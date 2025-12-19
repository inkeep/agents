import { type ExecutionContext, getLogger, validateAndGetApiKey } from '@inkeep/agents-core';
import type { createAuth } from '@inkeep/agents-core/auth';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import dbClient from '../data/db/dbClient';
import { env } from '../env';

const logger = getLogger('env-key-auth');
/**
 * Middleware to authenticate API requests using Bearer token authentication
 * Authentication priority:
 * 1. Bypass secret (INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET)
 * 2. Better-auth session token (from device authorization flow)
 * 3. Database API key
 */
export const apiKeyAuth = () =>
  createMiddleware<{
    Variables: {
      executionContext: ExecutionContext;
      userId?: string;
      userEmail?: string;
      tenantId?: string;
      auth: ReturnType<typeof createAuth> | null;
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

    // 2. Try to validate as a better-auth session token (from device authorization flow)
    const auth = c.get('auth');
    if (auth) {
      try {
        // Create headers with the Authorization header for bearer token validation
        const headers = new Headers();
        headers.set('Authorization', authHeader);

        const session = await auth.api.getSession({ headers });

        if (session?.user) {
          logger.info(
            { userId: session.user.id },
            'Better-auth session authenticated successfully'
          );

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
    }

    // 3. Validate against database API keys
    const validatedKey = await validateAndGetApiKey(token, dbClient);

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

    // None of the authentication methods succeeded
    throw new HTTPException(401, {
      message: 'Invalid Token',
    });
  });
