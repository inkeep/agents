import { getLogger } from '../logger';
import { ArtifactParser, type StreamPart } from './artifact-parser';
import type { StreamHelper } from './stream-helpers';

const logger = getLogger('IncrementalStreamParser');

interface ParseResult {
  completeParts: StreamPart[];
  remainingBuffer: string;
}

/**
 * Incremental parser that processes streaming text and formats artifacts/objects as they become complete
 * Uses the unified ArtifactParser to eliminate redundancy
 */
export class IncrementalStreamParser {
  private buffer = '';
  private pendingTextBuffer = '';
  private streamHelper: StreamHelper;
  private artifactParser: ArtifactParser;
  private hasStartedRole = false;
  private collectedParts: StreamPart[] = [];
  private contextId: string;
  private lastChunkWasToolResult = false;

  constructor(streamHelper: StreamHelper, tenantId: string, contextId: string) {
    this.streamHelper = streamHelper;
    this.contextId = contextId;
    this.artifactParser = new ArtifactParser(tenantId);
  }

  /**
   * Mark that a tool result just completed, so next text should have spacing
   */
  markToolResult(): void {
    this.lastChunkWasToolResult = true;
  }

  /**
   * Process a new text chunk for text streaming (handles artifact markers)
   */
  async processTextChunk(chunk: string): Promise<void> {
    // If this text follows a tool result and we haven't added any text yet, add spacing
    if (this.lastChunkWasToolResult && this.buffer === '' && chunk.trim()) {
      chunk = '\n\n' + chunk;
      this.lastChunkWasToolResult = false;
    }

    this.buffer += chunk;

    const parseResult = await this.parseTextBuffer();

    // Stream complete parts
    for (const part of parseResult.completeParts) {
      await this.streamPart(part);
    }

    // Update buffer with remaining content
    this.buffer = parseResult.remainingBuffer;
  }

  /**
   * Process a new object chunk for object streaming (handles JSON objects with artifact references)
   */
  async processObjectChunk(chunk: string): Promise<void> {
    this.buffer += chunk;

    const parseResult = await this.parseObjectBuffer();

    // Stream complete parts
    for (const part of parseResult.completeParts) {
      await this.streamPart(part);
    }

    // Update buffer with remaining content
    this.buffer = parseResult.remainingBuffer;
  }

  /**
   * Process tool call stream for structured output, streaming components as they complete
   */
  async processToolCallStream(stream: AsyncIterable<any>, targetToolName: string): Promise<void> {
    let jsonBuffer = '';
    let componentBuffer = '';
    let depth = 0;
    let _inDataComponents = false;
    let componentsStreamed = 0;

    const MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5MB max buffer size

    for await (const part of stream) {
      // Look for tool call deltas with incremental JSON
      if (part.type === 'tool-call-delta' && part.toolName === targetToolName) {
        const delta = part.argsTextDelta || '';

        // Prevent JSON buffer from growing too large
        if (jsonBuffer.length + delta.length > MAX_BUFFER_SIZE) {
          logger.warn(
            { bufferSize: jsonBuffer.length + delta.length, maxSize: MAX_BUFFER_SIZE },
            'JSON buffer exceeded maximum size, truncating'
          );
          jsonBuffer = jsonBuffer.slice(-MAX_BUFFER_SIZE / 2); // Keep last half
        }

        jsonBuffer += delta;

        // Parse character by character to detect complete components
        for (const char of delta) {
          // Prevent component buffer from growing too large
          if (componentBuffer.length > MAX_BUFFER_SIZE) {
            logger.warn(
              { bufferSize: componentBuffer.length, maxSize: MAX_BUFFER_SIZE },
              'Component buffer exceeded maximum size, resetting'
            );
            componentBuffer = '';
            depth = 0; // Reset depth tracking
            continue;
          }

          componentBuffer += char;

          // Track JSON depth
          if (char === '{') {
            depth++;
          } else if (char === '}') {
            depth--;

            // At depth 2, we're inside the dataComponents array
            // When we return to depth 2, we have a complete component
            if (depth === 2 && componentBuffer.includes('"id"')) {
              // Extract just the component object with size limit
              const componentMatch = componentBuffer.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
              if (componentMatch) {
                // Size limit check - prevent parsing extremely large JSON objects
                const MAX_COMPONENT_SIZE = 1024 * 1024; // 1MB limit per component
                if (componentMatch[0].length > MAX_COMPONENT_SIZE) {
                  logger.warn(
                    {
                      size: componentMatch[0].length,
                      maxSize: MAX_COMPONENT_SIZE,
                    },
                    'Component exceeds size limit, skipping'
                  );
                  componentBuffer = ''; // Reset and skip this component
                  continue;
                }

                try {
                  const component = JSON.parse(componentMatch[0]);

                  // Validate component structure before processing
                  if (typeof component !== 'object' || !component.id) {
                    logger.warn({ component }, 'Invalid component structure, skipping');
                    componentBuffer = '';
                    continue;
                  }

                  // Stream this individual component
                  const parts = await this.artifactParser.parseObject({
                    dataComponents: [component],
                  });
                  for (const part of parts) {
                    await this.streamPart(part);
                  }

                  componentsStreamed++;
                  componentBuffer = ''; // Reset for next component
                } catch (e) {
                  // Not valid JSON yet, keep accumulating
                  logger.debug({ error: e }, 'Failed to parse component, continuing to accumulate');
                }
              }
            }
          }

          // Detect when we enter dataComponents array
          if (componentBuffer.includes('"dataComponents"') && componentBuffer.includes('[')) {
            _inDataComponents = true;
          }
        }
      }
      // Alternative: if the SDK provides complete tool calls (not deltas)
      else if (part.type === 'tool-call' && part.toolName === targetToolName) {
        // Process the complete args at once
        if (part.args?.dataComponents) {
          const parts = await this.artifactParser.parseObject(part.args);
          for (const part of parts) {
            await this.streamPart(part);
          }
        }
        break; // Tool call complete
      }
    }

    logger.debug({ componentsStreamed }, 'Finished streaming components');
  }

