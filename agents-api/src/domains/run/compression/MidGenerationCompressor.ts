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
  private generatedMessagesBaseline: number | null = null;

  /**
   * Called after compression succeeds to record where the next cycle's generated messages start.
   * Because the AI SDK accumulates all messages in stepMessages regardless of what prepareStep
   * returns, we track the step count at compression time and slice from there next cycle.
   */
  markCompressed(stepCount: number): void {
    this.generatedMessagesBaseline = stepCount;
  }

  effectiveBaseline(originalMessageCount: number): number {
    return this.generatedMessagesBaseline ?? originalMessageCount;
  }

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
   * Perform mid-generation compression.
   * Each call receives the full current generatedMessages array — after compression fires,
   * the prepareStep callback (handlePrepareStepCompression) replaces step messages with
   * originalMessages + summary, so the next call starts fresh.
   * processedToolCalls guards against artifact re-creation; cumulativeSummary carries
   * forward the prior summary context.
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

    const toolCallToArtifactMap = await this.saveToolResultsAsArtifacts(messages);

    const summary = await this.createConversationSummary(messages, toolCallToArtifactMap);

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

    this.shouldCompress = false;

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
    };
  }
}
