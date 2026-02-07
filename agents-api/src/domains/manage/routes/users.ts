import {
  createApiError,
  getUserOrganizationsFromDb,
  getUserProvidersFromDb,
  type OrgRole,
  OrgRoles,
  type UserProviderInfo,
} from '@inkeep/agents-core';
import { Hono } from 'hono';
import runDbClient from '../../../data/db/runDbClient';
import { sessionAuth } from '../../../middleware/sessionAuth';
import type { ManageAppVariables } from '../../../types/app';

const usersRoutes = new Hono<{ Variables: ManageAppVariables }>();

// Require authentication for all routes
usersRoutes.use('*', sessionAuth());

/**
 * GET /api/users/:userId/organizations
 *
 * List all organizations for a user.
 * Only allows querying own organizations.
 */
usersRoutes.get('/:userId/organizations', async (c) => {
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

/**
 * POST /api/users/providers
 *
 * Get authentication providers for a list of users.
 * Returns which providers each user has (e.g., 'credential', 'google', 'auth0').
 * Restricted to org admins/owners querying members of their organization.
 *
 * Body: { userIds: string[], organizationId: string }
 * Response: UserProviderInfo[]
 */
usersRoutes.post('/providers', async (c) => {
  const body = await c.req.json<{ userIds?: string[]; organizationId?: string }>();
  const { userIds, organizationId } = body;
  // sessionAuth middleware guarantees userId is set
  const authenticatedUserId = c.get('userId') as string;

  if (!organizationId) {
    throw createApiError({
      code: 'bad_request',
      message: 'organizationId is required',
    });
  }

  if (!userIds || !Array.isArray(userIds)) {
    throw createApiError({
      code: 'bad_request',
      message: 'userIds array is required',
    });
  }

  if (userIds.length === 0) {
    return c.json([] as UserProviderInfo[]);
  }

  const userOrgs = await getUserOrganizationsFromDb(runDbClient)(authenticatedUserId);
  const orgAccess = userOrgs.find((org) => org.organizationId === organizationId);

  if (!orgAccess) {
    throw createApiError({
      code: 'forbidden',
      message: 'Access denied to this organization',
    });
  }

  const role = orgAccess.role as OrgRole;
  if (role !== OrgRoles.ADMIN && role !== OrgRoles.OWNER) {
    throw createApiError({
      code: 'forbidden',
      message: 'Admin access required',
    });
  }

  try {
    const providers = await getUserProvidersFromDb(runDbClient)(userIds);
    return c.json(providers);
  } catch (error) {
    console.error('[users/providers] Error fetching providers:', error);
    throw createApiError({
      code: 'internal_server_error',
      message: 'Failed to fetch user providers',
    });
  }
});

export default usersRoutes;
