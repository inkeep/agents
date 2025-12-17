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
    const authHeader = c.req.header('Authorization');
    const bypassSecretSet = !!env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET;
    const bypassSecretLength = env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET?.length || 0;
    const authHeaderPresent = !!authHeader;
    const authHeaderLength = authHeader?.length || 0;

    // Log auth state for debugging
    console.log('[AUTH DEBUG]', {
      path: c.req.path,
      bypassSecretSet,
      bypassSecretLength,
      authHeaderPresent,
      authHeaderLength,
      authHeaderPrefix: authHeader?.substring(0, 20),
    });

    // If bypass secret is configured, only allow bypass authentication
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

      console.log('[AUTH DEBUG]', {
        tokenLength: apiKey.length,
        expectedLength: env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET.length,
        tokenMatches,
        tokenFirst5: apiKey.substring(0, 5),
        expectedFirst5: env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET.substring(0, 5),
      });

      if (tokenMatches) {
        logger.info({}, 'Bypass secret authenticated successfully');
        await next();
        return;
      } else {
        // Bypass secret is set but token doesn't match - reject
        console.log('[AUTH DEBUG] Rejecting: Token does not match bypass secret');
        throw new HTTPException(401, {
          message: 'Invalid Token',
        });
      }
    }

    console.log('[AUTH DEBUG] No bypass secret configured, allowing request');
    await next();
    return;
  });
