import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  checkBulkPermissions,
  commonGetErrorResponses,
  createApiError,
  isAuthzEnabled,
  type OrgRole,
  OrgRoles,
  SpiceDbProjectPermissions,
  SpiceDbResourceTypes,
} from '@inkeep/agents-core';
import type { ManageAppVariables } from '../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const ProjectPermissionsParamsSchema = z.object({
  tenantId: z.string(),
  projectId: z.string(),
});

const ProjectPermissionsResponseSchema = z.object({
  data: z.object({
    canView: z.boolean(),
    canUse: z.boolean(),
    canEdit: z.boolean(),
  }),
});

// Get project permissions for the current user
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'Get Project Permissions',
    description:
      "Get the current user's permissions for a project. Returns which actions the user can perform.",
    operationId: 'get-project-permissions',
    tags: ['Project Permissions'],
    request: {
      params: ProjectPermissionsParamsSchema,
    },
    responses: {
      200: {
        description: 'Project permissions for the current user',
        content: {
          'application/json': {
            schema: ProjectPermissionsResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { projectId, tenantId } = c.req.valid('param');
    const userId = c.get('userId');
    const tenantRole = c.get('tenantRole') as OrgRole;

    // Fast path: Org owner/admin has all permissions (bypass SpiceDB)
    if (tenantRole === OrgRoles.OWNER || tenantRole === OrgRoles.ADMIN) {
      return c.json({
        data: {
          canView: true,
          canUse: true,
          canEdit: true,
        },
      });
    }

    // Fast path: Authz disabled, use legacy behavior
    if (!isAuthzEnabled(tenantId)) {
      // When authz is disabled, all org members can view/use, only owner/admin can edit
      return c.json({
        data: {
          canView: true,
          canUse: true,
          canEdit: false, // Only owner/admin can edit, handled above
        },
      });
    }

    if (!userId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'User not found',
      });
    }

    // Use bulk permission check - single gRPC call for all permissions
    const permissions = await checkBulkPermissions({
      resourceType: SpiceDbResourceTypes.PROJECT,
      resourceId: projectId,
      permissions: [
        SpiceDbProjectPermissions.VIEW,
        SpiceDbProjectPermissions.USE,
        SpiceDbProjectPermissions.EDIT,
      ],
      subjectType: SpiceDbResourceTypes.USER,
      subjectId: userId,
    });

    return c.json({
      data: {
        canView: permissions[SpiceDbProjectPermissions.VIEW] ?? false,
        canUse: permissions[SpiceDbProjectPermissions.USE] ?? false,
        canEdit: permissions[SpiceDbProjectPermissions.EDIT] ?? false,
      },
    });
  }
);

export default app;
