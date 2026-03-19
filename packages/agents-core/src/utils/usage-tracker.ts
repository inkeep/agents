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
import { estimateTokens } from './token-estimator';

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
  finishReason?: string;
}

function extractUsage(response: AiSdkResponse) {
  const usage = response.totalUsage ?? response.usage;
  return {
    inputTokens: usage?.inputTokens ?? usage?.promptTokens ?? 0,
    outputTokens: usage?.outputTokens ?? usage?.completionTokens ?? 0,
    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? undefined,
    cachedReadTokens: usage?.inputTokenDetails?.cacheReadTokens ?? undefined,
    cachedWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens ?? undefined,
    stepCount: Array.isArray(response.steps) ? response.steps.length : 1,
    resolvedModel: response.response?.modelId ?? undefined,
  };
}

function isNonConsumingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const statusCode = (error as { statusCode?: number }).statusCode;
  if (statusCode === 429) return true;
  const message = error instanceof Error ? error.message : '';
  return (
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ENOTFOUND') ||
    message.includes('fetch failed') ||
    message.includes('context_length_exceeded')
  );
}

function estimateInputFromConfig(config: Record<string, unknown>): number {
  let text = '';
  if (typeof config.prompt === 'string') {
    text = config.prompt;
  } else if (Array.isArray(config.messages)) {
    text = JSON.stringify(config.messages);
  }
  if (typeof config.system === 'string') {
    text += config.system;
  }
  return estimateTokens(text);
}

function persistEvent(
  db: AgentsRunDatabaseClient | null,
  context: UsageContext,
  requestedModel: string,
  inputTokens: number,
  outputTokens: number,
  opts: {
    resolvedModel?: string;
    reasoningTokens?: number;
    cachedReadTokens?: number;
    cachedWriteTokens?: number;
    stepCount?: number;
    streamed?: boolean;
    finishReason?: string;
    generationDurationMs?: number;
    status: 'succeeded' | 'failed' | 'timeout';
    errorCode?: string;
  }
): void {
  let provider: string;
  try {
    provider = ModelFactory.parseModelString(requestedModel).provider;
  } catch {
    provider = 'unknown';
  }

  const tokenUsage: TokenUsage = {
    inputTokens,
    outputTokens,
    reasoningTokens: opts.reasoningTokens,
    cachedReadTokens: opts.cachedReadTokens,
    cachedWriteTokens: opts.cachedWriteTokens,
  };

  const pricingService = getPricingService();
  let estimatedCostUsd: number | null = null;
  try {
    const modelForPricing = opts.resolvedModel ?? requestedModel;
    const { modelName } = ModelFactory.parseModelString(modelForPricing);
    const pricing = pricingService.getModelPricing(modelName, provider);
    estimatedCostUsd = pricing ? pricingService.calculateCost(tokenUsage, pricing) : null;
  } catch {
    // pricing lookup failed — proceed with null cost
  }

  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttributes({
      [SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS]: inputTokens,
      [SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS]: outputTokens,
      [SPAN_KEYS.GEN_AI_USAGE_TOTAL_TOKENS]: inputTokens + outputTokens,
      [SPAN_KEYS.GEN_AI_GENERATION_STEP_COUNT]: opts.stepCount ?? 1,
      [SPAN_KEYS.GEN_AI_GENERATION_TYPE]: context.generationType,
    });

    if (opts.reasoningTokens != null) {
      activeSpan.setAttribute(SPAN_KEYS.GEN_AI_USAGE_REASONING_TOKENS, opts.reasoningTokens);
    }
    if (opts.cachedReadTokens != null) {
      activeSpan.setAttribute(SPAN_KEYS.GEN_AI_USAGE_CACHED_READ_TOKENS, opts.cachedReadTokens);
    }
    if (opts.resolvedModel) {
      activeSpan.setAttribute(SPAN_KEYS.GEN_AI_RESPONSE_MODEL, opts.resolvedModel);
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
    resolvedModel: opts.resolvedModel ?? null,
    provider,
    inputTokens,
    outputTokens,
    reasoningTokens: opts.reasoningTokens ?? null,
    cachedReadTokens: opts.cachedReadTokens ?? null,
    cachedWriteTokens: opts.cachedWriteTokens ?? null,
    stepCount: opts.stepCount ?? 1,
    estimatedCostUsd: estimatedCostUsd?.toFixed(8) ?? null,
    streamed: opts.streamed ?? false,
    finishReason: opts.finishReason ?? null,
    generationDurationMs: opts.generationDurationMs ?? null,
    byok: context.byok ?? false,
    status: opts.status,
    errorCode: opts.errorCode ?? null,
    startedAt: now,
    completedAt: now,
  };

  insertUsageEvent(db)(event).catch((err) => {
    logger.error({ error: err, context }, 'Failed to insert usage event');
  });
}

export async function trackedGenerate<T extends AiSdkResponse>(
  db: AgentsRunDatabaseClient | null,
  context: UsageContext,
  requestedModel: string,
  generateFn: () => Promise<T>,
  config?: Record<string, unknown>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await generateFn();
    const durationMs = Date.now() - startTime;
    const usageData = extractUsage(result);

    persistEvent(db, context, requestedModel, usageData.inputTokens, usageData.outputTokens, {
      resolvedModel: usageData.resolvedModel,
      reasoningTokens: usageData.reasoningTokens,
      cachedReadTokens: usageData.cachedReadTokens,
      cachedWriteTokens: usageData.cachedWriteTokens,
      stepCount: usageData.stepCount,
      finishReason: result.finishReason,
      generationDurationMs: durationMs,
      status: result.finishReason === 'other' ? 'timeout' : 'succeeded',
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorCode = error instanceof Error ? error.message.slice(0, 256) : 'unknown';

    if (isNonConsumingError(error)) {
      persistEvent(db, context, requestedModel, 0, 0, {
        status: 'failed',
        generationDurationMs: durationMs,
        errorCode,
      });
    } else {
      const estimatedInput = config ? estimateInputFromConfig(config) : 0;
      persistEvent(db, context, requestedModel, estimatedInput, 0, {
        status: 'failed',
        generationDurationMs: durationMs,
        errorCode,
      });
    }

    throw error;
  }
}
