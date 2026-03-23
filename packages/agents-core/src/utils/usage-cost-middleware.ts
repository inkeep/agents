import { trace } from '@opentelemetry/api';
import type { LanguageModelMiddleware } from 'ai';
import { SPAN_KEYS } from '../constants/otel-attributes';
import { getLogger } from './logger';
import { ModelFactory } from './model-factory';
import type { TokenUsage } from './pricing-service';
import { getPricingService } from './pricing-service';

const logger = getLogger('usage-cost-middleware');

function calculateAndSetCost(
  modelId: string,
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
  try {
    const parsed = ModelFactory.parseModelString(modelId);
    provider = parsed.provider;
    modelName = parsed.modelName;
  } catch {
    provider = 'unknown';
    modelName = modelId;
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
  }
}

export const usageCostMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',

  async wrapGenerate({ doGenerate, model }) {
    const result = await doGenerate();

    try {
      const inputTokens = result.usage.inputTokens.total ?? 0;
      const outputTokens = result.usage.outputTokens.total ?? 0;
      const reasoningTokens = result.usage.outputTokens.reasoning ?? undefined;
      const cachedReadTokens = result.usage.inputTokens.cacheRead ?? undefined;
      const cachedWriteTokens = result.usage.inputTokens.cacheWrite ?? undefined;

      calculateAndSetCost(model.modelId, {
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedReadTokens,
        cachedWriteTokens,
      });
    } catch (error) {
      logger.warn({ error }, 'Failed to calculate cost in wrapGenerate');
    }

    return result;
  },

  async wrapStream({ doStream, model }) {
    const { stream, ...rest } = await doStream();

    const modelId = model.modelId;
    const wrappedStream = stream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(chunk);

          if (chunk.type === 'finish') {
            try {
              const inputTokens = chunk.usage.inputTokens.total ?? 0;
              const outputTokens = chunk.usage.outputTokens.total ?? 0;
              const reasoningTokens = chunk.usage.outputTokens.reasoning ?? undefined;
              const cachedReadTokens = chunk.usage.inputTokens.cacheRead ?? undefined;
              const cachedWriteTokens = chunk.usage.inputTokens.cacheWrite ?? undefined;

              calculateAndSetCost(modelId, {
                inputTokens,
                outputTokens,
                reasoningTokens,
                cachedReadTokens,
                cachedWriteTokens,
              });
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
