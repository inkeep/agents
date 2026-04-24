import type { FullExecutionContext } from '@inkeep/agents-core';
import { getLogger } from '../../../logger';
import { ArtifactParser, type StreamPart } from '../artifacts/ArtifactParser';
import {
  STREAM_PARSER_MAX_COLLECTED_PARTS,
  STREAM_PARSER_MAX_SNAPSHOT_SIZE,
  STREAM_PARSER_MAX_STREAMED_SIZE,
} from '../constants/execution-limits';
import { agentSessionManager } from '../session/AgentSession';
import type { StreamHelper } from './stream-helpers';

const logger = getLogger('IncrementalStreamParser');

interface ParseResult {
  completeParts: StreamPart[];
  remainingBuffer: string;
}

/**
 * A dataComponent is a "Text" component iff its name is exactly "Text". Text components are
 * always streamed to the wire as text-delta events (flattened to plain text) and never as
 * data-component events — this helper centralises that check so the Text/non-Text routing
 * decision is in one place.
 */
function isTextComponent(component: unknown): boolean {
  return (
    typeof component === 'object' &&
    component !== null &&
    (component as { name?: unknown }).name === 'Text'
  );
}

/**
 * Incremental parser that processes streaming text and structured-object deltas from Vercel AI
 * SDK generation and emits the right wire events to the client. Uses the unified ArtifactParser
 * to resolve artifact:ref / artifact:create markers.
 *
 * ---------------------------------------------------------------------------
 * Structured-output streaming pipeline (Anthropic + Output.object())
 * ---------------------------------------------------------------------------
 *
 * Upstream producer: `streamText({ output: Output.object({ schema }), ...,
 *   providerOptions: { anthropic: { structuredOutputMode: 'jsonTool' } } })`
 *
 * The Anthropic provider option is load-bearing. Without `structuredOutputMode: 'jsonTool'`,
 * newer Claude models (Sonnet 4.5, Opus 4.5, Opus 4.1) use Anthropic's native structured-outputs
 * beta which assembles the entire JSON response server-side and returns it as a single text
 * block at the end — producing ~20 seconds of silence followed by one giant text-delta event.
 * Forcing the synthetic-tool path restores token-by-token streaming via input_json_delta events.
 *
 * Consumer path (in stream-handler.ts): both `fullStream` (raw text-delta events containing
 * JSON tokens) and `partialOutputStream` (pre-parsed object deltas) are consumed in parallel
 * and both feed `processObjectDelta` here. They're deduped by length: `_doProcessObjectDelta`'s
 * Text branch only streams when currentText.length > previousTextContent.length.
 *
 * Wire-format mapping (what we emit vs what the model generated):
 *   - `{name: "Text", props: {text}}` components → streamed as text-delta wire events
 *     (via `streamHelper.streamText`). Their identity is flattened — the client sees plain
 *     text, not a data-component payload. We emit a '\n\n' separator when transitioning
 *     between distinct Text ids so consecutive Text blocks don't render as one run-on
 *     paragraph in Markdown.
 *   - Everything else (Card, Artifact, ArtifactCreate_*, etc.) → streamed as data-component
 *     wire events (via `streamHelper.writeData('data-component', data)`).
 *
 * Non-Text gating: we only emit a non-Text component when we have positional evidence that
 * the parser has moved past it — specifically, when a later component exists in the array.
 * Under fine-grained token streaming, a component frequently appears with empty/partial props
 * for one or more parses before filling in; the old snapshot-stability heuristic misfired on
 * these and produced empty `{}` or `{"id":""}` data-component events. The last visible
 * component is deferred to `finalize()` which runs after the stream closes.
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
  private subAgentId?: string;
  private allStreamedContent: StreamPart[] = [];
  private writeQueue: Promise<void> = Promise.resolve();
  private lastStreamedTextComponentId: string | null = null;

  private static readonly MAX_SNAPSHOT_SIZE = STREAM_PARSER_MAX_SNAPSHOT_SIZE; // Max number of snapshots to keep
  private static readonly MAX_STREAMED_SIZE = STREAM_PARSER_MAX_STREAMED_SIZE; // Max number of streamed component IDs to track
  private static readonly MAX_COLLECTED_PARTS = STREAM_PARSER_MAX_COLLECTED_PARTS; // Max number of collected parts to prevent unbounded growth

  constructor(
    streamHelper: StreamHelper,
    executionContext: FullExecutionContext,
    contextId: string,
    artifactParserOptions?: {
      sessionId?: string;
      taskId?: string;
      artifactComponents?: any[];
      streamRequestId?: string;
      subAgentId?: string;
      contextWindowSize?: number;
    }
  ) {
    this.streamHelper = streamHelper;
    this.contextId = contextId;
    this.subAgentId = artifactParserOptions?.subAgentId;

    if (artifactParserOptions?.streamRequestId) {
      const sessionParser = agentSessionManager.getArtifactParser(
        artifactParserOptions.streamRequestId
      );

      if (sessionParser) {
        this.artifactParser = sessionParser;
        return;
      }
    }

    let sharedArtifactService = null;
    if (
      artifactParserOptions?.streamRequestId &&
      typeof agentSessionManager.getArtifactService === 'function'
    ) {
      try {
        sharedArtifactService = agentSessionManager.getArtifactService(
          artifactParserOptions.streamRequestId
        );
      } catch (_error) {}
    }

    this.artifactParser = new ArtifactParser(executionContext, {
      ...artifactParserOptions,
      contextId,
      artifactService: sharedArtifactService, // Use shared ArtifactService if available
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
   * Process a new text chunk for text streaming (handles artifact markers).
   * Writes are serialized via the internal writeQueue so concurrent callers
   * (fullStream + partialOutputStream) cannot corrupt shared state.
   */
  async processTextChunk(chunk: string): Promise<void> {
    const next = this.writeQueue.then(() => this._doProcessTextChunk(chunk));
    this.writeQueue = next.catch((err) => {
      logger.error(
        {
          err,
          contextId: this.contextId,
          op: 'processTextChunk',
          pendingTextBufferSize: this.pendingTextBuffer.length,
          bufferSize: this.buffer.length,
        },
        'writeQueue entry failed; subsequent writes may run on inconsistent parser state'
      );
    });
    return next;
  }

  /**
   * Process object deltas directly from Vercel AI SDK's fullStream.
   * Writes are serialized via the internal writeQueue so concurrent callers
   * (fullStream + partialOutputStream) cannot corrupt shared state.
   */
  async processObjectDelta(delta: any): Promise<void> {
    const next = this.writeQueue.then(() => this._doProcessObjectDelta(delta));
    this.writeQueue = next.catch((err) => {
      logger.error(
        {
          err,
          contextId: this.contextId,
          op: 'processObjectDelta',
          pendingTextBufferSize: this.pendingTextBuffer.length,
          bufferSize: this.buffer.length,
        },
        'writeQueue entry failed; subsequent writes may run on inconsistent parser state'
      );
    });
    return next;
  }

  private async _doProcessTextChunk(chunk: string): Promise<void> {
    if (this.lastChunkWasToolResult && this.buffer === '' && chunk) {
      chunk = `\n\n${chunk}`;
      this.lastChunkWasToolResult = false;
    }

    this.buffer += chunk;

    const parseResult = await this.parseTextBuffer();

    for (const part of parseResult.completeParts) {
      await this.streamPart(part);
    }

    this.buffer = parseResult.remainingBuffer;
  }

  private async _doProcessObjectDelta(delta: any): Promise<void> {
    if (!delta || typeof delta !== 'object') {
      return;
    }

    this.componentAccumulator = this.deepMerge(this.componentAccumulator, delta);

    const components = this.componentAccumulator.dataComponents;
    if (!Array.isArray(components)) return;

    // Step 1: flush any previously-seen non-Text components that have been evicted from the
    // current accumulator (e.g., step 2 replaced step 1's dataComponents array). Text components
    // are explicitly skipped — they were already emitted as text-delta events, not data-components.
    const currentComponentIds = new Set(components.filter((c: any) => c?.id).map((c: any) => c.id));
    await this.flushEvictedComponents(currentComponentIds);

    // Step 2: process each component in the current array. Text components stream incrementally
    // as text-delta events; everything else is emitted as a data-component event once we have
    // positional proof it's complete (a later component has appeared).
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      if (!component?.id) continue;

      const componentKey = component.id;
      if (this.lastStreamedComponents.has(componentKey)) continue;

      const previousSnapshot = this.componentSnapshots.get(componentKey);
      const currentSnapshot = JSON.stringify(component);
      this.rememberSnapshot(componentKey, currentSnapshot);

      if (isTextComponent(component)) {
        await this.streamTextComponentDelta(component, componentKey, previousSnapshot);
        continue;
      }

      const isLastInArray = i === components.length - 1;
      if (!isLastInArray && this.isComponentComplete(component)) {
        await this.streamComponent(component);
      }
    }
  }

  /**
   * Emit any non-Text components that were present in earlier deltas but are no longer in the
   * current accumulator (e.g., the model replaced dataComponents between steps). Text components
   * are skipped because their content was already flushed to the client as text-delta events.
   */
  private async flushEvictedComponents(currentComponentIds: Set<string>): Promise<void> {
    for (const [componentId, snapshot] of this.componentSnapshots.entries()) {
      if (currentComponentIds.has(componentId)) continue;
      if (this.lastStreamedComponents.has(componentId)) continue;
      try {
        const component = JSON.parse(snapshot);
        if (isTextComponent(component)) continue;
        if (this.isComponentComplete(component)) {
          await this.streamComponent(component);
        }
      } catch (_e) {
        // Ignore un-parseable snapshots — they can't be safely re-emitted anyway.
      }
    }
  }

  /**
   * Stream the incremental text diff for a Text component. Under fine-grained token streaming
   * the component usually appears one or more times with empty props.text before any characters
   * land, so this method is a no-op until the text content actually grows.
   *
   * Emits a '\n\n' paragraph separator when transitioning between distinct Text ids so
   * consecutive Text blocks don't render as one run-on paragraph in Markdown. The separator
   * gate is `previousTextContent === ''` — the first time we stream any content for this id —
   * rather than "first time we see the component", because the component often appears with an
   * empty string value before the first token of text arrives.
   */
  private async streamTextComponentDelta(
    component: any,
    componentKey: string,
    previousSnapshot: string | undefined
  ): Promise<void> {
    const previousTextContent = previousSnapshot
      ? JSON.parse(previousSnapshot).props?.text || ''
      : '';
    const currentTextContent = component.props?.text ?? '';

    if (currentTextContent.length <= previousTextContent.length) return;

    const newText = currentTextContent.slice(previousTextContent.length);

    if (!this.hasStartedRole) {
      await this.streamHelper.writeRole('assistant');
      this.hasStartedRole = true;
    }

    const isFirstChunkOfNewTextId =
      this.lastStreamedTextComponentId !== null &&
      this.lastStreamedTextComponentId !== componentKey &&
      previousTextContent === '';

    if (isFirstChunkOfNewTextId) {
      await this.emitTextToClient('\n\n');
    }

    await this.emitTextToClient(newText);
    this.lastStreamedTextComponentId = componentKey;
  }

  /**
   * Write a text chunk to the client stream and record it in the collected/streamed buffers.
   */
  private async emitTextToClient(text: string): Promise<void> {
    await this.streamHelper.streamText(text, 0);
    const textPart: StreamPart = { kind: 'text', text };
    this.collectedParts.push(textPart);
    this.allStreamedContent.push(textPart);
  }

  /**
   * Store the latest JSON snapshot for a component id, evicting the oldest entry when the cap
   * is reached to bound memory.
   */
  private rememberSnapshot(componentKey: string, snapshot: string): void {
    this.componentSnapshots.set(componentKey, snapshot);
    if (this.componentSnapshots.size > IncrementalStreamParser.MAX_SNAPSHOT_SIZE) {
      const firstKey = this.componentSnapshots.keys().next().value;
      if (firstKey) this.componentSnapshots.delete(firstKey);
    }
  }

  /**
   * Stream a component and mark it as streamed
   * Note: Text components are handled separately with incremental streaming
   */
  private async streamComponent(component: any): Promise<void> {
    const parts = await this.artifactParser.parseObject(
      {
        dataComponents: [component],
      },
      this.artifactMap,
      this.subAgentId
    );

    if (!Array.isArray(parts)) {
      console.warn('parseObject returned non-array:', parts);
      return;
    }

    for (const part of parts) {
      await this.streamPart(part);
    }

    this.lastStreamedComponents.set(component.id, true);

    if (this.lastStreamedComponents.size > IncrementalStreamParser.MAX_STREAMED_SIZE) {
      const firstKey = this.lastStreamedComponents.keys().next().value;
      if (firstKey) {
        this.lastStreamedComponents.delete(firstKey);
      }
    }

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

    if (!component.props || typeof component.props !== 'object') {
      return false;
    }

    const isArtifact =
      component.name === 'Artifact' ||
      (component.props.artifact_id && (component.props.tool_call_id || component.props.task_id));

    if (isArtifact) {
      return Boolean(
        component.props.artifact_id && (component.props.tool_call_id || component.props.task_id)
      );
    }

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
        if (!hasBeenStreamed && this.isComponentComplete(component) && component.name !== 'Text') {
          const parts = await this.artifactParser.parseObject(
            {
              dataComponents: [component],
            },
            this.artifactMap,
            this.subAgentId
          );

          for (const part of parts) {
            await this.streamPart(part);
          }

          this.lastStreamedComponents.set(componentKey, true);

          if (this.lastStreamedComponents.size > IncrementalStreamParser.MAX_STREAMED_SIZE) {
            const firstKey = this.lastStreamedComponents.keys().next().value;
            if (firstKey) {
              this.lastStreamedComponents.delete(firstKey);
            }
          }

          this.componentSnapshots.delete(componentKey);
        }
      }
    }

    if (this.buffer) {
      const part: StreamPart = {
        kind: 'text',
        text: this.buffer,
      };
      await this.streamPart(part);
    }

    if (this.pendingTextBuffer) {
      const cleanedText = this.pendingTextBuffer
        .replace(/<\/?artifact:ref(?:\s[^>]*)?>\/?>/g, '') // Remove artifact:ref tags safely
        .replace(/<\/?artifact(?:\s[^>]*)?>\/?>/g, '') // Remove artifact tags safely
        .replace(/<\/artifact:ref>/g, '') // Remove closing artifact:ref tags
        .replace(/<\/(?:\w+:)?artifact>/g, ''); // Remove closing artifact tags safely

      if (cleanedText) {
        const textPart: StreamPart = {
          kind: 'text',
          text: cleanedText,
        };
        this.collectedParts.push(textPart);

        this.allStreamedContent.push(textPart);

        await this.streamHelper.streamText(cleanedText, 0);
      }
      this.pendingTextBuffer = '';
    }

    this.componentSnapshots.clear();
    this.lastStreamedComponents.clear();
    this.componentAccumulator = {};
  }

  /**
   * Get all collected parts for building the final response
   */
  getCollectedParts(): StreamPart[] {
    return [...this.collectedParts];
  }

  /**
   * Get all streamed content that was actually sent to the user
   */
  getAllStreamedContent(): StreamPart[] {
    return [...this.allStreamedContent];
  }

  /**
   * Parse buffer for complete artifacts and text parts (for text streaming)
   */
  private async parseTextBuffer(): Promise<ParseResult> {
    const completeParts: StreamPart[] = [];
    const workingBuffer = this.buffer;

    if (this.artifactParser.hasIncompleteArtifact(workingBuffer)) {
      const safeEnd = this.artifactParser.findSafeTextBoundary(workingBuffer);

      if (safeEnd > 0) {
        const safeText = workingBuffer.slice(0, safeEnd);
        const parts = await this.artifactParser.parseText(
          safeText,
          this.artifactMap,
          this.subAgentId
        );
        completeParts.push(...parts);

        return {
          completeParts,
          remainingBuffer: workingBuffer.slice(safeEnd),
        };
      }

      return {
        completeParts: [],
        remainingBuffer: workingBuffer,
      };
    }

    // No incomplete artifacts, parse the entire buffer
    const parts = await this.artifactParser.parseText(
      workingBuffer,
      this.artifactMap,
      this.subAgentId
    );

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

    this.allStreamedContent.push({ ...part });

    // Enforce size limit to prevent memory leaks
    if (this.collectedParts.length > IncrementalStreamParser.MAX_COLLECTED_PARTS) {
      // Remove oldest parts (keep last N parts)
      const excess = this.collectedParts.length - IncrementalStreamParser.MAX_COLLECTED_PARTS;
      this.collectedParts.splice(0, excess);
    }

    // Also enforce size limit for streamed content
    if (this.allStreamedContent.length > IncrementalStreamParser.MAX_COLLECTED_PARTS) {
      const excess = this.allStreamedContent.length - IncrementalStreamParser.MAX_COLLECTED_PARTS;
      this.allStreamedContent.splice(0, excess);
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
        const cleanedText = this.pendingTextBuffer
          .replace(/<\/?artifact:ref(?:\s[^>]*)?>\/?>/g, '') // Remove artifact:ref tags safely
          .replace(/<\/?artifact(?:\s[^>]*)?>\/?>/g, '') // Remove artifact tags safely
          .replace(/<\/artifact:ref>/g, '') // Remove closing artifact:ref tags
          .replace(/<\/(?:\w+:)?artifact>/g, ''); // Remove closing artifact tags safely

        if (cleanedText) {
          await this.streamHelper.streamText(cleanedText, 0);
        }
        this.pendingTextBuffer = '';
      }
    } else if (part.kind === 'data' && part.data) {
      // Flush any pending text before streaming data
      if (this.pendingTextBuffer) {
        const cleanedText = this.pendingTextBuffer
          .replace(/<\/?artifact:ref(?:\s[^>]*)?>\/?>/g, '') // Remove artifact:ref tags safely
          .replace(/<\/?artifact(?:\s[^>]*)?>\/?>/g, '') // Remove artifact tags safely
          .replace(/<\/artifact:ref>/g, '') // Remove closing artifact:ref tags
          .replace(/<\/(?:\w+:)?artifact>/g, ''); // Remove closing artifact tags safely

        if (cleanedText) {
          await this.streamHelper.streamText(cleanedText, 0);
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
