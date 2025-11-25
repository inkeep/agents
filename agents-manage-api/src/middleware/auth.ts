import { type ExecutionContext, getLogger, validateAndGetApiKey } from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import dbClient from '../data/db/dbClient';
import { env } from '../env';

const logger = getLogger('env-key-auth');
/**
 * Middleware to authenticate API requests using Bearer token authentication
 * First checks if token matches INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET, then falls back to API key validation
 * Extracts and validates API keys, then adds execution context to the request
 */
export const apiKeyAuth = () =>
  createMiddleware<{
    Variables: {
      executionContext: ExecutionContext;
      userId?: string;
      userEmail?: string;
      tenantId?: string;
    };
  }>(async (c, next) => {
    const authHeader = c.req.header('Authorization');

    // Check for Bearer token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HTTPException(401, {
        message: 'Missing or invalid authorization header. Expected: Bearer <api_key>',
      });
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

    // First, check if it's the bypass secret
    if (
      env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET &&
      apiKey === env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET
    ) {
      logger.info({}, 'Bypass secret authenticated successfully');

      // Set system user context for bypass authentication
      c.set('userId', 'system');
      c.set('userEmail', 'system@internal');

      await next();
      return;
    }

    // Otherwise, validate against database API keys
    const validatedKey = await validateAndGetApiKey(apiKey, dbClient);

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

    // Neither bypass secret nor valid API key
    throw new HTTPException(401, {
      message: 'Invalid Token',
    });
  });
