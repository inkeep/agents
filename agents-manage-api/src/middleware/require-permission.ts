import { createApiError } from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { env } from '../env';
import { auth } from '../index';

type Permission = {
  [resource: string]: string | string[];
};

type MinimalAuthVariables = {
  Variables: {
    userId: string;
    userEmail: string;
    tenantId: string;
    tenantRole: string;
  };
};

export const requirePermission = <Env extends MinimalAuthVariables = MinimalAuthVariables>(
  permissions: Permission
) =>
  createMiddleware<Env>(async (c, next) => {
    // Use process.env directly to support test environment variables set after module load
    const isTestEnvironment = process.env.ENVIRONMENT === 'test';
    
    if (env.DISABLE_AUTH || isTestEnvironment || !auth) {
      await next();
      return;
    }

    const userId = c.get('userId');
    const tenantId = c.get('tenantId');

    if (!userId || !tenantId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'User or organization not found',
      });
    }

    try {
      const result = await auth.api.hasPermission({
        body: {
          permissions,
          organizationId: tenantId,
        },
        headers: c.req.raw.headers,
      });

      if (!result || !result.success) {
        throw createApiError({
          code: 'forbidden',
          message: 'You do not have the required permissions to perform this action',
        });
      }

      await next();
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to verify permissions',
      });
    }
  });
