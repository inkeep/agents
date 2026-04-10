import { createApiError, getUserOrganizationsFromDb, OrgRoles } from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import runDbClient from '../data/db/runDbClient';
import { env } from '../env';

/**
 * Middleware to enforce tenant access control.
 * Verifies that the authenticated user has access to the requested tenant/organization.
 *
 * Access rules:
 * - Test environment: Grants anonymous owner access (bypasses all checks)
 * - System user (bypass auth): Full access to all tenants
 * - API key user: Access only to the tenant associated with the API key
 * - Session user: Access based on organization membership
 */
export const requireTenantAccess = () =>
  createMiddleware<{
    Variables: {
      userId: string;
      tenantId: string;
      tenantRole: string;
    };
  }>(async (c, next) => {
    const tenantId = c.req.param('tenantId');

    if (env.ENVIRONMENT === 'test') {
      if (tenantId) {
        c.set('tenantId', tenantId);
        c.set('userId', 'anonymous');
        c.set('tenantRole', OrgRoles.OWNER);
      }
      await next();
      return;
    }

    const userId = c.get('userId');

    if (!userId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'User ID not found',
      });
    }

    if (!tenantId) {
      throw createApiError({
        code: 'bad_request',
        message: 'Organization ID is required',
      });
    }

    // System user (bypass authentication) has access to all tenants
    if (userId === 'system') {
      c.set('tenantId', tenantId);
      c.set('tenantRole', OrgRoles.OWNER);
      await next();
      return;
    }

    // API key authentication - validate tenant matches the key's tenant
    if (userId.startsWith('apikey:')) {
      const apiKeyTenantId = c.get('tenantId');
      if (apiKeyTenantId && apiKeyTenantId !== tenantId) {
        throw createApiError({
          code: 'forbidden',
          message: 'API key does not have access to this organization',
        });
      }
      c.set('tenantId', tenantId);
      c.set('tenantRole', OrgRoles.OWNER); // API keys have full access to their tenant
      await next();
      return;
    }

    try {
      const userOrganizations = await getUserOrganizationsFromDb(runDbClient)(userId);
      const organizationAccess = userOrganizations.find((org) => org.organizationId === tenantId);

      if (!organizationAccess) {
        throw createApiError({
          code: 'forbidden',
          message: 'Access denied to this organization',
        });
      }

      c.set('tenantId', tenantId);
      c.set('tenantRole', organizationAccess.role);

      await next();
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to verify organization access',
      });
    }
  });
