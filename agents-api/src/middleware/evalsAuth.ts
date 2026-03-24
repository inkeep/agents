import {
  type BaseExecutionContext,
  getLogger,
  isInternalServiceToken,
  verifyInternalServiceAuthHeader,
} from '@inkeep/agents-core';
import { registerAuthzMeta } from '@inkeep/agents-core/middleware';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { env } from '../env';

const logger = getLogger('eval-auth');
/**
 * Middleware to authenticate API requests using Bearer token authentication
 * First checks if token matches INKEEP_AGENTS_EVAL_API_BYPASS_SECRET,
 */
export const evalApiKeyAuth = () => {
  const mw = createMiddleware<{
    Variables: {
      executionContext: BaseExecutionContext;
    };
  }>(async (c, next) => {
    const authHeader = c.req.header('Authorization');

    // Check for Bearer token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // In development environment, allow request without authentication
      if (env.ENVIRONMENT === 'development') {
        await next();
        return;
      }
      throw new HTTPException(401, {
        message: 'Missing or invalid authorization header. Expected: Bearer <api_key>',
      });
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

    // If bypass secret is configured, allow bypass authentication
    if (env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET) {
      // Check for Bearer token
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('[AUTH DEBUG] Rejecting: No Bearer token provided');
        throw new HTTPException(401, {
          message: 'Missing or invalid authorization header. Expected: Bearer <api_key>',
        });
      }

      const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
      const tokenMatches = apiKey === env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET;
      if (tokenMatches) {
        logger.info({}, 'Bypass secret authenticated successfully');
        await next();
        return;
      }
    }

    // 4. Validate as an internal service token if not already authenticated
    if (isInternalServiceToken(apiKey)) {
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
        },
        'Internal service authenticated'
      );

      await next();
      return;
    }

    // If development environment, allow request with invalid token
    if (env.ENVIRONMENT === 'development') {
      await next();
      return;
    }

    // None of the authentication methods succeeded
    throw new HTTPException(401, {
      message: 'Invalid Token',
    });
  });
  registerAuthzMeta(mw, {
    description: 'Requires eval API key (bypass secret or internal service token)',
  });
  return mw;
};
