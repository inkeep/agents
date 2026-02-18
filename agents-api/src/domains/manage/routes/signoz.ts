import { canViewProject, createApiError, type OrgRole } from '@inkeep/agents-core';
import axios from 'axios';
import { Hono } from 'hono';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import type { ManageAppVariables } from '../../../types/app';
import { enforceSecurityFilters } from '../../../utils/signozHelpers';

const logger = getLogger('signoz-proxy');

const app = new Hono<{ Variables: ManageAppVariables }>();

// POST /query - Proxy SigNoz queries with authorization
app.post('/query', async (c) => {
  let payload = await c.req.json();
  const requestedProjectId = payload.projectId;
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

  logger.debug(
    { tenantId, projectId: requestedProjectId, hasProjectId: !!requestedProjectId },
    'Processing SigNoz query request'
  );

  // If projectId is provided, validate user has permission to view the project
  if (requestedProjectId) {
    // System users and API key users bypass project access checks
    // They have full access within their authorized scope (enforced by tenant-access middleware)
    const bypassCheck = userId === 'system' || userId?.startsWith('apikey:');

    if (!bypassCheck) {
      const hasAccess = await canViewProject({
        userId,
        tenantId,
        projectId: requestedProjectId,
        orgRole: tenantRole,
      });

      if (!hasAccess) {
        logger.warn(
          { tenantId, projectId: requestedProjectId, userId },
          'Project not found or access denied'
        );
        return c.json(
          {
            error: 'Forbidden',
            message: 'You do not have access to this project',
          },
          403
        );
      }
    }
  }

  // Always enforce server-side tenant filter, and project filter if provided
  payload = enforceSecurityFilters(payload, tenantId, requestedProjectId);
  logger.debug({ tenantId, projectId: requestedProjectId }, 'Security filters enforced');

  const signozUrl = env.SIGNOZ_URL || env.PUBLIC_SIGNOZ_URL;
  const signozApiKey = env.SIGNOZ_API_KEY;

  if (!signozUrl || !signozApiKey) {
    logger.error({}, 'SigNoz not configured');
    return c.json(
      {
        error: 'Service Unavailable',
        message: 'SigNoz is not configured',
      },
      500
    );
  }

  try {
    const signozEndpoint = `${signozUrl}/api/v4/query_range`;
    logger.debug({ endpoint: signozEndpoint }, 'Proxying to SigNoz');

    const response = await axios.post(signozEndpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        'SIGNOZ-API-KEY': signozApiKey,
      },
      timeout: 30000,
    });

    logger.debug({ status: response.status }, 'SigNoz query successful');

    return c.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        logger.error({ error: error.message }, 'SigNoz service unavailable');
        return c.json(
          {
            error: 'Service Unavailable',
            message: 'SigNoz service is unavailable',
          },
          503
        );
      }
      if (error.response?.status === 401 || error.response?.status === 403) {
        logger.error({ status: error.response.status }, 'SigNoz authentication failed');
        return c.json(
          {
            error: 'Internal Server Error',
            message: 'SigNoz authentication failed',
          },
          500
        );
      }
      if (error.response?.status === 400) {
        logger.warn({ status: error.response.status }, 'Invalid SigNoz query');
        return c.json(
          {
            error: 'Bad Request',
            message: 'Invalid query parameters',
          },
          400
        );
      }
    }

    logger.error({ error }, 'SigNoz query failed');
    return c.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to query SigNoz',
      },
      500
    );
  }
});

