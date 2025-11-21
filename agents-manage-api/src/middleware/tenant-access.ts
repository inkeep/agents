import { getUserOrganizations } from '@inkeep/agents-core';
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
      throw new HTTPException(401, {
        message: 'Unauthorized - User ID not found',
      });
    }

    if (!tenantId) {
      throw new HTTPException(400, {
        message: 'Bad Request - Organization ID is required',
      });
    }

    try {
      const userOrganizations = await getUserOrganizations(dbClient)(userId);
      const organizationAccess = userOrganizations.find(
        (org) => org.organizationId === tenantId
      );

      if (!organizationAccess) {
        throw new HTTPException(403, {
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

      throw new HTTPException(500, {
        message: 'Failed to verify organization access',
      });
    }
  });

