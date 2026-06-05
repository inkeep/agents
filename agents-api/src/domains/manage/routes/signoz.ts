import {
  buildFilterExpression,
  canViewProject,
  createApiError,
  type OrgRole,
  SPAN_KEYS,
} from '@inkeep/agents-core';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import type { ManageAppVariables } from '../../../types/app';
import { buildSpanLookupPayload, enforceSecurityFilters } from '../../../utils/signozHelpers';

const logger = getLogger('signoz-proxy');

type Ctx = Context<{ Variables: ManageAppVariables }>;

function getSignozConfig() {
  const url = env.SIGNOZ_URL;
  const apiKey = env.SIGNOZ_API_KEY;
  if (!url || !apiKey) return null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // JWTs always start with 'eyJ' (base64 of `{"`). Route those through
  // Bearer auth; SigNoz PATs use the SIGNOZ-API-KEY header. The preview stack
  // uses a refresh JWT because v0.119 enterprise PAT minting panics.
  if (apiKey.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    headers['SIGNOZ-API-KEY'] = apiKey;
  }
  return {
    endpoint: `${url}/api/v5/query_range`,
    headers,
    healthUrl: url,
  };
}

async function authorizeProject(c: Ctx, projectId: string | undefined) {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const tenantRole = c.get('tenantRole') as OrgRole;

  if (!userId || !tenantId) {
    throw createApiError({
      code: 'unauthorized',
      message: 'User or organization context not found',
      instance: c.req.path,
    });
  }

  if (projectId) {
    const bypassCheck = userId === 'system' || userId?.startsWith('apikey:');
    if (!bypassCheck) {
      const hasAccess = await canViewProject({
        userId,
        tenantId,
        projectId,
        orgRole: tenantRole,
      });
      if (!hasAccess) {
        logger.warn({ userId }, 'Project not found or access denied');
        return c.json(
          { error: 'Forbidden', message: 'You do not have access to this project' },
          403
        );
      }
    }
  }

  return { tenantId, userId };
}

export class FetchResponseError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(`Request failed with status ${status}`);
    this.name = 'FetchResponseError';
    this.status = status;
    this.data = data;
  }
}

// SigNoz reports an unknown attribute key with either `key \`X\` not found`
// (v5 multi-error array shape) or `field \`X\` not found` (v0.96.1 flat-message
// shape). Match both nouns.
const MISSING_KEY_RE = /(?:key|field) `(.+?)` not found/i;

function extractMissingKeysFromBody(data: unknown): string[] {
  const errorData = data as any;
  const errors: any[] = errorData?.error?.errors ?? [];
  if (errors.length > 0) {
    const keys = errors.map((e: any) => MISSING_KEY_RE.exec(e?.message)?.[1]).filter(Boolean);
    // Only trust the array shape when every error parses as a missing key.
    if (keys.length > 0 && keys.length === errors.length) return [...new Set(keys)] as string[];
    return [];
  }
  // v0.96.1 flat shape: { error: { code, message: "field `X` not found" } }.
  const flat = MISSING_KEY_RE.exec(errorData?.error?.message)?.[1];
  return flat ? [flat] : [];
}

// Extract any missing-attribute keys carried in a SigNoz error body.
//
// Older SigNoz returns HTTP 400 with a structured `key \`X\` not found` list.
// SigNoz v0.96.1 instead returns HTTP 500 with a *generic* internal-error body
// for raw queries that select an attribute key with no materialized column —
// carrying no key names at all (see queryWithRetry's untyped re-probe for that
// case). It also returns HTTP 400 with a flat `field \`X\` not found` message
// (one key at a time) when selectFields are sent untyped. Accept 400 and 500 so
// the strip-and-retry path can recover under both versions.
export function getMissingKeys(error: unknown): string[] | null {
  if (!(error instanceof FetchResponseError)) return null;
  if (error.status !== 400 && error.status !== 500) return null;
  const keys = extractMissingKeysFromBody(error.data);
  if (keys.length === 0) return null;
  logger.warn({ missingKeys: keys }, 'SigNoz attributes not yet ingested');
  return keys;
}