// POST /query-batch - Execute two dependent SigNoz queries in one round-trip to improve performance
// Step 1 (paginationPayload) Step 2 (detailPayloadTemplate) Both responses are returned.
app.post('/query-batch', async (c) => {
  const t0 = Date.now();
  const body = await c.req.json();
  const { paginationPayload, detailPayloadTemplate } = body;

  if (!paginationPayload || !detailPayloadTemplate) {
    return c.json(
      { error: 'Bad Request', message: 'paginationPayload and detailPayloadTemplate are required' },
      400
    );
  }

  const paginationQueryNames = Object.keys(
    paginationPayload?.compositeQuery?.builderQueries ?? {}
  ).join(', ');
  const detailQueryNames = Object.keys(
    detailPayloadTemplate?.compositeQuery?.builderQueries ?? {}
  ).join(', ');

  const requestedProjectId = paginationPayload.projectId;
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const tenantRole = c.get('tenantRole') as OrgRole;

  logger.info(
    { tenantId, projectId: requestedProjectId, paginationQueryNames, detailQueryNames },
    '[traces-perf] /query-batch START'
  );

  if (!userId || !tenantId) {
    throw createApiError({
      code: 'unauthorized',
      message: 'User or organization context not found',
      instance: c.req.path,
    });
  }

  if (requestedProjectId) {
    const bypassCheck = userId === 'system' || userId?.startsWith('apikey:');
    if (!bypassCheck) {
      const tAuth = Date.now();
      const hasAccess = await canViewProject({
        userId,
        tenantId,
        projectId: requestedProjectId,
        orgRole: tenantRole,
      });
      logger.info({ authMs: Date.now() - tAuth }, '[traces-perf] /query-batch canViewProject');
      if (!hasAccess) {
        logger.warn(
          { tenantId, projectId: requestedProjectId, userId },
          'Project not found or access denied'
        );
        return c.json(
          { error: 'Forbidden', message: 'You do not have access to this project' },
          403
        );
      }
    }
  }

  const signozUrl = env.SIGNOZ_URL || env.PUBLIC_SIGNOZ_URL;
  const signozApiKey = env.SIGNOZ_API_KEY;

  if (!signozUrl || !signozApiKey) {
    logger.error({}, 'SigNoz not configured');
    return c.json({ error: 'Service Unavailable', message: 'SigNoz is not configured' }, 500);
  }

  const signozEndpoint = `${signozUrl}/api/v4/query_range`;
  const signozHeaders = {
    'Content-Type': 'application/json',
    'SIGNOZ-API-KEY': signozApiKey,
  };

  try {
    // Step 1: Execute pagination query
    const securedPagination = enforceSecurityFilters(
      paginationPayload,
      tenantId,
      requestedProjectId
    );
    const tStep1 = Date.now();
    const step1 = await axios.post(signozEndpoint, securedPagination, {
      headers: signozHeaders,
      timeout: 30000,
    });
    const step1Ms = Date.now() - tStep1;
    logger.info(
      { step1Ms, paginationQueryNames },
      '[traces-perf] /query-batch step1 (pagination) complete'
    );

    // Extract conversation IDs from the pageConversations result
    const pageResult = step1.data?.data?.result?.find(
      (r: any) => r?.queryName === 'pageConversations'
    );
    const conversationIds: string[] = (pageResult?.series ?? [])
      .map((s: any) => s.labels?.['conversation.id'])
      .filter(Boolean);

    if (conversationIds.length === 0) {
      logger.info(
        { step1Ms, totalMs: Date.now() - t0 },
        '[traces-perf] /query-batch END (no conversations)'
      );
      return c.json({ paginationResponse: step1.data, detailResponse: null });
    }

    // Step 2: Inject conversation IDs into the detail template and execute
    const detailWithIds = injectConversationIdFilter(detailPayloadTemplate, conversationIds);
    const securedDetail = enforceSecurityFilters(detailWithIds, tenantId, requestedProjectId);
    const tStep2 = Date.now();
    const step2 = await axios.post(signozEndpoint, securedDetail, {
      headers: signozHeaders,
      timeout: 30000,
    });
    const step2Ms = Date.now() - tStep2;
    logger.info(
      { step2Ms, detailQueryNames, conversationCount: conversationIds.length },
      '[traces-perf] /query-batch step2 (detail) complete'
    );

    logger.info(
      { step1Ms, step2Ms, totalMs: Date.now() - t0, conversationCount: conversationIds.length },
      '[traces-perf] /query-batch END'
    );

    return c.json({ paginationResponse: step1.data, detailResponse: step2.data });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        logger.error({ error: error.message }, 'SigNoz service unavailable');
        return c.json(
          { error: 'Service Unavailable', message: 'SigNoz service is unavailable' },
          503
        );
      }
      if (error.response?.status === 401 || error.response?.status === 403) {
        logger.error({ status: error.response.status }, 'SigNoz authentication failed');
        return c.json(
          { error: 'Internal Server Error', message: 'SigNoz authentication failed' },
          500
        );
      }
      if (error.response?.status === 400) {
        logger.warn({ status: error.response.status }, 'Invalid SigNoz query');
        return c.json({ error: 'Bad Request', message: 'Invalid query parameters' }, 400);
      }
    }
    logger.error({ error }, 'SigNoz query-batch failed');
    return c.json({ error: 'Internal Server Error', message: 'Failed to query SigNoz' }, 500);
  }
});

