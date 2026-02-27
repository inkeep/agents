import { randomUUID } from 'node:crypto';
import type { ModelSettings } from '@inkeep/agents-core';
import { getLedgerArtifacts } from '@inkeep/agents-core';
import { type Span, SpanStatusCode } from '@opentelemetry/api';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { type ConversationSummary, distillConversation } from '../tools/distill-conversation-tool';
import { type CompressedArtifactInfo, detectOversizedArtifact } from '../utils/artifact-utils';
import { getCompressionConfigForModel, getModelContextWindow } from '../utils/model-context-utils';
import { estimateTokens as estimateTokensUtil } from '../utils/token-estimator';
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

export abstract class BaseCompressor {
  protected processedToolCalls = new Set<string>();
  protected cumulativeSummary: ConversationSummary | null = null;
  protected contextWindowSize?: number;
  private toolCallInputMap = new Map<string, unknown>();

  constructor(
    protected sessionId: string,
    protected conversationId: string,
    protected tenantId: string,
    protected projectId: string,
    protected config: CompressionConfig,
    protected summarizerModel?: ModelSettings,
    protected baseModel?: ModelSettings
  ) {
    if (baseModel) {
      const modelContextInfo = getModelContextWindow(baseModel);
      this.contextWindowSize = modelContextInfo.contextWindow ?? undefined;
    }
  }

  getHardLimit(): number {
    return this.config.hardLimit;
  }

  protected estimateTokens(content: any): number {
    return estimateTokensUtil(typeof content === 'string' ? content : JSON.stringify(content));
  }

