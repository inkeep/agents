import { describe, expect, it } from 'vitest';
import { SPAN_KEYS } from '../../constants/otel-attributes';
import { type CacheDebugSpanRow, deriveCacheDebugCalls } from '../cache-debug-walk';

const span = (overrides: Partial<Record<string, string | number>>): CacheDebugSpanRow => ({
  data: {
    [SPAN_KEYS.SPAN_ID]: 'span-id-default',
    [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:00Z',
    [SPAN_KEYS.AI_OPERATION_ID]: 'ai.streamText',
    [SPAN_KEYS.AI_MODEL_ID]: 'claude-sonnet-4-5',
    [SPAN_KEYS.AI_MODEL_PROVIDER]: 'anthropic',
    [SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE]: 'main',
    [SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS]: 0,
    [SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 0,
    [SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 0,
    [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 0,
    [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: '',
    [SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID]: '',
    [SPAN_KEYS.AGENT_ID]: '',
    ...overrides,
  },
});

describe('deriveCacheDebugCalls — per-agent priorSignature tracking (multi-agent interleaved)', () => {
  it('uses per-agent priorSignatures for interleaved multi-agent spans (A2 vs A1, not A2 vs B1)', () => {
    // A1: agentA, sigA, no prior, markers=2, read=0 -> MISS-expected
    // B1: agentB, sigB, no prior, markers=2, read=0 -> MISS-expected
    // A2: agentA, sigA again, markers=2, read=0
    //   per-agent cursor: A's prior is "sigA" -> MISS-regression (CORRECT)
    //   global cursor:    last prior is "sigB" -> MISS-expected (BUG)
    const calls = deriveCacheDebugCalls([
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-A1',
        [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:01Z',
        [SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID]: 'agentA',
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sigA',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
      }),
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-B1',
        [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:02Z',
        [SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID]: 'agentB',
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sigB',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
      }),
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-A2',
        [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:03Z',
        [SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID]: 'agentA',
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sigA',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
      }),
    ]);

    const byId = new Map(calls.map((c) => [c.spanId, c]));
    expect(byId.get('span-A1')?.cacheState).toBe('MISS-expected');
    expect(byId.get('span-B1')?.cacheState).toBe('MISS-expected');
    expect(byId.get('span-A2')?.cacheState).toBe('MISS-regression');
  });

  it('falls back to AGENT_ID when AI_TELEMETRY_SUB_AGENT_ID is empty', () => {
    const calls = deriveCacheDebugCalls([
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-1',
        [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:01Z',
        [SPAN_KEYS.AGENT_ID]: 'agentZ',
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sigZ',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
      }),
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-2',
        [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:02Z',
        [SPAN_KEYS.AGENT_ID]: 'agentZ',
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sigZ',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
      }),
    ]);

    const byId = new Map(calls.map((c) => [c.spanId, c]));
    expect(byId.get('span-1')?.cacheState).toBe('MISS-expected');
    expect(byId.get('span-2')?.cacheState).toBe('MISS-regression');
    // The output `subAgentId` field reflects only AI_TELEMETRY_SUB_AGENT_ID (returns '' here),
    // intentionally distinct from the internal bucketing key (which falls back to AGENT_ID).
    // Pinning this gap so a future change that unifies them surfaces explicitly.
    expect(byId.get('span-1')?.subAgentId).toBe('');
    expect(byId.get('span-2')?.subAgentId).toBe('');
  });

  it('falls back to _default when both AI_TELEMETRY_SUB_AGENT_ID and AGENT_ID are empty', () => {
    const calls = deriveCacheDebugCalls([
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-1',
        [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:01Z',
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sig1',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
      }),
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-2',
        [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:02Z',
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sig1',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
      }),
    ]);

    const byId = new Map(calls.map((c) => [c.spanId, c]));
    expect(byId.get('span-1')?.cacheState).toBe('MISS-expected');
    expect(byId.get('span-2')?.cacheState).toBe('MISS-regression');
  });

  it('honors providerSupportsCaching from the AI_MODEL_PROVIDER attribute', () => {
    const calls = deriveCacheDebugCalls([
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-cohere',
        [SPAN_KEYS.AI_MODEL_PROVIDER]: 'cohere',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 0,
      }),
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-anthropic',
        [SPAN_KEYS.AI_MODEL_PROVIDER]: 'anthropic',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 0,
      }),
    ]);

    const byId = new Map(calls.map((c) => [c.spanId, c]));
    expect(byId.get('span-cohere')?.cacheState).toBe('NOT-SUPPORTED-BY-PROVIDER');
    expect(byId.get('span-anthropic')?.cacheState).toBe('NOT-ATTEMPTED');
  });

  it('resolves the caching-support gate from GEN_AI_RESPONSE_PROVIDER for gateway-routed spans', () => {
    // Regression: Vercel-AI-Gateway deployments report ai.model.provider='gateway'
    // (not in CACHING_SUPPORTED_PROVIDERS) while the real backend that owns the
    // cache keys is gen_ai.response.provider='anthropic'. A real cache hit
    // (marker_count=1, cache_read>0) must derive HIT, not NOT-SUPPORTED-BY-PROVIDER.
    // Mirrors live conversation conv_6tPrd7lMe6atqJ4z.
    const calls = deriveCacheDebugCalls([
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-gateway-hit',
        [SPAN_KEYS.AI_MODEL_PROVIDER]: 'gateway',
        [SPAN_KEYS.GEN_AI_RESPONSE_PROVIDER]: 'anthropic',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 1,
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: '2f50e6ab00',
        [SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 15927,
      }),
      // Gateway routing to a non-caching backend still classifies as unsupported.
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-gateway-cohere',
        [SPAN_KEYS.AI_MODEL_PROVIDER]: 'gateway',
        [SPAN_KEYS.GEN_AI_RESPONSE_PROVIDER]: 'cohere',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 0,
      }),
    ]);

    const byId = new Map(calls.map((c) => [c.spanId, c]));
    expect(byId.get('span-gateway-hit')?.cacheState).toBe('HIT');
    expect(byId.get('span-gateway-cohere')?.cacheState).toBe('NOT-SUPPORTED-BY-PROVIDER');
    // Display field still reflects the request-side provider.
    expect(byId.get('span-gateway-hit')?.modelProvider).toBe('gateway');
  });

  it('returns HIT when markers + cache_read > 0', () => {
    const calls = deriveCacheDebugCalls([
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-hit',
        [SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID]: 'agentA',
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sigA',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
        [SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 1000,
      }),
    ]);

    expect(calls[0]?.cacheState).toBe('HIT');
    expect(calls[0]?.cacheReadTokens).toBe(1000);
  });

  it('sorts spans chronologically before walking (preserves ordering invariants)', () => {
    // Provide spans out of timestamp order; the walk must sort first.
    const calls = deriveCacheDebugCalls([
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-late',
        [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:03Z',
        [SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID]: 'agentA',
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sigA',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
      }),
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-early',
        [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:01Z',
        [SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID]: 'agentA',
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sigA',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
      }),
    ]);

    expect(calls.map((c) => c.spanId)).toEqual(['span-early', 'span-late']);
    expect(calls[0]?.cacheState).toBe('MISS-expected'); // first chronological
    expect(calls[1]?.cacheState).toBe('MISS-regression'); // sig matches prior for same agent
  });

  it('surfaces subAgentId on the call output (for downstream debugging)', () => {
    const calls = deriveCacheDebugCalls([
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-1',
        [SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID]: 'agentA',
      }),
    ]);

    expect(calls[0]?.subAgentId).toBe('agentA');
  });

  it('reads fields from a flat (non-data-envelope) row shape', () => {
    // Rows may arrive without the { data: {...} } wrapper; getField falls back to the
    // top-level key. A flat row must still derive correctly (not all-empty/NOT-ATTEMPTED).
    const flatRow: CacheDebugSpanRow = {
      [SPAN_KEYS.SPAN_ID]: 'flat-1',
      [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:01Z',
      [SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID]: 'agentFlat',
      [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sigFlat',
      [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
    };

    const calls = deriveCacheDebugCalls([flatRow]);

    expect(calls[0]?.spanId).toBe('flat-1');
    expect(calls[0]?.subAgentId).toBe('agentFlat');
    expect(calls[0]?.markerCount).toBe(2);
    expect(calls[0]?.cacheState).toBe('MISS-expected');
  });

  it('advances the per-agent priorSignature cursor on a HIT, not only on misses', () => {
    // span-2 is a HIT (cache_read > 0) but must still advance the agent's cursor to its
    // own signature; span-3 (same signature as span-2) is then MISS-regression, proving the
    // cursor moved on the HIT rather than staying at span-1's signature.
    const calls = deriveCacheDebugCalls([
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-1',
        [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:01Z',
        [SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID]: 'agentA',
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sig1',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
      }),
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-2',
        [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:02Z',
        [SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID]: 'agentA',
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sig2',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
        [SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 8000,
      }),
      span({
        [SPAN_KEYS.SPAN_ID]: 'span-3',
        [SPAN_KEYS.TIMESTAMP]: '2024-01-01T00:00:03Z',
        [SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID]: 'agentA',
        [SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE]: 'sig2',
        [SPAN_KEYS.CACHE_INTENT_MARKER_COUNT]: 2,
      }),
    ]);

    const byId = new Map(calls.map((c) => [c.spanId, c]));
    expect(byId.get('span-2')?.cacheState).toBe('HIT');
    expect(byId.get('span-3')?.cacheState).toBe('MISS-regression');
  });
});
