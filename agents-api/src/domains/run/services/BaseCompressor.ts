import { randomUUID } from 'node:crypto';
import type { ModelSettings } from '@inkeep/agents-core';
import { getLedgerArtifacts } from '@inkeep/agents-core';
import { type Span, SpanStatusCode } from '@opentelemetry/api';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { type ConversationSummary, distillConversation } from '../tools/distill-conversation-tool';
import { type ArtifactInfo, detectOversizedArtifact } from '../utils/artifact-utils';
import { getCompressionConfigForModel, getModelContextWindow } from '../utils/model-context-utils';
import { tracer } from '../utils/tracer';
import { agentSessionManager } from './AgentSession';

const logger = getLogger('BaseCompressor');

export interface CompressionConfig {
  hardLimit: number;
  safetyBuffer: number;
  enabled?: boolean;
}

export interface CompressionResult {
  artifactIds: string[];
  summary: any;
}

export interface CompressionEventData {
  reason: 'manual' | 'automatic';
  messageCount: number;
  artifactCount: number;
  contextSizeBefore: number;
  contextSizeAfter: number;
  compressionType: 'mid_generation' | 'conversation_level';
}

/**
 * Base compressor class containing shared functionality for all compression types
 */
export abstract class BaseCompressor {
  protected processedToolCalls = new Set<string>();
  protected cumulativeSummary: ConversationSummary | null = null;
  protected contextWindowSize?: number;

  constructor(
    protected sessionId: string,
    protected conversationId: string,
    protected tenantId: string,
    protected projectId: string,
    protected config: CompressionConfig,
    protected summarizerModel?: ModelSettings,
    protected baseModel?: ModelSettings
  ) {
    // Calculate context window size from baseModel if available
    if (baseModel) {
      const modelContextInfo = getModelContextWindow(baseModel);
      this.contextWindowSize = modelContextInfo.contextWindow ?? undefined;
      logger.debug(
        {
          sessionId,
          model: baseModel.model,
          contextWindowSize: this.contextWindowSize,
        },
        'BaseCompressor initialized with context window size'
      );
    }
  }

  /**
   * Get the hard limit for compression decisions
   */
  getHardLimit(): number {
    return this.config.hardLimit;
  }

