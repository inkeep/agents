import { OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  getUserProfile,
  TenantUserIdParamsSchema,
  UserProfileApiSelectSchema,
  UserProfileApiUpdateSchema,
  upsertUserProfile,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedManageTenantAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import type { ManageAppVariables } from '../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

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
      params: TenantUserIdParamsSchema,
    },
    responses: {
      200: {
        description: 'User profile',
        content: {
          'application/json': {
            schema: UserProfileApiSelectSchema,
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

    // If the profile does not exist then we should create it
    if (!profile) {
      const newProfile = await upsertUserProfile(runDbClient)(userId, {
        timezone: null,
        attributes: {},
      });
      return c.json(newProfile, 200);
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

app.openapi(
  createProtectedRoute({
    method: 'put',
    path: '/{userId}/profile',
    summary: 'Upsert User Profile',
    description:
      'Create or update the profile for a specific user. Users can only update their own profile.',
    operationId: 'upsert-user-profile',
    tags: ['User Profile'],
    permission: inheritedManageTenantAuth(),
    request: {
      params: TenantUserIdParamsSchema,
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
            schema: UserProfileApiSelectSchema,
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
        message: "Cannot update another user's profile",
      });
    }

    const body = c.req.valid('json');

    const updated = await upsertUserProfile(runDbClient)(userId, {
      timezone: body.timezone,
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
  }
);

export default app;
