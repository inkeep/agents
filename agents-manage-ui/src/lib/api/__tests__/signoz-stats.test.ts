import { SPAN_KEYS } from '@/constants/signoz';
import { USAGE_COST_AGGREGATION_ORDER } from '../signoz-stats';

describe('USAGE_COST_AGGREGATION_ORDER positional contract', () => {
  it('preserves existing positions for the original 4 dimensions', () => {
    expect(USAGE_COST_AGGREGATION_ORDER[0]?.key).toBe('inputTokens');
    expect(USAGE_COST_AGGREGATION_ORDER[1]?.key).toBe('outputTokens');
    expect(USAGE_COST_AGGREGATION_ORDER[2]?.key).toBe('cost');
    expect(USAGE_COST_AGGREGATION_ORDER[3]?.key).toBe('eventCount');
  });

  it('appends exactly 2 cache-token entries at the end of the order', () => {
    expect(USAGE_COST_AGGREGATION_ORDER).toHaveLength(6);
    expect(USAGE_COST_AGGREGATION_ORDER[4]?.key).toBe('cacheReadTokens');
    expect(USAGE_COST_AGGREGATION_ORDER[5]?.key).toBe('cacheCreationTokens');
  });

  it('expressions reference the canonical cache SPAN_KEYS from otel-attributes', () => {
    expect(USAGE_COST_AGGREGATION_ORDER[4]?.expression).toBe(
      `sum(${SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS})`
    );
    expect(USAGE_COST_AGGREGATION_ORDER[5]?.expression).toBe(
      `sum(${SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS})`
    );
  });

  it('expressions reference SPAN_KEYS, not hard-coded strings (drift guard)', () => {
    expect(SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS).toBe(
      'gen_ai.usage.cache_read.input_tokens'
    );
    expect(SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS).toBe(
      'gen_ai.usage.cache_creation.input_tokens'
    );
    expect(SPAN_KEYS.CACHE_INTENT_MARKER_COUNT).toBe('cache.intent.marker_count');
    expect(SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE).toBe('cache.intent.prefix_signature');
  });

  it('every entry has a stable shape (key + expression strings, all expressions are sum() or count())', () => {
    for (const entry of USAGE_COST_AGGREGATION_ORDER) {
      expect(typeof entry.key).toBe('string');
      expect(entry.key.length).toBeGreaterThan(0);
      expect(typeof entry.expression).toBe('string');
      expect(entry.expression).toMatch(/^(sum\(.+\)|count\(\))$/);
    }
  });
});