  /**
   * Legacy method for backward compatibility - defaults to text processing
   */
  async processChunk(chunk: string): Promise<void> {
    await this.processTextChunk(chunk);
  }

  /**
   * Process any remaining buffer content at the end of stream
   */
  async finalize(): Promise<void> {
    if (this.buffer.trim()) {
      // Process remaining buffer as final text
      const part: StreamPart = {
        kind: 'text',
        text: this.buffer.trim(),
      };
      await this.streamPart(part);
    }

    // Flush any remaining buffered text
    if (this.pendingTextBuffer.trim()) {
      // Clean up any artifact-related tags or remnants before final flush
      // Use safe, non-backtracking regex patterns to prevent ReDoS attacks
      const cleanedText = this.pendingTextBuffer
        .replace(/<\/?artifact:ref(?:\s[^>]*)?>\/?>/g, '') // Remove artifact:ref tags safely
        .replace(/<\/?artifact(?:\s[^>]*)?>\/?>/g, '') // Remove artifact tags safely
        .replace(/<\/(?:\w+:)?artifact>/g, '') // Remove closing artifact tags safely
        .trim();

      if (cleanedText) {
        this.collectedParts.push({
          kind: 'text',
          text: cleanedText,
        });

        await this.streamHelper.streamText(cleanedText, 50);
      }
      this.pendingTextBuffer = '';
    }
  }

  /**
   * Get all collected parts for building the final response
   */
  getCollectedParts(): StreamPart[] {
    return [...this.collectedParts];
  }

  /**
   * Parse buffer for complete artifacts and text parts (for text streaming)
   */
  private async parseTextBuffer(): Promise<ParseResult> {
    const completeParts: StreamPart[] = [];
    const workingBuffer = this.buffer;

    // Check if we have incomplete artifact markers
    if (this.artifactParser.hasIncompleteArtifact(workingBuffer)) {
      // Find safe boundary to stream text before incomplete artifact
      const safeEnd = this.artifactParser.findSafeTextBoundary(workingBuffer);

      if (safeEnd > 0) {
        const safeText = workingBuffer.slice(0, safeEnd);
        // Parse the safe portion for complete artifacts
        const parts = await this.artifactParser.parseText(safeText);
        completeParts.push(...parts);

        return {
          completeParts,
          remainingBuffer: workingBuffer.slice(safeEnd),
        };
      }

      // Buffer contains only incomplete artifact
      return {
        completeParts: [],
        remainingBuffer: workingBuffer,
      };
    }

    // No incomplete artifacts, parse the entire buffer
    const parts = await this.artifactParser.parseText(workingBuffer);

    // Check last part - if it's text, it might be incomplete
    if (parts.length > 0 && parts[parts.length - 1].kind === 'text') {
      const lastPart = parts[parts.length - 1];
      const lastText = lastPart.text || '';

      // Keep some text in buffer if it might be start of artifact
      if (this.mightBeArtifactStart(lastText)) {
        parts.pop(); // Remove last text part
        return {
          completeParts: parts,
          remainingBuffer: lastText,
        };
      }
    }

    return {
      completeParts: parts,
      remainingBuffer: '',
    };
  }

