import { createApiError, OrgRoles } from '@inkeep/agents-core';
import type { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ManageAppVariables } from '../types';

export const requireWorkspaceAdmin = <
  Env extends { Variables: ManageAppVariables } = { Variables: ManageAppVariables },
>() =>
  createMiddleware<Env>(async (c: Context, next: Next) => {
    const isTestEnvironment = process.env.ENVIRONMENT === 'test';

    if (isTestEnvironment) {
      await next();
      return;
    }

    const userId = c.get('userId');
    const tenantId = c.get('tenantId');
    const tenantRole = c.get('tenantRole');

    if (!userId || !tenantId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'User or organization context not found',
        instance: c.req.path,
      });
    }

    if (userId === 'system' || userId.startsWith('apikey:')) {
      await next();
      return;
    }

    const isAdmin = tenantRole === OrgRoles.OWNER || tenantRole === OrgRoles.ADMIN;

    if (!isAdmin) {
      throw createApiError({
        code: 'forbidden',
        message: 'Only workspace administrators can modify workspace and channel configurations',
        instance: c.req.path,
        extensions: {
          requiredRole: 'admin or owner',
          currentRole: tenantRole,
        },
      });
    }

    await next();
  });