export function queryReferencesKeys(query: any, keys: string[]): boolean {
  const spec = query?.spec;
  const searchable = [
    spec?.filter?.expression ?? '',
    ...(spec?.selectFields ?? []).map((f: any) => f.name),
    ...(spec?.groupBy ?? []).map((g: any) => g.name),
  ];
  return keys.some((k) => searchable.some((t: string) => t.includes(k)));
}

// Remove the given attribute keys from every query's selectFields, leaving the
// rest of each query (filter, groupBy, other selects) intact. Downstream
// consumers read span attributes with a default fallback, so dropping a select
// for a key that has no rows is non-destructive — the field would be absent from
// the row data anyway. Returns null when nothing could be stripped (the key is
// only referenced by a filter/groupBy, not a select), signalling the caller to
// fall back to dropping whole queries.
export function stripSelectFields(payload: any, keys: string[]): any | null {
  const queries: any[] = payload.compositeQuery?.queries ?? [];
  let strippedAny = false;
  const next = queries.map((q: any) => {
    const fields: any[] = q?.spec?.selectFields ?? [];
    const kept = fields.filter((f: any) => !keys.some((k) => f?.name === k));
    if (kept.length === fields.length) return q;
    strippedAny = true;
    return { ...q, spec: { ...q.spec, selectFields: kept } };
  });
  if (!strippedAny) return null;
  return { ...payload, compositeQuery: { ...payload.compositeQuery, queries: next } };
}

function withUntypedAttributeSelects(payload: any): any {
  const queries: any[] = payload.compositeQuery?.queries ?? [];
  const untypedQueries = queries.map((q: any) => {
    const fields: any[] = q?.spec?.selectFields ?? [];
    const untyped = fields.map((f: any) =>
      f?.fieldContext === 'attribute' ? { name: f.name } : f
    );
    return { ...q, spec: { ...q.spec, selectFields: untyped } };
  });
  return { ...payload, compositeQuery: { ...payload.compositeQuery, queries: untypedQueries } };
}

// Discover every missing attribute key for a query whose typed form 500s without
// naming them (the SigNoz v0.96.1 quirk). Re-issuing with attribute selectFields
// sent untyped (no fieldDataType) downgrades the failure to an HTTP 400 that
// names one missing field at a time. Strip that field and re-probe untyped until
// the probe succeeds (or yields no parseable key), accumulating the full set in
// one bounded sweep so the caller can strip them all and retry the typed query
// just once — turning 2N round-trips into N+1. Returns the keys discovered.
async function discoverMissingKeysUntyped(
  signoz: SignozConfig,
  payload: any,
  maxRetries: number,
  deadlineSignal: AbortSignal
): Promise<string[]> {
  const discovered: string[] = [];
  let probe = withUntypedAttributeSelects(payload);

  for (let i = 0; i < maxRetries; i++) {
    try {
      await signozPost(signoz.endpoint, probe, signoz.headers, 30000, deadlineSignal);
      return discovered; // untyped form succeeds — all missing keys found.
    } catch (probeError) {
      if (!(probeError instanceof FetchResponseError)) return discovered;
      const keys = extractMissingKeysFromBody(probeError.data);
      if (keys.length === 0) return discovered;
      for (const k of keys) if (!discovered.includes(k)) discovered.push(k);
      const stripped = stripSelectFields(probe, keys);
      if (!stripped) return discovered; // referenced only by filter/groupBy.
      probe = stripped;
    }
  }
  return discovered;
}

type SignozConfig = { endpoint: string; headers: Record<string, string> };
const EMPTY_RESPONSE = { data: { status: 'success', data: { data: { results: [] } } } };

async function signozPost(
  endpoint: string,
  body: any,
  headers: Record<string, string>,
  timeout: number,
  deadlineSignal?: AbortSignal
): Promise<{ data: any }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Combine the per-call timeout with the caller's overall wall-clock deadline
  // (if any) so either firing aborts this request. The per-call 30s timeout
  // still bounds a single slow request; the deadline bounds the whole retry
  // sweep across queryWithRetry + discoverMissingKeysUntyped.
  const signal = deadlineSignal
    ? AbortSignal.any([controller.signal, deadlineSignal])
    : controller.signal;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    // Read the body once as text, then parse — so a non-JSON error body (HTML
    // error page, empty 502, gateway timeout) is preserved verbatim on the
    // FetchResponseError (with the upstream status) rather than lost to a
    // double-read or masked by a JSON SyntaxError that falls through to the
    // generic 500 handler.
    const rawBody = await response.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      throw new FetchResponseError(response.status, rawBody);
    }

    if (!response.ok) {
      throw new FetchResponseError(response.status, data);
    }

    return { data };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Bound the strip-and-retry loop. SigNoz v0.96.1 names one missing key per
