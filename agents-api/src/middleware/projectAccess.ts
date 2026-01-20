import {
  canEditProject,
  canUseProject,
  canViewProject,
  createApiError,
  isAuthzEnabled,
  type OrgRole,
} from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { env } from '../env';
import type { ManageAppVariables } from '../types/app';

/**
 * Permission levels for project access
 *
 * - view: Can see project and resources (read-only)
 * - use: Can invoke agents, create API keys, view traces
 * - edit: Can modify configurations and manage members
 */
export type ProjectPermission = 'view' | 'use' | 'edit';

/**
 * Middleware to check project-level access.
 *
 * When ENABLE_AUTHZ is false:
 * - 'view' permission: all org members can view
 * - 'edit': only org owner/admin
 *
 * When ENABLE_AUTHZ is true:
 * - Uses SpiceDB to check permissions
 * - Org owner/admin bypass (handled in canViewProject etc.)
 */
export const requireProjectPermission = <
  Env extends { Variables: ManageAppVariables } = { Variables: ManageAppVariables },
>(
  permission: ProjectPermission = 'view'
) =>
  createMiddleware<Env>(async (c, next) => {
    const isTestEnvironment = process.env.ENVIRONMENT === 'test';

    // Skip checks in test environment or when auth is disabled
    if (env.DISABLE_AUTH || isTestEnvironment) {
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
            tenantId,
            userId,
            projectId,
            orgRole: tenantRole,
          });
          break;
        case 'use':
          hasAccess = await canUseProject({
            tenantId,
            userId,
            projectId,
            orgRole: tenantRole,
          });
          break;
        case 'edit':
          hasAccess = await canEditProject({
            tenantId,
            userId,
            projectId,
            orgRole: tenantRole,
          });
          break;
      }

      if (!hasAccess) {
        // When authz is enabled, check if user can at least view the project
        // If they can view but not perform the requested action, return 403
        // If they can't even view, return 404 to not reveal project existence
        if (isAuthzEnabled(tenantId) && permission !== 'view') {
          const canView = await canViewProject({
            tenantId,
            userId,
            projectId,
            orgRole: tenantRole,
          });

          if (canView) {
            // User can see the project but lacks the specific permission
            throw createApiError({
              code: 'forbidden',
              message: `Permission denied. Required: project:${permission}`,
              instance: c.req.path,
              extensions: {
                requiredPermissions: [`project:${permission}`],
              },
            });
          }
        }

        // User can't view the project, or authz is disabled
        if (isAuthzEnabled(tenantId)) {
          throw createApiError({
            code: 'not_found',
            message: 'Project not found',
            instance: c.req.path,
          });
        }

        // When authz is disabled, return 403
        throw createApiError({
          code: 'forbidden',
          message: `Permission denied. Required: project:${permission}`,
          instance: c.req.path,
          extensions: {
            requiredPermissions: [`project:${permission}`],
            context: {
              userId,
              organizationId: tenantId,
              projectId,
              currentRole: tenantRole,
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
        message: 'Failed to verify project access',
        instance: c.req.path,
        extensions: {
          internalError: errorMessage,
        },
      });
    }
  });
