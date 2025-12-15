import {
  type BaseExecutionContext,
  validateAndGetApiKey,
  validateTargetAgent,
  verifyServiceToken,
  verifyTempToken,
} from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import dbClient from '../data/db/dbClient';
import { env } from '../env';
import { getLogger } from '../logger';
import { createBaseExecutionContext } from '../types/execution-context';

const logger = getLogger('env-key-auth');


 // ============================================================================
 // Supported auth strategies
 // ============================================================================
 // 1. JWT temp token: generated with user session cookies
 // 2. Bypass secret: override used for development purposes
 // 3. Database API key: validated against database, created in the dashboard
 // 4. Team agent token: used for intra-tenant team-agent delegation
 // ============================================================================

/**
 * Common request data extracted once at the start of auth
 */
interface RequestData {
  authHeader?: string;
  apiKey?: string;
  tenantId?: string;
  projectId?: string;
  agentId?: string;
  subAgentId?: string;
  ref?: string;
  baseUrl: string;
}

/**
 * Partial context data returned by auth strategies
 * These fields will be merged with RequestData to create the final context
 */
type AuthResult = Pick<
  BaseExecutionContext,
  'apiKey' | 'tenantId' | 'projectId' | 'agentId' | 'apiKeyId' | 'metadata'
>;

/**
 * Extract common request data from the Hono context
 */
function extractRequestData(c: { req: any }): RequestData {
  const authHeader = c.req.header('Authorization');
  const tenantId = c.req.header('x-inkeep-tenant-id');
  const projectId = c.req.header('x-inkeep-project-id');
  const agentId = c.req.header('x-inkeep-agent-id');
  const subAgentId = c.req.header('x-inkeep-sub-agent-id');
  const proto = c.req.header('x-forwarded-proto')?.split(',')[0].trim();
  const fwdHost = c.req.header('x-forwarded-host')?.split(',')[0].trim();
  const host = fwdHost ?? c.req.header('host');
  const reqUrl = new URL(c.req.url);
  const ref = c.req.query('ref');

  const baseUrl =
    proto && host
      ? `${proto}://${host}`
      : host
        ? `${reqUrl.protocol}//${host}`
        : `${reqUrl.origin}`;

  return {
    authHeader,
    apiKey: authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined,
    tenantId,
    projectId,
    agentId,
    subAgentId,
    ref,
    baseUrl,
  };
}

/**
 * Build the final execution context from auth result and request data
 */
function buildExecutionContext(authResult: AuthResult, reqData: RequestData): BaseExecutionContext {
  return createBaseExecutionContext({
    apiKey: authResult.apiKey,
    tenantId: authResult.tenantId,
    projectId: authResult.projectId,
    agentId: authResult.agentId,
    apiKeyId: authResult.apiKeyId,
    baseUrl: reqData.baseUrl,
    subAgentId: reqData.subAgentId,
    ref: reqData.ref,
    metadata: authResult.metadata,
  });
}

// ============================================================================
// Auth Strategies
// ============================================================================

/**
 * Attempts to authenticate using a JWT temporary token
 */
async function tryTempJwtAuth(apiKey: string): Promise<AuthResult | null> {
  if (!apiKey.startsWith('eyJ') || !env.INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY) {
    return null;
  }

  try {
    const publicKeyPem = Buffer.from(env.INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY, 'base64').toString(
      'utf-8'
    );
    const payload = await verifyTempToken(publicKeyPem, apiKey);

    logger.info({}, 'JWT temp token authenticated successfully');

    return {
      apiKey,
      tenantId: payload.tenantId,
      projectId: payload.projectId,
      agentId: payload.agentId,
      apiKeyId: 'temp-jwt',
      metadata: { initiatedBy: payload.initiatedBy },
    };
  } catch (error) {
    logger.debug({ error }, 'JWT verification failed');
    return null;
  }
}

/**
 * Authenticate using a regular API key
 */
async function tryApiKeyAuth(apiKey: string): Promise<AuthResult | null> {
  try {
    const apiKeyRecord = await validateAndGetApiKey(apiKey, dbClient);

    if (!apiKeyRecord) {
      return null;
    }

    logger.debug(
      {
        tenantId: apiKeyRecord.tenantId,
        projectId: apiKeyRecord.projectId,
        agentId: apiKeyRecord.agentId,
      },
      'API key authenticated successfully'
    );

    return {
      apiKey,
      tenantId: apiKeyRecord.tenantId,
      projectId: apiKeyRecord.projectId,
      agentId: apiKeyRecord.agentId,
      apiKeyId: apiKeyRecord.id,
    };
  } catch {
    return null;
  }
}

