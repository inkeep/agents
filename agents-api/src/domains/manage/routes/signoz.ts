import { canViewProject, createApiError, type OrgRole, SPAN_KEYS } from '@inkeep/agents-core';
import axios from 'axios';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import type { ManageAppVariables } from '../../../types/app';
import { enforceSecurityFilters } from '../../../utils/signozHelpers';

const logger = getLogger('signoz-proxy');

type Ctx = Context<{ Variables: ManageAppVariables }>;

function getSignozConfig() {
  const url = env.SIGNOZ_URL || env.PUBLIC_SIGNOZ_URL;
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
        logger.warn({ tenantId, projectId, userId }, 'Project not found or access denied');
        return c.json(
          { error: 'Forbidden', message: 'You do not have access to this project' },
          403
        );
      }
    }
  }

  return { tenantId, userId };
}

function handleSignozError(error: unknown, operation: string) {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      logger.error({ error: error.message }, 'SigNoz service unavailable');
      return {
        body: { error: 'Service Unavailable', message: 'SigNoz service is unavailable' },
        status: 503 as const,
      };
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      logger.error({ status: error.response.status }, 'SigNoz authentication failed');
      return {
        body: { error: 'Internal Server Error', message: 'SigNoz authentication failed' },
        status: 500 as const,
      };
    }
    if (error.response?.status === 400) {
      logger.warn(
        { status: 400, responseData: error.response?.data },
        `Invalid SigNoz ${operation}`
      );
      return {
        body: {
          error: 'Bad Request',
          message: error.response?.data?.error ?? 'Invalid query parameters',
        },
        status: 400 as const,
      };
    }
  }
  logger.error(
    { error, responseData: axios.isAxiosError(error) ? error.response?.data : undefined },
    `SigNoz ${operation} failed`
  );
  return {
    body: { error: 'Internal Server Error', message: 'Failed to query SigNoz' },
    status: 500 as const,
  };
}

// Axios wraps the HTTP body in `.data`. SigNoz v5 returns `{ status, data: { results } }`.
// So the results live at `axiosResponse.data.data.data.results`.
function extractResults(axiosResponse: any): any[] {
  return axiosResponse.data?.data?.data?.results ?? [];
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

  enforceSecurityFilters(payload, auth.tenantId, requestedProjectId);

  try {
    const response = await axios.post(signoz.endpoint, payload, {
      headers: signoz.headers,
      timeout: 30000,
    });
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
    const step1 = await axios.post(signoz.endpoint, paginationPayload, {
      headers: signoz.headers,
      timeout: 30000,
    });

    const step1Results = extractResults(step1);
    const pageResult = step1Results.find((r: any) => r?.queryName === 'pageConversations');

    const columns: Array<{ name: string; columnType: string }> = pageResult?.columns ?? [];
    const rows: any[][] = pageResult?.data ?? [];
    const convIdColIdx = columns.findIndex((col) => col.name === SPAN_KEYS.CONVERSATION_ID);
    const tsColIdx = columns.findIndex((col) => col.columnType === 'aggregation');

    const conversationIds: string[] =
      convIdColIdx >= 0 ? rows.map((row) => row[convIdColIdx]).filter(Boolean) : [];

    if (conversationIds.length === 0) {
      return c.json({ paginationResponse: step1.data, detailResponse: null });
    }

    // Narrow step 2's time range using the max(timestamp) values from step 1
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
    enforceSecurityFilters(detailPayloadTemplate, auth.tenantId, requestedProjectId);
    const step2 = await axios.post(signoz.endpoint, detailPayloadTemplate, {
      headers: signoz.headers,
      timeout: 30000,
    });

    return c.json({ paginationResponse: step1.data, detailResponse: step2.data });
  } catch (error) {
    const { body, status } = handleSignozError(error, 'query-batch');
    return c.json(body, status);
  }
});

app.get('/health', async (c) => {
  const signoz = getSignozConfig();
  if (!signoz) {
    logger.warn({}, 'SigNoz credentials not set');
    return c.json({
      status: 'not_configured',
      configured: false,
      error: 'SIGNOZ_URL or SIGNOZ_API_KEY not set',
    });
  }

  try {
    await axios.post(
      signoz.endpoint,
      {
        start: Date.now() - 300000,
        end: Date.now(),
        requestType: 'scalar',
        compositeQuery: { queries: [] },
      },
      { headers: signoz.headers, timeout: 5000, validateStatus: (s) => s === 200 || s === 400 }
    );
    return c.json({ status: 'ok', configured: true });
  } catch (error) {
    let errorMessage = 'Failed to connect to SigNoz';
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND')
        errorMessage = 'Check SIGNOZ_URL';
      else if (error.response?.status === 401 || error.response?.status === 403)
        errorMessage = 'Invalid SIGNOZ_API_KEY';
      else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED')
        errorMessage = 'SigNoz connection timed out';
    }
    logger.error(
      { error: error instanceof Error ? error.message : error },
      'SigNoz connection test failed'
    );
    return c.json({ status: 'connection_failed', configured: false, error: errorMessage });
  }
});

export default app;
