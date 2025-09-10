import { parsePartialJson } from 'ai';
import type { OperationEvent } from './agent-operations';

// Common interface for all stream helpers
export interface StreamHelper {
  writeRole(role?: string): Promise<void>;
  writeContent(content: string): Promise<void>;
  streamData(data: any): Promise<void>;
  streamText(text: string, delayMs?: number): Promise<void>;
  writeError(errorMessage: string): Promise<void>;
  complete(): Promise<void>;
  writeData(type: string, data: any): Promise<void>;
  // Operation streaming (operations are defined in agent-operations.ts)
  writeOperation(operation: OperationEvent): Promise<void>;
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
  private queuedOperations: OperationEvent[] = [];

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
   * Write error message
   */
  async writeError(errorMessage: string): Promise<void> {
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

  async writeOperation(operation: OperationEvent): Promise<void> {
    if (operation.type === 'status_update' && operation.ctx.operationType) {
      operation = {
        type: operation.ctx.operationType,
        ctx: operation.ctx.data,
      };
    }

    // Queue operation if text is currently streaming
    if (this.isTextStreaming) {
      this.queuedOperations.push(operation);
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
    if (this.queuedOperations.length === 0) {
      return;
    }

    const operationsToFlush = [...this.queuedOperations];
    this.queuedOperations = []; // Clear the queue

    for (const operation of operationsToFlush) {
      await this.writeData('data-operation', operation);
    }
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
  private queuedOperations: OperationEvent[] = [];

  constructor(private writer: VercelUIWriter) {}

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
      // Keep more context since we're not cleaning up during request
      const keepSize = Math.floor(VercelDataStreamHelper.MAX_BUFFER_SIZE * 0.8);
      this.jsonBuffer = this.jsonBuffer.slice(-keepSize);
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

    const words = text.split(' ');

    // ------------------------------
    // New Vercel data-stream v2 format
    // ------------------------------
    // Emit "text-start" once at the beginning, followed by "text-delta" chunks
    // for each word (with preceding space when necessary) and finish with
    // a single "text-end".

    const id = this.textId;

    // Mark that text streaming is starting
    this.isTextStreaming = true;

    try {
      this.writer.write({
        type: 'text-start',
        id,
      });

      // Deltas (optionally throttled)
      for (let i = 0; i < words.length; i++) {
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }

        const delta = i === 0 ? words[i] : ` ${words[i]}`;

        this.writer.write({
          type: 'text-delta',
          id,
          delta,
        });
      }

      // End
      this.writer.write({
        type: 'text-end',
        id,
      });
    } finally {
      // Mark that text streaming has finished
      this.isTextStreaming = false;

      // Flush any queued operations now that text sequence is complete
      await this.flushQueuedOperations();
    }
  }

  async writeData(type: 'operation', data: { type: string; ctx: any }): Promise<void> {
    if (this.isCompleted) {
      console.warn('Attempted to write data to completed stream');
      return;
    }

    this.writer.write({
      type: `${type}`,
      data,
    });
  }

  async writeError(errorMessage: string): Promise<void> {
    if (this.isCompleted) {
      console.warn('Attempted to write error to completed stream');
      return;
    }

    this.writer.write({
      type: 'error',
      errorText: errorMessage,
    });
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

  /**
   * Clean up all memory allocations
   * Should be called when the stream helper is no longer needed
   */
  public cleanup(): void {
    this.jsonBuffer = '';
    this.sentItems.clear();
    this.completedItems.clear();
    this.textId = null;
    this.queuedOperations = [];
    this.isTextStreaming = false;
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

  async writeOperation(operation: OperationEvent): Promise<void> {
    if (this.isCompleted) {
      console.warn('Attempted to write operation to completed stream');
      return;
    }

    if (operation.type === 'status_update' && operation.ctx.operationType) {
      operation = {
        type: operation.ctx.operationType,
        ctx: operation.ctx.data,
      };
    }

    // Queue operation if text is currently streaming
    if (this.isTextStreaming) {
      this.queuedOperations.push(operation);
      return;
    }

    // If not streaming, flush any queued operations first, then send this one
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
    if (this.queuedOperations.length === 0) {
      return;
    }

    const operationsToFlush = [...this.queuedOperations];
    this.queuedOperations = []; // Clear the queue

    for (const operation of operationsToFlush) {
      this.writer.write({
        id: 'id' in operation ? operation.id : undefined,
        type: 'data-operation',
        data: operation,
      });
    }
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

  async writeData(_type: string, data: any): Promise<void> {
    this.capturedData.push(data);
  }

  async writeError(errorMessage: string): Promise<void> {
    this.hasError = true;
    this.errorMessage = errorMessage;
  }

  async complete(): Promise<void> {
    // No-op for MCP
  }

  async writeOperation(operation: OperationEvent): Promise<void> {
    this.capturedOperations.push(operation);
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
