import { describe, expect, it } from 'vitest';
import { SPAN_KEYS } from '@/constants/signoz';
import {
  formatCostUsd,
  formatTokenCount,
  resolveCacheUsage,
  type SpanData,
} from '@/lib/utils/trace-usage';

const SK = SPAN_KEYS;

describe('formatCostUsd', () => {
  it('uses 6 decimals below $0.01', () => {
    expect(formatCostUsd(0.000123)).toBe('$0.000123');
  });
  it('uses 4 decimals at or above $0.01', () => {
    expect(formatCostUsd(0.0454)).toBe('$0.0454');
    expect(formatCostUsd(1.5)).toBe('$1.5000');
  });
});

describe('formatTokenCount', () => {
  it('formats millions and thousands compactly, small counts in full', () => {
    expect(formatTokenCount(2_500_000)).toBe('2.50M');
    expect(formatTokenCount(21_508)).toBe('21.5K');
    expect(formatTokenCount(74)).toBe('74');
  });
});

describe('resolveCacheUsage', () => {
  // The actual MISS span from production: list query dropped marker_count + tokens to 0, so the
  // item reads as a false NOT-ATTEMPTED ("Skipped") while the raw span shows a real cache MISS.
  const missSpan: SpanData = {
    [SK.GEN_AI_USAGE_INPUT_TOKENS]: 17335,
    [SK.GEN_AI_USAGE_OUTPUT_TOKENS]: 74,
    [SK.GEN_AI_COST_ESTIMATED_USD]: 0.0660795,
    [SK.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 0,
    [SK.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 17286,
    [SK.CACHE_INTENT_MARKER_COUNT]: 1,
    [SK.CACHE_INTENT_PREFIX_SIGNATURE]: 'e3434e79df',
    [SK.AI_MODEL_PROVIDER]: 'gateway',
    [SK.GEN_AI_RESPONSE_PROVIDER]: 'anthropic',
  };

  it('prefers raw span values over dropped list-query item fields', () => {
    const usage = resolveCacheUsage({
      item: { inputTokens: 0, outputTokens: 0, cacheMarkerCount: 0, cacheState: 'NOT-ATTEMPTED' },
      spanData: missSpan,
    });
    expect(usage.inputTokens).toBe(17335);
    expect(usage.outputTokens).toBe(74);
    expect(usage.costUsd).toBe(0.0660795);
    expect(usage.cacheWrite).toBe(17286);
    expect(usage.markerCount).toBe(1);
    expect(usage.prefixSignature).toBe('e3434e79df');
  });

  it('re-derives a false NOT-ATTEMPTED into a real MISS from raw attributes', () => {
    const usage = resolveCacheUsage({
      item: { cacheState: 'NOT-ATTEMPTED' },
      spanData: missSpan,
    });
    expect(usage.cacheState).toBe('MISS');
  });

  it('re-derives into HIT when the raw span shows a cache read', () => {
    const usage = resolveCacheUsage({
      item: { cacheState: 'NOT-ATTEMPTED' },
      spanData: { ...missSpan, [SK.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 15857 },
    });
    expect(usage.cacheState).toBe('HIT');
    expect(usage.cacheRead).toBe(15857);
  });

  it('lets the raw span override a stale server-derived state (raw numerics win)', () => {
    // The list-query state can be wrong; when we have the raw span we derive straight from its real
    // marker/read. A raw span with a marker but no read is a MISS even if the server said HIT.
    const usage = resolveCacheUsage({
      item: { cacheState: 'HIT' },
      spanData: missSpan,
    });
    expect(usage.cacheState).toBe('MISS');
  });

  it('falls back to item fields when no raw span is available', () => {
    const usage = resolveCacheUsage({
      item: {
        inputTokens: 100,
        outputTokens: 5,
        costUsd: 0.02,
        cacheMarkerCount: 1,
        cacheState: 'MISS',
      },
      spanData: undefined,
    });
    expect(usage.inputTokens).toBe(100);
    expect(usage.cacheState).toBe('MISS');
  });

  it('keeps the item state when the raw span carries no cache attributes (no false NOT-ATTEMPTED)', () => {
    // spanData is present but only has non-cache numerics — no marker/read/write/signature. The
    // rawHasCacheSignal guard must leave a valid item.cacheState intact; without it, deriveCacheState
    // would see 0/0 and clobber HIT to NOT-ATTEMPTED.
    const usage = resolveCacheUsage({
      item: { cacheState: 'HIT' },
      spanData: { [SK.GEN_AI_USAGE_INPUT_TOKENS]: 1000 } as SpanData,
    });
    expect(usage.cacheState).toBe('HIT');
  });
});
