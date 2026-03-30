import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  changeProjectRole,
  commonGetErrorResponses,
  createApiError,
  grantProjectAccess,
  listProjectMembers,
  ProjectRoles,
  revokeProjectAccess,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const projectRoleEnum = z.enum([ProjectRoles.ADMIN, ProjectRoles.MEMBER, ProjectRoles.VIEWER]);

const ProjectMemberSchema = z.object({
  userId: z.string().min(1),
  role: projectRoleEnum,
});

const ProjectMemberResponseSchema = z.object({
  data: z.object({
    userId: z.string(),
    role: projectRoleEnum,
    projectId: z.string(),
  }),
});

const ProjectMemberParamsSchema = z.object({
  tenantId: z.string(),
  projectId: z.string(),
});

const ProjectMemberUserParamsSchema = z.object({
  tenantId: z.string(),
  projectId: z.string(),
  userId: z.string(),
});

const UpdateRoleSchema = z.object({
  role: projectRoleEnum,
  previousRole: projectRoleEnum.optional(),
});

// List project members - requires view permission
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Project Members',
    description: 'List all users with explicit project access.',
    operationId: 'list-project-members',
    tags: ['Project Members'],
    permission: requireProjectPermission('view'),
    request: {
      params: ProjectMemberParamsSchema,
    },
    responses: {
      200: {
        description: 'List of project members',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(
                z.object({
                  userId: z.string(),
                  role: projectRoleEnum,
                })
              ),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { projectId, tenantId } = c.req.valid('param');

    const members = await listProjectMembers({ tenantId, projectId });

    return c.json({ data: members });
  }
);

// Middleware: require edit permission for write operations (includes member management)
// Add project member
app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Add Project Member',
    description: 'Add a user to a project with a specified role.',
    operationId: 'add-project-member',
    tags: ['Project Members'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ProjectMemberParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ProjectMemberSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Member added successfully',
        content: {
          'application/json': {
            schema: ProjectMemberResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { projectId, tenantId } = c.req.valid('param');
    const { userId, role } = c.req.valid('json');

    await grantProjectAccess({
      tenantId,
      projectId,
      userId,
      role,
    });

    return c.json(
      {
        data: {
          userId,
          role,
          projectId,
        },
      },
      201
    );
  }
);

// Update project member role
app.openapi(
  createProtectedRoute({
    method: 'patch',
    path: '/{userId}',
    summary: 'Update Project Member Role',
    description:
      "Update a project member's role. Include previousRole to specify which role to revoke.",
    operationId: 'update-project-member',
    tags: ['Project Members'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ProjectMemberUserParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: UpdateRoleSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Member role updated successfully',
        content: {
          'application/json': {
            schema: ProjectMemberResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { projectId, userId, tenantId } = c.req.valid('param');
    const { role: newRole, previousRole } = c.req.valid('json');

    if (!previousRole) {
      throw createApiError({
        code: 'bad_request',
        message: 'previousRole is required to update a member role',
      });
    }

    if (previousRole === newRole) {
      // No change needed
      return c.json({
        data: {
          userId,
          role: newRole,
          projectId,
        },
      });
    }

    await changeProjectRole({
      tenantId,
      projectId,
      userId,
      oldRole: previousRole,
      newRole,
    });

    return c.json({
      data: {
        userId,
        role: newRole,
        projectId,
      },
    });
  }
);

// Remove project member
app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{userId}',
    summary: 'Remove Project Member',
    description:
      'Remove a user from a project. Pass role as query param to specify which role to revoke.',
    operationId: 'remove-project-member',
    tags: ['Project Members'],
    permission: requireProjectPermission('edit'),
    request: {
      params: ProjectMemberUserParamsSchema,
      query: z.object({
        role: projectRoleEnum,
      }),
    },
    responses: {
      204: {
        description: 'Member removed successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { projectId, userId, tenantId } = c.req.valid('param');
    const { role } = c.req.valid('query');

    await revokeProjectAccess({
      tenantId,
      projectId,
      userId,
      role,
    });

    return c.body(null, 204);
  }
);

export default app;
