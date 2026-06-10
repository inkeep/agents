/**
 * Pure cache-debug walk: turns the SigNoz LLM-span rows returned by
 * `buildCacheDebugQuery` into a chronologically ordered list of `CacheDebugCall`
 * records — each carrying the derived `CacheState`.
 *
 * This is the pure, testable core of the `pnpm cache-debug` CLI. The CLI itself
 * remains a thin shell that fetches from SigNoz and prints these records.
 */
import { SPAN_KEYS } from '../constants/otel-attributes';
import {
  type CacheState,
  deriveCacheState,
  isProviderSupportedForCaching,
  resolveCachingProvider,
} from './cache-state';

export type CacheDebugSpanRow = { data?: Record<string, unknown> } & Record<string, unknown>;

export interface CacheDebugCall {
  spanId: string;
  timestamp: string;
  operationId: string;
  model: string;
  modelProvider: string;
  generationType: string;
  subAgentId: string;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  markerCount: number;
  prefixSignature: string;
  cacheState: CacheState;
}

function getField(row: CacheDebugSpanRow, key: string): unknown {
  const data = row.data;
  if (data && typeof data === 'object' && key in data) return data[key];
  return row[key];
}

function getString(row: CacheDebugSpanRow, key: string): string {
  const value = getField(row, key);
  if (typeof value === 'string') return value;
  return value == null ? '' : String(value);
}

function getNumber(row: CacheDebugSpanRow, key: string): number {
  const value = getField(row, key);
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Walk the LLM-span rows chronologically, deriving each call's cache state.
 *
 * The walk sorts rows by `SPAN_KEYS.TIMESTAMP` (ascending) and derives each
 * call's `CacheState` from its own attributes (marker count, cache-read tokens,
 * provider support).
 */
export function deriveCacheDebugCalls(rows: CacheDebugSpanRow[]): CacheDebugCall[] {
  const sorted = [...rows].sort((a, b) =>
    getString(a, SPAN_KEYS.TIMESTAMP).localeCompare(getString(b, SPAN_KEYS.TIMESTAMP))
  );

  const calls: CacheDebugCall[] = [];
  for (const row of sorted) {
    const prefixSignature = getString(row, SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE) || null;
    const cacheReadTokens = getNumber(row, SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS);
    const markerCount = getNumber(row, SPAN_KEYS.CACHE_INTENT_MARKER_COUNT);
    const requestProvider = getString(row, SPAN_KEYS.AI_MODEL_PROVIDER);
    const responseProvider = getString(row, SPAN_KEYS.GEN_AI_RESPONSE_PROVIDER);
    const cachingProvider = resolveCachingProvider({ requestProvider, responseProvider });

    const cacheState = deriveCacheState({
      markerCount,
      cacheRead: cacheReadTokens,
      providerSupportsCaching: cachingProvider
        ? isProviderSupportedForCaching(cachingProvider)
        : true,
    });

    calls.push({
      spanId: getString(row, SPAN_KEYS.SPAN_ID),
      timestamp: getString(row, SPAN_KEYS.TIMESTAMP),
      operationId: getString(row, SPAN_KEYS.AI_OPERATION_ID),
      model: getString(row, SPAN_KEYS.AI_MODEL_ID),
      modelProvider: requestProvider,
      generationType: getString(row, SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE),
      subAgentId: getString(row, SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID),
      inputTokens: getNumber(row, SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS),
      cacheReadTokens,
      cacheCreationTokens: getNumber(row, SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS),
      markerCount,
      prefixSignature: prefixSignature ?? '',
      cacheState,
      // `modelProvider` reflects the request-side provider for display; the
      // caching-support gate above uses the resolved provider instead.
    });
  }
  return calls;
}
