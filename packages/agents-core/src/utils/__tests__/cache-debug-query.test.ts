import { describe, expect, it } from 'vitest';
import { AI_OPERATIONS, SPAN_KEYS } from '../../constants/otel-attributes';
import { REQUEST_TYPES } from '../../constants/signoz-queries';
import { buildCacheDebugQuery, CACHE_DEBUG_QUERY_NAME } from '../cache-debug-query';

const CACHE_SPAN_KEYS = [
  'gen_ai.usage.cache_read.input_tokens',
  'gen_ai.usage.cache_creation.input_tokens',
  'cache.intent.marker_count',
  'cache.intent.prefix_signature',
] as const;

describe('buildCacheDebugQuery', () => {
  it('produces a JSON-serializable query template (parses as valid JSON)', () => {
    const query = buildCacheDebugQuery('conv-123', { start: 0, end: 1000 });
    const serialized = JSON.stringify(query);
    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(JSON.parse(serialized)).toEqual(query);
  });

  it('references all 4 D11 cache SPAN_KEYS by exact string (drift breaks CI)', () => {
    const serialized = JSON.stringify(buildCacheDebugQuery('conv-123', { start: 0, end: 1000 }));
    for (const key of CACHE_SPAN_KEYS) {
      expect(serialized).toContain(key);
    }
  });

  it('keeps the SPAN_KEYS constants aligned with the locked D11 literals', () => {
    expect(SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS).toBe(CACHE_SPAN_KEYS[0]);
    expect(SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS).toBe(CACHE_SPAN_KEYS[1]);
    expect(SPAN_KEYS.CACHE_INTENT_MARKER_COUNT).toBe(CACHE_SPAN_KEYS[2]);
    expect(SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE).toBe(CACHE_SPAN_KEYS[3]);
  });

  it('selects per-agent attribution fields so multi-agent cache walks can key by sub-agent', () => {
    const query = buildCacheDebugQuery('conv-123', { start: 0, end: 1000 });
    const selectFields = query.compositeQuery.queries[0]?.spec.selectFields ?? [];
    const names = selectFields.map((f) => f.name);
    // Without these, the CLI can't tell which sub-agent emitted each span and the
    // priorSignature cursor for multi-agent conversations regresses to a single
    // global cursor (re-introducing the bug fixed in route.ts).
    expect(names).toContain(SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID);
    expect(names).toContain(SPAN_KEYS.AGENT_ID);
    expect(names).toContain(SPAN_KEYS.AI_MODEL_PROVIDER);
    // Resolved provider gates caching support: gateway-routed spans report
    // ai.model.provider='gateway' (not caching-capable) while the real backend
    // lives in gen_ai.response.provider. Both must be selected so the walk can
    // resolve the gate provider — otherwise gateway deployments misclassify HITs.
    expect(names).toContain(SPAN_KEYS.GEN_AI_RESPONSE_PROVIDER);
  });

  it('scopes the query to the conversation id and LLM operation spans', () => {
    const query = buildCacheDebugQuery('conv-abc', { start: 0, end: 1000 });
    const expression = query.compositeQuery.queries[0]?.spec.filter.expression ?? '';
    expect(expression).toContain(`${SPAN_KEYS.CONVERSATION_ID} = 'conv-abc'`);
    expect(expression).toContain(AI_OPERATIONS.GENERATE_TEXT);
    expect(expression).toContain(AI_OPERATIONS.STREAM_TEXT);
    expect(query.requestType).toBe(REQUEST_TYPES.RAW);
    expect(query.compositeQuery.queries[0]?.spec.name).toBe(CACHE_DEBUG_QUERY_NAME);
  });

  it('escapes single quotes in the conversation id (injection-safe filter)', () => {
    const query = buildCacheDebugQuery("conv-o'brien", { start: 0, end: 1000 });
    const expression = query.compositeQuery.queries[0]?.spec.filter.expression ?? '';
    expect(expression).toContain("conv-o''brien");
  });

  it('adds project scoping only when a projectId is provided', () => {
    const withoutProject = buildCacheDebugQuery('conv-1', { start: 0, end: 1000 });
    expect('projectId' in withoutProject).toBe(false);
    expect(
      withoutProject.compositeQuery.queries[0]?.spec.filter.expression.includes(
        SPAN_KEYS.PROJECT_ID
      )
    ).toBe(false);

    const withProject = buildCacheDebugQuery('conv-1', {
      start: 0,
      end: 1000,
      projectId: 'proj-9',
    });
    expect(withProject.projectId).toBe('proj-9');
    expect(withProject.compositeQuery.queries[0]?.spec.filter.expression).toContain(
      `${SPAN_KEYS.PROJECT_ID} = 'proj-9'`
    );
  });
});
