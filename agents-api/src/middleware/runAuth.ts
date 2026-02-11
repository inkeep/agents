import {
  type BaseExecutionContext,
  canUseProjectStrict,
  isAnonymousToken,
  validateAndGetApiKey,
  validateTargetAgent,
  verifyAnonymousToken,
  verifyServiceToken,
  verifyTempToken,
} from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import runDbClient from '../data/db/runDbClient';
import { env } from '../env';
import { getLogger } from '../logger';
import { createBaseExecutionContext } from '../types/runExecutionContext';

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
  isAnonymous?: boolean;
}

/**
 * Partial context data returned by auth strategies
 * These fields will be merged with RequestData to create the final context
 */
type AuthResult = Pick<
  BaseExecutionContext,
  'apiKey' | 'tenantId' | 'projectId' | 'agentId' | 'apiKeyId' | 'metadata'
>;

type AuthAttempt = {
  authResult: AuthResult | null;
  failureMessage?: string;
};

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
  const isAnonymous = c.req.header('x-inkeep-anonymous') === 'true';

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
    isAnonymous,
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
 *
 * Throws HTTPException(403) if the JWT is valid but the user lacks permission.
 * Returns null if the token is not a temp JWT (allowing fallback to other auth methods).
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

    const userId = payload.sub;
    const projectId = payload.projectId;
    const agentId = payload.agentId;

    if (!projectId || !agentId) {
      logger.warn({ userId }, 'Missing projectId or agentId in JWT');
      throw new HTTPException(400, {
        message: 'Invalid token: missing projectId or agentId',
      });
    }

    let canUse: boolean;
    try {
      canUse = await canUseProjectStrict({ userId, projectId });
    } catch (error) {
      logger.error({ error, userId, projectId }, 'SpiceDB permission check failed');
      throw new HTTPException(503, {
        message: 'Authorization service temporarily unavailable',
      });
    }

    if (!canUse) {
      logger.warn({ userId, projectId }, 'User does not have use permission on project');
      throw new HTTPException(403, {
        message: 'Access denied: insufficient permissions',
      });
    }

    logger.info({ projectId, agentId }, 'JWT temp token authenticated successfully');

    return {
      apiKey,
      tenantId: payload.tenantId,
      projectId,
      agentId,
      apiKeyId: 'temp-jwt',
      metadata: { initiatedBy: payload.initiatedBy },
    };
  } catch (error) {
    // Re-throw HTTPExceptions (like our 403 above)
    if (error instanceof HTTPException) {
      throw error;
    }
    // Other errors (JWT verification failed) - allow fallback to other auth methods
    logger.debug({ error }, 'JWT verification failed');
    return null;
  }
}

/**
 * Authenticate using a regular API key
 */
async function tryApiKeyAuth(apiKey: string): Promise<AuthResult | null> {
  const apiKeyRecord = await validateAndGetApiKey(apiKey, runDbClient);

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
}

/**
 * Authenticate using a team agent JWT token (for intra-tenant delegation)
 */