// response, so a query selecting many feature-optional attribute keys against a
// conversation that exercises few of them can need one iteration per absent key.
// The cap is a safety valve against a pathological loop; real conversations
// converge well under it. Rather than a fixed oversized cap, derive it from the
// query's own selectField count (each absent key costs at most one iteration),
// clamped to a floor (small queries still get a few retries) and a ceiling.
const MISSING_KEY_RETRY_FLOOR = 8;
const MISSING_KEY_RETRY_CEILING = 80;

// Overall wall-clock deadline for an entire queryWithRetry call, covering both
// the outer retry loop and the nested discoverMissingKeysUntyped sweep. Bounds
// the worst case where each round-trip is slow but individually under the
// per-call 30s timeout, so the loops would otherwise run for minutes.
const QUERY_WALL_CLOCK_DEADLINE_MS = 120_000;

// Count the selectFields declared across every query in the composite payload.
// Used to size the strip-and-retry cap proportionally to the query's breadth.
function countSelectFields(payload: any): number {
  const queries: any[] = payload?.compositeQuery?.queries ?? [];
  return queries.reduce((total: number, q: any) => total + (q?.spec?.selectFields?.length ?? 0), 0);
}

export function effectiveRetryCap(payload: any): number {
  const proportional = 2 * countSelectFields(payload);
  return Math.min(MISSING_KEY_RETRY_CEILING, Math.max(MISSING_KEY_RETRY_FLOOR, proportional));
}

export async function queryWithRetry(
  signoz: SignozConfig,
  payload: any
): Promise<{ data: any; retried: boolean }> {
  let current = payload;
  let retried = false;
  const maxRetries = effectiveRetryCap(payload);

  const deadline = new AbortController();
  const deadlineId = setTimeout(() => deadline.abort(), QUERY_WALL_CLOCK_DEADLINE_MS);

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const resp = await signozPost(
          signoz.endpoint,
          current,
          signoz.headers,
          30000,
          deadline.signal
        );
        return { data: resp, retried };
      } catch (error) {
        // Directly parseable missing keys (structured 400, or flat 400/500 body).
        let missing = getMissingKeys(error);

        // SigNoz v0.96.1 returns a generic 500 with no key names when a typed
        // selectField targets an attribute with no materialized column. Sweep the
        // query with untyped attribute selects to discover the full missing-key set
        // in one pass, then strip them all and retry typed exactly once.
        if (!missing && error instanceof FetchResponseError && error.status === 500) {
          const probed = await discoverMissingKeysUntyped(
            signoz,
            current,
            maxRetries,
            deadline.signal
          );
          if (probed.length > 0) missing = probed;
        }

        if (!missing) throw error;

        // Prefer stripping just the offending selectField(s); fall back to dropping
        // whole queries when the key is referenced elsewhere (filter/groupBy).
        const fieldStripped = stripSelectFields(current, missing);
        if (fieldStripped) {
          logger.info(
            { missingKeys: missing, strategy: 'strip-select-fields' },
            'Retrying SigNoz query without missing attribute selectFields'
          );
          current = fieldStripped;
          retried = true;
          continue;
        }

        const queries: any[] = current.compositeQuery?.queries ?? [];
        const kept = queries.filter((q: any) => !queryReferencesKeys(q, missing));
        if (kept.length === queries.length) throw error;

        logger.info(
          {
            removedCount: queries.length - kept.length,
            remaining: kept.length,
            missingKeys: missing,
            strategy: 'drop-queries',
          },
          'Retrying SigNoz query without queries referencing missing keys'
        );

        if (kept.length === 0) return { data: EMPTY_RESPONSE, retried: true };
        current = { ...current, compositeQuery: { ...current.compositeQuery, queries: kept } };
        retried = true;
      }
    }

    // Cap exhausted — issue one final attempt and let any error propagate.
    const resp = await signozPost(signoz.endpoint, current, signoz.headers, 30000, deadline.signal);
    return { data: resp, retried };
  } finally {
    clearTimeout(deadlineId);
  }
}