/**
 * Authenticate using a team agent JWT token (for intra-tenant delegation)
 */
async function tryTeamAgentAuth(
  token: string,
  expectedSubAgentId?: string
): Promise<AuthResult | null> {
  const result = await verifyServiceToken(token);

  if (!result.valid || !result.payload) {
    logger.warn({ error: result.error }, 'Invalid team agent JWT token');
    return null;
  }

  const payload = result.payload;

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

  return {
    apiKey: 'team-agent-jwt',
    tenantId: payload.tenantId,
    projectId: payload.projectId,
    agentId: payload.aud,
    apiKeyId: 'team-agent-token',
    metadata: {
      teamDelegation: true,
      originAgentId: payload.sub,
    },
  };
}

/**
 * Authenticate using bypass secret (production mode bypass)
 */
function tryBypassAuth(apiKey: string, reqData: RequestData): AuthResult | null {
  if (!env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET) {
    return null;
  }

  if (apiKey !== env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET) {
    return null;
  }

  if (!reqData.tenantId || !reqData.projectId || !reqData.agentId) {
    throw new HTTPException(401, {
      message: 'Missing or invalid tenant, project, or agent ID',
    });
  }

  logger.info({}, 'Bypass secret authenticated successfully');

  return {
    apiKey,
    tenantId: reqData.tenantId,
    projectId: reqData.projectId,
    agentId: reqData.agentId,
    apiKeyId: 'bypass',
  };
}

/**
 * Create default development context
 */
function createDevContext(reqData: RequestData): AuthResult {
  return {
    apiKey: 'development',
    tenantId: reqData.tenantId || 'test-tenant',
    projectId: reqData.projectId || 'test-project',
    agentId: reqData.agentId || 'test-agent',
    apiKeyId: 'test-key',
  };
}

// ============================================================================
// Main Middleware
// ============================================================================

/**
 * Try all auth strategies in order, returning the first successful result
 */
async function authenticateRequest(reqData: RequestData): Promise<AuthResult | null> {
  const { apiKey, subAgentId } = reqData;

  if (!apiKey) {
    return null;
  }

  // 1. Try JWT temp token
  const jwtResult = await tryTempJwtAuth(apiKey);
  if (jwtResult) return jwtResult;

  // 2. Try bypass secret
  const bypassResult = tryBypassAuth(apiKey, reqData);
  if (bypassResult) return bypassResult;

  // 3. Try regular API key
  const apiKeyResult = await tryApiKeyAuth(apiKey);
  if (apiKeyResult) return apiKeyResult;

  // 4. Try team agent token
  const teamResult = await tryTeamAgentAuth(apiKey, subAgentId);
  if (teamResult) return teamResult;

  return null;
}

export const apiKeyAuth = () =>
  createMiddleware<{
    Variables: {
      executionContext: BaseExecutionContext;
    };
  }>(async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      await next();
      return;
    }

    const reqData = extractRequestData(c);
    const isDev = process.env.ENVIRONMENT === 'development' || process.env.ENVIRONMENT === 'test';

    // Development/test environment handling
    if (isDev) {
      logger.info({}, 'development environment');

      const authResult = await authenticateRequest(reqData);

      if (authResult) {
        c.set('executionContext', buildExecutionContext(authResult, reqData));
      } else {
        logger.info(
          {},
          reqData.apiKey
            ? 'Development/test environment - fallback to default context due to invalid API key'
            : 'Development/test environment - no API key provided, using default context'
        );
        c.set('executionContext', buildExecutionContext(createDevContext(reqData), reqData));
      }

      await next();
      return;
    }

    // Production environment - require valid auth
    if (!reqData.authHeader || !reqData.authHeader.startsWith('Bearer ')) {
      throw new HTTPException(401, {
        message: 'Missing or invalid authorization header. Expected: Bearer <api_key>',
      });
    }

    if (!reqData.apiKey || reqData.apiKey.length < 16) {
      throw new HTTPException(401, {
        message: 'Invalid API key format',
      });
    }

    const authResult = await authenticateRequest(reqData);

    if (!authResult) {
      logger.error({}, 'API key authentication error - no valid auth method found');
      throw new HTTPException(401, {
        message: 'Invalid Token',
      });
    }

    logger.debug(
      {
        tenantId: authResult.tenantId,
        projectId: authResult.projectId,
        agentId: authResult.agentId,
        subAgentId: reqData.subAgentId,
      },
      'API key authenticated successfully'
    );

    c.set('executionContext', buildExecutionContext(authResult, reqData));
    await next();
  });