  /**
   * Estimate tokens (4 chars = 1 token)
   */
  protected estimateTokens(content: any): number {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate total context size for messages
   */
  protected calculateContextSize(messages: any[]): number {
    const messageTokens = messages.reduce((total, msg) => {
      let msgTokens = 0;

      // Handle Vercel AI SDK message format
      if (Array.isArray(msg.content)) {
        // Content is array of content blocks
        for (const block of msg.content) {
          if (block.type === 'text') {
            msgTokens += this.estimateTokens(block.text || '');
          } else if (block.type === 'tool-call') {
            msgTokens += this.estimateTokens(
              JSON.stringify({
                toolCallId: block.toolCallId,
                toolName: block.toolName,
                input: block.input,
              })
            );
          } else if (block.type === 'tool-result') {
            msgTokens += this.estimateTokens(
              JSON.stringify({
                toolCallId: block.toolCallId,
                toolName: block.toolName,
                output: block.output,
              })
            );
          }
        }
      } else if (typeof msg.content === 'string') {
        // Content is a simple string
        msgTokens += this.estimateTokens(msg.content);
      } else if (msg.content) {
        // Fallback - try to stringify the content
        msgTokens += this.estimateTokens(JSON.stringify(msg.content));
      }

      return total + msgTokens;
    }, 0);

    return messageTokens;
  }

  /**
   * Save tool results as artifacts
   */
  async saveToolResultsAsArtifacts(
    messages: any[],
    startIndex: number = 0
  ): Promise<Record<string, ArtifactInfo>> {
    const session = agentSessionManager.getSession(this.sessionId);
    if (!session) {
      throw new Error(`No session found: ${this.sessionId}`);
    }

    const messagesToProcess = messages.slice(startIndex);

    // Step 1: Extract all tool call IDs and batch lookup existing artifacts (solve N+1)
    const toolCallIds = this.extractToolCallIds(messagesToProcess);
    const existingArtifacts = await this.batchFindExistingArtifacts(toolCallIds);

    const toolCallToArtifactMap: Record<string, ArtifactInfo> = {};

    // Step 2: Process messages with existing artifacts cache
    for (const message of messagesToProcess) {
      // Convert database format to SDK format if needed
      this.convertDatabaseFormatMessage(message);

      // Process SDK format messages
      if (Array.isArray(message.content)) {
        const messageArtifacts = await this.processMessageToolResults(
          message,
          session,
          existingArtifacts
        );
        Object.assign(toolCallToArtifactMap, messageArtifacts);
      }
    }

    return toolCallToArtifactMap;
  }

  /**
   * Extract all tool call IDs from messages for batch lookup
   */
  private extractToolCallIds(messages: any[]): string[] {
    const toolCallIds: string[] = [];

    for (const message of messages) {
      // Handle database format
      if (message.messageType === 'tool-result' && !Array.isArray(message.content)) {
        const toolCallId = message.metadata?.a2a_metadata?.toolCallId;
        if (toolCallId && !this.shouldSkipToolCall(message.metadata?.a2a_metadata?.toolName)) {
          toolCallIds.push(toolCallId);
        }
      }

      // Handle SDK format
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'tool-result' && !this.shouldSkipToolCall(block.toolName)) {
            toolCallIds.push(block.toolCallId);
          }
        }
      }
    }

    return [...new Set(toolCallIds)]; // Remove duplicates
  }

  /**
   * Batch lookup existing artifacts for multiple tool call IDs (solves N+1 query problem)
   */
  private async batchFindExistingArtifacts(toolCallIds: string[]): Promise<Map<string, string>> {
    const existingArtifacts = new Map<string, string>();

    if (toolCallIds.length === 0) {
      return existingArtifacts;
    }

    try {
      // Use SQL IN clause to batch query all tool call IDs at once
      const artifacts = await this.queryExistingArtifactsBatch(toolCallIds);

      for (const artifact of artifacts) {
        if (artifact.toolCallId) {
          existingArtifacts.set(artifact.toolCallId, artifact.artifactId);
        }
      }

      logger.debug(
        {
          sessionId: this.sessionId,
          toolCallIds: toolCallIds.length,
          foundArtifacts: existingArtifacts.size,
        },
        'Batched artifact lookup completed'
      );
    } catch (error) {
      logger.debug(
        {
          sessionId: this.sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Batch artifact lookup failed, will create new artifacts'
      );
    }

    return existingArtifacts;
  }

  /**
   * Query database for existing artifacts using enhanced getLedgerArtifacts with batch support
   */
  private async queryExistingArtifactsBatch(toolCallIds: string[]): Promise<any[]> {
    if (toolCallIds.length === 0) {
      return [];
    }

    try {
      // Use the enhanced getLedgerArtifacts with toolCallIds for batch query
      const artifacts = await getLedgerArtifacts(runDbClient)({
        scopes: { tenantId: this.tenantId, projectId: this.projectId },
        toolCallIds: toolCallIds,
      });

      // Map to expected format for compatibility
      return artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        toolCallId: artifact.toolCallId,
      }));
    } catch (error) {
      logger.debug(
        {
          sessionId: this.sessionId,
          toolCallIds: toolCallIds.length,
          error: error instanceof Error ? error.message : String(error),
        },
        'Batch artifact lookup failed'
      );
      return [];
    }
  }

  /**
   * Convert database format tool-result messages to Vercel AI SDK format
   */
  private convertDatabaseFormatMessage(message: any): void {
    if (
      message.messageType === 'tool-result' &&
      !Array.isArray(message.content) &&
      message.content?.text
    ) {
      const toolName = message.metadata?.a2a_metadata?.toolName;
      const toolCallId = message.metadata?.a2a_metadata?.toolCallId;

      // Skip internal tools
      if (this.shouldSkipToolCall(toolName)) {
        return;
      }

      if (toolName && toolCallId) {
        // Convert to SDK format
        message.content = [
          {
            type: 'tool-result',
            toolCallId: toolCallId,
            toolName: toolName,
            output: message.content.text,
          },
        ];
      }
    }
  }

  /**
   * Process all tool results in a message
   */
  private async processMessageToolResults(
    message: any,
    session: any,
    existingArtifacts: Map<string, string>
  ): Promise<Record<string, ArtifactInfo>> {
    const toolCallToArtifactMap: Record<string, ArtifactInfo> = {};

    for (const block of message.content) {
      if (block.type === 'tool-result') {
        const artifactInfo = await this.processToolResult(
          block,
          message,
          session,
          existingArtifacts
        );
        if (artifactInfo) {
          toolCallToArtifactMap[block.toolCallId] = artifactInfo;
        }
      }
    }

    return toolCallToArtifactMap;
  }

  /**
   * Process a single tool result block
   */
  private async processToolResult(
    block: any,
    message: any,
    session: any,
    existingArtifacts: Map<string, string>
  ): Promise<ArtifactInfo | null> {
    // Skip internal tools
    if (this.shouldSkipToolCall(block.toolName)) {
      logger.debug(
        {
          toolCallId: block.toolCallId,
          toolName: block.toolName,
        },
        'Skipping special tool - not creating artifacts'
      );
      this.processedToolCalls.add(block.toolCallId);
      return null;
    }

    // Skip already processed tool calls
    if (this.processedToolCalls.has(block.toolCallId)) {
      logger.debug(
        {
          toolCallId: block.toolCallId,
          toolName: block.toolName,
        },
        'Skipping already processed tool call'
      );
      return null;
    }

    // Check for existing artifact in cache (no more N+1 queries!)
    const existingArtifactId = existingArtifacts.get(block.toolCallId);
    if (existingArtifactId) {
      logger.debug(
        {
          toolCallId: block.toolCallId,
          existingArtifactId: existingArtifactId,
          toolName: block.toolName,
        },
        'Reusing existing artifact from batch lookup'
      );
      // Existing artifact - assume not oversized since we don't have metadata for existing artifacts
      // LIMITATION: This assumption is safe when compressing new conversations, but could be problematic
      // when re-compressing conversations that already contain oversized artifacts. In such cases,
      // the distillation prompt may incorrectly try to include the full tool result output instead
      // of just metadata. To fix this properly, getLedgerArtifacts() would need to return the
      // metadata.isOversized flag along with artifact IDs.
      return {
        artifactId: existingArtifactId,
        isOversized: false,
      };
    }

    // Create new artifact
    return await this.createNewArtifact(block, message, session);
  }

  /**
   * Check if a tool should be skipped
   */
  private shouldSkipToolCall(toolName: string): boolean {
    return (
      toolName === 'get_reference_artifact' ||
      toolName === 'load_skill' ||
      toolName === 'thinking_complete' ||
      toolName?.includes('save_tool_result') ||
      toolName?.startsWith('transfer_to_')
    );
  }

  /**
   * Create a new artifact for a tool call
   */
  private async createNewArtifact(
    block: any,
    message: any,
    session: any
  ): Promise<ArtifactInfo | null> {
    const artifactId = `compress_${block.toolName || 'tool'}_${block.toolCallId || Date.now()}_${randomUUID().slice(0, 8)}`;

    // Find corresponding tool input
    const toolInput = this.findToolInput(message, block.toolCallId);

    // Prepare tool result data
    const toolResultData = {
      toolName: block.toolName,
      toolInput: toolInput,
      toolResult: this.removeStructureHints(block.output),
      compressedAt: new Date().toISOString(),
    };

    // Skip if data is empty
    if (this.isEmpty(toolResultData)) {
      logger.debug(
        {
          toolName: block.toolName,
          toolCallId: block.toolCallId,
        },
        'Skipping empty tool result'
      );
      return null;
    }

    // Create artifact data
    const artifactData = this.buildArtifactData(artifactId, block, toolResultData);

    // Final validation
    if (!this.validateArtifactData(artifactData)) {
      logger.debug(
        {
          artifactId,
          toolName: block.toolName,
          toolCallId: block.toolCallId,
        },
        'Skipping empty compression artifact'
      );
      return null;
    }

    // Save artifact
    session.recordEvent('artifact_saved', this.sessionId, artifactData);
    this.processedToolCalls.add(block.toolCallId);

    logger.debug(
      {
        artifactId,
        toolName: block.toolName,
        toolCallId: block.toolCallId,
      },
      'Created new compression artifact'
    );

    // Extract metadata for oversized detection
    return {
      artifactId,
      isOversized: artifactData.metadata?.isOversized || false,
      toolArgs: artifactData.metadata?.toolArgs,
      structureInfo: artifactData.summaryData?._structureInfo,
      oversizedWarning: artifactData.summaryData?._oversizedWarning,
    };
  }

  /**
   * Find tool input for a given tool call ID
   */
  private findToolInput(message: any, toolCallId: string): any {
    if (!Array.isArray(message.content)) {
      return null;
    }

    const toolCall = message.content.find(
      (b: any) => b.type === 'tool-call' && b.toolCallId === toolCallId
    );
    return toolCall?.input || null;
  }

  /**
   * Build artifact data structure
   */
  private buildArtifactData(artifactId: string, block: any, toolResultData: any): any {
    // Detect if artifact data is oversized
    const oversizedDetection = detectOversizedArtifact(toolResultData, this.contextWindowSize, {
      artifactId,
      toolCallId: block.toolCallId,
      toolName: block.toolName,
    });

    // Build summary data with oversized warning if needed
    const summaryData: any = {
      toolCallId: block.toolCallId,
      toolName: block.toolName,
      resultPreview: this.generateResultPreview(toolResultData.toolResult),
      note: `Tool result from ${block.toolName} - compressed to save context space`,
    };

    if (oversizedDetection.isOversized) {
      summaryData._oversizedWarning = oversizedDetection.oversizedWarning;
      summaryData._structureInfo = oversizedDetection.structureInfo;
    }

    return {
      artifactId,
      taskId: `task_${this.conversationId}-${this.sessionId}`,
      toolCallId: block.toolCallId,
      artifactType: 'tool_result',
      pendingGeneration: true,
      tenantId: this.tenantId,
      projectId: this.projectId,
      contextId: this.conversationId,
      subAgentId: this.sessionId,
      metadata: {
        toolCallId: block.toolCallId,
        toolName: block.toolName,
        toolArgs: block.input || null,
        compressionReason: this.getCompressionType(),
        isOversized: oversizedDetection.isOversized,
        originalTokenSize: oversizedDetection.originalTokenSize,
        contextWindowSize: oversizedDetection.contextWindowSize,
        retrievalBlocked: oversizedDetection.retrievalBlocked,
      },
      summaryData,
      data: toolResultData,
    };
  }

  /**
   * Validate artifact data has meaningful content
   */
  private validateArtifactData(artifactData: any): boolean {
    const fullData = artifactData.data;
    return (
      fullData &&
      typeof fullData === 'object' &&
      Object.keys(fullData).length > 0 &&
      fullData.toolResult &&
      (typeof fullData.toolResult !== 'object' || Object.keys(fullData.toolResult).length > 0)
    );
  }

  /**
   * Create conversation summary using distillConversation
   */
  protected async createConversationSummary(
    messages: any[],
    toolCallToArtifactMap: Record<string, ArtifactInfo>
  ): Promise<any> {
    const summary = await distillConversation({
      messages: messages,
      conversationId: this.conversationId,
      currentSummary: this.cumulativeSummary,
      summarizerModel: this.summarizerModel,
      toolCallToArtifactMap: toolCallToArtifactMap,
    });

    // Update cumulative summary for next compression cycle
    this.cumulativeSummary = summary;

    return summary;
  }

  /**
   * Record compression event in session
   */
  /**
   * Generate a preview of the tool result for the artifact summary
   */
  protected generateResultPreview(toolResult: any): string {
    try {
      if (!toolResult) return 'No result data';

      let preview: string;
      if (typeof toolResult === 'string') {
        preview = toolResult;
      } else if (typeof toolResult === 'object') {
        preview = JSON.stringify(toolResult);
      } else {
        preview = String(toolResult);
      }

      // Limit to 150 characters and clean up
      return (
        preview.slice(0, 150).replace(/\s+/g, ' ').trim() + (preview.length > 150 ? '...' : '')
      );
    } catch {
      return 'Preview unavailable';
    }
  }

  protected recordCompressionEvent(eventData: CompressionEventData): void {
    const session = agentSessionManager.getSession(this.sessionId);
    if (session) {
      session.recordEvent('compression', this.sessionId, eventData);
    }
  }

  /**
   * Check if tool result data is effectively empty
   */
  protected isEmpty(toolResultData: any): boolean {
    if (!toolResultData || typeof toolResultData !== 'object') {
      return true;
    }

    // Check if toolResult is empty/null/undefined
    const { toolResult } = toolResultData;
    if (!toolResult) {
      return true;
    }

    // Check if toolResult is an empty object
    if (typeof toolResult === 'object' && !Array.isArray(toolResult)) {
      const keys = Object.keys(toolResult);
      if (keys.length === 0) {
        return true;
      }

      // Check if all values are empty/null/undefined
      return keys.every((key) => {
        const value = toolResult[key];
        if (value === null || value === undefined || value === '') {
          return true;
        }
        if (Array.isArray(value) && value.length === 0) {
          return true;
        }
        if (typeof value === 'object' && Object.keys(value).length === 0) {
          return true;
        }
        return false;
      });
    }

    // Check if toolResult is an empty array
    if (Array.isArray(toolResult) && toolResult.length === 0) {
      return true;
    }

    // Check if toolResult is an empty string
    if (typeof toolResult === 'string' && toolResult.trim() === '') {
      return true;
    }

    return false;
  }

  /**
   * Recursively remove _structureHints from an object
   */
  protected removeStructureHints(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.removeStructureHints(item));
    }

    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key !== '_structureHints') {
          cleaned[key] = this.removeStructureHints(value);
        }
      }
      return cleaned;
    }

    return obj;
  }

  /**
   * Get current compression summary
   */
  getCompressionSummary(): ConversationSummary | null {
    return this.cumulativeSummary;
  }

  /**
   * Clean up memory by clearing processed tool calls and optionally resetting summary
   * Call this at the end of agent generation or after compression cycles
   */
  cleanup(options: { resetSummary?: boolean; keepRecentToolCalls?: number } = {}): void {
    const { resetSummary = false, keepRecentToolCalls = 0 } = options;

    // Clear processed tool calls, optionally keeping some recent ones
    if (keepRecentToolCalls > 0) {
      const recentCalls = Array.from(this.processedToolCalls).slice(-keepRecentToolCalls);
      this.processedToolCalls = new Set(recentCalls);
    } else {
      this.processedToolCalls.clear();
    }

    // Optionally reset cumulative summary
    if (resetSummary) {
      this.cumulativeSummary = null;
    }

    logger.debug(
      {
        sessionId: this.sessionId,
        conversationId: this.conversationId,
        processedToolCallsSize: this.processedToolCalls.size,
        summaryReset: resetSummary,
      },
      'BaseCompressor cleanup completed'
    );
  }

  /**
   * Partial cleanup that preserves recent state for ongoing conversations
   */
  partialCleanup(): void {
    this.cleanup({ keepRecentToolCalls: 50 }); // Keep last 50 tool calls
  }

  /**
   * Full cleanup that resets all state - use when conversation/session ends
   */
  fullCleanup(): void {
    this.cleanup({ resetSummary: true });
  }

  /**
   * Get current state for debugging
   */
  getState() {
    return {
      config: this.config,
      processedToolCalls: Array.from(this.processedToolCalls),
      cumulativeSummary: this.cumulativeSummary,
    };
  }

  /**
   * Safe compression wrapper with fallback handling
   */
  async safeCompress(messages: any[], fullContextSize?: number): Promise<CompressionResult> {
    return await tracer.startActiveSpan(
      'compressor.safe_compress',
      {
        attributes: {
          'compression.type': this.getCompressionType(),
          'compression.session_id': this.sessionId,
          'compression.message_count': messages.length,
          'compression.input_tokens': fullContextSize ?? this.calculateContextSize(messages),
          'compression.hard_limit': this.getHardLimit(),
          'compression.safety_buffer': this.config.safetyBuffer,
        },
      },
      async (compressionSpan: Span) => {
        try {
          const result = await this.compress(messages);

          // Add result attributes
          const resultTokens = Array.isArray(result.summary)
            ? this.calculateContextSize(result.summary)
            : this.estimateTokens(result.summary);

          compressionSpan.setAttributes({
            'compression.result.artifact_count': result.artifactIds.length,
            'compression.result.output_tokens': resultTokens,
            'compression.result.compression_ratio':
              (fullContextSize ?? this.calculateContextSize(messages)) > 0
                ? ((fullContextSize ?? this.calculateContextSize(messages)) - resultTokens) /
                  (fullContextSize ?? this.calculateContextSize(messages))
                : 0,
            'compression.success': true,
            'compression.result.summary': result.summary?.high_level || '',
          });

          compressionSpan.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          logger.error(
            {
              sessionId: this.sessionId,
              conversationId: this.conversationId,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            },
            'Compression failed, using simple fallback'
          );

          compressionSpan.setAttributes({
            'compression.error': error instanceof Error ? error.message : String(error),
          });

          // Use simple compression fallback - same logic as Agent.simpleCompression
          const fallbackResult = await this.simpleCompressionFallback(messages);

          const fallbackTokens = Array.isArray(fallbackResult.summary)
            ? this.calculateContextSize(fallbackResult.summary)
            : this.estimateTokens(fallbackResult.summary);

          compressionSpan.setAttributes({
            'compression.result.artifact_count': fallbackResult.artifactIds.length,
            'compression.result.output_tokens': fallbackTokens,
            'compression.result.compression_ratio':
              (fullContextSize ?? this.calculateContextSize(messages)) > 0
                ? ((fullContextSize ?? this.calculateContextSize(messages)) - fallbackTokens) /
                  (fullContextSize ?? this.calculateContextSize(messages))
                : 0,
            'compression.success': true,
          });

          compressionSpan.setStatus({ code: SpanStatusCode.OK });
          return fallbackResult;
        } finally {
          compressionSpan.end();
        }
      }
    );
  }

  /**
   * Simple compression fallback using the same logic as Agent.simpleCompression
   * Returns the compressed messages, not just a summary
   */
  protected async simpleCompressionFallback(messages: any[]): Promise<CompressionResult> {
    if (messages.length === 0) {
      return {
        artifactIds: [],
        summary: [],
      };
    }

    // Use 50% of hard limit as target
    const targetTokens = Math.floor(this.getHardLimit() * 0.5);
    let totalTokens = this.calculateContextSize(messages);

    if (totalTokens <= targetTokens) {
      return {
        artifactIds: [],
        summary: messages, // Return original messages if no compression needed
      };
    }

    // Keep dropping messages from the beginning until we're under the limit
    const result = [...messages];
    while (totalTokens > targetTokens && result.length > 1) {
      const dropped = result.shift();
      if (dropped) {
        totalTokens -= this.estimateTokens(dropped);
      }
    }

    logger.info(
      {
        sessionId: this.sessionId,
        conversationId: this.conversationId,
        originalCount: messages.length,
        compressedCount: result.length,
        compressionType: 'simple_fallback',
      },
      'Simple compression fallback completed'
    );

    // Return the compressed messages in the summary field
    return {
      artifactIds: [],
      summary: result,
    };
  }

  // Abstract methods that subclasses must implement
  abstract isCompressionNeeded(messages: any[]): boolean;
  abstract compress(messages: any[]): Promise<CompressionResult>;
  abstract getCompressionType(): string;
}

/**
 * Get model-aware compression config for any model
 * @param modelSettings - Model settings to get context window for
 * @param targetPercentage - Target percentage of context window (e.g., 0.5 for conversation, undefined for aggressive)
 */
export function getModelAwareCompressionConfig(
  modelSettings?: ModelSettings,
  targetPercentage?: number
): CompressionConfig {
  const config = getCompressionConfigForModel(modelSettings, targetPercentage);

  return {
    hardLimit: config.hardLimit,
    safetyBuffer: config.safetyBuffer,
    enabled: config.enabled,
  };
}
