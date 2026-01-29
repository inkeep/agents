import { createApiError } from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { ManageAppVariables } from '../types/app';

type Permission = {
  [resource: string]: string | string[];
};

function formatPermissionsForDisplay(permissions: Permission): string[] {
  const formatted: string[] = [];
  for (const [resource, actions] of Object.entries(permissions)) {
    const actionList = Array.isArray(actions) ? actions : [actions];
    for (const action of actionList) {
      formatted.push(`${resource}:${action}`);
    }
  }
  return formatted;
}

export const requirePermission = <
  Env extends { Variables: ManageAppVariables } = { Variables: ManageAppVariables },
>(
  permissions: Permission
) =>
  createMiddleware<Env>(async (c, next) => {
    const isTestEnvironment = process.env.ENVIRONMENT === 'test';

    const auth = c.get('auth');

    if (isTestEnvironment || !auth) {
      await next();
      return;
    }

    const userId = c.get('userId');
    const tenantId = c.get('tenantId');
    const tenantRole = c.get('tenantRole');
    const requiredPermissions = formatPermissionsForDisplay(permissions);

    // System users and API key users bypass permission checks
    // They have full access within their authorized scope (enforced by tenant-access middleware)
    if (userId === 'system' || userId?.startsWith('apikey:')) {
      await next();
      return;
    }

    if (!userId || !tenantId) {
      throw createApiError({
        code: 'unauthorized',
        message:
          'User or organization context not found. Ensure you are authenticated and belong to an organization.',
        instance: c.req.path,
        extensions: {
          requiredPermissions,
          context: {
            hasUserId: !!userId,
            hasTenantId: !!tenantId,
          },
        },
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
          message: `Permission denied. Required: ${requiredPermissions.join(', ')}`,
          instance: c.req.path,
          extensions: {
            requiredPermissions,
            context: {
              userId,
              organizationId: tenantId,
              currentRole: tenantRole || 'unknown',
            },
          },
        });
      }

      await next();
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to verify permissions',
        instance: c.req.path,
        extensions: {
          requiredPermissions,
          internalError: errorMessage,
        },
      });
    }
  });
