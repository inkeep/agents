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
import runDbClient from '../data/db/runDbClient';
import { env } from '../env';
import { sessionAuth } from './sessionAuth';

const logger = getLogger('env-key-auth');
/**
 * Middleware to authenticate API requests using Bearer token authentication
 * Authentication priority:
 * 1. Bypass secret (INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET)
 * 2. Better-auth session token (from device authorization flow)
 * 3. Database API key
 * 4. Internal service token
 */
export const manageApiKeyAuth = () =>
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
      logger.info({}, 'Bypass secret authenticated successfully');

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
      // Session validation failed, continue to API key validation
      logger.debug({ error }, 'Better-auth session validation failed, trying API key');
    }

    // 3. Validate against database API keys
    const validatedKey = await validateAndGetApiKey(token, runDbClient);

    if (validatedKey) {
      logger.info({ keyId: validatedKey.id }, 'API key authenticated successfully');

      // Set context from the validated API key
      c.set('userId', `apikey:${validatedKey.id}`);
      c.set('userEmail', `apikey-${validatedKey.id}@internal`);
      // The tenantId from the API key can be used for access control
      c.set('tenantId', validatedKey.tenantId);

      await next();
      return;
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

    // None of the authentication methods succeeded
    throw new HTTPException(401, {
      message: 'Invalid Token',
    });
  });

/**
 * Middleware that gates a route with manage-domain authentication.
 * Uses Bearer token → API key auth, otherwise falls back to session auth.
 */
export const manageApiKeyOrSessionAuth = () => {
  const mw = createMiddleware(async (c, next) => {
    if (env.ENVIRONMENT === 'test') {
      await next();
      return;
    }

    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return manageApiKeyAuth()(c as any, next);
    }

    return sessionAuth()(c as any, next);
  });
  registerAuthzMeta(mw, {
    resource: 'organization',
    permission: 'member',
    description: 'Requires session cookie or API key authentication',
  });
  return mw;
};
