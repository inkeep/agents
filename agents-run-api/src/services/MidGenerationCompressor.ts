import type { ModelSettings } from '@inkeep/agents-core';
import { randomUUID } from 'crypto';
import { getLogger } from '../logger';
import { distillConversation } from '../tools/distill-conversation-tool';
import { agentSessionManager } from './AgentSession';

const logger = getLogger('MidGenerationCompressor');

export interface CompressionConfig {
  hardLimit: number;
  safetyBuffer: number;
  enabled?: boolean;
}

/**
 * Get compression config from environment variables
 */
export function getCompressionConfigFromEnv(): CompressionConfig {
  return {
    hardLimit: parseInt(process.env.AGENTS_COMPRESSION_HARD_LIMIT || '120000'),
    safetyBuffer: parseInt(process.env.AGENTS_COMPRESSION_SAFETY_BUFFER || '20000'),
    enabled: process.env.AGENTS_COMPRESSION_ENABLED !== 'false', // Default enabled
  };
}

/**
 * Simple mid-generation compressor
 * Compresses context when generate() steps get too large
 */
export class MidGenerationCompressor {
  private shouldCompress = false;
  private processedToolCalls = new Set<string>(); // Track already compressed tool call IDs
  private lastProcessedMessageIndex = 0; // Track where we left off in message processing
  private cumulativeSummary: any = null; // Track cumulative summary across compression cycles

  constructor(
    private sessionId: string,
    private conversationId: string,
    private tenantId: string,
    private projectId: string,
    private config: CompressionConfig,
    private summarizerModel?: ModelSettings,
    private baseModel?: ModelSettings
  ) {}

  /**
   * Get the hard limit for compression decisions
   */
  getHardLimit(): number {
    return this.config.hardLimit;
  }