async function tryTeamAgentAuth(token: string, expectedSubAgentId?: string): Promise<AuthAttempt> {
  const result = await verifyServiceToken(token);

  if (!result.valid || !result.payload) {
    logger.warn({ error: result.error }, 'Invalid team agent JWT token');
    return {
      authResult: null,
      failureMessage: `Invalid team agent token: ${result.error || 'Invalid token'}`,
    };
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
    authResult: {
      apiKey: 'team-agent-jwt',
      tenantId: payload.tenantId,
      projectId: payload.projectId,
      agentId: payload.aud,
      apiKeyId: 'team-agent-token',
      metadata: {
        teamDelegation: true,
        originAgentId: payload.sub,
      },
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
  const result = {
    apiKey: 'development',
    tenantId: reqData.tenantId || 'test-tenant',
    projectId: reqData.projectId || 'test-project',
    agentId: reqData.agentId || 'test-agent',
    apiKeyId: 'test-key',
  };

  // Log when falling back to test values to help debug auth issues
  if (!reqData.tenantId || !reqData.projectId) {
    logger.warn(
      {
        hasTenantId: !!reqData.tenantId,
        hasProjectId: !!reqData.projectId,
        hasApiKey: !!reqData.apiKey,
        apiKeyPrefix: reqData.apiKey?.substring(0, 10),
        resultTenantId: result.tenantId,
        resultProjectId: result.projectId,
      },
      'createDevContext: Using fallback test values due to missing tenant/project in request'
    );
  }

  return result;
}

/**
 * Authenticate using an anonymous JWE token (returning anonymous user)
 */
async function tryAnonymousJweAuth(
  apiKey: string,
  reqData: RequestData
): Promise<AuthResult | null> {
  if (!isAnonymousToken(apiKey)) {
    return null;
  }

  const result = await verifyAnonymousToken(apiKey);
  if (!result.valid) {
    logger.debug({ error: result.error }, 'Anonymous JWE token verification failed');
    return null;
  }

  const { anonymousUserId, tenantId, projectId } = result.payload;
  const agentId = reqData.agentId;

  if (!agentId) {
    logger.warn({}, 'Anonymous JWE auth missing x-inkeep-agent-id header');
    throw new HTTPException(400, {
      message: 'x-inkeep-agent-id header is required for anonymous authentication',
    });
  }

  logger.info({ anonymousUserId, tenantId, projectId, agentId }, 'Anonymous JWE authenticated');

  return {
    apiKey: 'anonymous-jwe',
    tenantId,
    projectId,
    agentId,
    apiKeyId: 'anonymous',
    metadata: {
      anonymous: true,
      anonymousUserId,
    },
  };
}

/**
 * Create auth context for a new anonymous user (no token yet)
 * Requires x-inkeep-anonymous: true header plus tenant/project/agent headers
 */
function tryAnonymousNewAuth(reqData: RequestData): AuthResult | null {
  if (!reqData.isAnonymous) {
    return null;
  }

  if (!reqData.tenantId || !reqData.projectId || !reqData.agentId) {
    logger.warn(
      {
        hasTenantId: !!reqData.tenantId,
        hasProjectId: !!reqData.projectId,
        hasAgentId: !!reqData.agentId,
      },
      'Anonymous new user auth missing required headers'
    );
    throw new HTTPException(400, {
      message:
        'x-inkeep-tenant-id, x-inkeep-project-id, and x-inkeep-agent-id headers are required for anonymous access',
    });
  }

  logger.info(
    { tenantId: reqData.tenantId, projectId: reqData.projectId, agentId: reqData.agentId },
    'New anonymous user auth from headers'
  );

  return {
    apiKey: 'anonymous-new',
    tenantId: reqData.tenantId,
    projectId: reqData.projectId,
    agentId: reqData.agentId,
    apiKeyId: 'anonymous',
    metadata: {
      anonymous: true,
      isNewAnonymousUser: true,
    },
  };
}

// ============================================================================
// Main Middleware
// ============================================================================

/**
 * Try all auth strategies in order, returning the first successful result
 */
async function authenticateRequest(reqData: RequestData): Promise<AuthAttempt> {
  const { apiKey, subAgentId } = reqData;

  if (apiKey) {
    // 1. Try anonymous JWE token (fast header check)
    const anonJweResult = await tryAnonymousJweAuth(apiKey, reqData);
    if (anonJweResult) return { authResult: anonJweResult };

    // 2. Try JWT temp token
    const jwtResult = await tryTempJwtAuth(apiKey);
    if (jwtResult) return { authResult: jwtResult };

    // 3. Try bypass secret
    const bypassResult = tryBypassAuth(apiKey, reqData);
    if (bypassResult) return { authResult: bypassResult };

    // 4. Try regular API key
    const apiKeyResult = await tryApiKeyAuth(apiKey);
    if (apiKeyResult) return { authResult: apiKeyResult };

    // 5. Try team agent token
    const teamAttempt = await tryTeamAgentAuth(apiKey, subAgentId);
    if (teamAttempt.authResult) return { authResult: teamAttempt.authResult };

    return { authResult: null, failureMessage: teamAttempt.failureMessage };
  }

  // No API key — check for new anonymous user (x-inkeep-anonymous header)
  const anonNewResult = tryAnonymousNewAuth(reqData);
  if (anonNewResult) return { authResult: anonNewResult };

  return { authResult: null };
}

/**
 * Core authentication handler that can be reused across middleware
 */
async function runApiKeyAuthHandler(
  c: { req: any; set: (key: 'executionContext', value: BaseExecutionContext) => void },
  next: () => Promise<void>
): Promise<void> {
  if (c.req.method === 'OPTIONS') {
    await next();
    return;
  }

  const reqData = extractRequestData(c);
  const isDev = process.env.ENVIRONMENT === 'development' || process.env.ENVIRONMENT === 'test';

  // Development/test environment handling
  if (isDev) {
    logger.info({}, 'development environment');

    const attempt = await authenticateRequest(reqData);

    if (attempt.authResult) {
      c.set('executionContext', buildExecutionContext(attempt.authResult, reqData));
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

  // Production environment - require valid auth (or anonymous mode)
  if (!reqData.authHeader || !reqData.authHeader.startsWith('Bearer ')) {
    // Allow anonymous requests without Bearer token when x-inkeep-anonymous header is present
    if (reqData.isAnonymous) {
      const anonNewResult = tryAnonymousNewAuth(reqData);
      if (anonNewResult) {
        c.set('executionContext', buildExecutionContext(anonNewResult, reqData));
        await next();
        return;
      }
    }

    throw new HTTPException(401, {
      message: 'Missing or invalid authorization header. Expected: Bearer <api_key>',
    });
  }

  if (!reqData.apiKey || reqData.apiKey.length < 16) {
    // Anonymous JWE tokens may be shorter or longer — check before rejecting
    if (reqData.apiKey && isAnonymousToken(reqData.apiKey)) {
      // Let it through to authenticateRequest which will verify the JWE
    } else {
      throw new HTTPException(401, {
        message: 'Invalid API key format',
      });
    }
  }

  let attempt: AuthAttempt = { authResult: null };
  try {
    attempt = await authenticateRequest(reqData);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error({ error }, 'Authentication failed');
    throw new HTTPException(500, { message: 'Authentication failed' });
  }

  if (!attempt.authResult) {
    logger.error({}, 'API key authentication error - no valid auth method found');
    throw new HTTPException(401, {
      message: attempt.failureMessage || 'Invalid Token',
    });
  }

  logger.debug(
    {
      tenantId: attempt.authResult.tenantId,
      projectId: attempt.authResult.projectId,
      agentId: attempt.authResult.agentId,
      subAgentId: reqData.subAgentId,
    },
    'API key authenticated successfully'
  );

  c.set('executionContext', buildExecutionContext(attempt.authResult, reqData));
  await next();
}

export const runApiKeyAuth = () =>
  createMiddleware<{
    Variables: {
      executionContext: BaseExecutionContext;
    };
  }>(runApiKeyAuthHandler);

/**
 * Creates a middleware that applies API key authentication except for specified route patterns
 * @param skipRouteCheck - Function that returns true if the route should skip authentication
 */
export const runApiKeyAuthExcept = (skipRouteCheck: (path: string) => boolean) =>
  createMiddleware<{
    Variables: {
      executionContext: BaseExecutionContext;
    };
  }>(async (c, next) => {
    if (skipRouteCheck(c.req.path)) {
      return next();
    }
    return runApiKeyAuthHandler(c, next);
  });

/**
 * Helper middleware for endpoints that optionally support API key authentication
 * If no auth header is present, it continues without setting the executionContext
 */
export const runOptionalAuth = () =>
  createMiddleware<{
    Variables: {
      executionContext?: BaseExecutionContext;
    };
  }>(async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      await next();
      return;
    }

    return runApiKeyAuthHandler(c, next);
  });
