import { canViewProject, createApiError, type OrgRole, SPAN_KEYS } from '@inkeep/agents-core';
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
  return {
    endpoint: `${url}/api/v5/query_range`,
    headers: { 'Content-Type': 'application/json', 'SIGNOZ-API-KEY': apiKey },
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

class FetchResponseError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(`Request failed with status ${status}`);
    this.name = 'FetchResponseError';
    this.status = status;
    this.data = data;
  }
}

const KEY_NOT_FOUND_RE = /key `(.+)` not found/i;

function getMissingKeys(error: unknown): string[] | null {
  if (!(error instanceof FetchResponseError) || error.status !== 400) return null;
  const errorData = error.data as any;
  const errors: any[] = errorData?.error?.errors ?? [];
  const keys = errors.map((e: any) => KEY_NOT_FOUND_RE.exec(e?.message)?.[1]).filter(Boolean);
  if (keys.length === 0 || keys.length !== errors.length) return null;
  const unique = [...new Set(keys)] as string[];
  logger.warn({ missingKeys: unique }, 'SigNoz attributes not yet ingested');
  return unique;
}

function queryReferencesKeys(query: any, keys: string[]): boolean {
  const spec = query?.spec;
  const searchable = [
    spec?.filter?.expression ?? '',
    ...(spec?.selectFields ?? []).map((f: any) => f.name),
    ...(spec?.groupBy ?? []).map((g: any) => g.name),
  ];
  return keys.some((k) => searchable.some((t: string) => t.includes(k)));
}

type SignozConfig = { endpoint: string; headers: Record<string, string> };
const EMPTY_RESPONSE = { data: { status: 'success', data: { data: { results: [] } } } };

async function signozPost(
  endpoint: string,
  body: any,
  headers: Record<string, string>,
  timeout: number
): Promise<{ data: any }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new FetchResponseError(response.status, data);
    }

    return { data };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function queryWithRetry(
  signoz: SignozConfig,
  payload: any
): Promise<{ data: any; retried: boolean }> {
  try {
    const resp = await signozPost(signoz.endpoint, payload, signoz.headers, 30000);
    return { data: resp, retried: false };
  } catch (error) {
    const missing = getMissingKeys(error);
    if (!missing) throw error;

    const queries: any[] = payload.compositeQuery?.queries ?? [];
    const kept = queries.filter((q: any) => !queryReferencesKeys(q, missing));
    if (kept.length === queries.length) throw error;

    logger.info(
      { removedCount: queries.length - kept.length, remaining: kept.length, missingKeys: missing },
      'Retrying SigNoz query without queries referencing missing keys'
    );

    if (kept.length === 0) return { data: EMPTY_RESPONSE, retried: true };

    const stripped = { ...payload, compositeQuery: { ...payload.compositeQuery, queries: kept } };
    const resp = await signozPost(signoz.endpoint, stripped, signoz.headers, 30000);
    return { data: resp, retried: true };
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

    const convIdExpr = `${SPAN_KEYS.CONVERSATION_ID} IN (${conversationIds.map((id) => `'${id}'`).join(', ')})`;
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
