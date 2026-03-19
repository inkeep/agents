import { trace } from '@opentelemetry/api';
import { SPAN_KEYS } from '../constants/otel-attributes';
import type { UsageEventInsert } from '../data-access/runtime/usageEvents';
import { insertUsageEvent } from '../data-access/runtime/usageEvents';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import type { GenerationType } from '../db/runtime/runtime-schema';
import { getLogger } from './logger';
import { ModelFactory } from './model-factory';
import type { TokenUsage } from './pricing-service';
import { getPricingService } from './pricing-service';

const logger = getLogger('UsageTracker');

export type { GenerationType } from '../db/runtime/runtime-schema';

export interface UsageContext {
  tenantId: string;
  projectId: string;
  agentId: string;
  subAgentId?: string;
  conversationId?: string;
  messageId?: string;
  generationType: GenerationType;
  byok?: boolean;
}

export interface RecordUsageOptions {
  streamed?: boolean;
  finishReason?: string;
  generationDurationMs?: number;
  status?: 'succeeded' | 'failed' | 'timeout';
  errorCode?: string;
}

interface AiSdkUsage {
  promptTokens?: number;
  completionTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTokenDetails?: {
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    noCacheTokens?: number;
  };
  outputTokenDetails?: {
    reasoningTokens?: number;
    textTokens?: number;
  };
}

interface AiSdkResponse {
  usage?: AiSdkUsage;
  totalUsage?: AiSdkUsage;
  response?: {
    modelId?: string;
  };
  steps?: unknown[];
}

function extractUsage(response: AiSdkResponse): {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cachedReadTokens?: number;
  cachedWriteTokens?: number;
  stepCount: number;
  resolvedModel?: string;
} {
  const usage = response.totalUsage ?? response.usage;
  const inputTokens = usage?.inputTokens ?? usage?.promptTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? usage?.completionTokens ?? 0;

  return {
    inputTokens,
    outputTokens,
    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? undefined,
    cachedReadTokens: usage?.inputTokenDetails?.cacheReadTokens ?? undefined,
    cachedWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens ?? undefined,
    stepCount: Array.isArray(response.steps) ? response.steps.length : 1,
    resolvedModel: response.response?.modelId ?? undefined,
  };
}

export function recordUsage(
  db: AgentsRunDatabaseClient | null,
  context: UsageContext,
  requestedModel: string,
  response: AiSdkResponse,
  options?: RecordUsageOptions
): void {
  const usageData = extractUsage(response);
  const { provider } = ModelFactory.parseModelString(requestedModel);

  const tokenUsage: TokenUsage = {
    inputTokens: usageData.inputTokens,
    outputTokens: usageData.outputTokens,
    reasoningTokens: usageData.reasoningTokens,
    cachedReadTokens: usageData.cachedReadTokens,
    cachedWriteTokens: usageData.cachedWriteTokens,
  };

  const pricingService = getPricingService();
  const modelForPricing = usageData.resolvedModel ?? requestedModel;
  const { modelName } = ModelFactory.parseModelString(modelForPricing);
  const pricing = pricingService.getModelPricing(modelName, provider);
  const estimatedCostUsd = pricing ? pricingService.calculateCost(tokenUsage, pricing) : null;

  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttributes({
      [SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS]: usageData.inputTokens,
      [SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS]: usageData.outputTokens,
      [SPAN_KEYS.GEN_AI_USAGE_TOTAL_TOKENS]: usageData.inputTokens + usageData.outputTokens,
      [SPAN_KEYS.GEN_AI_GENERATION_STEP_COUNT]: usageData.stepCount,
      [SPAN_KEYS.GEN_AI_GENERATION_TYPE]: context.generationType,
    });

    if (usageData.reasoningTokens != null) {
      activeSpan.setAttribute(SPAN_KEYS.GEN_AI_USAGE_REASONING_TOKENS, usageData.reasoningTokens);
    }
    if (usageData.cachedReadTokens != null) {
      activeSpan.setAttribute(
        SPAN_KEYS.GEN_AI_USAGE_CACHED_READ_TOKENS,
        usageData.cachedReadTokens
      );
    }
    if (usageData.resolvedModel) {
      activeSpan.setAttribute(SPAN_KEYS.GEN_AI_RESPONSE_MODEL, usageData.resolvedModel);
    }
    if (estimatedCostUsd != null) {
      activeSpan.setAttribute(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, estimatedCostUsd);
    }
  }

  if (!db) return;

  const now = new Date().toISOString();
  const event: UsageEventInsert = {
    tenantId: context.tenantId,
    projectId: context.projectId,
    agentId: context.agentId,
    subAgentId: context.subAgentId ?? null,
    conversationId: context.conversationId ?? null,
    messageId: context.messageId ?? null,
    generationType: context.generationType,
    requestedModel,
    resolvedModel: usageData.resolvedModel ?? null,
    provider,
    inputTokens: usageData.inputTokens,
    outputTokens: usageData.outputTokens,
    reasoningTokens: usageData.reasoningTokens ?? null,
    cachedReadTokens: usageData.cachedReadTokens ?? null,
    cachedWriteTokens: usageData.cachedWriteTokens ?? null,
    stepCount: usageData.stepCount,
    estimatedCostUsd: estimatedCostUsd?.toFixed(8) ?? null,
    streamed: options?.streamed ?? false,
    finishReason: options?.finishReason ?? null,
    generationDurationMs: options?.generationDurationMs ?? null,
    byok: context.byok ?? false,
    status: options?.status ?? 'succeeded',
    errorCode: options?.errorCode ?? null,
    startedAt: now,
    completedAt: now,
  };

  insertUsageEvent(db)(event).catch((error) => {
    logger.error({ error, context }, 'Failed to insert usage event');
  });
}
