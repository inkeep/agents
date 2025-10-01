import { type ExecutionContext, validateAndGetApiKey } from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import dbClient from '../data/db/dbClient';
import { env } from '../env';
import { getLogger } from '../logger';
import { createExecutionContext } from '../types/execution-context';

const logger = getLogger('env-key-auth');
/**
 * Middleware to authenticate API requests using Bearer token authentication
 * First checks if token matches INKEEP_AGENTS_RUN_API_BYPASS_SECRET, then falls back to API key validation
 * Extracts and validates API keys, then adds execution context to the request
 */
export const apiKeyAuth = () =>
  createMiddleware<{
    Variables: {
      executionContext: ExecutionContext;
    };
  }>(async (c, next) => {
    // Skip authentication for OPTIONS requests (CORS preflight)
    if (c.req.method === 'OPTIONS') {
      await next();
      return;
    }

    const authHeader = c.req.header('Authorization');
    const tenantId = c.req.header('x-inkeep-tenant-id');
    const projectId = c.req.header('x-inkeep-project-id');
    const graphId = c.req.header('x-inkeep-graph-id');
    const agentId = c.req.header('x-inkeep-agent-id');
    const baseUrl = new URL(c.req.url).origin;

    // Bypass authentication only for integration tests with specific header
    if (process.env.ENVIRONMENT === 'development' || process.env.ENVIRONMENT === 'test') {
      let executionContext: ExecutionContext;

      if (authHeader?.startsWith('Bearer ')) {
        try {
          executionContext = await extractContextFromApiKey(authHeader.substring(7));
          executionContext.agentId = agentId;
          logger.info({}, 'Development/test environment - API key authenticated successfully');
        } catch {
          // If API key extraction fails, fallback to default context
          executionContext = createExecutionContext({
            apiKey: 'development',
            tenantId: tenantId || 'test-tenant',
            projectId: projectId || 'test-project',
            graphId: graphId || 'test-graph',
            apiKeyId: 'test-key',
            baseUrl: baseUrl,
            agentId: agentId,
          });
          logger.info(
            {},
            'Development/test environment - fallback to default context due to invalid API key'
          );
        }
      } else {
        // No API key provided, use default context
        executionContext = createExecutionContext({
          apiKey: 'development',
          tenantId: tenantId || 'test-tenant',
          projectId: projectId || 'test-project',
          graphId: graphId || 'test-graph',
          apiKeyId: 'test-key',
          baseUrl: baseUrl,
          agentId: agentId,
        });
        logger.info(
          {},
          'Development/test environment - no API key provided, using default context'
        );
      }

      c.set('executionContext', executionContext);
      await next();
      return;
    }
    // Check for Bearer token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HTTPException(401, {
        message: 'Missing or invalid authorization header. Expected: Bearer <api_key>',
      });
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

    // If bypass secret is configured, allow bypass authentication or api key validation
    if (env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET) {
      if (apiKey === env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET) {
        // Extract base URL from request

        if (!tenantId || !projectId || !graphId) {
          throw new HTTPException(401, {
            message: 'Missing or invalid tenant, project, or graph ID',
          });
        }

        // Create bypass execution context with default values
        const executionContext = createExecutionContext({
          apiKey: apiKey,
          tenantId: tenantId,
          projectId: projectId,
          graphId: graphId,
          apiKeyId: 'bypass',
          baseUrl: baseUrl,
          agentId: agentId,
        });

        c.set('executionContext', executionContext);

        logger.info({}, 'Bypass secret authenticated successfully');

        await next();
        return;
      } else if (apiKey) {
        const executionContext = await extractContextFromApiKey(apiKey);
        executionContext.agentId = agentId;

        c.set('executionContext', executionContext);

        logger.info({}, 'API key authenticated successfully');

        await next();
        return;
      } else {
        // Bypass secret is set but token doesn't match - reject
        throw new HTTPException(401, {
          message: 'Invalid Token',
        });
      }
    }

    // No bypass secret configured - continue with normal API key validation
    // Validate API key format (basic validation)
    if (!apiKey || apiKey.length < 16) {
      throw new HTTPException(401, {
        message: 'Invalid API key format',
      });
    }

    try {
      const executionContext = await extractContextFromApiKey(apiKey);
      executionContext.agentId = agentId;

      c.set('executionContext', executionContext);

      // Log successful authentication (without sensitive data)
      logger.debug(
        {
          tenantId: executionContext.tenantId,
          projectId: executionContext.projectId,
          graphId: executionContext.graphId,
          agentId: executionContext.agentId,
        },
        'API key authenticated successfully'
      );

      await next();
    } catch (error) {
      // Re-throw HTTPException
      if (error instanceof HTTPException) {
        throw error;
      }

      // Log unexpected errors and return generic message
      logger.error({ error }, 'API key authentication error');
      throw new HTTPException(500, {
        message: 'Authentication failed',
      });
    }
  });

export const extractContextFromApiKey = async (apiKey: string) => {
  const apiKeyRecord = await validateAndGetApiKey(apiKey, dbClient);

  if (!apiKeyRecord) {
    throw new HTTPException(401, {
      message: 'Invalid or expired API key',
    });
  }

  return createExecutionContext({
    apiKey: apiKey,
    tenantId: apiKeyRecord.tenantId,
    projectId: apiKeyRecord.projectId,
    graphId: apiKeyRecord.graphId,
    apiKeyId: apiKeyRecord.id,
  });
};
/**
 * Helper middleware for endpoints that optionally support API key authentication
 * If no auth header is present, it continues without setting the executionContext
 */
export const optionalAuth = () =>
  createMiddleware<{
    Variables: {
      executionContext?: ExecutionContext;
    };
  }>(async (c, next) => {
    const authHeader = c.req.header('Authorization');

    // If no auth header, continue without authentication
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      await next();
      return;
    }

    // If auth header exists, use the regular auth middleware
    return apiKeyAuth()(c as any, next);
  });
