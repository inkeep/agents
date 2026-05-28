import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  effectiveRetryCap,
  FetchResponseError,
  getMissingKeys,
  queryReferencesKeys,
  queryWithRetry,
  stripSelectFields,
} from '../signoz';

const SIGNOZ = { endpoint: 'http://signoz.test/api/v5/query_range', headers: {} };

function jsonResponse(status: number, body: unknown): Response {
  // signozPost reads the body via response.text() then JSON.parses it, so the mock
  // must expose text(). A string body is returned verbatim (non-JSON case); an
  // object body is serialized so JSON.parse(text) round-trips to it.
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text,
  } as unknown as Response;
}

/** Generic v0.96.1 internal-error body (no key names). */
const internal500 = jsonResponse(500, {
  status: 'error',
  error: {
    code: 'internal',
    message: "Something went wrong on our end. It's not you, it's us.",
  },
});

/** v0.96.1 flat 400 body naming a single missing field. */
const fieldNotFound400 = (field: string) =>
  jsonResponse(400, {
    status: 'error',
    error: { code: 'invalid_input', message: `field \`${field}\` not found` },
  });

const success200 = jsonResponse(200, {
  status: 'success',
  data: { data: { results: [{ queryName: 'q', rows: [] }] } },
});

function attr(name: string) {
  return { name, fieldDataType: 'string', fieldContext: 'attribute' };
}

function buildPayload(
  selectFields: Array<{ name: string; fieldDataType?: string; fieldContext?: string }>
) {
  return {
    start: 0,
    end: 1,
    requestType: 'raw',
    compositeQuery: {
      queries: [
        {
          type: 'builder_query',
          spec: {
            name: 'q',
            signal: 'traces',
            filter: { expression: "conversation.id = 'conv-x'" },
            selectFields,
          },
        },
      ],
    },
  };
}

/** Structured array-shape 400 naming one or more missing keys directly. */
function keyNotFound400(...fields: string[]): Response {
  return jsonResponse(400, {
    status: 'error',
    error: { errors: fields.map((f) => ({ message: `key \`${f}\` not found` })) },
  });
}

/**
 * Multi-query payload. Each query gets its own name, filter expression, and
 * selectFields, so tests can target the drop-queries fallback (missing key
 * referenced only by a filter) independently per query.
 */
function buildMultiQueryPayload(
  queries: Array<{
    name: string;
    filter: string;
    selectFields?: Array<{ name: string; fieldDataType?: string; fieldContext?: string }>;
  }>
) {
  return {
    start: 0,
    end: 1,
    requestType: 'raw',
    compositeQuery: {
      queries: queries.map((q) => ({
        type: 'builder_query',
        spec: {
          name: q.name,
          signal: 'traces',
          filter: { expression: q.filter },
          selectFields: q.selectFields ?? [],
        },
      })),
    },
  };
}

function queryNamesFromCall(call: unknown): string[] {
  const [, init] = call as [string, RequestInit];
  const body = JSON.parse(init.body as string);
  return body.compositeQuery.queries.map((q: any) => q.spec.name);
}

function selectFieldNamesFromCall(call: unknown): string[] {
  const [, init] = call as [string, RequestInit];
  const body = JSON.parse(init.body as string);
  return body.compositeQuery.queries.flatMap((q: any) =>
    (q.spec.selectFields ?? []).map((f: any) => f.name)
  );
}

function isUntypedProbe(call: unknown): boolean {
  const [, init] = call as [string, RequestInit];
  const body = JSON.parse(init.body as string);
  // Untyped probe = attribute selects sent without fieldDataType.
  return body.compositeQuery.queries.every((q: any) =>
    (q.spec.selectFields ?? []).every((f: any) => f.fieldDataType === undefined)
  );
}

describe('getMissingKeys', () => {
  it('parses the structured 400 `key not found` array shape', () => {
    const err = new FetchResponseError(400, {
      error: { errors: [{ message: 'key `tool.name` not found' }] },
    });
    expect(getMissingKeys(err)).toEqual(['tool.name']);
  });

  it('parses the v0.96.1 flat 400 `field not found` message shape', () => {
    const err = new FetchResponseError(400, {
      error: { code: 'invalid_input', message: 'field `artifact.id` not found' },
    });
    expect(getMissingKeys(err)).toEqual(['artifact.id']);
  });

  it('returns null for a generic 500 with no key names (must be discovered via re-probe)', () => {
    const err = new FetchResponseError(500, {
      error: { code: 'internal', message: 'Something went wrong on our end.' },
    });
    expect(getMissingKeys(err)).toBeNull();
  });

  it('returns null for a mixed error array where not every entry is a missing-key error', () => {
    // The array shape is only trusted when every error parses as a missing key. Here one
    // entry does, the other does not, so keys.length !== errors.length and we must not strip.
    const err = new FetchResponseError(400, {
      error: {
        errors: [
          { message: 'key `tool.name` not found' },
          { message: 'internal timeout while scanning shard' },
        ],
      },
    });
    expect(getMissingKeys(err)).toBeNull();
  });

  it('returns null for non-FetchResponseError', () => {
    expect(getMissingKeys(new Error('boom'))).toBeNull();
  });
});

