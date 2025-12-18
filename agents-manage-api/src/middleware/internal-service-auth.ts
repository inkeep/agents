import {
  getLogger,
  isInternalServiceToken,
  verifyInternalServiceAuthHeader,
  validateInternalServiceTenantAccess,
  validateInternalServiceProjectAccess,
  type InternalServiceTokenPayload,
} from '@inkeep/agents-core';
import type { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger('internal-service-auth');

export interface InternalServiceAuthVariables {
  isInternalService: boolean;
  internalServicePayload?: InternalServiceTokenPayload;
}

/**
 * Middleware to authenticate internal service-to-service requests.
 *
 * This middleware:
 * 1. Checks if the Bearer token is an internal service token (by issuer)
 * 2. If so, validates the token and sets context
 * 3. If not an internal service token, calls next() to allow other auth to handle it
 *
 * Use this BEFORE other auth middleware in the chain.
 */
export const internalServiceAuth = () =>
  createMiddleware<{
    Variables: InternalServiceAuthVariables & {
      userId?: string;
      userEmail?: string;
      tenantId?: string;
    };
  }>(async (c, next) => {
    const authHeader = c.req.header('Authorization');

    // No auth header - let other middleware handle it
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      c.set('isInternalService', false);
      await next();
      return;
    }

    const token = authHeader.substring(7);

    // Check if this is an internal service token
    if (!isInternalServiceToken(token)) {
      c.set('isInternalService', false);
      await next();
      return;
    }

    // Verify the internal service token
    const result = await verifyInternalServiceAuthHeader(authHeader);

    if (!result.valid || !result.payload) {
      logger.warn({ error: result.error }, 'Invalid internal service token');
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

    // Set internal service context
    c.set('isInternalService', true);
    c.set('internalServicePayload', result.payload);
    c.set('userId', `service:${result.payload.sub}`);
    c.set('userEmail', `${result.payload.sub}@internal.inkeep`);

    // If token has tenant scope, set it
    if (result.payload.tenantId) {
      c.set('tenantId', result.payload.tenantId);
    }

    await next();
  });

/**
 * Middleware to validate that internal service has access to the requested tenant.
 * Should be used after internalServiceAuth() and after tenant is determined from path/headers.
 *
 * @param getTenantId - Function to extract tenant ID from context (e.g., from params or headers)
 */
export const requireInternalServiceTenantAccess = (getTenantId: (c: Context) => string) =>
  createMiddleware<{
    Variables: InternalServiceAuthVariables;
  }>(async (c, next) => {
    const payload = c.get('internalServicePayload');

    // Not an internal service request - skip this check
    if (!payload) {
      await next();
      return;
    }

    const tenantId = getTenantId(c);

    if (!validateInternalServiceTenantAccess(payload, tenantId)) {
      throw new HTTPException(403, {
        message: 'Access denied: tenant mismatch',
      });
    }

    await next();
  });

/**
 * Middleware to validate that internal service has access to the requested project.
 * Should be used after internalServiceAuth() and after project is determined from path/headers.
 *
 * @param getProjectId - Function to extract project ID from context (e.g., from params or headers)
 */
export const requireInternalServiceProjectAccess = (getProjectId: (c: Context) => string) =>
  createMiddleware<{
    Variables: InternalServiceAuthVariables;
  }>(async (c, next) => {
    const payload = c.get('internalServicePayload');

    // Not an internal service request - skip this check
    if (!payload) {
      await next();
      return;
    }

    const projectId = getProjectId(c);

    if (!validateInternalServiceProjectAccess(payload, projectId)) {
      throw new HTTPException(403, {
        message: 'Access denied: project mismatch',
      });
    }

    await next();
  });

/**
 * Helper to check if current request is from an internal service
 */
export const isInternalServiceRequest = (c: Context): boolean => {
  return c.get('isInternalService') === true;
};

/**
 * Helper to get the internal service payload if present
 */
export const getInternalServicePayload = (c: Context): InternalServiceTokenPayload | undefined => {
  return c.get('internalServicePayload');
};
