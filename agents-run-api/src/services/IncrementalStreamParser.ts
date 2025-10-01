import { getLogger } from '../logger';
import { ArtifactParser, type StreamPart } from '../services/ArtifactParser';
import type { StreamHelper } from '../utils/stream-helpers';
import { graphSessionManager } from './GraphSession';

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
  private componentAccumulator: any = {};
  private lastStreamedComponents = new Map<string, any>();
  private componentSnapshots = new Map<string, string>();
  private artifactMap?: Map<string, any>;
  private agentId?: string;

  // Memory management constants
  private static readonly MAX_SNAPSHOT_SIZE = 100; // Max number of snapshots to keep
  private static readonly MAX_STREAMED_SIZE = 1000; // Max number of streamed component IDs to track
  private static readonly MAX_COLLECTED_PARTS = 10000; // Max number of collected parts to prevent unbounded growth

  constructor(
    streamHelper: StreamHelper,
    tenantId: string,
    contextId: string,
    artifactParserOptions?: {
      sessionId?: string;
      taskId?: string;
      projectId?: string;
      artifactComponents?: any[];
      streamRequestId?: string;
      agentId?: string;
    }
  ) {
    this.streamHelper = streamHelper;
    this.contextId = contextId;
    // Store agentId for passing to parsing methods
    this.agentId = artifactParserOptions?.agentId;

    // Get the shared ArtifactParser from GraphSession
    if (artifactParserOptions?.streamRequestId) {
      const sessionParser = graphSessionManager.getArtifactParser(
        artifactParserOptions.streamRequestId
      );

      if (sessionParser) {
        this.artifactParser = sessionParser;
        return;
      }
    }

    // Fallback: create new parser if session parser not available (for tests, etc.)
    this.artifactParser = new ArtifactParser(tenantId, {
      ...artifactParserOptions,
      contextId,
    });
  }

  /**
   * Initialize artifact map for artifact:ref lookups during streaming
   * Should be called before processing chunks
   */
  async initializeArtifactMap(): Promise<void> {
    try {
      this.artifactMap = await this.artifactParser.getContextArtifacts(this.contextId);
      logger.debug(
        {
          contextId: this.contextId,
          artifactMapSize: this.artifactMap.size,
        },
        'Initialized artifact map for streaming'
      );
    } catch (error) {
      logger.warn({ error, contextId: this.contextId }, 'Failed to initialize artifact map');
      this.artifactMap = new Map();
    }
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
    if (this.lastChunkWasToolResult && this.buffer === '' && chunk) {
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
   * Process object deltas directly from Vercel AI SDK's fullStream
   * Accumulates components and streams them when they're stable (unchanged between deltas)
   */
  async processObjectDelta(delta: any): Promise<void> {
    if (!delta || typeof delta !== 'object') {
      return;
    }

    // Deep merge delta into accumulator
    this.componentAccumulator = this.deepMerge(this.componentAccumulator, delta);

    // Check if we have dataComponents to process
    if (
      this.componentAccumulator.dataComponents &&
      Array.isArray(this.componentAccumulator.dataComponents)
    ) {
      const components = this.componentAccumulator.dataComponents;
      const currentComponentIds = new Set(
        components.filter((c: any) => c?.id).map((c: any) => c.id)
      );

      // Check for new components - stream any previous components that are ready
      for (const [componentId, snapshot] of this.componentSnapshots.entries()) {
        if (
          !currentComponentIds.has(componentId) &&
          !this.lastStreamedComponents.has(componentId)
        ) {
          // This component is no longer in the current delta - stream it if complete
          try {
            const component = JSON.parse(snapshot);
            if (this.isComponentComplete(component)) {
              await this.streamComponent(component);
            }
          } catch (e) {
            // Ignore invalid snapshots
          }
        }
      }

      for (let i = 0; i < components.length; i++) {
        const component = components[i];

        if (!component?.id) continue;

        const componentKey = component.id;
        const hasBeenStreamed = this.lastStreamedComponents.has(componentKey);

        if (hasBeenStreamed) continue;

        // Create snapshot of current component
        const currentSnapshot = JSON.stringify(component);
        const previousSnapshot = this.componentSnapshots.get(componentKey);

        // Update snapshot with size limit enforcement
        this.componentSnapshots.set(componentKey, currentSnapshot);

        // Enforce size limit - remove oldest entries if exceeded
        if (this.componentSnapshots.size > IncrementalStreamParser.MAX_SNAPSHOT_SIZE) {
          const firstKey = this.componentSnapshots.keys().next().value;
          if (firstKey) {
            this.componentSnapshots.delete(firstKey);
          }
        }

        // Special handling for Text components - stream the text content immediately
        if (component.name === 'Text' && component.props?.text) {
          // For Text components, stream the incremental text immediately
          const previousTextContent = previousSnapshot
            ? JSON.parse(previousSnapshot).props?.text || ''
            : '';
          const currentTextContent = component.props.text || '';

          // Only stream the new text that was added
          if (currentTextContent.length > previousTextContent.length) {
            const newText = currentTextContent.slice(previousTextContent.length);

            // Stream directly to avoid artifact parsing overhead and trimming
            if (!this.hasStartedRole) {
              await this.streamHelper.writeRole('assistant');
              this.hasStartedRole = true;
            }

            // Stream text directly without going through streamPart
            await this.streamHelper.streamText(newText, 50);

            // Still collect for final response
            this.collectedParts.push({
              kind: 'text',
              text: newText,
            });
          }

          // Don't mark as streamed yet - let it keep streaming incrementally
          continue;
        }

        // For non-Text components, use stability checking
        if (this.isComponentComplete(component)) {
          const currentPropsSnapshot = JSON.stringify(component.props);
          const previousPropsSnapshot = previousSnapshot
            ? JSON.stringify(JSON.parse(previousSnapshot).props)
            : null;

          if (previousPropsSnapshot === currentPropsSnapshot) {
            await this.streamComponent(component);
          }
        }
      }
    }
  }

  /**
   * Stream a component and mark it as streamed
   * Note: Text components are handled separately with incremental streaming
   */
  private async streamComponent(component: any): Promise<void> {
    // Stream as regular data component (Text components handled elsewhere)
    const parts = await this.artifactParser.parseObject({
      dataComponents: [component],
    }, this.artifactMap, this.agentId);

    // Ensure parts is an array before iterating
    if (!Array.isArray(parts)) {
      console.warn('parseObject returned non-array:', parts);
      return;
    }

    for (const part of parts) {
      await this.streamPart(part);
    }

    // Mark as streamed
    this.lastStreamedComponents.set(component.id, true);

    // Enforce size limit for streamed components map
    if (this.lastStreamedComponents.size > IncrementalStreamParser.MAX_STREAMED_SIZE) {
      const firstKey = this.lastStreamedComponents.keys().next().value;
      if (firstKey) {
        this.lastStreamedComponents.delete(firstKey);
      }
    }

    // Clean up snapshot after streaming
    this.componentSnapshots.delete(component.id);
  }

  /**
   * Check if a component has the basic structure required for streaming
   * Requires id, name, and props object with content
   */
  private isComponentComplete(component: any): boolean {
    if (!component || !component.id || !component.name) {
      return false;
    }

    // Must have props object (can be empty, stability will handle completeness)
    if (!component.props || typeof component.props !== 'object') {
      return false;
    }

    // For artifacts, still require both required fields
    const isArtifact =
      component.name === 'Artifact' ||
      (component.props.artifact_id && (component.props.tool_call_id || component.props.task_id));

    if (isArtifact) {
      return Boolean(
        component.props.artifact_id && (component.props.tool_call_id || component.props.task_id)
      );
    }

    // For regular components, just need id, name, and props object
    return true;
  }

  /**
   * Deep merge helper for object deltas
   */
  private deepMerge(target: any, source: any): any {
    if (!source) return target;
    if (!target) return source;

    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
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
    // Stream any remaining complete components that haven't been streamed yet
    if (
      this.componentAccumulator.dataComponents &&
      Array.isArray(this.componentAccumulator.dataComponents)
    ) {
      const components = this.componentAccumulator.dataComponents;

      for (let i = 0; i < components.length; i++) {
        const component = components[i];

        if (!component?.id) continue;

        const componentKey = component.id;
        const hasBeenStreamed = this.lastStreamedComponents.has(componentKey);

        // Stream any complete components that haven't been streamed yet
        // Skip Text components as they've already been streamed incrementally
        if (!hasBeenStreamed && this.isComponentComplete(component) && component.name !== 'Text') {
          const parts = await this.artifactParser.parseObject({
            dataComponents: [component],
          }, this.artifactMap, this.agentId);

          for (const part of parts) {
            await this.streamPart(part);
          }

          this.lastStreamedComponents.set(componentKey, true);

          // Enforce size limit for streamed components map
          if (this.lastStreamedComponents.size > IncrementalStreamParser.MAX_STREAMED_SIZE) {
            const firstKey = this.lastStreamedComponents.keys().next().value;
            if (firstKey) {
              this.lastStreamedComponents.delete(firstKey);
            }
          }

          // Clean up snapshot after streaming
          this.componentSnapshots.delete(componentKey);
        }
      }
    }

    if (this.buffer) {
      // Process remaining buffer as final text
      const part: StreamPart = {
        kind: 'text',
        text: this.buffer,
      };
      await this.streamPart(part);
    }

    // Flush any remaining buffered text
    if (this.pendingTextBuffer) {
      // Clean up any artifact-related tags or remnants before final flush
      // Use safe, non-backtracking regex patterns to prevent ReDoS attacks
      const cleanedText = this.pendingTextBuffer
        .replace(/<\/?artifact:ref(?:\s[^>]*)?>\/?>/g, '') // Remove artifact:ref tags safely
        .replace(/<\/?artifact(?:\s[^>]*)?>\/?>/g, '') // Remove artifact tags safely
        .replace(/<\/artifact:ref>/g, '') // Remove closing artifact:ref tags
        .replace(/<\/(?:\w+:)?artifact>/g, ''); // Remove closing artifact tags safely

      if (cleanedText) {
        this.collectedParts.push({
          kind: 'text',
          text: cleanedText,
        });

        await this.streamHelper.streamText(cleanedText, 50);
      }
      this.pendingTextBuffer = '';
    }

    // Clean up all Maps to prevent memory leaks
    this.componentSnapshots.clear();
    this.lastStreamedComponents.clear();
    // Reset accumulator
    this.componentAccumulator = {};
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
        const parts = await this.artifactParser.parseText(safeText, this.artifactMap, this.agentId);
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
    const parts = await this.artifactParser.parseText(workingBuffer, this.artifactMap, this.agentId);

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
    // Collect for final response with size limit enforcement
    this.collectedParts.push({ ...part });

    // Enforce size limit to prevent memory leaks
    if (this.collectedParts.length > IncrementalStreamParser.MAX_COLLECTED_PARTS) {
      // Remove oldest parts (keep last N parts)
      const excess = this.collectedParts.length - IncrementalStreamParser.MAX_COLLECTED_PARTS;
      this.collectedParts.splice(0, excess);
    }

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
          .replace(/<\/artifact:ref>/g, '') // Remove closing artifact:ref tags
          .replace(/<\/(?:\w+:)?artifact>/g, ''); // Remove closing artifact tags safely

        if (cleanedText) {
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
          .replace(/<\/artifact:ref>/g, '') // Remove closing artifact:ref tags
          .replace(/<\/(?:\w+:)?artifact>/g, ''); // Remove closing artifact tags safely

        if (cleanedText) {
          await this.streamHelper.streamText(cleanedText, 50);
        }
        this.pendingTextBuffer = '';
      }

      // Determine if this is an artifact or regular data component
      const isArtifact = part.data.artifactId && part.data.toolCallId;

      if (isArtifact) {
        await this.streamHelper.writeData('data-artifact', part.data);
      } else {
        await this.streamHelper.writeData('data-component', part.data);
      }
    }
  }
}