function handleSignozError(error: unknown, operation: string) {
  if (error instanceof FetchResponseError) {
    if (error.status === 401 || error.status === 403) {
      logger.error({ status: error.status }, 'SigNoz authentication failed');
      return {
        body: { error: 'Internal Server Error', message: 'SigNoz authentication failed' },
        status: 500 as const,
      };
    }
    if (error.status === 400) {
      logger.warn({ status: 400, responseData: error.data }, `Invalid SigNoz ${operation}`);
      return {
        body: {
          error: 'Bad Request',
          message: (error.data as any)?.error ?? 'Invalid query parameters',
        },
        status: 400 as const,
      };
    }
  }

  if (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === 'AbortError')
  ) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      'SigNoz service unavailable'
    );
    return {
      body: { error: 'Service Unavailable', message: 'SigNoz service is unavailable' },
      status: 503 as const,
    };
  }

  logger.error(
    { error, responseData: error instanceof FetchResponseError ? error.data : undefined },
    `SigNoz ${operation} failed`
  );
  return {
    body: { error: 'Internal Server Error', message: 'Failed to query SigNoz' },
    status: 500 as const,
  };
}

function extractResults(fetchResponse: any): any[] {
  return fetchResponse.data?.data?.data?.results ?? [];
}

const app = new Hono<{ Variables: ManageAppVariables }>();

app.post('/query', async (c) => {
  const payload = await c.req.json();
  const requestedProjectId = payload.projectId;
  delete payload.projectId;

  const auth = await authorizeProject(c, requestedProjectId);
  if (auth instanceof Response) return auth;

  const signoz = getSignozConfig();
  if (!signoz)
    return c.json({ error: 'Service Unavailable', message: 'SigNoz is not configured' }, 500);

  try {
    enforceSecurityFilters(payload, auth.tenantId, requestedProjectId);
  } catch (error) {
    return c.json(
      { error: 'Bad Request', message: error instanceof Error ? error.message : 'Invalid query' },
      400
    );
  }

  try {
    const { data: response } = await queryWithRetry(signoz, payload);
    return c.json(response.data);
  } catch (error) {
    const { body, status } = handleSignozError(error, 'query');
    return c.json(body, status);
  }
});

app.post('/query-batch', async (c) => {
  const body = await c.req.json();
  const { paginationPayload, detailPayloadTemplate } = body;

  if (!paginationPayload || !detailPayloadTemplate) {
    return c.json(
      { error: 'Bad Request', message: 'paginationPayload and detailPayloadTemplate are required' },
      400
    );
  }

  const requestedProjectId = paginationPayload.projectId;
  delete paginationPayload.projectId;
  delete detailPayloadTemplate.projectId;

  const auth = await authorizeProject(c, requestedProjectId);
  if (auth instanceof Response) return auth;

  const signoz = getSignozConfig();
  if (!signoz)
    return c.json({ error: 'Service Unavailable', message: 'SigNoz is not configured' }, 500);

  try {
    enforceSecurityFilters(paginationPayload, auth.tenantId, requestedProjectId);
    enforceSecurityFilters(detailPayloadTemplate, auth.tenantId, requestedProjectId);
  } catch (error) {
    return c.json(
      { error: 'Bad Request', message: error instanceof Error ? error.message : 'Invalid query' },
      400
    );
  }

  try {
    const { data: step1Data } = await queryWithRetry(signoz, paginationPayload);

    const step1Results = extractResults(step1Data);
    const pageResult = step1Results.find((r: any) => r?.queryName === 'pageConversations');

    const columns: Array<{ name: string; columnType: string }> = pageResult?.columns ?? [];
    const rows: any[][] = pageResult?.data ?? [];
    const convIdColIdx = columns.findIndex((col) => col.name === SPAN_KEYS.CONVERSATION_ID);
    const tsColIdx = columns.findIndex((col) => col.columnType === 'aggregation');

    const conversationIds: string[] =
      convIdColIdx >= 0 ? rows.map((row) => row[convIdColIdx]).filter(Boolean) : [];

    if (conversationIds.length === 0) {
      return c.json({ paginationResponse: step1Data.data, detailResponse: null });
    }

    if (tsColIdx >= 0 && rows.length > 0) {
      const BUFFER_MS = 3_600_000;
      let minTs = Number.POSITIVE_INFINITY;
      let maxTs = 0;
      for (const row of rows) {
        const ts = new Date(String(row[tsColIdx])).getTime();
        if (ts > 0 && ts < minTs) minTs = ts;
        if (ts > maxTs) maxTs = ts;
      }
      if (minTs < Number.POSITIVE_INFINITY && maxTs > 0) {
        detailPayloadTemplate.start = minTs - BUFFER_MS;
        detailPayloadTemplate.end = maxTs + BUFFER_MS;
      }
    }

    const convIdExpr = buildFilterExpression([
      { key: SPAN_KEYS.CONVERSATION_ID, op: 'in', value: conversationIds },
    ]);
    for (const { spec } of detailPayloadTemplate.compositeQuery.queries) {
      spec.filter = { expression: `(${spec.filter.expression}) AND ${convIdExpr}` };
    }
    const { data: step2Data } = await queryWithRetry(signoz, detailPayloadTemplate);

    return c.json({ paginationResponse: step1Data.data, detailResponse: step2Data.data });
  } catch (error) {
    const { body, status } = handleSignozError(error, 'query-batch');
    return c.json(body, status);
  }
});

