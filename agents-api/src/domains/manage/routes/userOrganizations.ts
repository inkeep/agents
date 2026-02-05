import { createApiError, getUserOrganizationsFromDb } from '@inkeep/agents-core';
import { Hono } from 'hono';
import runDbClient from '../../../data/db/runDbClient';
import { sessionAuth } from '../../../middleware/sessionAuth';
import type { ManageAppVariables } from '../../../types/app';

const userOrganizationsRoutes = new Hono<{ Variables: ManageAppVariables }>();

// Require authentication for all routes
userOrganizationsRoutes.use('*', sessionAuth());

// GET /api/users/:userId/organizations - List all organizations for a user
// Internal route - not exposed in OpenAPI spec
userOrganizationsRoutes.get('/', async (c) => {
  const userId = c.req.param('userId');
  const authenticatedUserId = c.get('userId');

  if (!userId) {
    throw createApiError({
      code: 'bad_request',
      message: 'User ID is required',
    });
  }

  // Only allow querying own organizations
  if (userId !== authenticatedUserId) {
    throw createApiError({
      code: 'forbidden',
      message: "Cannot access another user's organizations",
    });
  }

  const orgs = await getUserOrganizationsFromDb(runDbClient)(userId);
  // Transform Date to string for API response
  const userOrganizations = orgs.map((org) => ({
    ...org,
    createdAt: org.createdAt.toISOString(),
  }));
  return c.json(userOrganizations);
});

export default userOrganizationsRoutes;
