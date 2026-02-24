import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  listUserProjectMembershipsInSpiceDb,
  ProjectRoles,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedManageTenantAuth } from '@inkeep/agents-core/middleware';
import type { ManageAppVariables } from '../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const projectRoleEnum = z.enum([ProjectRoles.ADMIN, ProjectRoles.MEMBER, ProjectRoles.VIEWER]);

const UserProjectMembershipParamsSchema = z.object({
  tenantId: z.string(),
  userId: z.string(),
});

// List user's project memberships
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List User Project Memberships',
    description: 'List all projects a user has explicit access to and their role in each.',
    operationId: 'list-user-project-memberships',
    tags: ['User Project Memberships'],
    permission: inheritedManageTenantAuth(),
    request: {
      params: UserProjectMembershipParamsSchema,
    },
    responses: {
      200: {
        description: 'List of project memberships for the user',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(
                z.object({
                  projectId: z.string(),
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
    const { tenantId, userId } = c.req.valid('param');

    const memberships = await listUserProjectMembershipsInSpiceDb({ tenantId, userId });

    return c.json({ data: memberships });
  }
);

export default app;
