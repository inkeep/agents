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
  private componentAccumulator: any = {};
  private lastStreamedComponents = new Map<string, any>();
  private componentSnapshots = new Map<string, string>();

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
    if (this.componentAccumulator.dataComponents && Array.isArray(this.componentAccumulator.dataComponents)) {
      const components = this.componentAccumulator.dataComponents;
      
      for (let i = 0; i < components.length; i++) {
        const component = components[i];
        
        if (!component?.id) continue;
        
        const componentKey = component.id;
        const hasBeenStreamed = this.lastStreamedComponents.has(componentKey);
        
        if (hasBeenStreamed) continue;
        
        // Create a content snapshot to track changes
        const currentSnapshot = JSON.stringify(component);
        const previousSnapshot = this.componentSnapshots.get(componentKey);
        
        // Update the snapshot for next comparison
        this.componentSnapshots.set(componentKey, currentSnapshot);
        
        // Stream component if it's complete AND stable (unchanged from previous delta)
        if (this.isComponentComplete(component) && previousSnapshot === currentSnapshot) {
          // Component is complete and hasn't changed - stream it now
          const parts = await this.artifactParser.parseObject({
            dataComponents: [component],
          });
          
          for (const part of parts) {
            await this.streamPart(part);
          }
          
          // Mark as streamed
          this.lastStreamedComponents.set(componentKey, true);
        }
      }
    }
  }

  /**
   * Check if a component has the basic structure required for streaming
   * With stability-based streaming, we only check for id, name, and props object
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
    const isArtifact = component.name === 'Artifact' || 
                      (component.props.artifact_id && component.props.task_id);
    
    if (isArtifact) {
      return Boolean(component.props.artifact_id && component.props.task_id);
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
    if (this.componentAccumulator.dataComponents && Array.isArray(this.componentAccumulator.dataComponents)) {
      const components = this.componentAccumulator.dataComponents;
      
      for (let i = 0; i < components.length; i++) {
        const component = components[i];
        
        if (!component?.id) continue;
        
        const componentKey = component.id;
        const hasBeenStreamed = this.lastStreamedComponents.has(componentKey);
        
        // Stream any complete components that haven't been streamed yet
        if (!hasBeenStreamed && this.isComponentComplete(component)) {
          const parts = await this.artifactParser.parseObject({
            dataComponents: [component],
          });
          
          for (const part of parts) {
            await this.streamPart(part);
          }
          
          this.lastStreamedComponents.set(componentKey, true);
        }
      }
    }

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