describe('stripSelectFields', () => {
  it('removes only the named selectFields, leaving the rest of the query intact', () => {
    const payload = buildPayload([attr('ai.toolCall.name'), attr('tool.name')]);
    const stripped = stripSelectFields(payload, ['tool.name']);
    expect(stripped).not.toBeNull();
    const names = stripped.compositeQuery.queries[0].spec.selectFields.map((f: any) => f.name);
    expect(names).toEqual(['ai.toolCall.name']);
    // Filter expression preserved.
    expect(stripped.compositeQuery.queries[0].spec.filter.expression).toContain('conv-x');
  });

  it('returns null when the key is not present in any selectField', () => {
    const payload = buildPayload([attr('ai.toolCall.name')]);
    expect(stripSelectFields(payload, ['not.selected'])).toBeNull();
  });
});

describe('queryWithRetry — SigNoz v0.96.1 absent-key 500 quirk', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recovers a typed query that 500s on absent keys by discovering them untyped and stripping', async () => {
    // Conversation has ai.toolCall.name but NOT tool.name / artifact.id (both absent).
    // Emulated SigNoz v0.96.1 behavior:
    //   - typed select touching an absent key  -> 500 generic (no key names)
    //   - untyped select touching an absent key -> 400 naming ONE field at a time
    //   - once all absent keys removed          -> 200
    const present = new Set(['ai.toolCall.name']);
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const fields = body.compositeQuery.queries.flatMap((q: any) => q.spec.selectFields ?? []);
      const absent = fields.filter((f: any) => !present.has(f.name));
      if (absent.length === 0) return success200;
      const anyTyped = fields.some((f: any) => f.fieldDataType !== undefined);
      if (anyTyped) return internal500; // typed + absent -> generic 500
      return fieldNotFound400(absent[0].name); // untyped + absent -> flat 400, one key
    });

    const payload = buildPayload([
      attr('ai.toolCall.name'),
      attr('tool.name'),
      attr('artifact.id'),
    ]);

    const { data, retried } = await queryWithRetry(SIGNOZ, payload);

    expect(retried).toBe(true);
    expect(data.data.status).toBe('success');

    // The FINAL (successful) call must be a typed query carrying the present key
    // and neither absent key.
    const lastCall = fetchMock.mock.calls.at(-1);
    expect(isUntypedProbe(lastCall)).toBe(false);
    const finalNames = selectFieldNamesFromCall(lastCall);
    expect(finalNames).toContain('ai.toolCall.name');
    expect(finalNames).not.toContain('tool.name');
    expect(finalNames).not.toContain('artifact.id');
  });

  it('does not retry when the first typed query succeeds', async () => {
    fetchMock.mockResolvedValue(success200);
    const payload = buildPayload([attr('ai.toolCall.name')]);
    const { retried } = await queryWithRetry(SIGNOZ, payload);
    expect(retried).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recovers via the structured 400 path without an untyped re-probe', async () => {
    // Older SigNoz: typed query returns a structured 400 naming the missing key
    // directly, so no untyped sweep is needed.
    const present = new Set(['ai.toolCall.name']);
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const fields = body.compositeQuery.queries.flatMap((q: any) => q.spec.selectFields ?? []);
      const absent = fields.filter((f: any) => !present.has(f.name));
      if (absent.length === 0) return success200;
      return jsonResponse(400, {
        error: { errors: absent.map((f: any) => ({ message: `key \`${f.name}\` not found` })) },
      });
    });

    const payload = buildPayload([attr('ai.toolCall.name'), attr('tool.name')]);
    const { retried } = await queryWithRetry(SIGNOZ, payload);

    expect(retried).toBe(true);
    // No untyped probe should have been issued on the structured-400 path.
    const untypedProbes = fetchMock.mock.calls.filter((c) => isUntypedProbe(c));
    expect(untypedProbes).toHaveLength(0);
  });
});

