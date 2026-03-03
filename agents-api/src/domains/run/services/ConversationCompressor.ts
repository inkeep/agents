import type { ModelSettings } from '@inkeep/agents-core';
import { getLogger } from '../../../logger';
import {
  type ConversationHistorySummary,
  distillConversationHistory,
} from '../tools/distill-conversation-history-tool';
import type { CompressedArtifactInfo } from '../utils/artifact-utils';
import {
  BaseCompressor,
  type CompressionConfig,
  type CompressionResult,
  getModelAwareCompressionConfig,
} from './BaseCompressor';

const logger = getLogger('ConversationCompressor');

/**
 * Conversation-level compressor
 * Compresses entire conversations for long-term storage or analysis
 */
export class ConversationCompressor extends BaseCompressor {
  private readonly priorSummary: ConversationHistorySummary | null;

  constructor(
    sessionId: string,
    conversationId: string,
    tenantId: string,
    projectId: string,
    options?: {
      config?: CompressionConfig;
      summarizerModel?: ModelSettings;
      baseModel?: ModelSettings;
      priorSummary?: ConversationHistorySummary | null;
    }
  ) {
    const compressionConfig =
      options?.config || getModelAwareCompressionConfig(options?.summarizerModel, 0.5);
    super(
      sessionId,
      conversationId,
      tenantId,
      projectId,
      compressionConfig,
      options?.summarizerModel,
      options?.baseModel
    );
    this.priorSummary = options?.priorSummary ?? null;
  }

  /**
   * Get compression type for this compressor
   */
  getCompressionType(): 'conversation_level' {
    return 'conversation_level';
  }

  /**
   * Check if compression is needed based on total context size exceeding conversation limits
   */
  isCompressionNeeded(messages: any[]): boolean {
    const contextSize = this.calculateContextSize(messages);
    const remaining = this.config.hardLimit - contextSize;
    const needsCompression = remaining <= this.config.safetyBuffer;

    logger.debug(
      {
        sessionId: this.sessionId,
        contextSize,
        hardLimit: this.config.hardLimit,
        safetyBuffer: this.config.safetyBuffer,
        remaining,
        needsCompression,
      },
      'Checking conversation compression criteria'
    );

    return needsCompression;
  }

  /**
   * Perform conversation-level compression
   * Unlike mid-generation, this compresses ALL messages in the conversation
   */
  async compress(messages: any[]): Promise<CompressionResult> {
    const contextSizeBefore = this.calculateContextSize(messages);

    logger.info(
      {
        sessionId: this.sessionId,
        messageCount: messages.length,
        contextSize: contextSizeBefore,
      },
      'CONVERSATION COMPRESSION: Starting compression'
    );

    // For conversation-level compression, process ALL messages (no partial processing)
    const toolCallToArtifactMap = await this.saveToolResultsAsArtifacts(messages, 0);

    // Create comprehensive conversation summary
    const summary = await this.createConversationSummary(messages, toolCallToArtifactMap);

    // Calculate context size after compression
    const contextSizeAfter = this.estimateTokens(JSON.stringify(summary));

    // Record compression event
    this.recordCompressionEvent({
      reason: 'automatic',
      messageCount: messages.length,
      artifactCount: Object.keys(toolCallToArtifactMap).length,
      contextSizeBefore,
      contextSizeAfter,
      compressionType: this.getCompressionType(),
    });

    logger.info(
      {
        sessionId: this.sessionId,
        artifactsCreated: Object.keys(toolCallToArtifactMap).length,
        messageCount: messages.length,
        contextSizeBefore,
        contextSizeAfter,
        compressionRatio: contextSizeAfter / contextSizeBefore,
        artifactIds: Object.values(toolCallToArtifactMap).map((info) => info.artifactId),
      },
      'CONVERSATION COMPRESSION: Compression completed successfully'
    );

    return {
      artifactIds: Object.values(toolCallToArtifactMap).map((info) => info.artifactId),
      summary,
    };
  }

  /**
   * Override createConversationSummary for conversation-level compression
   * Uses specialized conversation history distillation instead of the base implementation
   */
  protected async createConversationSummary(
    messages: any[],
    toolCallToArtifactMap: Record<string, CompressedArtifactInfo>
  ): Promise<any> {
    if (!this.summarizerModel) {
      throw new Error('Summarizer model is required for conversation history compression');
    }

    // Use the specialized conversation history distillation
    return await distillConversationHistory({
      conversationId: this.conversationId,
      summarizerModel: this.summarizerModel,
      currentSummary: this.priorSummary,
      messageFormatter: (maxChars) =>
        this.formatMessagesForDistillation(messages, toolCallToArtifactMap, maxChars),
    });
  }
}
