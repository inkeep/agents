import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getUserOrganizations } from '@inkeep/agents-core';
import { UserOrganizationsResponseSchema } from '@inkeep/agents-core/auth/validation';
import type { AppVariables } from '../create-app';
import dbClient from '../data/db/dbClient';

const userOrganizationsRoutes = new OpenAPIHono<{ Variables: AppVariables }>();

// GET /api/users/:userId/organizations - List all organizations for a user
userOrganizationsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['user-organizations'],
    summary: 'List user organizations',
    description: 'Get all organizations associated with a user',
    request: {
      params: z.object({
        userId: z.string().describe('User ID'),
      }),
    },
    responses: {
      200: {
        description: 'List of user organizations',
        content: {
          'application/json': {
            schema: UserOrganizationsResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { userId } = c.req.valid('param');
    const orgs = await getUserOrganizations(dbClient)(userId);
    // Transform Date to string for API response
    const userOrganizations = orgs.map((org) => ({
      ...org,
      createdAt: org.createdAt.toISOString(),
    }));
    return c.json(userOrganizations);
  }
);

export default userOrganizationsRoutes;
