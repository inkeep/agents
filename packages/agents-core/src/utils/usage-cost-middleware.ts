import { createHash } from 'node:crypto';
import { trace } from '@opentelemetry/api';
import type { LanguageModelMiddleware } from 'ai';
import { GATEWAY_ROUTABLE_PROVIDERS_SET } from '../constants/models.js';
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
  let cachedReadTokens =
    typeof usage?.inputTokens === 'object' ? usage.inputTokens.cacheRead : undefined;
  const cachedWriteTokens =
    typeof usage?.inputTokens === 'object' ? usage.inputTokens.cacheWrite : undefined;

  if (cachedReadTokens === undefined) {
    const geminiCacheRead = usage?.inputTokenDetails?.cacheReadTokens ?? usage?.cachedInputTokens;
    if (typeof geminiCacheRead === 'number') {
      cachedReadTokens = geminiCacheRead;
    }
  }

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

export function normalizeModelId(modelId: string): string {
  const slashIndex = modelId.indexOf('/');
  if (slashIndex === -1) return modelId;
  const prefix = modelId.slice(0, slashIndex);
  if (GATEWAY_ROUTABLE_PROVIDERS_SET.has(prefix)) {
    return modelId.slice(slashIndex + 1);
  }
  return modelId;
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

export function countCacheMarkers(
  prompt: readonly any[],
  callProviderOptions?: Record<string, any>
): number {
  let count = 0;

  const caching = callProviderOptions?.gateway?.caching;
  if (caching && caching !== 'off' && caching !== 'disabled') {
    count++;
  }

  for (const msg of prompt) {
    if (msg.providerOptions?.anthropic?.cacheControl) {
      count++;
    }
  }

  return Math.min(count, 4);
}

export function computePrefixSignature(prompt: readonly any[], tools?: readonly any[]): string {
  // Hash a structured representation rather than concatenated text so logical boundaries are
  // unambiguous: plain concatenation lets update('AB')+update('C') collide with
  // update('A')+update('BC'). deriveCacheState compares these signatures by equality.
  const systemParts: string[] = [];
  for (const msg of prompt) {
    if (msg.role !== 'system') continue;
    if (typeof msg.content === 'string') {
      systemParts.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (typeof part === 'string') systemParts.push(part);
        else if (part?.text) systemParts.push(part.text);
      }
    }
  }

  const toolParts = (tools ?? []).map((tool) => [
    tool.name ?? '',
    tool.description ?? '',
    tool.parameters ? JSON.stringify(tool.parameters) : '',
  ]);

  return createHash('sha256')
    .update(JSON.stringify([systemParts, toolParts]))
    .digest('hex')
    .slice(0, 10);
}

function setCacheAttributesOnSpan(params: Record<string, any>, usage: any): void {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return;

  const { cachedReadTokens, cachedWriteTokens } = extractUsageTokens(usage);

  activeSpan.setAttribute(
    SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
    typeof cachedReadTokens === 'number' ? cachedReadTokens : 0
  );
  activeSpan.setAttribute(
    SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
    typeof cachedWriteTokens === 'number' ? cachedWriteTokens : 0
  );

  const prompt = params.prompt ?? [];
  const markerCount = countCacheMarkers(prompt, params.providerOptions);
  activeSpan.setAttribute(SPAN_KEYS.CACHE_INTENT_MARKER_COUNT, markerCount);

  const prefixSignature = computePrefixSignature(prompt, params.tools);
  activeSpan.setAttribute(SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE, prefixSignature);
}

export const gatewayCostMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',

  overrideModelId({ model }) {
    return normalizeModelId(model.modelId);
  },

  async wrapGenerate({ doGenerate, params }) {
    const result = await doGenerate();

    try {
      setGatewayAttributesOnSpan(result.providerMetadata as Record<string, any> | undefined);
    } catch (error) {
      logger.warn({ error }, 'Failed to extract gateway cost in wrapGenerate');
    }

    try {
      setCacheAttributesOnSpan(params, result.usage);
    } catch (error) {
      logger.warn({ error }, 'Failed to set cache attributes in wrapGenerate');
    }

    return result;
  },

  async wrapStream({ doStream, params }) {
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

            try {
              setCacheAttributesOnSpan(params, chunk.usage);
            } catch (error) {
              logger.warn({ error }, 'Failed to set cache attributes in wrapStream');
            }
          }
        },
      })
    );

    return { stream: wrappedStream, ...rest };
  },
};