  /**
   * Estimate tokens (4 chars = 1 token)
   */
  private estimateTokens(content: any): number {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate total context size
   */
  private calculateContextSize(messages: any[]): number {
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
   */
  isCompressionNeeded(messages: any[]): boolean {
    // Check manual request first - no calculation needed
    if (this.shouldCompress) return true;

    // Only calculate context size if no manual request
    const contextSize = this.calculateContextSize(messages);
    const remaining = this.config.hardLimit - contextSize;
    return remaining <= this.config.safetyBuffer;
  }

  /**
   * Perform compression: save all tool results as artifacts and create summary
   */
  async compress(messages: any[]): Promise<{
    artifactIds: string[];
    summary: any;
  }> {
    const contextSizeBefore = this.calculateContextSize(messages);

    logger.info(
      {
        sessionId: this.sessionId,
        messageCount: messages.length,
        contextSize: contextSizeBefore,
      },
      'COMPRESSION: Starting compression'
    );

    // Count tool results to be saved
    const toolResultCount = messages.reduce((count, msg) => {
      if (Array.isArray(msg.content)) {
        return count + msg.content.filter((block: any) => block.type === 'tool-result').length;
      }
      return count;
    }, 0);

    logger.debug({ toolResultCount }, 'Tool results found for compression');

    // 1. Save tool results as artifacts
    const toolCallToArtifactMap = await this.saveToolResultsAsArtifacts(messages);

    // 3. Create conversation summary
    const summary = await this.createConversationSummary(messages, toolCallToArtifactMap);

    // Calculate context size after compression (just the summary)
    const contextSizeAfter = this.estimateTokens(JSON.stringify(summary));

    // Record compression event
    const session = agentSessionManager.getSession(this.sessionId);
    if (session) {
      // Determine if this was a manual request (shouldCompress was set) or automatic (context limit)
      const wasManualRequest = this.shouldCompress;

      session.recordEvent('compression', this.sessionId, {
        reason: wasManualRequest ? 'manual' : 'automatic',
        messageCount: messages.length,
        artifactCount: Object.keys(toolCallToArtifactMap).length,
        contextSizeBefore,
        contextSizeAfter,
        compressionType: 'mid_generation',
      });
    }

    // Reset state
    this.shouldCompress = false;

    logger.info(
      {
        sessionId: this.sessionId,
        artifactsCreated: Object.keys(toolCallToArtifactMap).length,
        messageCount: messages.length,
        contextSizeBefore,
        contextSizeAfter,
        artifactIds: Object.values(toolCallToArtifactMap),
      },
      'COMPRESSION: Compression completed successfully'
    );

    return { artifactIds: Object.values(toolCallToArtifactMap), summary };
  }

  /**
   * 1. Save NEW tool results as artifacts (only process messages since last compression)
   */
  private async saveToolResultsAsArtifacts(messages: any[]): Promise<Record<string, string>> {
    const session = agentSessionManager.getSession(this.sessionId);
    if (!session) {
      throw new Error(`No session found: ${this.sessionId}`);
    }

    const toolCallToArtifactMap: Record<string, string> = {};

    // Only process messages that haven't been processed yet
    const newMessages = messages.slice(this.lastProcessedMessageIndex);

    logger.debug(
      {
        totalMessages: messages.length,
        newMessages: newMessages.length,
        startIndex: this.lastProcessedMessageIndex,
      },
      'Starting compression artifact processing'
    );

    for (const message of newMessages) {
      // Handle Vercel AI SDK message format
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'tool-result') {
            // Handle artifact retrieval tools specially - don't create artifacts but do compress the large results
            if (block.toolName === 'get_reference_artifact') {
              logger.debug(
                {
                  toolCallId: block.toolCallId,
                  toolName: block.toolName,
                },
                'Handling artifact retrieval tool - compressing result but not saving as artifact'
              );
              // Mark as processed but don't create an artifact - the extractTextMessages will handle this
              this.processedToolCalls.add(block.toolCallId);
              // Don't continue - let it be processed but without artifact creation
            }

            // Skip if this tool call has already been processed
            if (this.processedToolCalls.has(block.toolCallId)) {
              logger.debug(
                {
                  toolCallId: block.toolCallId,
                  toolName: block.toolName,
                },
                'Skipping already processed tool call'
              );
              continue;
            }
            const artifactId = `compress_${block.toolName || 'tool'}_${block.toolCallId || Date.now()}_${randomUUID().slice(0, 8)}`;

            logger.debug(
              {
                artifactId,
                toolName: block.toolName,
                toolCallId: block.toolCallId,
              },
              'Saving compression artifact'
            );

            // Find corresponding tool-call for input
            let toolInput = null;
            if (Array.isArray(message.content)) {
              const toolCall = message.content.find(
                (b: any) => b.type === 'tool-call' && b.toolCallId === block.toolCallId
              );
              toolInput = toolCall?.input;
            }

            // Clean tool result by recursively removing _structureHints before storing
            const cleanToolResult = this.removeStructureHints(block.output);

            // logger.info({ toolInput, cleanToolResult }, 'Tool input and clean tool result');

            // Create the tool result data
            const toolResultData = {
              toolName: block.toolName,
              toolInput: toolInput,
              toolResult: cleanToolResult,
              compressedAt: new Date().toISOString(),
            };

            // Skip artifact creation if toolResultData is empty
            if (this.isEmpty(toolResultData)) {
              logger.debug(
                {
                  toolName: block.toolName,
                  toolCallId: block.toolCallId,
                },
                'Skipping empty tool result'
              );
              continue;
            }

            // Create artifact data structure
            const artifactData = {
              artifactId,
              taskId: `task_${this.conversationId}-${this.sessionId}`,
              toolCallId: block.toolCallId,
              artifactType: 'tool_result',
              pendingGeneration: true, // Triggers LLM-generated name/description
              tenantId: this.tenantId,
              projectId: this.projectId,
              contextId: this.conversationId,
              subAgentId: this.sessionId,
              metadata: {
                toolCallId: block.toolCallId,
                toolName: block.toolName,
                compressionReason: 'mid_generation_context_limit',
              },
              // Pass data in the format expected by ArtifactSavedData interface
              summaryData: {
                toolName: block.toolName,
                note: 'Compressed tool result - see full data for details',
              },
              data: toolResultData, // Full tool result data
            };

            // Double-check if artifact data contains meaningful data - use deeper validation
            const fullData = artifactData.data;
            const hasFullData =
              fullData &&
              typeof fullData === 'object' &&
              Object.keys(fullData).length > 0 &&
              // Check if toolResult specifically has content
              fullData.toolResult &&
              (typeof fullData.toolResult !== 'object' ||
                Object.keys(fullData.toolResult).length > 0);

            if (!hasFullData) {
              logger.debug(
                {
                  artifactId,
                  toolName: block.toolName,
                  toolCallId: block.toolCallId,
                },
                'Skipping empty compression artifact'
              );
              continue;
            }

            // Use existing AgentSession artifact processing (includes LLM name/description generation)
            session.recordEvent('artifact_saved', this.sessionId, artifactData);

            // Mark this tool call as processed to avoid reprocessing
            this.processedToolCalls.add(block.toolCallId);
            toolCallToArtifactMap[block.toolCallId] = artifactId;
          }
        }
      }
    }

    // Update the pointer to track where we left off
    this.lastProcessedMessageIndex = messages.length;

    logger.debug(
      {
        totalArtifactsCreated: Object.keys(toolCallToArtifactMap).length,
        newMessageIndex: this.lastProcessedMessageIndex,
      },
      'Compression artifact processing completed'
    );

