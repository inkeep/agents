import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  checkBulkPermissions,
  commonGetErrorResponses,
  createApiError,
  type OrgRole,
  OrgRoles,
  SpiceDbProjectPermissions,
  SpiceDbResourceTypes,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { requireProjectPermission } from '../../../middleware/projectAccess';
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
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'Get Project Permissions',
    description:
      "Get the current user's permissions for a project. Returns which actions the user can perform.",
    operationId: 'get-project-permissions',
    tags: ['Project Permissions'],
    permission: requireProjectPermission('view'),
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
    const { projectId } = c.req.valid('param');
    const userId = c.get('userId');
    const tenantRole = c.get('tenantRole') as OrgRole;
    const isTestEnvironment = process.env.ENVIRONMENT === 'test';

    if (isTestEnvironment) {
      return c.json({
        data: {
          canView: true,
          canUse: true,
          canEdit: true,
        },
      });
    }

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
