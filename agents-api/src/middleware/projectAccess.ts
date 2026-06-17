import {
  canEditProject,
  canUseProject,
  canViewProject,
  createApiError,
  type OrgRole,
  type ProjectPermissionLevel,
} from '@inkeep/agents-core';
import { type ProjectScopedMiddleware, registerAuthzMeta } from '@inkeep/agents-core/middleware';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { ManageAppVariables } from '../types/app';

const projectPermissionDescriptions: Record<string, string> = {
  view: 'Requires project view permission (project_viewer+, or org admin/owner)',
  use: 'Requires project use permission (project_member+, or org admin/owner)',
  edit: 'Requires project edit permission (project_admin, or org admin/owner)',
};

/**
 * Middleware to check project-level access.
 */
export const requireProjectPermission = <
  Env extends { Variables: ManageAppVariables } = { Variables: ManageAppVariables },
>(
  permission: ProjectPermissionLevel = 'view'
): ProjectScopedMiddleware<Env> => {
  const mw = createMiddleware<Env>(async (c, next) => {
    const isTestEnvironment = process.env.ENVIRONMENT === 'test';

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
        // For `use`/`edit` failures, distinguish "user can't see the project at
        // all" from "user can see it but lacks the higher permission". If they
        // already have view access, returning "Project not found" is confusing
        // (they're operating inside a project they can see), so return a 403
        // with a clear message instead. We only fall back to the 404 mask when
        // the user genuinely can't view the project, preserving the existing
        // behavior of not leaking project existence to unauthorized users.
        if (permission !== 'view') {
          const canView = await canViewProject({
            userId,
            tenantId,
            projectId,
            orgRole: tenantRole,
          });

          if (canView) {
            throw createApiError({
              code: 'forbidden',
              message: `You do not have permission to ${permission} this project`,
              instance: c.req.path,
            });
          }
        }

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

  registerAuthzMeta(mw, {
    resource: 'project',
    permission,
    description:
      projectPermissionDescriptions[permission] ?? `Requires project ${permission} permission`,
  });
  return mw as ProjectScopedMiddleware<Env>;
};