    return toolCallToArtifactMap;
  }

  /**
   * 3. Create conversation summary with artifact references
   */
  private async createConversationSummary(
    messages: any[],
    toolCallToArtifactMap: Record<string, string>
  ): Promise<any> {
    // Extract text messages to preserve before the summary
    const textMessages = this.extractTextMessages(messages, toolCallToArtifactMap);

    logger.debug(
      {
        sessionId: this.sessionId,
        messageCount: messages.length,
        textMessageCount: textMessages.length,
        artifactCount: Object.keys(toolCallToArtifactMap).length,
        sampleMessages: messages.slice(0, 2).map((m) => ({
          role: m.role,
          contentType: typeof m.content,
          contentPreview:
            typeof m.content === 'string' ? m.content.substring(0, 100) : 'array/object',
        })),
      },
      'Starting distillation with debug info'
    );

    const summary = await distillConversation({
      messages: messages,
      conversationId: this.conversationId,
      currentSummary: this.cumulativeSummary, // Pass existing summary for cumulative building
      summarizerModel: this.summarizerModel,
      toolCallToArtifactMap: toolCallToArtifactMap, // Pass mapping for message formatting
    });

    // Update cumulative summary for next compression cycle
    this.cumulativeSummary = summary;

    logger.debug(
      {
        sessionId: this.sessionId,
        summaryGenerated: !!summary,
        summaryHighLevel: summary?.high_level,
        artifactsCount: summary?.related_artifacts?.length || 0,
      },
      'Distillation completed'
    );

    // Return structure: text messages first, then summary
    return {
      text_messages: textMessages,
      summary: summary,
    };
  }

  /**
   * Extract text messages and convert tool calls to descriptive text
   * Avoids API tool-call/tool-result pairing issues while preserving context
   */
  private extractTextMessages(
    messages: any[],
    toolCallToArtifactMap: Record<string, string>
  ): any[] {
    const textMessages: any[] = [];

    // Collect tool call pairs to group them properly
    const toolCallPairs = new Map<string, { call: any; result: any }>();

    for (const message of messages) {
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'tool-call') {
            if (!toolCallPairs.has(block.toolCallId)) {
              toolCallPairs.set(block.toolCallId, { call: block, result: null });
            } else {
              toolCallPairs.get(block.toolCallId)!.call = block;
            }
          } else if (block.type === 'tool-result') {
            if (!toolCallPairs.has(block.toolCallId)) {
              toolCallPairs.set(block.toolCallId, { call: null, result: block });
            } else {
              toolCallPairs.get(block.toolCallId)!.result = block;
            }
          }
        }
      }
    }

    for (const message of messages) {
      // Handle assistant text messages
      if (message.role === 'assistant' && typeof message.content === 'string') {
        textMessages.push({
          role: message.role,
          content: message.content,
        });
      }
      // Handle assistant messages with content blocks
      else if (message.role === 'assistant' && Array.isArray(message.content)) {
        const textParts: string[] = [];
        const toolCallsInMessage = new Set<string>();
        const preservedBlocks: any[] = [];

        for (const block of message.content) {
          // Always preserve text blocks
          if (block.type === 'text') {
            textParts.push(block.text);
          }
          // Preserve thinking_complete tool blocks as-is
          else if (block.type === 'tool-call' && block.toolName === 'thinking_complete') {
            preservedBlocks.push(block);
          } else if (block.type === 'tool-result' && block.toolName === 'thinking_complete') {
            preservedBlocks.push(block);
          }
          // Convert other tool calls to descriptive text
          else if (block.type === 'tool-call') {
            toolCallsInMessage.add(block.toolCallId);
          }
        }

        // Add descriptive text for tool calls in this message
        for (const toolCallId of toolCallsInMessage) {
          const pair = toolCallPairs.get(toolCallId);
          const artifactId = toolCallToArtifactMap[toolCallId];

          if (pair?.call) {
            const args = JSON.stringify(pair.call.input);
            const artifactText = artifactId
              ? ` Results compressed into artifact: ${artifactId}.`
              : ' Results were compressed but not saved.';

            textParts.push(`I called ${pair.call.toolName}(${args}).${artifactText}`);
          }
        }

        // Build final content based on what we have
        if (preservedBlocks.length > 0 && textParts.length > 0) {
          // Mixed content: preserved blocks + text
          const content = [...preservedBlocks];
          if (textParts.length > 0) {
            content.push({ type: 'text', text: textParts.join('\n\n') });
          }
          textMessages.push({
            role: message.role,
            content: content,
          });
        } else if (preservedBlocks.length > 0) {
          // Only preserved blocks
          textMessages.push({
            role: message.role,
            content: preservedBlocks,
          });
        } else if (textParts.length > 0) {
          // Only text
          textMessages.push({
            role: message.role,
            content: textParts.join('\n\n'),
          });
        }
      }
    }

    return textMessages;
  }

  // Removed focus hint helper methods - no longer needed since tool results are in formatted messages

  /**
   * Check if tool result data is effectively empty
   */
  private isEmpty(toolResultData: any): boolean {
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
  private removeStructureHints(obj: any): any {
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
   * Get current state for debugging
   */
  getState() {
    return {
      shouldCompress: this.shouldCompress,
      config: this.config,
    };
  }

  /**
   * Get the current compression summary
   */
  getCompressionSummary() {
    return this.cumulativeSummary;
  }
}
