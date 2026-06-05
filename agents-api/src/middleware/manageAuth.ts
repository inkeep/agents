import {
  type BaseExecutionContext,
  getLogger,
  isInternalServiceToken,
  isSlackUserToken,
  validateAndGetApiKey,
  verifyInternalServiceAuthHeader,
  verifySlackUserToken,
} from '@inkeep/agents-core';
import type { createAuth } from '@inkeep/agents-core/auth';
import { registerAuthzMeta } from '@inkeep/agents-core/middleware';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { jwtVerify } from 'jose';
import runDbClient from '../data/db/runDbClient';
import { env } from '../env';
import { getOAuthIssuer, getOAuthJwks } from '../utils/oauthJwks';
import { sessionAuth } from './sessionAuth';

/**
 * Legacy exceptions: specific manage routes where deprecated database API keys are still
 * accepted. Every other manage endpoint remains session-only. Project match on the API key
 * is enforced separately below (see `extractProjectIdFromPath`) so a key can only act on
 * routes within its own project.
 *
 * Current exceptions:
 *   - GET  /manage/tenants/:t/projects/:p/conversations/:id
 *     Read a single conversation by ID. Caller must already know the conversationId;
 *     list, bounds, and media sub-endpoints remain session-only.
 *   - POST /manage/tenants/:t/projects/:p/feedback
 *     Create feedback tied to a conversation. Supports external integrations.
 *     Update/list/delete on feedback remain session-only.
 */
const LEGACY_API_KEY_ALLOWED_ROUTES: ReadonlyArray<{
  method: string;
  path: RegExp;
}> = [
  {
    method: 'GET',
    path: /^\/manage\/tenants\/[^/]+\/projects\/[^/]+\/conversations\/[^/]+\/?$/,
  },
  {
    method: 'POST',
    path: /^\/manage\/tenants\/[^/]+\/projects\/[^/]+\/feedback\/?$/,
  },
];

function isLegacyApiKeyAllowedRoute(method: string, path: string): boolean {
  return LEGACY_API_KEY_ALLOWED_ROUTES.some(
    (entry) => entry.method === method && entry.path.test(path)
  );
}

