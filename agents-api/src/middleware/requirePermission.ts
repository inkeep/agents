import { createApiError, OrgRoles } from '@inkeep/agents-core';
import { adminRole, memberRole, ownerRole } from '@inkeep/agents-core/auth/permissions';
import { registerAuthzMeta } from '@inkeep/agents-core/middleware';
import { createMiddleware } from 'hono/factory';
import { getLogger } from '../logger';
import type { ManageAppVariables } from '../types/app';

const permLogger = getLogger('require-permission');

type Permission = {
  [resource: string]: string | string[];
};

type RoleLike = {
  authorize: (request: Record<string, string[]>) => { success: boolean; error?: string };
};

// The SAME access-control role definitions that are wired into better-auth's organization
// plugin (packages/agents-core/src/auth/permissions.ts → auth.ts `roles: { member, admin, owner }`).
// Evaluating `role.authorize(permissions)` is exactly what `auth.api.hasPermission` does
// internally — minus the better-auth session lookup. By checking the role that
// `requireTenantAccess` already resolved (and which it only sets after enforcing membership
// against the DB), authorization becomes session-independent and works for ANY authenticated
// principal — a better-auth session (manage UI) OR an OAuth user JWT (MCP). Same RBAC source,
// no degradation; fail-closed on an unknown/missing role.
const ROLE_OBJECTS: Record<string, RoleLike> = {
  [OrgRoles.MEMBER]: memberRole as unknown as RoleLike,
  [OrgRoles.ADMIN]: adminRole as unknown as RoleLike,
  [OrgRoles.OWNER]: ownerRole as unknown as RoleLike,
};

export const requirePermission = <
  Env extends { Variables: ManageAppVariables } = { Variables: ManageAppVariables },
>(
  permissions: Permission
) => {
  const mw = createMiddleware<Env>(async (c, next) => {
    const isTestEnvironment = process.env.ENVIRONMENT === 'test';

    const auth = c.get('auth');

    if (isTestEnvironment || !auth) {
      await next();
      return;
    }

    const userId = c.get('userId');
    const tenantId = c.get('tenantId');
    const tenantRole = c.get('tenantRole');

    // System users and API key users bypass permission checks.
    // They have full access within their authorized scope (enforced by tenant-access middleware).
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
          permissions,
          context: {
            hasUserId: !!userId,
            hasTenantId: !!tenantId,
          },
        },
      });
    }

    // Normalize to arrays for the access-control request shape (`{ project: ['create'] }`).
    const request: Record<string, string[]> = {};
    for (const [resource, actions] of Object.entries(permissions)) {
      request[resource] = Array.isArray(actions) ? actions : [actions];
    }

    const roleObj = tenantRole ? ROLE_OBJECTS[tenantRole] : undefined;
    const authorized = roleObj?.authorize(request)?.success === true;

    if (!authorized) {
      permLogger.debug(
        { path: c.req.path, userId, tenantId, tenantRole: tenantRole ?? null, permissions },
        'requirePermission: denied'
      );
      throw createApiError({
        code: 'forbidden',
        message: 'Permission denied. Required: organization admin.',
        instance: c.req.path,
        extensions: {
          permissions,
          context: {
            userId,
            organizationId: tenantId,
            currentRole: tenantRole || 'unknown',
          },
        },
      });
    }

    await next();
  });
  registerAuthzMeta(mw, {
    resource: 'organization',
    permission: 'admin',
    description: 'Requires organization admin role',
  });
  return mw;
};
