import {
  type BaseExecutionContext,
  validateAndGetApiKey,
  validateTargetAgent,
  verifyServiceToken,
  verifyTempToken,
} from '@inkeep/agents-core';
import type { createAuth } from '@inkeep/agents-core/auth';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import dbClient from '../data/db/dbClient';
import { env } from '../env';
import { getLogger } from '../logger';
import { createBaseExecutionContext, type Principal } from '../types/execution-context';

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
  xApiKey?: string; // X-API-Key header (new pattern per spec)
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

type AuthAttempt = {
  authResult: AuthResult | null;
  failureMessage?: string;
};

/**
 * Extract common request data from the Hono context
 */
function extractRequestData(c: { req: any }): RequestData {
  const authHeader = c.req.header('Authorization');
  const xApiKey = c.req.header('X-API-Key');
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

  // Support both X-API-Key header (new spec) and Authorization Bearer (backward compatible)
  // If X-API-Key is present, use it as the API key
  // Otherwise, fall back to Authorization Bearer (existing behavior)
  const apiKey = xApiKey || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined);

  return {
    authHeader,
    apiKey,
    xApiKey,
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
// Session Validation
// ============================================================================

/**
 * Validates a Better Auth session token and returns principal info
 * Returns null if no valid session found
 */
async function validateSession(
  auth: ReturnType<typeof createAuth> | null,
  headers: Headers
): Promise<Principal | null> {
  if (!auth) {
    return null;
  }

  try {
    const session = await auth.api.getSession({ headers });

    if (!session?.user) {
      return null;
    }

    const isAnonymous = session.user.isAnonymous === true;

    return {
      type: isAnonymous ? 'anonymous' : 'authenticated',
      id: session.user.id,
      email: isAnonymous ? undefined : session.user.email,
      isAnonymous,
    };
  } catch (error) {
    logger.debug({ error }, 'Session validation failed');
    return null;
  }
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

// ============================================================================
// Main Middleware
// ============================================================================

/**
 * Try all auth strategies in order, returning the first successful result
 */
async function authenticateRequest(reqData: RequestData): Promise<AuthAttempt> {
  const { apiKey, subAgentId } = reqData;

  if (!apiKey) {
    return { authResult: null };
  }

  // 1. Try JWT temp token
  const jwtResult = await tryTempJwtAuth(apiKey);
  if (jwtResult) return { authResult: jwtResult };

  // 2. Try bypass secret
  const bypassResult = tryBypassAuth(apiKey, reqData);
  if (bypassResult) return { authResult: bypassResult };

  // 3. Try regular API key
  const apiKeyResult = await tryApiKeyAuth(apiKey);
  if (apiKeyResult) return { authResult: apiKeyResult };

  // 4. Try team agent token
  const teamAttempt = await tryTeamAgentAuth(apiKey, subAgentId);
  if (teamAttempt.authResult) return { authResult: teamAttempt.authResult };

  return { authResult: null, failureMessage: teamAttempt.failureMessage };
}

export const apiKeyAuth = (auth?: ReturnType<typeof createAuth> | null) =>
  createMiddleware<{
    Variables: {
      executionContext: BaseExecutionContext;
      principal?: Principal;
      auth?: ReturnType<typeof createAuth> | null;
    };
  }>(async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      await next();
      return;
    }

    // Make auth available on context for other middleware
    if (auth) {
      c.set('auth', auth);
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

      // Validate session if auth is available and Authorization header present
      if (auth && reqData.authHeader?.startsWith('Bearer ')) {
        const headers = new Headers();
        headers.set('Authorization', reqData.authHeader);
        // Also forward cookies if present
        const cookie = c.req.header('cookie');
        if (cookie) {
          headers.set('cookie', cookie);
        }
        const principal = await validateSession(auth, headers);
        if (principal) {
          c.set('principal', principal);
          logger.debug({ principalId: principal.id, isAnonymous: principal.isAnonymous }, 'Session validated');
        }
      }

      await next();
      return;
    }

    // Production environment - require valid API key auth
    // Support both X-API-Key header (new spec) and Authorization Bearer (backward compatible)
    const hasXApiKey = !!reqData.xApiKey;
    const hasAuthBearer = reqData.authHeader?.startsWith('Bearer ');

    if (!hasXApiKey && !hasAuthBearer) {
      throw new HTTPException(401, {
        message: 'Missing API key. Expected: X-API-Key header or Authorization: Bearer <api_key>',
      });
    }

    if (!reqData.apiKey || reqData.apiKey.length < 16) {
      throw new HTTPException(401, {
        message: 'Invalid API key format',
      });
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

    // Validate session if auth is available
    // When using X-API-Key, the Authorization header contains the session token
    // When using Authorization Bearer for API key (backward compat), session is from cookies only
    if (auth) {
      const headers = new Headers();

      if (hasXApiKey && hasAuthBearer) {
        // New pattern: X-API-Key for API key, Authorization Bearer for session token
        headers.set('Authorization', reqData.authHeader!);
      }

      // Also forward cookies for session validation
      const cookie = c.req.header('cookie');
      if (cookie) {
        headers.set('cookie', cookie);
      }
      const forwardedCookie = c.req.header('x-forwarded-cookie');
      if (forwardedCookie) {
        headers.set('cookie', forwardedCookie);
      }

      const principal = await validateSession(auth, headers);
      if (principal) {
        c.set('principal', principal);
        logger.info(
          { principalId: principal.id, isAnonymous: principal.isAnonymous },
          'Session validated successfully'
        );
      }
    }

    await next();
  });

/**
 * Helper middleware for endpoints that optionally support API key authentication
 * If no auth header is present, it continues without setting the executionContext
 */
export const optionalAuth = (auth?: ReturnType<typeof createAuth> | null) =>
  createMiddleware<{
    Variables: {
      executionContext?: BaseExecutionContext;
      principal?: Principal;
    };
  }>(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const xApiKey = c.req.header('X-API-Key');

    // No auth headers present, continue without context
    if (!xApiKey && (!authHeader || !authHeader.startsWith('Bearer '))) {
      await next();
      return;
    }

    return apiKeyAuth(auth)(c as any, next);
  });
