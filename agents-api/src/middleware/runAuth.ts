import {
  type BaseExecutionContext,
  canUseProjectStrict,
  createApiError,
  getAppById,
  getPoWErrorMessage,
  isSlackUserToken,
  type PublicKeyConfig,
  updateAppLastUsed,
  validateAndGetApiKey,
  validateOrigin,
  validateTargetAgent,
  verifyPoW,
  verifyServiceToken,
  verifySlackUserToken,
  verifyTempToken,
  type WebClientConfig,
} from '@inkeep/agents-core';
import { trace } from '@opentelemetry/api';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { decodeProtectedHeader, errors, importSPKI, jwtVerify } from 'jose';
import runDbClient from '../data/db/runDbClient';
import { getAnonJwtSecret } from '../domains/run/routes/auth';
import { env } from '../env';
import { getLogger } from '../logger';
import { createBaseExecutionContext } from '../types/runExecutionContext';
import { isCopilotAgent } from '../utils/copilot';

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
  request: Request;
  authHeader?: string;
  apiKey?: string;
  tenantId?: string;
  projectId?: string;
  agentId?: string;
  subAgentId?: string;
  ref?: string;
  baseUrl: string;
  runAsUserId?: string;
  appId?: string;
  appPrompt?: string;
  origin?: string;
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
  const runAsUserId = c.req.header('x-inkeep-run-as-user-id');
  const appId = c.req.header('x-inkeep-app-id');
  const appPrompt = c.req.header('x-inkeep-app-prompt');
  const origin = c.req.header('Origin');
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
    request: c.req.raw,
    authHeader,
    apiKey: authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined,
    tenantId,
    projectId,
    agentId,
    subAgentId,
    ref,
    baseUrl,
    runAsUserId,
    appId,
    appPrompt,
    origin,
  };
}

/**
 * Build the final execution context from auth result and request data
 */
