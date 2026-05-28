import { expect } from 'vitest';
import { SPAN_KEYS } from '../../../constants/otel-attributes';

export interface CacheSpanExpectation {
  cacheReadTokens: number;
  cacheCreationTokens: number;
  markerCount: number;
  prefixSignature?: string;
}

export function assertCacheSpanKeys(
  setAttributeCalls: unknown[][],
  expected: CacheSpanExpectation
): void {
  const attrs = new Map(setAttributeCalls.map((c) => [c[0], c[1]] as [string, unknown]));

  expect(attrs.get(SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS)).toBe(expected.cacheReadTokens);
  expect(attrs.get(SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS)).toBe(
    expected.cacheCreationTokens
  );
  expect(attrs.get(SPAN_KEYS.CACHE_INTENT_MARKER_COUNT)).toBe(expected.markerCount);

  if (expected.prefixSignature !== undefined) {
    expect(attrs.get(SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE)).toBe(expected.prefixSignature);
  } else {
    expect(attrs.has(SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE)).toBe(true);
    const sig = attrs.get(SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE);
    expect(typeof sig).toBe('string');
    expect((sig as string).length).toBe(10);
  }
}
