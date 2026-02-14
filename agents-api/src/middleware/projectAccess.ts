import {
  canEditProject,
  canUseProject,
  canViewProject,
  createApiError,
  type OrgRole,
  type ProjectPermissionLevel,
} from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { ManageAppVariables } from '../types/app';

/**
 * Middleware to check project-level access.
 */
export const requireProjectPermission = <
  Env extends { Variables: ManageAppVariables } = { Variables: ManageAppVariables },
>(
  permission: ProjectPermissionLevel = 'view'
) =>
  createMiddleware<Env>(async (c, next) => {
    const isTestEnvironment = process.env.ENVIRONMENT === 'test';

    // Skip checks in test environment or when auth is disabled
    if (isTestEnvironment) {
      await next();
      return;
    }

    const userId = c.get('userId');
    const tenantId = c.get('tenantId');
    const tenantRole = c.get('tenantRole') as OrgRole;
    const projectId = c.req.param('projectId') || c.req.param('id');

    if (!userId || !tenantId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'User or organization context not found',
        instance: c.req.path,
      });
    }

    if (!projectId) {
      throw createApiError({
        code: 'bad_request',
        message: 'Project ID is required',
        instance: c.req.path,
      });
    }

    // System users and API key users bypass project access checks
    // They have full access within their authorized scope (enforced by tenant-access middleware)
    if (userId === 'system' || userId.startsWith('apikey:')) {
      await next();
      return;
    }

    try {
      let hasAccess = false;

      switch (permission) {
        case 'view':
          hasAccess = await canViewProject({
            userId,
            tenantId,
            projectId,
            orgRole: tenantRole,
          });
          break;
        case 'use':
          hasAccess = await canUseProject({
            userId,
            tenantId,
            projectId,
            orgRole: tenantRole,
          });
          break;
        case 'edit':
          hasAccess = await canEditProject({
            userId,
            tenantId,
            projectId,
            orgRole: tenantRole,
          });
          break;
      }

      if (!hasAccess) {
        throw createApiError({
          code: 'not_found',
          message: 'Project not found',
          instance: c.req.path,
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
        message: 'Failed to verify project access',
        instance: c.req.path,
        extensions: {
          internalError: errorMessage,
        },
      });
    }
  });
