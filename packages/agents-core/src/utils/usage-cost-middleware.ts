import { trace } from '@opentelemetry/api';
import type { LanguageModelMiddleware } from 'ai';
import { SPAN_KEYS } from '../constants/otel-attributes';
import { getLogger } from './logger';

const logger = getLogger('usage-cost-middleware');

export function extractUsageTokens(usage: any): {
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

function extractGatewayCost(providerMetadata: Record<string, any> | undefined): number {
  const gw = providerMetadata?.gateway;
  if (!gw) return 0;

  const cost = parseFloat(gw.cost as string);
  if (!Number.isNaN(cost) && cost > 0) return cost;

  const marketCost = parseFloat(gw.marketCost as string);
  if (!Number.isNaN(marketCost) && marketCost > 0) return marketCost;

  return 0;
}

function setGatewayAttributesOnSpan(providerMetadata: Record<string, any> | undefined): void {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return;

  const cost = extractGatewayCost(providerMetadata);
  activeSpan.setAttribute(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, cost);

  const gw = providerMetadata?.gateway;
  if (gw) {
    if (cost === 0) {
      logger.warn({ gateway: gw }, 'Routed through gateway but no cost data in response');
    }

    const routing = gw.routing as Record<string, any> | undefined;
    if (routing?.finalProvider) {
      activeSpan.setAttribute(SPAN_KEYS.GEN_AI_RESPONSE_PROVIDER, routing.finalProvider);
    }
    if (routing?.resolvedProvider) {
      activeSpan.setAttribute(SPAN_KEYS.GEN_AI_REQUEST_PROVIDER, routing.resolvedProvider);
    }
  }
}

export const gatewayCostMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',

  async wrapGenerate({ doGenerate }) {
    const result = await doGenerate();

    try {
      setGatewayAttributesOnSpan(result.providerMetadata as Record<string, any> | undefined);
    } catch (error) {
      logger.warn({ error }, 'Failed to extract gateway cost in wrapGenerate');
    }

    return result;
  },

  async wrapStream({ doStream }) {
    const { stream, ...rest } = await doStream();

    const wrappedStream = stream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(chunk);

          if (chunk.type === 'finish') {
            try {
              setGatewayAttributesOnSpan(chunk.providerMetadata as Record<string, any> | undefined);
            } catch (error) {
              logger.warn({ error }, 'Failed to extract gateway cost in wrapStream');
            }
          }
        },
      })
    );

    return { stream: wrappedStream, ...rest };
  },
};
