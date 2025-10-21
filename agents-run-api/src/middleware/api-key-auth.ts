import { type ExecutionContext, getAgentById, validateAndGetApiKey } from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import dbClient from '../data/db/dbClient';
import { env } from '../env';
import { getLogger } from '../logger';
import { createExecutionContext } from '../types/execution-context';

const logger = getLogger('env-key-auth');

export const apiKeyAuth = () =>
  createMiddleware<{
    Variables: {
      executionContext: ExecutionContext;
    };
  }>(async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      await next();
      return;
    }

    const authHeader = c.req.header('Authorization');
    const tenantId = c.req.header('x-inkeep-tenant-id');
    const projectId = c.req.header('x-inkeep-project-id');
    const agentId = c.req.header('x-inkeep-agent-id');
    const subAgentId = c.req.header('x-inkeep-sub-agent-id');
    const proto = c.req.header('x-forwarded-proto')?.split(',')[0].trim();
    const fwdHost = c.req.header('x-forwarded-host')?.split(',')[0].trim();
    const host = fwdHost ?? c.req.header('host');
    const reqUrl = new URL(c.req.url);

    const baseUrl =
      proto && host
        ? `${proto}://${host}`
        : host
          ? `${reqUrl.protocol}//${host}`
          : `${reqUrl.origin}`;

    if (process.env.ENVIRONMENT === 'development' || process.env.ENVIRONMENT === 'test') {
      let executionContext: ExecutionContext;

      if (authHeader?.startsWith('Bearer ')) {
        try {
          executionContext = await extractContextFromApiKey(authHeader.substring(7), baseUrl);
          if (subAgentId) {
            executionContext.subAgentId = subAgentId;
          }
          logger.info({}, 'Development/test environment - API key authenticated successfully');
        } catch {
          executionContext = createExecutionContext({
            apiKey: 'development',
            tenantId: tenantId || 'test-tenant',
            projectId: projectId || 'test-project',
            agentId: agentId || 'test-agent',
            apiKeyId: 'test-key',
            baseUrl: baseUrl,
            subAgentId: subAgentId,
          });
          logger.info(
            {},
            'Development/test environment - fallback to default context due to invalid API key'
          );
        }
      } else {
        executionContext = createExecutionContext({
          apiKey: 'development',
          tenantId: tenantId || 'test-tenant',
          projectId: projectId || 'test-project',
          agentId: agentId || 'test-agent',
          apiKeyId: 'test-key',
          baseUrl: baseUrl,
          subAgentId: subAgentId,
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

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HTTPException(401, {
        message: 'Missing or invalid authorization header. Expected: Bearer <api_key>',
      });
    }

    const apiKey = authHeader.substring(7);

    if (env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET) {
      if (apiKey === env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET) {
        if (!tenantId || !projectId || !agentId) {
          throw new HTTPException(401, {
            message: 'Missing or invalid tenant, project, or agent ID',
          });
        }

        const executionContext = createExecutionContext({
          apiKey: apiKey,
          tenantId: tenantId,
          projectId: projectId,
          agentId: agentId,
          apiKeyId: 'bypass',
          baseUrl: baseUrl,
          subAgentId: subAgentId,
        });

        c.set('executionContext', executionContext);

        logger.info({}, 'Bypass secret authenticated successfully');

        await next();
        return;
      } else if (apiKey) {
        const executionContext = await extractContextFromApiKey(apiKey, baseUrl);
        if (subAgentId) {
          executionContext.subAgentId = subAgentId;
        }

        c.set('executionContext', executionContext);

        logger.info({}, 'API key authenticated successfully');

        await next();
        return;
      } else {
        throw new HTTPException(401, {
          message: 'Invalid Token',
        });
      }
    }

    if (!apiKey || apiKey.length < 16) {
      throw new HTTPException(401, {
        message: 'Invalid API key format',
      });
    }

    try {
      const executionContext = await extractContextFromApiKey(apiKey, baseUrl);
      if (subAgentId) {
        executionContext.subAgentId = subAgentId;
      }

      c.set('executionContext', executionContext);

      logger.debug(
        {
          tenantId: executionContext.tenantId,
          projectId: executionContext.projectId,
          agentId: executionContext.agentId,
          subAgentId: executionContext.subAgentId,
        },
        'API key authenticated successfully'
      );

      await next();
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      logger.error({ error }, 'API key authentication error');
      throw new HTTPException(500, {
        message: 'Authentication failed',
      });
    }
  });

export const extractContextFromApiKey = async (apiKey: string, baseUrl?: string) => {
  const apiKeyRecord = await validateAndGetApiKey(apiKey, dbClient);

  if (!apiKeyRecord) {
    throw new HTTPException(401, {
      message: 'Invalid or expired API key',
    });
  }

  const agent = await getAgentById(dbClient)({
    scopes: {
      tenantId: apiKeyRecord.tenantId,
      projectId: apiKeyRecord.projectId,
      agentId: apiKeyRecord.agentId,
    },
  });

  if (!agent) {
    throw new HTTPException(401, {
      message: 'Invalid or expired API key',
    });
  }

  logger.info({ agent }, 'agent');
  logger.info({ defaultSubAgentId: agent.defaultSubAgentId }, 'agent.defaultSubAgentId');
  return createExecutionContext({
    apiKey: apiKey,
    tenantId: apiKeyRecord.tenantId,
    projectId: apiKeyRecord.projectId,
    agentId: apiKeyRecord.agentId,
    apiKeyId: apiKeyRecord.id,
    baseUrl: baseUrl,
    subAgentId: agent.defaultSubAgentId || undefined,
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

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      await next();
      return;
    }

    return apiKeyAuth()(c as any, next);
  });
