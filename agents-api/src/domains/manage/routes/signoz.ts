import { createApiError, projectExists } from '@inkeep/agents-core';
import axios from 'axios';
import { Hono } from 'hono';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import type { ManageAppVariables } from '../../../types/app';
import { enforceProjectFilter } from '../../../utils/signozHelpers';

const logger = getLogger('signoz-proxy');

const app = new Hono<{ Variables: ManageAppVariables }>();

// POST /query - Proxy SigNoz queries with authorization
app.post('/query', async (c) => {
  let payload = await c.req.json();
  const requestedProjectId = payload.projectId;
  const tenantId = c.get('tenantId');
  const db = c.get('db');

  if (!tenantId) {
    throw createApiError({
      code: 'unauthorized',
      message: 'Tenant ID not found',
    });
  }

  logger.info(
    { tenantId, projectId: requestedProjectId, hasProjectId: !!requestedProjectId },
    'Processing SigNoz query request'
  );

  // If projectId is provided, validate access and enforce filter
  if (requestedProjectId) {
    const projectExistsCheck = await projectExists(db)({
      tenantId,
      projectId: requestedProjectId,
    });

    if (!projectExistsCheck) {
      logger.warn(
        { tenantId, projectId: requestedProjectId },
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

    // Enforce server-side project filter
    payload = enforceProjectFilter(payload, requestedProjectId);
    logger.debug({ projectId: requestedProjectId }, 'Project filter enforced');
  }

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

    logger.info({ status: response.status }, 'SigNoz query successful');

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

// GET /health - Check SigNoz configuration
app.get('/health', async (c) => {
  const signozUrl = env.SIGNOZ_URL || env.PUBLIC_SIGNOZ_URL;
  const signozApiKey = env.SIGNOZ_API_KEY;

  logger.info(
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
    logger.info({ endpoint: signozEndpoint }, 'Testing SigNoz connection');

    await axios.post(signozEndpoint, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'SIGNOZ-API-KEY': signozApiKey,
      },
      timeout: 5000,
      validateStatus: (status) => status === 200 || status === 400, // Both OK (valid API key)
    });

    logger.info({}, 'SigNoz health check successful');

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
