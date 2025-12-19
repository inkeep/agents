import type { ModelSettings } from '@inkeep/agents-core';
import { createLedgerArtifact, getLedgerArtifacts } from '@inkeep/agents-core';
import { randomUUID } from 'crypto';
import { getLogger } from '../logger';
import { type ConversationSummary, distillConversation } from '../tools/distill-conversation-tool';
import { agentSessionManager } from './AgentSession';
import { getCompressionConfigForModel } from '../utils/model-context-utils';
import dbClient from '../data/db/dbClient';

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
  compressionType: string;
}

/**
 * Base compressor class containing shared functionality for all compression types
 */
export abstract class BaseCompressor {
  protected processedToolCalls = new Set<string>();
  protected cumulativeSummary: ConversationSummary | null = null;

  constructor(
    protected sessionId: string,
    protected conversationId: string,
    protected tenantId: string,
    protected projectId: string,
    protected config: CompressionConfig,
    protected summarizerModel?: ModelSettings,
    protected baseModel?: ModelSettings
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
  protected async saveToolResultsAsArtifacts(
    messages: any[],
    startIndex: number = 0
  ): Promise<Record<string, string>> {
    const session = agentSessionManager.getSession(this.sessionId);
    if (!session) {
      throw new Error(`No session found: ${this.sessionId}`);
    }

    const toolCallToArtifactMap: Record<string, string> = {};
    const messagesToProcess = messages.slice(startIndex);



    for (const message of messagesToProcess) {
      // Convert database format tool-result messages to Vercel AI SDK format
      if (message.messageType === 'tool-result' && !Array.isArray(message.content) && message.content?.text) {
        const toolName = message.metadata?.a2a_metadata?.toolName;
        const toolCallId = message.metadata?.a2a_metadata?.toolCallId;
        
        // Skip internal tools from database format too
        if (toolName && (
          toolName === 'get_reference_artifact' ||
          toolName === 'thinking_complete' ||
          toolName.includes('save_tool_result') ||
          toolName.startsWith('transfer_to_')
        )) {
          continue; // Skip this entire message
        }
        
        if (toolName && toolCallId) {
          // Convert to SDK format by creating a content array
          message.content = [{
            type: 'tool-result',
            toolCallId: toolCallId,
            toolName: toolName,
            output: message.content.text, // Use the raw text as output
          }];
        }
      }

      // Handle Vercel AI SDK message format
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'tool-result') {
            // Skip internal tools that shouldn't be compressed at all
            if (
              block.toolName === 'get_reference_artifact' ||
              block.toolName === 'thinking_complete' ||
              block.toolName.includes('save_tool_result') ||
              block.toolName.startsWith('transfer_to_')
            ) {
              logger.debug(
                {
                  toolCallId: block.toolCallId,
                  toolName: block.toolName,
                },
                'Skipping special tool - not creating artifacts'
              );
              this.processedToolCalls.add(block.toolCallId);
              continue;
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

            // Check if an artifact already exists for this tool call ID
            let artifactId;
            try {
              const existingArtifacts = await getLedgerArtifacts(dbClient)({
                scopes: { tenantId: this.tenantId, projectId: this.projectId },
                filters: { toolCallId: block.toolCallId },
              });
              
              if (existingArtifacts.length > 0) {
                artifactId = existingArtifacts[0].id;
                toolCallToArtifactMap[block.toolCallId] = artifactId;
                logger.debug(
                  {
                    toolCallId: block.toolCallId,
                    existingArtifactId: artifactId,
                    toolName: block.toolName,
                  },
                  'Reusing existing artifact for tool call'
                );
                continue; // Skip creating a new artifact
              }
            } catch (error) {
              logger.debug(
                {
                  toolCallId: block.toolCallId,
                  error: error instanceof Error ? error.message : String(error),
                },
                'Could not check for existing artifacts, creating new one'
              );
            }

            artifactId = `compress_${block.toolName || 'tool'}_${block.toolCallId || Date.now()}_${randomUUID().slice(0, 8)}`;

            logger.debug(
              {
                artifactId,
                toolName: block.toolName,
                toolCallId: block.toolCallId,
              },
              'Creating new compression artifact'
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
                compressionReason: this.getCompressionType(),
              },
              summaryData: {
                toolCallId: block.toolCallId,
                toolName: block.toolName,
                resultPreview: this.generateResultPreview(cleanToolResult),
                note: `Tool result from ${block.toolName} - compressed to save context space`,
              },
              data: toolResultData,
            };

            // Validate artifact has meaningful data
            const fullData = artifactData.data;
            const hasFullData =
              fullData &&
              typeof fullData === 'object' &&
              Object.keys(fullData).length > 0 &&
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

            // Use existing AgentSession artifact processing
            session.recordEvent('artifact_saved', this.sessionId, artifactData);

            // Mark this tool call as processed to avoid reprocessing
            this.processedToolCalls.add(block.toolCallId);
            toolCallToArtifactMap[block.toolCallId] = artifactId;
          }
        }
      }
    }


    return toolCallToArtifactMap;
  }

  /**
   * Create conversation summary using distillConversation
   */
  protected async createConversationSummary(
    messages: any[],
    toolCallToArtifactMap: Record<string, string>
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
      return preview
        .slice(0, 150)
        .replace(/\s+/g, ' ')
        .trim() + (preview.length > 150 ? '...' : '');
    } catch (error) {
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
   * Get current state for debugging
   */
  getState() {
    return {
      config: this.config,
      processedToolCalls: Array.from(this.processedToolCalls),
      cumulativeSummary: this.cumulativeSummary,
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

