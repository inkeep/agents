import { OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  getUserProfile,
  UserIdParamsSchema,
  UserProfileApiUpdateSchema,
  UserProfileSelectSchema,
  upsertUserProfile,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedManageTenantAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { manageBearerOrSessionAuth } from '../../../middleware/manageAuth';
import type { ManageAppVariables } from '../../../types/app';
import {
  type ManageRouteHandler,
  openapiRegisterPutPatchRoutesForLegacy,
} from '../../../utils/openapiDualRoute';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

// Accept the OAuth/MCP bearer JWT as well as a session cookie. manageBearerAuth sets
// c.get('userId') from the JWT `sub`, so the per-route ownership check below still holds.
// (Session-only auth here 401'd every OAuth/MCP caller before reaching that check.)
app.use('*', manageBearerOrSessionAuth());

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{userId}/profile',
    summary: 'Get User Profile',
    description: 'Get the profile for a specific user. Users can only access their own profile.',
    operationId: 'get-user-profile',
    tags: ['User Profile'],
    permission: inheritedManageTenantAuth(),
    request: {
      params: UserIdParamsSchema,
    },
    responses: {
      200: {
        description: 'User profile',
        content: {
          'application/json': {
            schema: UserProfileSelectSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { userId } = c.req.valid('param');
    const authenticatedUserId = c.get('userId') as string;

    if (userId !== authenticatedUserId) {
      throw createApiError({
        code: 'forbidden',
        message: "Cannot access another user's profile",
      });
    }

    const profile = await getUserProfile(runDbClient)(userId);

    if (!profile) {
      throw createApiError({
        code: 'not_found',
        message: 'User profile not found',
      });
    }

    return c.json(
      {
        id: profile.id,
        userId: profile.userId,
        timezone: profile.timezone,
        attributes: profile.attributes ?? {},
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
      200
    );
  }
);

const upsertUserProfileRouteConfig = {
  path: '/{userId}/profile' as const,
  summary: 'Upsert User Profile',
  description:
    'Create or update the profile for a specific user. Users can only update their own profile.',
  tags: ['User Profile'],
  permission: inheritedManageTenantAuth(),
  request: {
    params: UserIdParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: UserProfileApiUpdateSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated user profile',
      content: {
        'application/json': {
          schema: UserProfileSelectSchema,
        },
      },
    },
    ...commonGetErrorResponses,
  },
};

const upsertUserProfileHandler: ManageRouteHandler<typeof upsertUserProfileRouteConfig> = async (
  c
) => {
  const { userId } = c.req.valid('param');
  const authenticatedUserId = c.get('userId') as string;

  if (userId !== authenticatedUserId) {
    throw createApiError({
      code: 'forbidden',
      message: "Cannot update another user's profile",
    });
  }

  const body = c.req.valid('json');

  const updated = await upsertUserProfile(runDbClient)(userId, {
    ...body,
    attributes: body.attributes ?? {},
  });

  return c.json(
    {
      id: updated.id,
      userId: updated.userId,
      timezone: updated.timezone,
      attributes: updated.attributes ?? {},
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
    200
  );
};

openapiRegisterPutPatchRoutesForLegacy(
  app,
  upsertUserProfileRouteConfig,
  upsertUserProfileHandler,
  { operationId: 'upsert-user-profile' }
);

export default app;
