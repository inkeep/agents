import { trace } from '@opentelemetry/api';
import type { LanguageModelMiddleware } from 'ai';
import { SPAN_KEYS } from '../constants/otel-attributes';
import { getLogger } from './logger';
import { ModelFactory } from './model-factory';
import type { TokenUsage } from './pricing-service';
import { getPricingService } from './pricing-service';

const logger = getLogger('usage-cost-middleware');

function extractUsageTokens(usage: any): {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cachedReadTokens?: number;
  cachedWriteTokens?: number;
} {
  const inputTokens =
    typeof usage?.inputTokens === 'object'
      ? (usage.inputTokens.total ?? 0)
      : (usage?.inputTokens ?? 0);
  const outputTokens =
    typeof usage?.outputTokens === 'object'
      ? (usage.outputTokens.total ?? 0)
      : (usage?.outputTokens ?? 0);
  const reasoningTokens =
    typeof usage?.outputTokens === 'object' ? usage.outputTokens.reasoning : undefined;
  const cachedReadTokens =
    typeof usage?.inputTokens === 'object' ? usage.inputTokens.cacheRead : undefined;
  const cachedWriteTokens =
    typeof usage?.inputTokens === 'object' ? usage.inputTokens.cacheWrite : undefined;

  return { inputTokens, outputTokens, reasoningTokens, cachedReadTokens, cachedWriteTokens };
}

function calculateAndSetCost(
  modelId: string,
  providerId: string | undefined,
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
    cachedReadTokens?: number;
    cachedWriteTokens?: number;
  }
): void {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return;

  let provider: string;
  let modelName: string;
  if (providerId) {
    provider = providerId;
    modelName = modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId;
  } else {
    try {
      const parsed = ModelFactory.parseModelString(modelId);
      provider = parsed.provider;
      modelName = parsed.modelName;
    } catch (parseError) {
      logger.debug(
        { modelId, error: parseError instanceof Error ? parseError.message : String(parseError) },
        'Failed to parse model string for cost calculation, using unknown provider'
      );
      provider = 'unknown';
      modelName = modelId;
    }
  }

  const tokenUsage: TokenUsage = {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    cachedReadTokens: usage.cachedReadTokens,
    cachedWriteTokens: usage.cachedWriteTokens,
  };

  const pricingService = getPricingService();
  const pricing = pricingService.getModelPricing(modelName, provider);
  if (pricing) {
    const cost = pricingService.calculateCost(tokenUsage, pricing);
    activeSpan.setAttribute(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, cost);
  } else {
    activeSpan.setAttribute('gen_ai.cost.pricing_unavailable', true);
  }
}

export const usageCostMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',

  async wrapGenerate({ doGenerate, model }) {
    const result = await doGenerate();

    try {
      calculateAndSetCost(model.modelId, model.provider, extractUsageTokens(result.usage));
    } catch (error) {
      logger.warn({ error }, 'Failed to calculate cost in wrapGenerate');
    }

    return result;
  },

  async wrapStream({ doStream, model }) {
    const { stream, ...rest } = await doStream();

    const modelId = model.modelId;
    const providerId = model.provider;
    const wrappedStream = stream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(chunk);

          if (chunk.type === 'finish') {
            try {
              calculateAndSetCost(modelId, providerId, extractUsageTokens(chunk.usage));
            } catch (error) {
              logger.warn({ error }, 'Failed to calculate cost in wrapStream');
            }
          }
        },
      })
    );

    return { stream: wrappedStream, ...rest };
  },
};