function extractProjectIdFromPath(path: string): string | undefined {
  const match = path.match(/\/projects\/([^/]+)\//);
  return match?.[1];
}

const logger = getLogger('env-key-auth');
/**
 * Middleware to authenticate API requests using Bearer token authentication
 * Authentication priority:
 * 1. Bypass secret (INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET)
 * 2. Better-auth session token (from device authorization flow)
 * 3. OAuth access token (JWT or opaque, from oauthProvider plugin)
 * 4. Slack user JWT token (for Slack work app delegation)
 * 5. Internal service token
 *
 * NOTE: Database API keys are intentionally NOT accepted on manage endpoints, except for
 * the narrow legacy exceptions enumerated in `LEGACY_API_KEY_ALLOWED_ROUTES`. API keys
 * are otherwise restricted to the run domain only.
 */
export const manageBearerAuth = () =>
  createMiddleware<{
    Variables: {
      executionContext: BaseExecutionContext;
      userId?: string;
      userEmail?: string;
      tenantId?: string;
      auth: ReturnType<typeof createAuth>;
    };
  }>(async (c, next) => {
    const authHeader = c.req.header('Authorization');

    // Check for Bearer token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HTTPException(401, {
        message: 'Missing or invalid authorization header. Expected: Bearer <api_key>',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // 1. First, check if it's the bypass secret
    if (
      env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET &&
      token === env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET
    ) {
      logger.info('Bypass secret authenticated successfully');

      // Set system user context for bypass authentication
      c.set('userId', 'system');
      c.set('userEmail', 'system@internal');

      await next();
      return;
    }

    // 2. Try to validate as a better-auth session token (from device authorization flow or cookie)
    const auth = c.get('auth');
    try {
      // Create headers with the Authorization header for bearer token validation
      const headers = new Headers();
      headers.set('Authorization', authHeader);

      // Also include cookie for session validation - check x-forwarded-cookie first (from MCP/SDK calls)
      const forwardedCookie = c.req.header('x-forwarded-cookie');
      const cookie = c.req.header('cookie');
      if (forwardedCookie) {
        headers.set('cookie', forwardedCookie);
        logger.debug(
          { source: 'x-forwarded-cookie' },
          'Using x-forwarded-cookie for session validation'
        );
      } else if (cookie) {
        headers.set('cookie', cookie);
        logger.debug({ source: 'cookie' }, 'Using cookie for session validation');
      }

      const session = await auth.api.getSession({ headers });

      if (session?.user) {
        logger.info({ userId: session.user.id }, 'Better-auth session authenticated successfully');

        c.set('userId', session.user.id);
        c.set('userEmail', session.user.email);
        // Note: tenantId will be validated by tenant-access middleware based on the route

        await next();
        return;
      }
    } catch (error) {
      logger.debug({ error }, 'Better-auth session validation failed, trying other auth methods');
    }

    // 3. Validate as an OAuth JWT access token (from oauthProvider plugin)
    // Only JWT tokens are handled here — opaque tokens are not issued by the copilot flow.
    // OAuth JWT auth is disabled entirely when COPILOT_OAUTH_CLIENT_ID is unset, so an
    // unconfigured deployment cannot be tricked into accepting a JWT intended for a different
    // OAuth client on the same provider.
    if (env.COPILOT_OAUTH_CLIENT_ID && token.split('.').length === 3) {
      try {
        const { payload } = await jwtVerify(token, getOAuthJwks(), {
          issuer: getOAuthIssuer(),
        });
        const azp = payload.azp as string | undefined;
        if (azp !== env.COPILOT_OAUTH_CLIENT_ID) {
          throw new HTTPException(401, { message: 'Invalid OAuth client' });
        }
        const sub = payload.sub;
        const tenantId = payload['https://inkeep.com/tenantId'] as string | undefined;
        const email = payload['https://inkeep.com/email'] as string | undefined;
        if (sub) {
          logger.info({ userId: sub, tenantId }, 'OAuth JWT authenticated successfully');
          c.set('userId', sub);
          if (email) c.set('userEmail', email);
          if (tenantId) c.set('tenantId', tenantId);
          c.set('oauthClientId' as any, azp);
          await next();
          return;
        }
      } catch (error) {
        if (error instanceof HTTPException) throw error;
        logger.debug({ error }, 'OAuth JWT validation failed, trying other auth methods');
      }
    }

    // 4. Validate as a Slack user JWT token (for Slack work app delegation)
    if (isSlackUserToken(token)) {
      const result = await verifySlackUserToken(token);

      if (!result.valid || !result.payload) {
        throw new HTTPException(401, {
          message: result.error || 'Invalid Slack user token',
        });
      }

      logger.info(
        {
          inkeepUserId: result.payload.sub,
          tenantId: result.payload.tenantId,
          slackTeamId: result.payload.slack.teamId,
          slackUserId: result.payload.slack.userId,
        },
        'Slack user JWT authenticated successfully'
      );

      c.set('userId', result.payload.sub);
      if (result.payload.slack.email) {
        c.set('userEmail', result.payload.slack.email);
      }
      c.set('tenantId', result.payload.tenantId);

      await next();
      return;
    }

    // 5. Validate as an internal service token if not already authenticated
    if (isInternalServiceToken(token)) {
      const result = await verifyInternalServiceAuthHeader(authHeader);
      if (!result.valid || !result.payload) {
        throw new HTTPException(401, {
          message: result.error || 'Invalid internal service token',
        });
      }

      logger.info(
        {
          serviceId: result.payload.sub,
          tenantId: result.payload.tenantId,
          projectId: result.payload.projectId,
          userId: result.payload.userId,
        },
        'Internal service authenticated'
      );

      c.set('userId', result.payload.userId || `system`);
      c.set('userEmail', `${result.payload.sub}@internal.inkeep`);

      // If token has tenant scope, set it
      if (result.payload.tenantId) {
        c.set('tenantId', result.payload.tenantId);
      }

      await next();
      return;
    }

    // 6. Legacy exception: allow database API keys on a narrow allowlist of routes
    //    (see LEGACY_API_KEY_ALLOWED_ROUTES above). Project match is enforced below.
    if (isLegacyApiKeyAllowedRoute(c.req.method, c.req.path)) {
      try {
        const apiKeyRecord = await validateAndGetApiKey(token, runDbClient);
        if (apiKeyRecord) {
          // Validate that the API key's project matches the route's project
          const routeProjectId = extractProjectIdFromPath(c.req.path);
          if (routeProjectId && apiKeyRecord.projectId !== routeProjectId) {
            logger.warn(
              {
                apiKeyId: apiKeyRecord.id,
                apiKeyProjectId: apiKeyRecord.projectId,
                routeProjectId,
              },
              'Legacy API key project mismatch'
            );
            throw new HTTPException(403, {
              message: 'API key does not have access to this project',
            });
          }

          logger.info(
            {
              apiKeyId: apiKeyRecord.id,
              tenantId: apiKeyRecord.tenantId,
              method: c.req.method,
              path: c.req.path,
            },
            'Legacy API key authenticated for manage endpoint'
          );
          c.set('userId', `apikey:${apiKeyRecord.id}`);
          c.set('tenantId', apiKeyRecord.tenantId);
          await next();
          return;
        }
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        // Intentional fallthrough to 401 on transient DB errors — a broken run DB
        // should not block session-based manage auth on other routes. The customer
        // will see "Invalid Token" rather than 503, which is acceptable for a legacy path.
        logger.error({ error }, 'Legacy API key validation failed');
      }
    }

    // None of the authentication methods succeeded
    throw new HTTPException(401, {
      message: 'Invalid Token',
    });
  });

/**
 * Middleware that gates a route with manage-domain authentication.
 * Uses Bearer token → manage bearer auth (bypass secret, session, Slack JWT, internal service),
 * otherwise falls back to session auth.
 */
export const manageBearerOrSessionAuth = () => {
  const mw = createMiddleware(async (c, next) => {
    if (env.ENVIRONMENT === 'test') {
      await next();
      return;
    }

    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return manageBearerAuth()(c as any, next);
    }

    return sessionAuth()(c as any, next);
  });
  registerAuthzMeta(mw, {
    resource: 'organization',
    permission: 'member',
    description: 'Requires session cookie authentication',
  });
  return mw;
};
