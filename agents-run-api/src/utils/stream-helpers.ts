import type { SummaryEvent } from '@inkeep/agents-core';
import { parsePartialJson } from 'ai';
import type { ErrorEvent, OperationEvent } from './agent-operations';

// Common interface for all stream helpers
export interface StreamHelper {
  writeRole(role?: string): Promise<void>;
  writeContent(content: string): Promise<void>;
  streamData(data: any): Promise<void>;
  streamText(text: string, delayMs?: number): Promise<void>;
  writeError(error: string | ErrorEvent): Promise<void>;
  complete(): Promise<void>;
  writeData(type: string, data: any): Promise<void>;
  // Operation streaming (operations are defined in agent-operations.ts)
  writeOperation(operation: OperationEvent): Promise<void>;
  writeSummary(summary: SummaryEvent): Promise<void>;
}

// Define the stream type based on Hono's streamSSE callback parameter
export interface HonoSSEStream {
  writeSSE(message: { data: string; event?: string; id?: string }): Promise<void>;
  sleep(ms: number): Promise<unknown>;
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

export class SSEStreamHelper implements StreamHelper {
  // Stream queuing for proper event ordering
  private isTextStreaming: boolean = false;
  private queuedEvents: { type: string; event: OperationEvent | SummaryEvent }[] = [];

  constructor(
    private stream: HonoSSEStream,
    private requestId: string,
    private timestamp: number
  ) {}

  /**
   * Write the initial role message
   */
  async writeRole(role = 'assistant'): Promise<void> {
    await this.stream.writeSSE({
      data: JSON.stringify({
        id: this.requestId,
        object: 'chat.completion.chunk',
        created: this.timestamp,
        choices: [
          {
            index: 0,
            delta: {
              role,
            },
            finish_reason: null,
          },
        ],
      }),
    });
  }

  /**
   * Write content chunk
   */
  async writeContent(content: string): Promise<void> {
    await this.stream.writeSSE({
      data: JSON.stringify({
        id: this.requestId,
        object: 'chat.completion.chunk',
        created: this.timestamp,
        choices: [
          {
            index: 0,
            delta: {
              content,
            },
            finish_reason: null,
          },
        ],
      }),
    });
  }

  /**
   * Stream text word by word with optional delay
   */
  async streamText(text: string, delayMs = 100): Promise<void> {
    const words = text.split(' ');

    // Mark that text streaming is starting
    this.isTextStreaming = true;

    try {
      for (let i = 0; i < words.length; i++) {
        await this.stream.sleep(delayMs);

        const content = i === 0 ? words[i] : ` ${words[i]}`;
        await this.writeContent(content);
      }
    } finally {
      // Mark that text streaming has finished
      this.isTextStreaming = false;

      // Flush any queued operations now that text sequence is complete
      await this.flushQueuedOperations();
    }
  }

  async streamData(data: any): Promise<void> {
    await this.writeContent(JSON.stringify(data));
  }

  /**
   * Write error message or error event
   */
  async writeError(error: string | ErrorEvent): Promise<void> {
    const errorMessage = typeof error === 'string' ? error : error.message;
    await this.writeContent(`\n\n${errorMessage}`);
  }

