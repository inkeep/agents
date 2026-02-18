import type { ModelSettings } from '@inkeep/agents-core';
import { getLogger } from '../../../logger';
import {
  BaseCompressor,
  type CompressionConfig,
  type CompressionResult,
  getModelAwareCompressionConfig,
} from './BaseCompressor';

const logger = getLogger('MidGenerationCompressor');

/**
 * Mid-generation compressor
 * Compresses context when generate() steps get too large with manual compression support
 */
export class MidGenerationCompressor extends BaseCompressor {
  private shouldCompress = false;
  private lastProcessedMessageIndex = 0; // Track where we left off in message processing

  constructor(
    sessionId: string,
    conversationId: string,
    tenantId: string,
    projectId: string,
    config?: CompressionConfig,
    summarizerModel?: ModelSettings,
    baseModel?: ModelSettings
  ) {
    // Use aggressive model-aware config by default, or fall back to provided config
    const compressionConfig = config || getModelAwareCompressionConfig(summarizerModel);
    super(
      sessionId,
      conversationId,
      tenantId,
      projectId,
      compressionConfig,
      summarizerModel,
      baseModel
    );
  }

  /**
   * Get compression type for this compressor
   */
  getCompressionType(): 'mid_generation' {
    return 'mid_generation';
  }

  /**
   * Manual compression request from LLM tool
   */
  requestManualCompression(reason?: string): void {
    this.shouldCompress = true;
    logger.info(
      {
        sessionId: this.sessionId,
        reason: reason || 'Manual request from LLM',
      },
      'Manual compression requested'
    );
  }

  /**
   * Check if compression is needed (either automatic or manual)
   * Supports manual compression requests unique to mid-generation
   */
  isCompressionNeeded(messages: any[]): boolean {
    // Check manual request first - no calculation needed
    if (this.shouldCompress) return true;

    // Use base class logic for automatic compression
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
        manualRequest: this.shouldCompress,
      },
      'Checking mid-generation compression criteria'
    );

    return needsCompression;
  }

  /**
   * Perform mid-generation compression with incremental processing
   * Uses base class functionality with mid-generation specific logic
   */
  async compress(messages: any[]): Promise<CompressionResult> {
    const contextSizeBefore = this.calculateContextSize(messages);

    logger.info(
      {
        sessionId: this.sessionId,
        messageCount: messages.length,
        contextSize: contextSizeBefore,
      },
      'MID-GENERATION COMPRESSION: Starting compression'
    );

    // For mid-generation, process messages from where we left off (incremental)
    const toolCallToArtifactMap = await this.saveToolResultsAsArtifacts(
      messages,
      this.lastProcessedMessageIndex
    );

    // Only distill NEW messages (old messages are already in cumulativeSummary)
    const newMessages = messages.slice(this.lastProcessedMessageIndex);

    // Create conversation summary using base class method with only new messages
    const summary = await this.createConversationSummary(newMessages, toolCallToArtifactMap);

    // Calculate context size after compression
    const contextSizeAfter = this.estimateTokens(JSON.stringify(summary));

    // Record compression event using base class method
    this.recordCompressionEvent({
      reason: this.shouldCompress ? 'manual' : 'automatic',
      messageCount: messages.length,
      artifactCount: Object.keys(toolCallToArtifactMap).length,
      contextSizeBefore,
      contextSizeAfter,
      compressionType: this.getCompressionType(),
    });

    // Update state for next compression cycle
    this.shouldCompress = false;
    this.lastProcessedMessageIndex = messages.length;

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
      'MID-GENERATION COMPRESSION: Compression completed successfully'
    );

    return {
      artifactIds: Object.values(toolCallToArtifactMap).map((info) => info.artifactId),
      summary,
    };
  }

  /**
   * Get current state for debugging
   */
  getState() {
    return {
      ...super.getState(),
      shouldCompress: this.shouldCompress,
      lastProcessedMessageIndex: this.lastProcessedMessageIndex,
    };
  }
}
