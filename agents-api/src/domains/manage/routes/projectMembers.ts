import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  changeProjectRole,
  commonGetErrorResponses,
  createApiError,
  grantProjectAccess,
  listProjectMembers,
  ProjectRoles,
  revokeProjectAccess,
} from '@inkeep/agents-core';
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
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Project Members',
    description: 'List all users with explicit project access. Requires authz to be enabled.',
    operationId: 'list-project-members',
    tags: ['Project Members'],
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
app.use('/*', async (c, next) => {
  // GET requests don't need edit permission (handled above)
  if (c.req.method === 'GET') {
    return next();
  }
  return requireProjectPermission('edit')(c, next);
});

// Add project member
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Add Project Member',
    description: 'Add a user to a project with a specified role. Requires authz to be enabled.',
    operationId: 'add-project-member',
    tags: ['Project Members'],
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
  createRoute({
    method: 'patch',
    path: '/{userId}',
    summary: 'Update Project Member Role',
    description:
      "Update a project member's role. Requires authz to be enabled. Include previousRole to specify which role to revoke.",
    operationId: 'update-project-member',
    tags: ['Project Members'],
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
  createRoute({
    method: 'delete',
    path: '/{userId}',
    summary: 'Remove Project Member',
    description:
      'Remove a user from a project. Requires authz to be enabled. Pass role as query param to specify which role to revoke.',
    operationId: 'remove-project-member',
    tags: ['Project Members'],
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