/**
 * Inject a `conversation.id IN [...]` filter into every builder query
 * of a SigNoz composite query payload.
 */
function injectConversationIdFilter(payload: any, conversationIds: string[]): any {
  const modified = JSON.parse(JSON.stringify(payload));
  const builderQueries = modified.compositeQuery?.builderQueries;
  if (!builderQueries) return modified;

  const inFilter = {
    key: {
      key: 'conversation.id',
      dataType: 'string',
      type: 'tag',
      isColumn: false,
      isJSON: false,
      id: 'false',
    },
    op: 'in',
    value: conversationIds,
  };

  for (const queryKey in builderQueries) {
    const query = builderQueries[queryKey];
    if (!query.filters) {
      query.filters = { op: 'AND', items: [] };
    }
    // Remove any existing conversation.id IN filter to avoid duplication
    query.filters.items = query.filters.items.filter(
      (item: any) => !(item.key?.key === 'conversation.id' && item.op === 'in')
    );
    query.filters.items.push(inFilter);
  }

  return modified;
}

// GET /health - Check SigNoz configuration
app.get('/health', async (c) => {
  const signozUrl = env.SIGNOZ_URL || env.PUBLIC_SIGNOZ_URL;
  const signozApiKey = env.SIGNOZ_API_KEY;

  logger.debug(
    {
      hasUrl: !!signozUrl,
      hasApiKey: !!signozApiKey,
      url: signozUrl,
    },
    'Checking SigNoz configuration'
  );

  // Check if credentials are set
  if (!signozUrl || !signozApiKey) {
    logger.warn({}, 'SigNoz credentials not set');
    return c.json({
      status: 'not_configured',
      configured: false,
      error: 'SIGNOZ_URL or SIGNOZ_API_KEY not set',
    });
  }

  // Test connection with minimal query
  try {
    const testPayload = {
      start: Date.now() - 300000, // 5 minutes ago
      end: Date.now(),
      step: 60,
      compositeQuery: {
        queryType: 'builder',
        panelType: 'table',
        builderQueries: {},
      },
    };

    const signozEndpoint = `${signozUrl}/api/v4/query_range`;
    logger.debug({ endpoint: signozEndpoint }, 'Testing SigNoz connection');

    await axios.post(signozEndpoint, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'SIGNOZ-API-KEY': signozApiKey,
      },
      timeout: 5000,
      validateStatus: (status) => status === 200 || status === 400, // Both OK (valid API key)
    });

    logger.debug({}, 'SigNoz health check successful');

    return c.json({
      status: 'ok',
      configured: true,
    });
  } catch (error) {
    logger.error(
      {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        code: axios.isAxiosError(error) ? error.code : undefined,
        status: axios.isAxiosError(error) ? error.response?.status : undefined,
      },
      'SigNoz connection test failed'
    );

    let errorMessage = 'Failed to connect to SigNoz';
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = 'Check SIGNOZ_URL';
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        errorMessage = 'Invalid SIGNOZ_API_KEY';
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        errorMessage = 'SigNoz connection timed out';
      }
    }

    return c.json({
      status: 'connection_failed',
      configured: false,
      error: errorMessage,
    });
  }
});

export default app;