  protected calculateContextSize(messages: any[]): number {
    return messages.reduce((total, msg) => {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            total += this.estimateTokens(block.text || '');
          } else if (block.type === 'tool-call') {
            total += this.estimateTokens(
              JSON.stringify({
                toolCallId: block.toolCallId,
                toolName: block.toolName,
                input: block.input,
              })
            );
          } else if (block.type === 'tool-result') {
            total += this.estimateTokens(
              JSON.stringify({
                toolCallId: block.toolCallId,
                toolName: block.toolName,
                output: block.output,
              })
            );
          }
        }
      } else if (typeof msg.content === 'string') {
        total += this.estimateTokens(msg.content);
      } else if (msg.content) {
        total += this.estimateTokens(JSON.stringify(msg.content));
      }
      return total;
    }, 0);
  }

  async saveToolResultsAsArtifacts(
    messages: any[],
    startIndex = 0
  ): Promise<Record<string, CompressedArtifactInfo>> {
    const session = agentSessionManager.getSession(this.sessionId);
    if (!session) {
      throw new Error(`No session found: ${this.sessionId}`);
    }

    const messagesToProcess = messages.slice(startIndex);

    this.toolCallInputMap = new Map();
    for (const message of messagesToProcess) {
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'tool-call' && block.toolCallId != null) {
            this.toolCallInputMap.set(block.toolCallId, block.input);
          }
        }
      }
    }

    const toolCallIds = this.extractToolCallIds(messagesToProcess);
    const existingArtifacts = await this.findExistingArtifacts([...new Set(toolCallIds)]);
    const toolCallToArtifactMap: Record<string, CompressedArtifactInfo> = {};

    for (const message of messagesToProcess) {
      this.convertDatabaseFormatMessage(message);
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'tool-result') {
            const artifactInfo = await this.processToolResult(block, session, existingArtifacts);
            if (artifactInfo) {
              toolCallToArtifactMap[block.toolCallId] = artifactInfo;
            }
          }
        }
      }
    }

    return toolCallToArtifactMap;
  }

  private async findExistingArtifacts(
    toolCallIds: string[]
  ): Promise<
    Map<
      string,
      {
        artifactId: string;
        isOversized: boolean;
        toolArgs?: unknown;
        toolName?: string;
        summaryData?: Record<string, any>;
      }
    >
  > {
    const result = new Map<
      string,
      {
        artifactId: string;
        isOversized: boolean;
        toolArgs?: unknown;
        toolName?: string;
        summaryData?: Record<string, any>;
      }
    >();

    if (toolCallIds.length === 0) return result;

    try {
      const artifacts = await getLedgerArtifacts(runDbClient)({
        scopes: { tenantId: this.tenantId, projectId: this.projectId },
        toolCallIds,
      });

      for (const artifact of artifacts) {
        if (artifact.toolCallId) {
          result.set(artifact.toolCallId, {
            artifactId: artifact.artifactId,
            isOversized: (artifact.metadata?.isOversized as boolean) ?? false,
            toolArgs: artifact.metadata?.toolArgs,
            toolName: artifact.metadata?.toolName as string | undefined,
            summaryData:
              (artifact.parts?.[0] as any)?.data?.summary ??
              (artifact.parts?.[0] as any)?.data ??
              undefined,
          });
        }
      }
    } catch (error) {
      logger.debug(
        {
          sessionId: this.sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Artifact batch lookup failed'
      );
    }

    return result;
  }

  private convertDatabaseFormatMessage(message: any): void {
    if (
      message.messageType === 'tool-result' &&
      !Array.isArray(message.content) &&
      message.content?.text
    ) {
      const toolName = message.metadata?.a2a_metadata?.toolName;
      const toolCallId = message.metadata?.a2a_metadata?.toolCallId;
      if (this.shouldSkipToolCall(toolName)) return;
      if (toolName && toolCallId) {
        const a2a = message.metadata?.a2a_metadata;
        message.content = [
          {
            type: 'tool-result',
            toolCallId,
            toolName,
            input: a2a?.toolArgs ?? null,
            output: a2a?.toolOutput ?? message.content.text,
          },
        ];
      }
    }
  }

  private async processToolResult(
    block: any,
    session: any,
    existingArtifacts: Map<
      string,
      {
        artifactId: string;
        isOversized: boolean;
        toolArgs?: unknown;
        toolName?: string;
        summaryData?: Record<string, any>;
      }
    >
  ): Promise<CompressedArtifactInfo | null> {
    if (this.shouldSkipToolCall(block.toolName)) {
      this.processedToolCalls.add(block.toolCallId);
      return null;
    }

    if (this.processedToolCalls.has(block.toolCallId)) return null;

    const existing = existingArtifacts.get(block.toolCallId);
    if (existing) {
      return {
        artifactId: existing.artifactId,
        isOversized: existing.isOversized,
        toolArgs: existing.toolArgs as Record<string, unknown> | undefined,
        summaryData: existing.summaryData,
      };
    }

    return await this.createNewArtifact(block, session);
  }

  private shouldSkipToolCall(toolName: string): boolean {
    return (
      toolName === 'get_reference_artifact' ||
      toolName === 'load_skill' ||
      toolName === 'thinking_complete' ||
      toolName?.includes('save_tool_result') ||
      toolName?.startsWith('transfer_to_')
    );
  }

  private extractToolCallIds(messages: any[]): string[] {
    const toolCallIds: string[] = [];
    for (const message of messages) {
      if (message.messageType === 'tool-result' && !Array.isArray(message.content)) {
        const toolCallId = message.metadata?.a2a_metadata?.toolCallId;
        if (toolCallId && !this.shouldSkipToolCall(message.metadata?.a2a_metadata?.toolName)) {
          toolCallIds.push(toolCallId);
        }
      }
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'tool-result' && !this.shouldSkipToolCall(block.toolName)) {
            toolCallIds.push(block.toolCallId);
          }
        }
      }
    }
    return toolCallIds;
  }

  private isEmpty(data: any): boolean {
    if (!data.toolResult) return true;
    if (typeof data.toolResult === 'object' && Object.keys(data.toolResult).length === 0)
      return true;
    return false;
  }

  private buildArtifactData(artifactId: string, block: any, toolResultData: any): any {
    const toolInput = block.input ?? this.toolCallInputMap.get(block.toolCallId) ?? null;

    const oversized = detectOversizedArtifact(toolResultData, this.contextWindowSize, {
      artifactId,
      toolCallId: block.toolCallId,
      toolName: block.toolName,
    });

    const summaryData: Record<string, any> = {
      toolCallId: block.toolCallId,
      toolName: block.toolName,
      toolInput: this.generatePreview(toolInput),
      resultPreview: this.generatePreview(toolResultData.toolResult),
      note: `Tool result from ${block.toolName} - compressed to save context space`,
    };

    if (oversized.isOversized) {
      summaryData._oversizedWarning = oversized.oversizedWarning;
      summaryData._structureInfo = oversized.structureInfo;
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
        toolArgs: toolInput ?? null,
        compressionReason: this.getCompressionType(),
        isOversized: oversized.isOversized,
        originalTokenSize: oversized.originalTokenSize,
        contextWindowSize: oversized.contextWindowSize,
        retrievalBlocked: oversized.retrievalBlocked,
      },
      summaryData,
      data: toolResultData,
    };
  }

  private async createNewArtifact(
    block: any,
    session: any
  ): Promise<CompressedArtifactInfo | null> {
    const artifactId = `compress_${block.toolName || 'tool'}_${block.toolCallId || Date.now()}_${randomUUID().slice(0, 8)}`;
    const toolInput = block.input ?? this.toolCallInputMap.get(block.toolCallId) ?? null;
    const toolResultData = {
      toolName: block.toolName,
      toolInput,
      toolResult: this.removeStructureHints(block.output),
      compressedAt: new Date().toISOString(),
    };

    if (this.isEmpty(toolResultData)) return null;

    const artifactData = this.buildArtifactData(artifactId, block, toolResultData);

    session.recordEvent('artifact_saved', this.sessionId, artifactData);
    this.processedToolCalls.add(block.toolCallId);

    return {
      artifactId,
      isOversized: artifactData.metadata.isOversized,
      toolArgs: artifactData.metadata.toolArgs ?? undefined,
      structureInfo: artifactData.summaryData._structureInfo,
      oversizedWarning: artifactData.summaryData._oversizedWarning,
      summaryData: artifactData.summaryData,
    };
  }

  protected formatMessagesForDistillation(
    messages: any[],
    toolCallToArtifactMap: Record<string, CompressedArtifactInfo> | undefined,
    maxTotalChars?: number
  ): string {
    let nonToolResultChars = 0;
    let numToolResults = 0;

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        nonToolResultChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            nonToolResultChars += (block.text || '').length;
          } else if (block.type === 'tool-call') {
            nonToolResultChars +=
              JSON.stringify(block.input || {}).length + (block.toolName || '').length;
          } else if (block.type === 'tool-result' && toolCallToArtifactMap?.[block.toolCallId]) {
            numToolResults++;
          }
        }
      } else if (msg.content?.text) {
        nonToolResultChars += msg.content.text.length;
      }
    }

    const perResultLimit =
      maxTotalChars && numToolResults > 0
        ? Math.max(200, Math.floor((maxTotalChars - nonToolResultChars) / numToolResults))
        : maxTotalChars;

    return messages
      .map((msg: any) => {
        const parts: string[] = [];

        if (typeof msg.content === 'string') {
          parts.push(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              parts.push(block.text);
            } else if (block.type === 'tool-call') {
              parts.push(
                `[TOOL CALL] ${block.toolName}(${JSON.stringify(block.input)}) [ID: ${block.toolCallId}]`
              );
            } else if (block.type === 'tool-result') {
              const artifactInfo = toolCallToArtifactMap?.[block.toolCallId];
              if (artifactInfo) {
                const summary = artifactInfo.summaryData
                  ? JSON.stringify(artifactInfo.summaryData)
                  : '';
                const truncated =
                  perResultLimit && summary.length > perResultLimit
                    ? `${summary.slice(0, perResultLimit)}...`
                    : summary;
                parts.push(
                  `[TOOL RESULT] ${block.toolName} [ARTIFACT: ${artifactInfo.artifactId}]\n${truncated}`
                );
              }
            }
          }
        } else if (msg.content?.text) {
          parts.push(msg.content.text);
        }

        return parts.length > 0 ? `${msg.role || 'system'}: ${parts.join('\n')}` : '';
      })
      .filter((line) => line.trim().length > 0)
      .join('\n\n');
  }

  protected async createConversationSummary(
    messages: any[],
    toolCallToArtifactMap: Record<string, CompressedArtifactInfo>
  ): Promise<any> {
    const summary = await distillConversation({
      conversationId: this.conversationId,
      currentSummary: this.cumulativeSummary,
      summarizerModel: this.summarizerModel,
      messageFormatter: (maxChars) =>
        this.formatMessagesForDistillation(messages, toolCallToArtifactMap, maxChars),
    });
    this.cumulativeSummary = summary;
    return summary;
  }

  protected generatePreview(value: any, maxChars = 150): string | null {
    if (value == null) return null;
    try {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      return str.length > maxChars
        ? `${str.slice(0, maxChars).replace(/\s+/g, ' ').trim()}...`
        : str.replace(/\s+/g, ' ').trim();
    } catch {
      return null;
    }
  }

  protected recordCompressionEvent(eventData: CompressionEventData): void {
    const session = agentSessionManager.getSession(this.sessionId);
    if (session) {
      session.recordEvent('compression', this.sessionId, eventData);
    }
  }

  protected removeStructureHints(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.removeStructureHints(item));
    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key !== '_structureHints') cleaned[key] = this.removeStructureHints(value);
      }
      return cleaned;
    }
    return obj;
  }

  getCompressionSummary(): ConversationSummary | null {
    return this.cumulativeSummary;
  }

  cleanup(options: { resetSummary?: boolean; keepRecentToolCalls?: number } = {}): void {
    const { resetSummary = false, keepRecentToolCalls = 0 } = options;
    if (keepRecentToolCalls > 0) {
      this.processedToolCalls = new Set(
        Array.from(this.processedToolCalls).slice(-keepRecentToolCalls)
      );
    } else {
      this.processedToolCalls.clear();
    }
    if (resetSummary) this.cumulativeSummary = null;
  }

  partialCleanup(): void {
    this.cleanup({ keepRecentToolCalls: 50 });
  }

  fullCleanup(): void {
    this.cleanup({ resetSummary: true });
  }

  getState() {
    return {
      config: this.config,
      processedToolCalls: Array.from(this.processedToolCalls),
      cumulativeSummary: this.cumulativeSummary,
    };
  }

  async safeCompress(messages: any[], fullContextSize?: number): Promise<CompressionResult> {
    return await tracer.startActiveSpan(
      'compressor.safe_compress',
      {
        attributes: {
          'compression.type': this.getCompressionType(),
          'compression.session_id': this.sessionId,
          'compression.message_count': messages.length,
          'compression.input_tokens': this.calculateContextSize(messages),
          'compression.full_context_size': fullContextSize,
          'compression.hard_limit': this.getHardLimit(),
          'compression.safety_buffer': this.config.safetyBuffer,
        },
      },
      async (compressionSpan: Span) => {
        try {
          const result = await this.compress(messages);
          const resultTokens = Array.isArray(result.summary)
            ? this.calculateContextSize(result.summary)
            : this.estimateTokens(result.summary);
          const inputTokens = fullContextSize ?? this.calculateContextSize(messages);
          compressionSpan.setAttributes({
            'compression.result.artifact_count': result.artifactIds.length,
            'compression.result.output_tokens': resultTokens,
            'compression.result.compression_ratio':
              inputTokens > 0 ? (inputTokens - resultTokens) / inputTokens : 0,
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
          const fallbackResult = await this.simpleCompressionFallback(messages);
          const fallbackTokens = Array.isArray(fallbackResult.summary)
            ? this.calculateContextSize(fallbackResult.summary)
            : this.estimateTokens(fallbackResult.summary);
          const inputTokens = fullContextSize ?? this.calculateContextSize(messages);
          compressionSpan.setAttributes({
            'compression.result.artifact_count': fallbackResult.artifactIds.length,
            'compression.result.output_tokens': fallbackTokens,
            'compression.result.compression_ratio':
              inputTokens > 0 ? (inputTokens - fallbackTokens) / inputTokens : 0,
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

  protected async simpleCompressionFallback(messages: any[]): Promise<CompressionResult> {
    if (messages.length === 0) return { artifactIds: [], summary: [] };

    const targetTokens = Math.floor(this.getHardLimit() * 0.5);
    let totalTokens = this.calculateContextSize(messages);

    if (totalTokens <= targetTokens) return { artifactIds: [], summary: messages };

    const result = [...messages];
    while (totalTokens > targetTokens && result.length > 1) {
      const dropped = result.shift();
      if (dropped) totalTokens -= this.estimateTokens(dropped);
    }

    logger.info(
      {
        sessionId: this.sessionId,
        conversationId: this.conversationId,
        originalCount: messages.length,
        compressedCount: result.length,
      },
      'Simple compression fallback completed'
    );

    return { artifactIds: [], summary: result };
  }

  abstract isCompressionNeeded(messages: any[]): boolean;
  abstract compress(messages: any[]): Promise<CompressionResult>;
  abstract getCompressionType(): string;
}

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
