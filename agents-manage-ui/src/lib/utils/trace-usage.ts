import type { CacheState } from '@/constants/signoz';
import {
  deriveCacheState,
  isProviderSupportedForCaching,
  resolveCachingProvider,
  SPAN_KEYS,
} from '@/constants/signoz';

/** Raw span attribute bag as returned by `/api/traces/spans/[spanId]` (attribute name -> value). */
export type SpanData = Record<string, unknown> | undefined;

/** Read a numeric span attribute. Returns undefined when absent, empty, or non-numeric. */
function readSpanNumber(spanData: SpanData, key: string): number | undefined {
  const v = spanData?.[key];
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Read a non-empty string span attribute, or undefined. */
function readSpanString(spanData: SpanData, key: string): string | undefined {
  const v = spanData?.[key];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** Cost formatter shared across the timeline panel, timeline rows, and any cost surface. */
export function formatCostUsd(costUsd: number): string {
  return costUsd < 0.01 ? `$${costUsd.toFixed(6)}` : `$${costUsd.toFixed(4)}`;
}

/** Compact token-count formatter (1.2K / 3.4M) for aggregate stat surfaces. */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(2)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

/**
 * The subset of a timeline activity item the cache/usage resolver reads. Kept structural (rather
 * than importing the full ActivityItem) so this util stays decoupled and reusable from any caller.
 */
export interface CacheUsageItemFields {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  cacheMarkerCount?: number;
  cachePrefixSignature?: string;
  cacheState?: CacheState;
}

export interface ResolvedCacheUsage {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  costUsd: number | undefined;
  cacheRead: number | undefined;
  cacheWrite: number | undefined;
  markerCount: number | undefined;
  prefixSignature: string | undefined;
  cacheState: CacheState | undefined;
}

/**
 * Merge an LLM-call activity item with its raw span attributes into a single usage view.
 *
 * The conversations list query reads numeric attributes via a typed select that drops some values
 * — notably `cache.intent.marker_count` and the SDK-written token counts — so the item alone can
 * report 0 tokens and a false `NOT-ATTEMPTED` cache state even when the call cached. The raw span
 * (fetched on demand) carries every attribute, so we prefer it and fall back to the item. When the
 * raw span shows a marker was attached but the item state reads as unattempted, the cache state is
 * re-derived from the reliable raw attributes so a genuine HIT/MISS is not mislabeled "Skipped".
 */
export function resolveCacheUsage({
  item,
  spanData,
}: {
  item: CacheUsageItemFields;
  spanData: SpanData;
}): ResolvedCacheUsage {
  const inputTokens =
    readSpanNumber(spanData, SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS) ?? item.inputTokens;
  const outputTokens =
    readSpanNumber(spanData, SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS) ?? item.outputTokens;
  const costUsd = readSpanNumber(spanData, SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD) ?? item.costUsd;
  const cacheRead =
    readSpanNumber(spanData, SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS) ??
    item.cacheReadTokens;
  const cacheWrite =
    readSpanNumber(spanData, SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS) ??
    item.cacheCreationTokens;
  const markerCount =
    readSpanNumber(spanData, SPAN_KEYS.CACHE_INTENT_MARKER_COUNT) ?? item.cacheMarkerCount;
  const prefixSignature =
    readSpanString(spanData, SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE) ?? item.cachePrefixSignature;

  let cacheState = item.cacheState;
  // Only re-derive from the raw span when it actually carries cache attributes. A span fetched
  // without any cache numerics (marker/read/write) or a prefix signature tells us nothing, so we
  // must NOT overwrite a valid server-derived state with a fabricated NOT-ATTEMPTED.
  const rawHasCacheSignal =
    spanData != null &&
    (readSpanNumber(spanData, SPAN_KEYS.CACHE_INTENT_MARKER_COUNT) != null ||
      readSpanNumber(spanData, SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS) != null ||
      readSpanNumber(spanData, SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS) != null ||
      readSpanString(spanData, SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE) != null);
  if (rawHasCacheSignal) {
    const provider = resolveCachingProvider({
      requestProvider: readSpanString(spanData, SPAN_KEYS.AI_MODEL_PROVIDER),
      responseProvider: readSpanString(spanData, SPAN_KEYS.GEN_AI_RESPONSE_PROVIDER),
    });
    const providerSupportsCaching = provider ? isProviderSupportedForCaching(provider) : true;
    // The raw span carries the real numerics (the list query can drop them and mislabel the state),
    // so derive straight from the real marker count and cache read — no synthesized marker. A real
    // markerCount of 0 means no cache marker was placed, i.e. caching was not attempted ("Skipped");
    // a read always resolves to HIT (deriveCacheState checks it first).
    cacheState = deriveCacheState({
      markerCount: markerCount ?? 0,
      cacheRead: cacheRead ?? 0,
      providerSupportsCaching,
    });
  }

  return {
    inputTokens,
    outputTokens,
    costUsd,
    cacheRead,
    cacheWrite,
    markerCount,
    prefixSignature,
    cacheState,
  };
}