  /**
   * Write the final completion message
   */
  async writeCompletion(finishReason = 'stop'): Promise<void> {
    await this.stream.writeSSE({
      data: JSON.stringify({
        id: this.requestId,
        object: 'chat.completion.chunk',
        created: this.timestamp,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: finishReason,
          },
        ],
      }),
    });
  }

  async writeData(type: string, data: any): Promise<void> {
    await this.stream.writeSSE({
      data: JSON.stringify({
        id: this.requestId,
        object: 'chat.completion.chunk',
        created: this.timestamp,
        choices: [
          {
            index: 0,
            delta: {
              content: JSON.stringify({ type, data }),
            },
            finish_reason: null,
          },
        ],
      }),
    });
  }

  async writeSummary(summary: SummaryEvent): Promise<void> {
    // Queue operation if text is currently streaming
    if (this.isTextStreaming) {
      this.queuedEvents.push({
        type: 'data-summary',
        event: summary,
      });
      return;
    }

    // If not streaming, flush any queued operations first, then send this one
    await this.flushQueuedOperations();
    await this.writeData('data-summary', summary);
  }

  async writeOperation(operation: OperationEvent): Promise<void> {
    // Queue operation if text is currently streaming
    if (this.isTextStreaming) {
      this.queuedEvents.push({
        type: 'data-operation',
        event: operation,
      });
      return;
    }

    // If not streaming, flush any queued operations first, then send this one
    await this.flushQueuedOperations();

    await this.writeData('data-operation', operation);
  }

  /**
   * Flush all queued operations in order after text streaming completes
   */
  private async flushQueuedOperations(): Promise<void> {
    if (this.queuedEvents.length === 0) {
      return;
    }

    const eventsToFlush = [...this.queuedEvents];
    this.queuedEvents = []; // Clear the queue

    for (const event of eventsToFlush) {
      await this.writeData(event.type, event.event);
    }
  }

  /**
   * Write the final [DONE] message
   */
  async writeDone(): Promise<void> {
    await this.stream.writeSSE({
      data: '[DONE]',
    });
  }

  /**
   * Complete the stream with finish reason and done message
   */
  async complete(finishReason = 'stop'): Promise<void> {
    // Flush any remaining queued operations before completing
    await this.flushQueuedOperations();

    await this.writeCompletion(finishReason);
    await this.writeDone();
  }
}

/**
 * Factory function to create SSE stream helper
 */
export function createSSEStreamHelper(
  stream: HonoSSEStream,
  requestId: string,
  timestamp: number
): SSEStreamHelper {
  return new SSEStreamHelper(stream, requestId, timestamp);
}

// Define Vercel writer interface based on actual AI SDK V5 writer
export interface VercelUIWriter {
  write(chunk: any): void;
  merge(stream: any): void;
  onError?: (error: Error) => void;
}

export class VercelDataStreamHelper implements StreamHelper {
  private textId: string | null = null;
  private jsonBuffer = '';
  private sentItems = new Map<number, string>(); // Track what we've sent for each index
  private completedItems = new Set<number>(); // Track completed items
  private sessionId?: string;

  // Memory management - focused on connection completion cleanup
  private static readonly MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5MB limit (more generous during request)
  private isCompleted = false;

  // Stream queuing for proper event ordering
  private isTextStreaming: boolean = false;
  private queuedEvents: { type: string; event: OperationEvent | SummaryEvent }[] = [];

  // Timing tracking for text sequences (text-end to text-start gap)
  private lastTextEndTimestamp: number = 0;
  private readonly TEXT_GAP_THRESHOLD = 2000; // milliseconds - if gap between text sequences is less than this, queue operations

  // Connection management and forced cleanup
  private connectionDropTimer?: ReturnType<typeof setTimeout>;
  private readonly MAX_LIFETIME_MS = 600_000; // 10 minutes max lifetime