  /**
   * Parse buffer for complete JSON objects with artifact references (for object streaming)
   */
  private async parseObjectBuffer(): Promise<ParseResult> {
    const completeParts: StreamPart[] = [];

    try {
      // Try to parse as complete JSON
      const parsed = JSON.parse(this.buffer);
      const parts = await this.artifactParser.parseObject(parsed);

      return {
        completeParts: parts,
        remainingBuffer: '',
      };
    } catch {
      // JSON is incomplete, try partial parsing
      const { complete, remaining } = this.artifactParser.parsePartialJSON(this.buffer);

      for (const obj of complete) {
        const parts = await this.artifactParser.parseObject(obj);
        completeParts.push(...parts);
      }

      return {
        completeParts,
        remainingBuffer: remaining,
      };
    }
  }

  /**
   * Check if text might be the start of an artifact marker
   */
  private mightBeArtifactStart(text: string): boolean {
    const lastChars = text.slice(-20); // Check last 20 chars
    return lastChars.includes('<') && !lastChars.includes('/>');
  }

  /**
   * Stream a formatted part (text or data) with smart buffering
   */
  private async streamPart(part: StreamPart): Promise<void> {
    // Collect for final response
    this.collectedParts.push({ ...part });

    if (!this.hasStartedRole) {
      await this.streamHelper.writeRole('assistant');
      this.hasStartedRole = true;
    }

    if (part.kind === 'text' && part.text) {
      // Add to pending buffer
      this.pendingTextBuffer += part.text;

      // Flush if safe to do so
      if (!this.artifactParser.hasIncompleteArtifact(this.pendingTextBuffer)) {
        // Clean up any artifact-related tags or remnants before flushing
        // Use safe, non-backtracking regex patterns to prevent ReDoS attacks
        const cleanedText = this.pendingTextBuffer
          .replace(/<\/?artifact:ref(?:\s[^>]*)?>\/?>/g, '') // Remove artifact:ref tags safely
          .replace(/<\/?artifact(?:\s[^>]*)?>\/?>/g, '') // Remove artifact tags safely
          .replace(/<\/(?:\w+:)?artifact>/g, ''); // Remove closing artifact tags safely

        if (cleanedText.trim()) {
          await this.streamHelper.streamText(cleanedText, 50);
        }
        this.pendingTextBuffer = '';
      }
    } else if (part.kind === 'data' && part.data) {
      // Flush any pending text before streaming data
      if (this.pendingTextBuffer) {
        // Clean up any artifact-related tags or remnants before flushing
        // Use safe, non-backtracking regex patterns to prevent ReDoS attacks
        const cleanedText = this.pendingTextBuffer
          .replace(/<\/?artifact:ref(?:\s[^>]*)?>\/?>/g, '') // Remove artifact:ref tags safely
          .replace(/<\/?artifact(?:\s[^>]*)?>\/?>/g, '') // Remove artifact tags safely
          .replace(/<\/(?:\w+:)?artifact>/g, ''); // Remove closing artifact tags safely

        if (cleanedText.trim()) {
          await this.streamHelper.streamText(cleanedText, 50);
        }
        this.pendingTextBuffer = '';
      }

      // Determine if this is an artifact or regular data component
      const isArtifact = part.data.artifactId && part.data.taskId;

      if (isArtifact) {
        await this.streamHelper.writeData('data-artifact', part.data);
      } else {
        await this.streamHelper.writeData('data-component', part.data);
      }
    }
  }
}
