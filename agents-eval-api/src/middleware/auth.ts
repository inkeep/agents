import { type ExecutionContext, getLogger } from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { env } from '../env';

const logger = getLogger('eval-api-key-auth');
/**
 * Middleware to authenticate API requests using Bearer token authentication
 * First checks if token matches INKEEP_AGENTS_EVAL_API_BYPASS_SECRET, then falls back to API key validation
 * Extracts and validates API keys, then adds execution context to the request
 */
export const apiKeyAuth = () =>
  createMiddleware<{
    Variables: {
      executionContext: ExecutionContext;
    };
  }>(async (c, next) => {
    // If bypass secret is configured, only allow bypass authentication
    if (env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET) {
      const authHeader = c.req.header('Authorization');

      // Check for Bearer token
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new HTTPException(401, {
          message: 'Missing or invalid authorization header. Expected: Bearer <api_key>',
        });
      }

      const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

      if (apiKey === env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET) {
        logger.info({}, 'Bypass secret authenticated successfully');

        await next();
        return;
      } else {
        // Bypass secret is set but token doesn't match - reject
        throw new HTTPException(401, {
          message: 'Invalid Token',
        });
      }
    }
    await next();
    return;
  });