app.post('/span-lookup', async (c) => {
  const body = await c.req.json();
  const { conversationId, spanId } = body;

  if (!conversationId || !spanId) {
    return c.json({ error: 'Bad Request', message: 'conversationId and spanId are required' }, 400);
  }

  const auth = await authorizeProject(c, undefined);
  if (auth instanceof Response) return auth;

  const signoz = getSignozConfig();
  if (!signoz)
    return c.json({ error: 'Service Unavailable', message: 'SigNoz is not configured' }, 500);

  const now = Date.now();
  const lookbackMs = 180 * 24 * 60 * 60 * 1000;
  const payload = buildSpanLookupPayload(
    auth.tenantId,
    conversationId,
    spanId,
    now - lookbackMs,
    now
  );

  try {
    const resp = await signozPost(signoz.endpoint, payload, signoz.headers, 15000);
    return c.json(resp.data);
  } catch (error) {
    const { body: errBody, status } = handleSignozError(error, 'span-lookup');
    return c.json(errBody, status);
  }
});

app.get('/health', async (c) => {
  const signoz = getSignozConfig();
  if (!signoz) {
    logger.warn('SigNoz credentials not set');
    return c.json({
      status: 'not_configured',
      configured: false,
      error: 'SIGNOZ_URL or SIGNOZ_API_KEY not set',
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(signoz.endpoint, {
      method: 'POST',
      headers: signoz.headers,
      body: JSON.stringify({
        start: Date.now() - 300000,
        end: Date.now(),
        requestType: 'scalar',
        compositeQuery: { queries: [] },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 200 || response.status === 400) {
      return c.json({ status: 'ok', configured: true });
    }

    if (response.status === 401 || response.status === 403) {
      logger.error({ error: 'Invalid API key' }, 'SigNoz connection test failed');
      return c.json({
        status: 'connection_failed',
        configured: false,
        error: 'Invalid SIGNOZ_API_KEY',
      });
    }

    logger.error(
      { error: `Unexpected status ${response.status}` },
      'SigNoz connection test failed'
    );
    return c.json({
      status: 'connection_failed',
      configured: false,
      error: 'Failed to connect to SigNoz',
    });
  } catch (error) {
    let errorMessage = 'Failed to connect to SigNoz';
    if (error instanceof DOMException && error.name === 'AbortError') {
      errorMessage = 'SigNoz connection timed out';
    } else if (error instanceof TypeError) {
      errorMessage = 'Check SIGNOZ_URL';
    }
    logger.error(
      { error: error instanceof Error ? error.message : error },
      'SigNoz connection test failed'
    );
    return c.json({ status: 'connection_failed', configured: false, error: errorMessage });
  }
});

export default app;
