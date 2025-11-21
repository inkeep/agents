import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { addUserToOrganization, getUserOrganizations } from '@inkeep/agents-core';
import {
  AddUserToOrganizationRequestSchema,
  AddUserToOrganizationResponseSchema,
  UserOrganizationsResponseSchema,
} from '@inkeep/agents-core/auth/validation';
import type { AppVariables } from '../app';
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

// POST /api/users/:userId/organizations - Add user to organization
userOrganizationsRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['user-organizations'],
    summary: 'Add user to organization',
    description: 'Associate a user with an organization',
    request: {
      params: z.object({
        userId: z.string().describe('User ID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: AddUserToOrganizationRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'User added to organization',
        content: {
          'application/json': {
            schema: AddUserToOrganizationResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { userId } = c.req.valid('param');
    const { organizationId, role } = c.req.valid('json');

    await addUserToOrganization(dbClient)({ userId, organizationId, role });
    return c.json({ organizationId, role, createdAt: new Date().toISOString() }, 201);
  }
);

export default userOrganizationsRoutes;