function buildExecutionContext(authResult: AuthResult, reqData: RequestData): BaseExecutionContext {
  // For team delegation, use the parent agent ID from the request header (x-inkeep-agent-id)
  // instead of the JWT's audience (which is the sub-agent being called).
  // The parent agent ID is needed for project lookup (project.agents[agentId].subAgents[subAgentId]).
  const agentId =
    authResult.metadata?.teamDelegation && reqData.agentId ? reqData.agentId : authResult.agentId;

  if (
    !authResult.metadata?.teamDelegation &&
    reqData.agentId &&
    reqData.agentId !== authResult.agentId &&
    authResult.apiKeyId &&
    !authResult.apiKeyId.startsWith('temp-') &&
    !authResult.apiKeyId.startsWith('app:') &&
    authResult.apiKeyId !== 'bypass' &&
    authResult.apiKeyId !== 'slack-user-token' &&
    authResult.apiKeyId !== 'team-agent-token' &&
    authResult.apiKeyId !== 'test-key'
  ) {
    logger.warn(
      {
        requestedAgentId: reqData.agentId,
        apiKeyAgentId: authResult.agentId,
        apiKeyId: authResult.apiKeyId,
      },
      'API key agent scope mismatch: ignoring x-inkeep-agent-id header, using key-bound agent'
    );
  }

  return createBaseExecutionContext({
    apiKey: authResult.apiKey,
    tenantId: authResult.tenantId,
    projectId: authResult.projectId,
    agentId,
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
async function tryTempJwtAuth(apiKey: string): Promise<AuthAttempt> {
  if (!apiKey.startsWith('eyJ')) {
    return { authResult: null, failureMessage: 'not a JWT' };
  }

  if (!env.INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY) {
    return { authResult: null, failureMessage: 'no public key configured' };
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

    const isCopilotToken = isCopilotAgent({
      tenantId: payload.tenantId,
      projectId,
      agentId,
    });

    if (isCopilotToken) {
      logger.info({ userId, projectId, agentId }, 'Copilot bypass: skipping SpiceDB check');
    }

    if (!isCopilotToken) {
      let canUse: boolean;
      try {
        canUse = await canUseProjectStrict({ userId, tenantId: payload.tenantId, projectId });
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
    }

    logger.info({ projectId, agentId }, 'JWT temp token authenticated successfully');

    return {
      authResult: {
        apiKey,
        tenantId: payload.tenantId,
        projectId,
        agentId,
        apiKeyId: 'temp-jwt',
        metadata: { initiatedBy: payload.initiatedBy },
      },
    };
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.debug({ error }, 'JWT verification failed');
    return { authResult: null, failureMessage: 'JWT verification failed' };
  }
}

/**
 * Authenticate using a regular API key
 */
async function tryApiKeyAuth(apiKey: string): Promise<AuthAttempt> {
  const apiKeyRecord = await validateAndGetApiKey(apiKey, runDbClient);

  if (!apiKeyRecord) {
    return { authResult: null, failureMessage: 'not found' };
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
    authResult: {
      apiKey,
      tenantId: apiKeyRecord.tenantId,
      projectId: apiKeyRecord.projectId,
      agentId: apiKeyRecord.agentId,
      apiKeyId: apiKeyRecord.id,
    },
  };
}

/**
 * Authenticate using a Slack user JWT token (for Slack work app delegation)
 */
async function trySlackUserJwtAuth(token: string, reqData: RequestData): Promise<AuthAttempt> {
  if (!isSlackUserToken(token)) {
    return { authResult: null };
  }

  const result = await verifySlackUserToken(token);

  if (!result.valid || !result.payload) {
    logger.warn({ error: result.error }, 'Invalid Slack user JWT token');
    return {
      authResult: null,
      failureMessage: `Invalid Slack user token: ${result.error || 'Invalid token'}`,
    };
  }

  const payload = result.payload;

  if (!reqData.projectId || !reqData.agentId) {
    logger.warn(
      { hasProjectId: !!reqData.projectId, hasAgentId: !!reqData.agentId },
      'Slack user JWT requires x-inkeep-project-id and x-inkeep-agent-id headers'
    );
    return {
      authResult: null,
      failureMessage: 'Slack user token requires x-inkeep-project-id and x-inkeep-agent-id headers',
    };
  }

  // Channel/workspace authorization bypass (D2, D8)
  // If the Slack work app determined the user is authorized via channel or workspace config,
  // AND the requested project matches the project the bypass was granted for,
  // skip the SpiceDB project membership check.
  const slackAuthorized =
    payload.slack.authorized === true && payload.slack.authorizedProjectId === reqData.projectId;

  if (!slackAuthorized) {
    logger.debug(
      {
        slackAuthorizedClaim: payload.slack.authorized,
        slackAuthorizedProjectId: payload.slack.authorizedProjectId,
        requestedProjectId: reqData.projectId,
        projectMatch: payload.slack.authorizedProjectId === reqData.projectId,
      },
      'Slack channel auth bypass not applied, falling through to SpiceDB'
    );

    // Verify the requested projectId belongs to the authenticated tenant
    try {
      const canUse = await canUseProjectStrict({
        userId: payload.sub,
        tenantId: payload.tenantId,
        projectId: reqData.projectId,
      });
      if (!canUse) {
        logger.warn(
          {
            userId: payload.sub,
            tenantId: payload.tenantId,
            projectId: reqData.projectId,
          },
          'Slack user JWT: user does not have access to requested project'
        );
        return {
          authResult: null,
          failureMessage: 'Access denied: insufficient permissions for the requested project',
        };
      }
    } catch (error) {
      logger.error(
        { error, userId: payload.sub, projectId: reqData.projectId },
        'SpiceDB permission check failed for Slack JWT'
      );
      throw new HTTPException(503, {
        message: 'Authorization service temporarily unavailable',
      });
    }
  }

  logger.info(
    {
      inkeepUserId: payload.sub,
      tenantId: payload.tenantId,
      slackTeamId: payload.slack.teamId,
      slackUserId: payload.slack.userId,
      projectId: reqData.projectId,
      agentId: reqData.agentId,
      slackAuthorized,
      slackAuthSource: payload.slack.authSource,
      slackChannelId: payload.slack.channelId,
      slackAuthorizedProjectId: payload.slack.authorizedProjectId,
    },
    'Slack user JWT token authenticated successfully'
  );

  return {
    authResult: {
      apiKey: token,
      tenantId: payload.tenantId,
      projectId: reqData.projectId,
      agentId: reqData.agentId,
      apiKeyId: 'slack-user-token',
      metadata: {
        initiatedBy: {
          type: 'user',
          id: payload.sub,
        },
        ...(slackAuthorized && {
          slack: {
            authorized: true,
            authSource: payload.slack.authSource ?? 'channel',
            channelId: payload.slack.channelId,
            teamId: payload.slack.teamId,
          },
        }),
      },
    },
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
      apiKey: token,
      tenantId: payload.tenantId,
      projectId: payload.projectId,
      agentId: payload.aud,
      apiKeyId: 'team-agent-token',
      metadata: {
        teamDelegation: true,
        originAgentId: payload.sub,
        ...(payload.initiatedBy ? { initiatedBy: payload.initiatedBy } : {}),
      },
    },
  };
}

/**
 * Authenticate using bypass secret (production mode bypass)
 */
function tryBypassAuth(apiKey: string, reqData: RequestData): AuthAttempt {
  if (!env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET) {
    return { authResult: null, failureMessage: 'no bypass secret configured' };
  }

  if (apiKey !== env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET) {
    return { authResult: null, failureMessage: 'no match' };
  }

  if (!reqData.tenantId || !reqData.projectId || !reqData.agentId) {
    throw new HTTPException(401, {
      message: 'Missing or invalid tenant, project, or agent ID',
    });
  }

  logger.info({}, 'Bypass secret authenticated successfully');

  return {
    authResult: {
      apiKey,
      tenantId: reqData.tenantId,
      projectId: reqData.projectId,
      agentId: reqData.agentId,
      apiKeyId: 'bypass',
      ...(reqData.runAsUserId
        ? { metadata: { initiatedBy: { type: 'user' as const, id: reqData.runAsUserId } } }
        : {}),
    },
  };
}

/**
 * Authenticate using an app credential (X-Inkeep-App-Id header).
 * Supports web_client (end-user JWT) and api (app secret) types.
 */
async function tryAsymmetricJwtVerification(
  bearerToken: string,
  publicKeys: PublicKeyConfig[],
  audience: string | undefined,
  appId: string
): Promise<
  | { ok: true; endUserId: string; kid: string; claims: Record<string, unknown> }
  | { ok: false; failureMessage: string }
> {
  let header: { kid?: string; alg?: string };
  try {
    header = decodeProtectedHeader(bearerToken);
  } catch (err) {
    logger.debug({ error: err, appId }, 'Failed to decode JWT protected header');
    return { ok: false, failureMessage: 'Failed to decode JWT header' };
  }

  if (!header.kid) {
    return { ok: false, failureMessage: 'JWT missing kid header' };
  }

  const matchedKey = publicKeys.find((k) => k.kid === header.kid);
  if (!matchedKey) {
    logger.warn({ kid: header.kid, appId }, 'App auth: kid not found in app public keys');
    return { ok: false, failureMessage: `kid "${header.kid}" not found on app` };
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await importSPKI(matchedKey.publicKey, matchedKey.algorithm);
  } catch (err) {
    logger.error(
      { error: err, kid: header.kid, appId },
      'Failed to import public key for verification'
    );
    return { ok: false, failureMessage: 'Failed to import public key' };
  }

  const verifyOptions: Parameters<typeof jwtVerify>[2] = {
    clockTolerance: 60,
  };
  if (audience) {
    verifyOptions.audience = audience;
  }

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(bearerToken, cryptoKey, verifyOptions);
    payload = result.payload as Record<string, unknown>;
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      return { ok: false, failureMessage: 'Token expired' };
    }
    if (err instanceof errors.JWSSignatureVerificationFailed) {
      return { ok: false, failureMessage: 'Signature verification failed' };
    }
    if (err instanceof errors.JWTClaimValidationFailed) {
      logger.debug({ error: err.message, appId }, 'JWT claim validation failed');
      return { ok: false, failureMessage: 'JWT claim validation failed' };
    }
    logger.debug({ error: err, appId }, 'JWT verification failed');
    return { ok: false, failureMessage: 'JWT verification failed' };
  }

  if (!payload.sub) {
    return { ok: false, failureMessage: 'JWT missing required sub claim' };
  }

  if (!payload.iat) {
    return { ok: false, failureMessage: 'JWT missing required iat claim' };
  }

  if (!payload.exp) {
    return { ok: false, failureMessage: 'JWT missing required exp claim' };
  }

  const exp = payload.exp as number;
  const iat = payload.iat as number;
  if (exp - iat > 86400) {
    return { ok: false, failureMessage: 'Token lifetime exceeds 24 hours' };
  }

  return {
    ok: true,
    endUserId: payload.sub as string,
    kid: matchedKey.kid,
    claims: payload,
  };
}

async function tryAppCredentialAuth(reqData: RequestData): Promise<AuthAttempt> {
  const { appId: appIdHeader, apiKey: bearerToken, origin, agentId: requestedAgentId } = reqData;

  if (!appIdHeader) {
    return { authResult: null };
  }

  const app = await getAppById(runDbClient)(appIdHeader);
  if (!app) {
    return { authResult: null, failureMessage: 'App not found' };
  }
  if (!app.enabled) {
    return { authResult: null, failureMessage: 'App is disabled' };
  }

  let endUserId: string | undefined;
  let authMethod:
    | 'app_credential_web_client'
    | 'app_credential_api'
    | 'app_credential_web_client_authenticated';

  if (app.type === 'web_client') {
    const config = app.config as WebClientConfig;

    if (!validateOrigin(origin, config.webClient.allowedDomains)) {
      logger.warn(
        { origin, allowedDomains: config.webClient.allowedDomains, appId: app.id },
        'App credential auth: origin not allowed'
      );
      throw createApiError({ code: 'forbidden', message: 'Origin not allowed for this app' });
    }

    if (!bearerToken) {
      return { authResult: null, failureMessage: 'Bearer token required for web_client app' };
    }

    const publicKeys = config.webClient.auth?.publicKeys ?? [];
    const hasAuthConfigured = publicKeys.length > 0;

    if (hasAuthConfigured) {
      const asymResult = await tryAsymmetricJwtVerification(
        bearerToken,
        publicKeys,
        config.webClient.auth?.audience,
        app.id
      );

      if (!asymResult.ok) {
        const allowAnonymous = config.webClient.auth?.allowAnonymous !== false;
        if (!allowAnonymous) {
          logger.debug(
            { appId: app.id, reason: asymResult.failureMessage },
            'Asymmetric JWT verification failed, anonymous not allowed'
          );
          throw createApiError({ code: 'unauthorized', message: asymResult.failureMessage });
        }
        logger.debug(
          { appId: app.id, reason: asymResult.failureMessage },
          'Asymmetric JWT verification failed, falling back to anonymous'
        );
        // Don't return — fall through to anonymous path below
      }

      if (asymResult.ok) {
        authMethod = 'app_credential_web_client_authenticated';
        endUserId = asymResult.endUserId;

        // Extract verified claims (non-standard JWT fields) for runtime context
        const {
          sub: _sub,
          iat: _iat,
          exp: _exp,
          aud: _aud,
          iss: _iss,
          jti: _jti,
          nbf: _nbf,
          tid: _tid,
          pid: _pid,
          agentId: _agentIdClaim,
          ...verifiedClaims
        } = asymResult.claims;

        // Enforce 1KB size limit on verified claims
        const claimsJson = JSON.stringify(verifiedClaims);
        if (claimsJson.length > 1024) {
          throw createApiError({
            code: 'unauthorized',
            message: `Token custom claims exceed 1KB limit (${claimsJson.length} bytes)`,
          });
        }

        const span = trace.getActiveSpan();
        span?.setAttribute('app.auth.kid', asymResult.kid);
        span?.setAttribute('app.auth.endUserId', asymResult.endUserId);
        span?.setAttribute('app.auth.method', authMethod);

        // Resolve scope: global apps get scope from token claims, tenant-scoped apps from the app record.
        let resolvedTenantId: string;
        let resolvedProjectId: string;
        let resolvedAgentId: string;

        if (!app.tenantId) {
          // Global app — scope comes from token claims
          const claims = asymResult.claims;
          const tid = typeof claims.tid === 'string' ? claims.tid : undefined;
          const pid = typeof claims.pid === 'string' ? claims.pid : undefined;
          const claimAgentId = typeof claims.agentId === 'string' ? claims.agentId : undefined;

          if (!tid || !pid) {
            throw createApiError({
              code: 'unauthorized',
              message: 'Global app requires tid and pid claims in token',
            });
          }

          // Opt-in SpiceDB validation for global apps
          if (config.webClient.auth?.validateScopeClaims) {
            try {
              const canUse = await canUseProjectStrict({
                userId: asymResult.endUserId,
                tenantId: tid,
                projectId: pid,
              });
              if (!canUse) {
                throw createApiError({
                  code: 'forbidden',
                  message: 'Access denied: insufficient permissions',
                });
              }
            } catch (error) {
              if (error instanceof HTTPException) throw error;
              if ((error as { status?: number })?.status === 403) throw error;
              logger.error({ error }, 'SpiceDB permission check failed for global app auth');
              throw createApiError({
                code: 'internal_server_error',
                message: 'Authorization service temporarily unavailable',
              });
            }
          }

          resolvedTenantId = tid;
          resolvedProjectId = pid;
          resolvedAgentId = claimAgentId || requestedAgentId || app.defaultAgentId || '';
        } else {
          // Tenant-scoped app — scope comes from app record
          if (!app.projectId) {
            logger.error(
              { appId: app.id },
              'App credential auth: tenant-scoped app missing projectId'
            );
            throw createApiError({
              code: 'internal_server_error',
              message: 'App configuration error',
            });
          }

          resolvedTenantId = app.tenantId;
          resolvedProjectId = app.projectId;
          resolvedAgentId = requestedAgentId || app.defaultAgentId || '';
        }

        if (Math.random() < 0.1) {
          updateAppLastUsed(runDbClient)(app.id).catch((err) => {
            logger.error({ error: err, appId: app.id }, 'Failed to update app lastUsedAt');
          });
        }

        logger.info(
          { appId: app.id, kid: asymResult.kid, endUserId, authMethod, global: !app.tenantId },
          'App credential authenticated (asymmetric)'
        );

        return {
          authResult: {
            apiKey: bearerToken,
            tenantId: resolvedTenantId,
            projectId: resolvedProjectId,
            agentId: resolvedAgentId,
            apiKeyId: `app:${app.id}`,
            metadata: {
              endUserId,
              initiatedBy: { type: 'user' as const, id: endUserId },
              authMethod,
              ...(Object.keys(verifiedClaims).length > 0 ? { verifiedClaims } : {}),
            },
          },
        };
      } // end if (asymResult.ok)
    } // end if (hasAuthConfigured)

    const pow = await verifyPoW(reqData.request, env.INKEEP_POW_HMAC_SECRET);
    if (!pow.ok) {
      throw new HTTPException(400, { message: getPoWErrorMessage(pow.error) });
    }

    authMethod = 'app_credential_web_client';
    try {
      const secret = getAnonJwtSecret();
      const { payload } = await jwtVerify(bearerToken, secret, { issuer: 'inkeep' });

      if (payload.app !== appIdHeader) {
        if (hasAuthConfigured) {
          throw createApiError({ code: 'unauthorized', message: 'Invalid or expired token' });
        }
        return {
          authResult: null,
          failureMessage: 'JWT app claim does not match request app ID',
        };
      }

      endUserId = payload.sub;
    } catch (err) {
      const errorType =
        err instanceof errors.JWTExpired
          ? 'expired'
          : err instanceof errors.JWSSignatureVerificationFailed
            ? 'signature_invalid'
            : 'unknown';
      logger.debug({ errorType, appId: appIdHeader }, 'Anonymous JWT verification failed');
      if (hasAuthConfigured) {
        throw createApiError({ code: 'unauthorized', message: 'Invalid or expired token' });
      }
      return { authResult: null, failureMessage: 'Invalid end-user JWT' };
    }
  } else {
    return { authResult: null, failureMessage: 'Unsupported app type' };
  }

  const agentId = requestedAgentId || app.defaultAgentId || '';

  if (Math.random() < 0.1) {
    updateAppLastUsed(runDbClient)(app.id).catch((err) => {
      logger.error({ error: err, appId: app.id }, 'Failed to update app lastUsedAt');
    });
  }

  logger.info(
    { appId: app.id, appType: app.type, agentId, endUserId, authMethod },
    'App credential authenticated successfully'
  );

  return {
    authResult: {
      apiKey: bearerToken || appIdHeader,
      tenantId: app.tenantId || reqData.tenantId || '',
      projectId: app.projectId || reqData.projectId || '',
      agentId,
      apiKeyId: `app:${app.id}`,
      metadata: {
        endUserId,
        ...(endUserId ? { initiatedBy: { type: 'user' as const, id: endUserId } } : {}),
        authMethod,
        appPrompt: app.prompt || undefined,
      },
    },
  };
}

/**
 * Create default development context
 */
function createDevContext(reqData: RequestData): AuthResult {
  const result: AuthResult = {
    apiKey: 'development',
    tenantId: reqData.tenantId || 'test-tenant',
    projectId: reqData.projectId || 'test-project',
    agentId: reqData.agentId || 'test-agent',
    apiKeyId: 'test-key',
    ...(reqData.runAsUserId
      ? { metadata: { initiatedBy: { type: 'user' as const, id: reqData.runAsUserId } } }
      : {}),
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

  if (reqData.appId) {
    if (!apiKey) {
      return { authResult: null, failureMessage: 'Bearer token required for app credential auth' };
    }
    return tryAppCredentialAuth(reqData);
  }

  if (!apiKey) {
    return { authResult: null, failureMessage: 'No API key provided' };
  }

  const failures: Array<{ strategy: string; reason: string }> = [];

  const jwtAttempt = await tryTempJwtAuth(apiKey);
  if (jwtAttempt.authResult) return jwtAttempt;
  if (jwtAttempt.failureMessage) {
    failures.push({ strategy: 'JWT temp token', reason: jwtAttempt.failureMessage });
  }

  const bypassAttempt = tryBypassAuth(apiKey, reqData);
  if (bypassAttempt.authResult) return bypassAttempt;
  if (bypassAttempt.failureMessage) {
    failures.push({ strategy: 'bypass secret', reason: bypassAttempt.failureMessage });
  }

  const slackAttempt = await trySlackUserJwtAuth(apiKey, reqData);
  if (slackAttempt.authResult) return slackAttempt;
  if (slackAttempt.failureMessage) return slackAttempt;
  failures.push({ strategy: 'Slack user JWT', reason: 'not a Slack token' });

  const apiKeyAttempt = await tryApiKeyAuth(apiKey);
  if (apiKeyAttempt.authResult) return apiKeyAttempt;
  if (apiKeyAttempt.failureMessage) {
    failures.push({ strategy: 'API key', reason: apiKeyAttempt.failureMessage });
  }

  const teamAttempt = await tryTeamAgentAuth(apiKey, subAgentId);
  if (teamAttempt.authResult) return teamAttempt;
  if (teamAttempt.failureMessage) {
    failures.push({ strategy: 'team agent token', reason: teamAttempt.failureMessage });
  }

  logger.debug({ failures }, 'All auth strategies exhausted');

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

  if (reqData.runAsUserId === 'system' || reqData.runAsUserId?.startsWith('apikey:')) {
    throw new HTTPException(400, {
      message: 'x-inkeep-run-as-user-id cannot be a system identifier',
    });
  }

  // Development/test environment handling
  if (isDev) {
    logger.info({}, 'development environment');

    const attempt = await authenticateRequest(reqData);

    if (attempt.authResult) {
      if (reqData.appPrompt && !attempt.authResult.metadata?.appPrompt) {
        attempt.authResult.metadata = {
          ...attempt.authResult.metadata,
          appPrompt: reqData.appPrompt,
        };
      }
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

    if (reqData.appId && attempt.authResult) {
      trace.getActiveSpan()?.setAttribute('app.id', reqData.appId);
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
    logger.error(
      { failureMessage: attempt.failureMessage },
      'API key authentication error - no valid auth method found'
    );
    throw new HTTPException(401, {
      message: 'Invalid Token',
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

  // Forward appPrompt from internal A2A header when not already set by auth strategy
  if (reqData.appPrompt && !attempt.authResult.metadata?.appPrompt) {
    attempt.authResult.metadata = { ...attempt.authResult.metadata, appPrompt: reqData.appPrompt };
  }

  c.set('executionContext', buildExecutionContext(attempt.authResult, reqData));
  if (reqData.appId) {
    trace.getActiveSpan()?.setAttribute('app.id', reqData.appId);
  }
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
