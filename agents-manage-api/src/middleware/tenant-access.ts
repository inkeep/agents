import { createApiError, getUserOrganizations } from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import dbClient from '../data/db/dbClient';

export const requireTenantAccess = () =>
  createMiddleware<{
    Variables: {
      userId: string;
      tenantId: string;
      tenantRole: string;
    };
  }>(async (c, next) => {
    const userId = c.get('userId');
    const tenantId = c.req.param('tenantId');

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

    try {
      const userOrganizations = await getUserOrganizations(dbClient)(userId);
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