describe('queryWithRetry — drop-queries fallback', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops the query referencing the missing key only in its filter, keeping the others', async () => {
    // `evaluation.score` is absent. It is referenced ONLY by query `withEval`'s
    // filter expression (not any selectField), so stripSelectFields can remove
    // nothing -> queryWithRetry falls back to dropping the whole `withEval`
    // query. `plain` does not reference the missing key and must survive.
    const payload = buildMultiQueryPayload([
      { name: 'withEval', filter: "evaluation.score > 0.5 AND conversation.id = 'conv-x'" },
      { name: 'plain', filter: "conversation.id = 'conv-x'" },
    ]);

    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const names: string[] = body.compositeQuery.queries.map((q: any) => q.spec.name);
      // SigNoz rejects the request while any query still references the absent key.
      if (names.includes('withEval')) return keyNotFound400('evaluation.score');
      return success200;
    });

    const { data, retried } = await queryWithRetry(SIGNOZ, payload);

    expect(retried).toBe(true);
    expect(data.data.status).toBe('success');
    // The surviving (successful) call carries exactly the query that did NOT
    // reference the missing key.
    const lastCall = fetchMock.mock.calls.at(-1);
    expect(queryNamesFromCall(lastCall)).toEqual(['plain']);
  });

  it('returns EMPTY_RESPONSE without another network call when every query is dropped', async () => {
    // Both queries reference the absent key only in their filters, so all
    // queries are dropped and queryWithRetry short-circuits to EMPTY_RESPONSE.
    const payload = buildMultiQueryPayload([
      { name: 'a', filter: 'evaluation.score > 0.5' },
      { name: 'b', filter: 'evaluation.score < 0.9' },
    ]);

    fetchMock.mockResolvedValue(keyNotFound400('evaluation.score'));

    const { data, retried } = await queryWithRetry(SIGNOZ, payload);

    expect(retried).toBe(true);
    // Shape matches the source EMPTY_RESPONSE sentinel.
    expect(data).toEqual({ data: { status: 'success', data: { data: { results: [] } } } });
    // Exactly one network call: the initial failing query. The short-circuit
    // returns without re-issuing a query with zero queries.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('queryReferencesKeys', () => {
  const keys = ['evaluation.score'];

  it('returns true when a key is referenced in the filter expression', () => {
    const query = { spec: { filter: { expression: 'evaluation.score > 0.5' } } };
    expect(queryReferencesKeys(query, keys)).toBe(true);
  });

  it('returns true when a key is referenced in a selectField name', () => {
    const query = { spec: { selectFields: [{ name: 'evaluation.score' }] } };
    expect(queryReferencesKeys(query, keys)).toBe(true);
  });

  it('returns true when a key is referenced in groupBy', () => {
    const query = { spec: { groupBy: [{ name: 'evaluation.score' }] } };
    expect(queryReferencesKeys(query, keys)).toBe(true);
  });

  it('returns false when no field references the key', () => {
    const query = {
      spec: {
        filter: { expression: "conversation.id = 'conv-x'" },
        selectFields: [{ name: 'tool.name' }],
        groupBy: [{ name: 'span.name' }],
      },
    };
    expect(queryReferencesKeys(query, keys)).toBe(false);
  });

  it('returns false for an empty/absent spec', () => {
    expect(queryReferencesKeys({}, keys)).toBe(false);
    expect(queryReferencesKeys({ spec: {} }, keys)).toBe(false);
  });
});

describe('queryWithRetry — robustness (deadline + proportional cap)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('propagates an abort (e.g. wall-clock deadline) instead of looping forever', async () => {
    // Simulate the deadline AbortController firing mid-flight: fetch rejects with
    // an AbortError. getMissingKeys returns null for a non-FetchResponseError, so
    // queryWithRetry must rethrow immediately rather than spin the retry loop.
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));

    const payload = buildPayload([attr('ai.toolCall.name')]);

    await expect(queryWithRetry(SIGNOZ, payload)).rejects.toMatchObject({ name: 'AbortError' });
    // A single attempt, then propagation — no retry storm.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces upstream status + raw body when SigNoz returns a non-JSON error (HTML 502)', async () => {
    // Reverse-proxy HTML error page / empty gateway timeout: response.text() yields
    // non-JSON, JSON.parse throws, and signozPost must surface a FetchResponseError
    // carrying the upstream status AND the raw body (not an opaque SyntaxError, and
    // not an empty body lost to a double-read).
    fetchMock.mockResolvedValue(jsonResponse(502, '<html>502 Bad Gateway</html>'));

    const payload = buildPayload([attr('ai.toolCall.name')]);

    await expect(queryWithRetry(SIGNOZ, payload)).rejects.toMatchObject({
      status: 502,
      data: '<html>502 Bad Gateway</html>',
    });
  });

  it('sizes the retry cap proportionally to selectField count, clamped to floor and ceiling', () => {
    // Floor: a tiny query (1 field -> 2) is clamped up to the floor of 8 so even
    // narrow queries get a few strip-and-retry attempts.
    expect(effectiveRetryCap(buildPayload([attr('only.one')]))).toBe(8);

    // Proportional middle: 2 * fieldCount once above the floor.
    const tenFields = Array.from({ length: 10 }, (_, i) => attr(`f.${i}`));
    expect(effectiveRetryCap(buildPayload(tenFields))).toBe(20);

    // Ceiling: a very wide query is clamped down to 80 (was the old fixed cap).
    const hundredFields = Array.from({ length: 100 }, (_, i) => attr(`f.${i}`));
    expect(effectiveRetryCap(buildPayload(hundredFields))).toBe(80);

    // Sums selectFields across every query in a composite payload.
    const multi = buildMultiQueryPayload([
      { name: 'a', filter: 'x', selectFields: Array.from({ length: 6 }, (_, i) => attr(`a.${i}`)) },
      { name: 'b', filter: 'y', selectFields: Array.from({ length: 6 }, (_, i) => attr(`b.${i}`)) },
    ]);
    expect(effectiveRetryCap(multi)).toBe(24); // 2 * (6 + 6)

    // Degenerate payloads fall back to the floor without throwing.
    expect(effectiveRetryCap({})).toBe(8);
    expect(effectiveRetryCap({ compositeQuery: { queries: [] } })).toBe(8);
  });
});
