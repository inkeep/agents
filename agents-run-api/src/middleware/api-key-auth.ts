import {
  type DatabaseClient,
  type ExecutionContext,
  executeInBranch,
  getAgentById,
  type ResolvedRef,
  validateAndGetApiKey,
  validateTargetAgent,
  verifyServiceToken,
} from '@inkeep/agents-core';
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
      resolvedRef: ResolvedRef;
      db: DatabaseClient;
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

    const resolvedRef = c.get('resolvedRef');
    const baseUrl =
      proto && host
        ? `${proto}://${host}`
        : host
          ? `${reqUrl.protocol}//${host}`
          : `${reqUrl.origin}`;

    if (process.env.ENVIRONMENT === 'development' || process.env.ENVIRONMENT === 'test') {
      logger.info({}, 'development environment');
      let executionContext: ExecutionContext;

      if (authHeader?.startsWith('Bearer ')) {
        // Try to authenticate as a API key
        const apiKey = authHeader.substring(7);
        try {
          executionContext = await extractContextFromApiKey(apiKey, dbClient, resolvedRef, baseUrl);
          if (subAgentId) {
            executionContext.subAgentId = subAgentId;
          }
          executionContext.ref = c.get('resolvedRef');
          c.set('executionContext', executionContext);
        } catch {
          // If the API key is invalid, try jwt
          try {
            executionContext = await extractContextFromTeamAgentToken(
              apiKey,
              resolvedRef,
              baseUrl,
              subAgentId
            );
            executionContext.ref = c.get('resolvedRef');
            c.set('executionContext', executionContext);
          } catch {
            // If JWT verification fails, fall through to default context

            executionContext = createExecutionContext({
              apiKey: 'development',
              tenantId: tenantId || 'test-tenant',
              projectId: projectId || 'test-project',
              agentId: agentId || 'test-agent',
              apiKeyId: 'test-key',
              baseUrl: baseUrl,
              subAgentId: subAgentId,
              ref: resolvedRef,
            });
            c.set('executionContext', executionContext);
            logger.info(
              {},
              'Development/test environment - fallback to default context due to invalid API key'
            );
          }
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
          ref: resolvedRef,
        });
        c.set('executionContext', executionContext);
        logger.info(
          {},
          'Development/test environment - no API key provided, using default context'
        );
      }

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
          ref: c.get('resolvedRef'),
        });

        c.set('executionContext', executionContext);

        logger.info({}, 'Bypass secret authenticated successfully');

        await next();
        return;
      }
      if (apiKey) {
        try {
          const executionContext = await extractContextFromApiKey(
            apiKey,
            dbClient,
            resolvedRef,
            baseUrl
          );
          if (subAgentId) {
            executionContext.subAgentId = subAgentId;
          }
          c.set('executionContext', executionContext);

          logger.info({}, 'API key authenticated successfully');
        } catch {
          const executionContext = await extractContextFromTeamAgentToken(
            apiKey,
            resolvedRef,
            baseUrl,
            subAgentId
          );
          c.set('executionContext', executionContext);
        }

        await next();
        return;
      }
      throw new HTTPException(401, {
        message: 'Invalid Token',
      });
    }

    if (!apiKey || apiKey.length < 16) {
      throw new HTTPException(401, {
        message: 'Invalid API key format',
      });
    }

    try {
      const executionContext = await extractContextFromApiKey(
        apiKey,
        dbClient,
        resolvedRef,
        baseUrl
      );
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
    } catch {
      try {
        const executionContext = await extractContextFromTeamAgentToken(
          apiKey,
          resolvedRef,
          baseUrl,
          subAgentId
        );

        c.set('executionContext', executionContext);
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
    }
  });

export const extractContextFromApiKey = async (
  apiKey: string,
  dbClient: DatabaseClient,
  ref: ResolvedRef,
  baseUrl?: string
) => {
  const apiKeyRecord = await executeInBranch({ dbClient, ref }, async (db) => {
    return await validateAndGetApiKey(apiKey, db);
  });

  if (!apiKeyRecord) {
    throw new HTTPException(401, {
      message: 'Invalid or expired API key',
    });
  }

  const agent = await executeInBranch({ dbClient, ref }, async (db) => {
    return await getAgentById(db)({
      scopes: {
        tenantId: apiKeyRecord.tenantId,
        projectId: apiKeyRecord.projectId,
        agentId: apiKeyRecord.agentId,
      },
    });
  });

  if (!agent) {
    throw new HTTPException(401, {
      message: 'Invalid or expired API key',
    });
  }

  logger.debug(
    {
      tenantId: apiKeyRecord.tenantId,
      projectId: apiKeyRecord.projectId,
      agentId: apiKeyRecord.agentId,
      subAgentId: agent.defaultSubAgentId || undefined,
    },
    'API key authenticated successfully'
  );
  return createExecutionContext({
    apiKey: apiKey,
    tenantId: apiKeyRecord.tenantId,
    projectId: apiKeyRecord.projectId,
    agentId: apiKeyRecord.agentId,
    apiKeyId: apiKeyRecord.id,
    baseUrl: baseUrl,
    subAgentId: agent.defaultSubAgentId || undefined,
    ref: ref,
  });
};

/**
 * Extract execution context from a team agent JWT token
 * Team agent tokens are used for intra-tenant agent delegation
 */
export const extractContextFromTeamAgentToken = async (
  token: string,
  ref: ResolvedRef,
  baseUrl?: string,
  expectedSubAgentId?: string
) => {
  const result = await verifyServiceToken(token);

  if (!result.valid || !result.payload) {
    logger.warn({ error: result.error }, 'Invalid team agent JWT token');
    throw new HTTPException(401, {
      message: `Invalid team agent token: ${result.error || 'Unknown error'}`,
    });
  }

  const payload = result.payload;

  // Validate target agent if provided in headers
  if (expectedSubAgentId && !validateTargetAgent(payload, expectedSubAgentId)) {
    logger.error(
      {
        tokenTargetAgentId: payload.aud,
        expectedSubAgentId,
        originAgentId: payload.sub,
      },
      'Team agent token target mismatch'
    );
    throw new HTTPException(403, {
      message: 'Token not valid for the requested agent',
    });
  }

  logger.info(
    {
      originAgentId: payload.sub,
      targetAgentId: payload.aud,
      tenantId: payload.tenantId,
      projectId: payload.projectId,
    },
    'Team agent JWT token authenticated successfully'
  );

  // Create execution context from the token's target agent perspective
  return createExecutionContext({
    apiKey: 'team-agent-jwt', // Not an actual API key
    tenantId: payload.tenantId,
    projectId: payload.projectId,
    agentId: payload.aud, // Target agent ID
    apiKeyId: 'team-agent-token',
    baseUrl: baseUrl,
    subAgentId: undefined,
    metadata: {
      teamDelegation: true,
      originAgentId: payload.sub,
    },
    ref: ref,
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