  constructor(private writer: VercelUIWriter) {
    // Set maximum lifetime timer to prevent memory leaks from abandoned connections
    this.connectionDropTimer = setTimeout(() => {
      this.forceCleanup('Connection lifetime exceeded');
    }, this.MAX_LIFETIME_MS);
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  // This mirrors SSEStreamHelper API but outputs using Vercel AI SDK writer
  async writeRole(_ = 'assistant'): Promise<void> {
    // noop
  }

  async writeContent(content: string): Promise<void> {
    if (this.isCompleted) {
      console.warn('Attempted to write content to completed stream');
      return;
    }

    if (!this.textId) this.textId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Only prevent catastrophic buffer growth during request
    if (this.jsonBuffer.length + content.length > VercelDataStreamHelper.MAX_BUFFER_SIZE) {
      // JSON-aware truncation to prevent corruption
      const newBuffer = this.truncateJsonBufferSafely(this.jsonBuffer);

      // If we couldn't find a safe truncation point, clear the buffer entirely
      // This is safer than keeping potentially corrupted JSON
      if (newBuffer.length === this.jsonBuffer.length) {
        console.warn(
          'VercelDataStreamHelper: Could not find safe JSON truncation point, clearing buffer'
        );
        this.jsonBuffer = '';
        // Clear tracking as we're starting fresh
        this.sentItems.clear();
      } else {
        this.jsonBuffer = newBuffer;
        // Update tracking indices based on the new buffer content
        this.reindexSentItems();
      }
    }

    this.jsonBuffer += content;
    const { value, state } = await parsePartialJson(this.jsonBuffer);

    if (!['repaired-parse', 'successful-parse'].includes(state)) return;
    if (!Array.isArray(value)) return;

    for (let i = 0; i < value.length; i++) {
      const { type, ...data } = value[i] as { type?: string; [key: string]: any };

      // TODO: Check for kind data and JSON.stringify
      // Create a content hash to check if this item has changed
      const currentContent = JSON.stringify(data);
      const lastSentContent = this.sentItems.get(i);

      // Only send if content has changed or is new
      if (currentContent !== lastSentContent) {
        const chunk = {
          type: 'data-component',
          id: `${this.textId}-${i}`,
          data: { type, ...data },
        };

        this.writer.write(chunk);
        this.sentItems.set(i, currentContent);
      }
    }
  }

  async streamText(text: string, delayMs = 100): Promise<void> {
    if (this.isCompleted) {
      console.warn('Attempted to stream text to completed stream');
      return;
    }

    // For plain text, write directly to the stream as text chunks
    if (!this.textId) this.textId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // ------------------------------
    // New Vercel data-stream v2 format
    // ------------------------------
    // Emit "text-start" once at the beginning, followed by a single "text-delta"
    // for the entire text chunk, and finish with "text-end".
    // Don't artificially split by words - let the agent determine chunk boundaries.

    const id = this.textId;

    // Check gap from last text-end to this text-start
    const startTime = Date.now();
    const gapFromLastSequence =
      this.lastTextEndTimestamp > 0
        ? startTime - this.lastTextEndTimestamp
        : Number.MAX_SAFE_INTEGER;

    // If gap is large enough, flush any queued operations before starting new text
    if (gapFromLastSequence >= this.TEXT_GAP_THRESHOLD) {
      await this.flushQueuedOperations();
    }

    // Mark that text streaming is starting
    this.isTextStreaming = true;

    try {
      this.writer.write({
        type: 'text-start',
        id,
      });

      // Optional delay before sending the text chunk
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      // Send the entire text as a single delta
      this.writer.write({
        type: 'text-delta',
        id,
        delta: text,
      });

      // End
      this.writer.write({
        type: 'text-end',
        id,
      });

      // Track when this text sequence ended
      this.lastTextEndTimestamp = Date.now();
    } finally {
      // Mark that text streaming has finished
      this.isTextStreaming = false;

      // DO NOT flush operations here - wait for gap threshold
    }
  }

  async writeData(type: string, data: any): Promise<void> {
    if (this.isCompleted) {
      console.warn('Attempted to write data to completed stream');
      return;
    }

    // For data-artifact, check if we should delay it based on text timing
    if (type === 'data-artifact') {
      const now = Date.now();
      const gapFromLastTextEnd =
        this.lastTextEndTimestamp > 0 ? now - this.lastTextEndTimestamp : Number.MAX_SAFE_INTEGER;

      // If we're within the gap threshold from last text-end, it means more text might be coming
      // In this case, write the artifact but don't reset timing - let operations stay queued
      if (this.isTextStreaming || gapFromLastTextEnd < this.TEXT_GAP_THRESHOLD) {
        // Artifact arrives during or shortly after text - maintain timing continuity
        this.writer.write({
          type: `${type}`,
          data,
        });
        return;
      }
    }

    this.writer.write({
      type: `${type}`,
      data,
    });
  }

  async writeError(error: string | ErrorEvent): Promise<void> {
    if (this.isCompleted) {
      console.warn('Attempted to write error to completed stream');
      return;
    }

    // Handle both string and ErrorEvent formats
    if (typeof error === 'string') {
      this.writer.write({
        type: 'error',
        message: error,
        severity: 'error',
        timestamp: Date.now(),
      });
    } else {
      this.writer.write({
        ...error,
        type: 'error',
      });
    }
  }

  async streamData(data: any): Promise<void> {
    await this.writeContent(JSON.stringify(data));
  }

  async mergeStream(stream: any): Promise<void> {
    if (this.isCompleted) {
      console.warn('Attempted to merge stream to completed stream');
      return;
    }

    this.writer.merge(stream);
  }

  /**
   * Clean up all memory allocations
   * Should be called when the stream helper is no longer needed
   */
  public cleanup(): void {
    // Clear the connection drop timer
    if (this.connectionDropTimer) {
      clearTimeout(this.connectionDropTimer);
      this.connectionDropTimer = undefined;
    }

    this.jsonBuffer = '';
    this.sentItems.clear();
    this.completedItems.clear();
    this.textId = null;
    this.queuedEvents = [];
    this.isTextStreaming = false;
  }

  /**
   * JSON-aware buffer truncation that preserves complete JSON structures
   */
  private truncateJsonBufferSafely(buffer: string): string {
    const keepSize = Math.floor(VercelDataStreamHelper.MAX_BUFFER_SIZE * 0.6); // Be more conservative
    if (buffer.length <= keepSize) return buffer;

    // Start from the end and work backwards to find complete JSON structures
    let depth = 0;
    let inString = false;
    let escaping = false;
    let lastCompleteStructureEnd = -1;

    // Scan backwards from the target keep size
    for (let i = Math.min(keepSize + 1000, buffer.length - 1); i >= keepSize; i--) {
      const char = buffer[i];

      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === '\\') {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '}' || char === ']') {
        depth++;
      } else if (char === '{' || char === '[') {
        depth--;
        // If we've returned to depth 0, we have a complete structure
        if (depth === 0) {
          lastCompleteStructureEnd = i - 1;
          break;
        }
      }
    }

    // If we found a safe truncation point, use it
    if (lastCompleteStructureEnd > 0) {
      return buffer.slice(lastCompleteStructureEnd + 1);
    }

    // Fallback: look for newlines between structures
    for (let i = keepSize; i < Math.min(keepSize + 500, buffer.length); i++) {
      if (buffer[i] === '\n' && buffer[i + 1] && buffer[i + 1].match(/[{[]]/)) {
        return buffer.slice(i + 1);
      }
    }

    // Return original buffer if no safe point found (caller will handle clearing)
    return buffer;
  }

  /**
   * Reindex sent items after buffer truncation
   */
  private reindexSentItems(): void {
    // After truncation, we need to clear sent items as indices are no longer valid
    this.sentItems.clear();
    this.completedItems.clear();
  }

  /**
   * Force cleanup on connection drop or timeout
   */
  private forceCleanup(reason: string): void {
    console.warn(`VercelDataStreamHelper: Forcing cleanup - ${reason}`);

    // Mark as completed to prevent further writes
    this.isCompleted = true;

    // Clean up all resources
    this.cleanup();

    // Try to write an error if the writer is still available
    try {
      if (this.writer && !this.isCompleted) {
        this.writer.write({
          type: 'error',
          message: `Stream terminated: ${reason}`,
          severity: 'error',
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      // Writer may be unavailable, ignore errors
    }
  }

  /**
   * Check if the stream has been completed and cleaned up
   */
  public isStreamCompleted(): boolean {
    return this.isCompleted;
  }

  /**
   * Get current memory usage stats (for debugging/monitoring)
   */
  public getMemoryStats() {
    return {
      bufferSize: this.jsonBuffer.length,
      sentItemsCount: this.sentItems.size,
      completedItemsCount: this.completedItems.size,
      isCompleted: this.isCompleted,
    };
  }

  async writeSummary(summary: SummaryEvent): Promise<void> {
    if (this.isCompleted) {
      console.warn('Attempted to write summary to completed stream');
      return;
    }

    // Check timing gap from last text-end
    const now = Date.now();
    const gapFromLastTextEnd =
      this.lastTextEndTimestamp > 0 ? now - this.lastTextEndTimestamp : Number.MAX_SAFE_INTEGER;

    // ALWAYS queue operation if:
    // 1. Text is currently streaming, OR
    // 2. We're within the gap threshold from last text-end (more text might be coming)
    if (this.isTextStreaming || gapFromLastTextEnd < this.TEXT_GAP_THRESHOLD) {
      this.queuedEvents.push({ type: 'data-summary', event: summary });
      return;
    }

    // If not streaming, flush any queued operations first, then send this one
    await this.flushQueuedOperations();

    await this.writer.write({
      id: 'id' in summary ? summary.id : undefined,
      type: 'data-summary',
      data: summary,
    });
  }

  async writeOperation(operation: OperationEvent): Promise<void> {
    if (this.isCompleted) {
      console.warn('Attempted to write operation to completed stream');
      return;
    }

    // Check timing gap from last text-end
    const now = Date.now();
    const gapFromLastTextEnd =
      this.lastTextEndTimestamp > 0 ? now - this.lastTextEndTimestamp : Number.MAX_SAFE_INTEGER;

    // ALWAYS queue operation if:
    // 1. Text is currently streaming, OR
    // 2. We're within the gap threshold from last text-end (more text might be coming)
    if (this.isTextStreaming || gapFromLastTextEnd < this.TEXT_GAP_THRESHOLD) {
      this.queuedEvents.push({ type: 'data-operation', event: operation });
      return;
    }

    // If not streaming and gap is large enough, flush any queued operations first, then send this one
    await this.flushQueuedOperations();

    this.writer.write({
      id: 'id' in operation ? operation.id : undefined,
      type: 'data-operation',
      data: operation,
    });
  }

  /**
   * Flush all queued operations in order after text streaming completes
   */
  private async flushQueuedOperations(): Promise<void> {
    if (this.queuedEvents.length === 0) {
      return;
    }

    const eventsToFlush = [...this.queuedEvents];
    this.queuedEvents = []; // Clear the queue

    for (const event of eventsToFlush) {
      this.writer.write({
        id: 'id' in event.event ? event.event.id : undefined,
        type: event.type,
        data: event.event,
      });
    }
  }

  async writeCompletion(_finishReason = 'stop'): Promise<void> {
    // Completion is handled automatically by Vercel's writer
  }

  async writeDone(): Promise<void> {
    // Done is handled automatically by Vercel's writer
  }

  /**
   * Complete the stream and clean up all memory
   * This is the primary cleanup point to prevent memory leaks between requests
   */
  async complete(): Promise<void> {
    if (this.isCompleted) return;

    // Flush any remaining queued operations before completing
    await this.flushQueuedOperations();

    // Mark as completed to prevent further writes
    this.isCompleted = true;

    // Clean up all buffers and references
    this.cleanup();
  }
}

export function createVercelStreamHelper(writer: VercelUIWriter) {
  return new VercelDataStreamHelper(writer);
}

/**
 * MCP Stream Helper that captures content instead of streaming
 * Used for MCP tool responses which require a single response message
 */
export class MCPStreamHelper implements StreamHelper {
  private capturedText = '';
  private capturedData: any[] = [];
  private capturedOperations: OperationEvent[] = [];
  private capturedSummaries: SummaryEvent[] = [];
  private hasError = false;
  private errorMessage = '';
  private sessionId?: string;

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  async writeRole(_role?: string): Promise<void> {
    // No-op for MCP
  }

  async writeContent(content: string): Promise<void> {
    this.capturedText += content;
  }

  async streamText(text: string, _delayMs?: number): Promise<void> {
    // Capture text without streaming delay
    this.capturedText += text;
  }

  async streamData(data: any): Promise<void> {
    this.capturedData.push(data);
  }

  async streamSummary(summary: SummaryEvent): Promise<void> {
    this.capturedSummaries.push(summary);
  }

  async streamOperation(operation: OperationEvent): Promise<void> {
    this.capturedOperations.push(operation);
  }

  async writeData(_type: string, data: any): Promise<void> {
    this.capturedData.push(data);
  }

  async writeSummary(summary: SummaryEvent): Promise<void> {
    this.capturedSummaries.push(summary);
  }

  async writeOperation(operation: OperationEvent): Promise<void> {
    this.capturedOperations.push(operation);
  }

  async writeError(error: string | ErrorEvent): Promise<void> {
    this.hasError = true;
    this.errorMessage = typeof error === 'string' ? error : error.message;
  }

  async complete(): Promise<void> {
    // No-op for MCP
  }

  /**
   * Get the captured response for MCP tool result
   */
  getCapturedResponse(): {
    text: string;
    data: any[];
    operations: OperationEvent[];
    hasError: boolean;
    errorMessage: string;
  } {
    return {
      text: this.capturedText,
      data: this.capturedData,
      operations: this.capturedOperations,
      hasError: this.hasError,
      errorMessage: this.errorMessage,
    };
  }
}

export function createMCPStreamHelper(): MCPStreamHelper {
  return new MCPStreamHelper();
}
