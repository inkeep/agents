import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AddPublicKeyRequestSchema,
  commonGetErrorResponses,
  createApiError,
  getAppAuthKeysForProject,
  PublicKeyListResponseSchema,
  PublicKeyResponseSchema,
  TenantProjectParamsSchema,
  updateAppAuthKeysForProject,
  validatePublicKey,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';

const AppAuthKeyParamsSchema = TenantProjectParamsSchema.extend({
  appId: z.string().min(1),
});

const AppAuthKeyWithKidParamsSchema = AppAuthKeyParamsSchema.extend({
  kid: z.string().min(1),
});

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Public Keys',
    description: 'List all public keys configured for app authentication',
    operationId: 'list-app-auth-keys',
    tags: ['Apps'],
    permission: requireProjectPermission('view'),
    request: {
      params: AppAuthKeyParamsSchema,
    },
    responses: {
      200: {
        description: 'List of public keys',
        content: {
          'application/json': {
            schema: PublicKeyListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, appId } = c.req.valid('param');

    const appRecord = await getAppAuthKeysForProject(runDbClient)({
      scopes: { tenantId, projectId },
      id: appId,
    });

    if (!appRecord) {
      throw createApiError({ code: 'not_found', message: 'App not found' });
    }

    if (appRecord.config.type !== 'web_client') {
      throw createApiError({
        code: 'bad_request',
        message: 'Auth keys are only supported for web_client apps',
      });
    }

    const publicKeys = appRecord.config.webClient.auth?.publicKeys ?? [];
    return c.json({ data: publicKeys });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Add Public Key',
    description: 'Add a public key for app authentication',
    operationId: 'create-app-auth-key',
    tags: ['Apps'],
    permission: requireProjectPermission('edit'),
    request: {
      params: AppAuthKeyParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AddPublicKeyRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Public key added',
        content: {
          'application/json': {
            schema: PublicKeyResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, appId } = c.req.valid('param');
    const { kid, publicKey, algorithm } = c.req.valid('json');

    const appRecord = await getAppAuthKeysForProject(runDbClient)({
      scopes: { tenantId, projectId },
      id: appId,
    });

    if (!appRecord) {
      throw createApiError({ code: 'not_found', message: 'App not found' });
    }

    if (appRecord.config.type !== 'web_client') {
      throw createApiError({
        code: 'bad_request',
        message: 'Auth keys are only supported for web_client apps',
      });
    }

    const existingKeys = appRecord.config.webClient.auth?.publicKeys ?? [];

    if (existingKeys.some((k) => k.kid === kid)) {
      throw createApiError({
        code: 'conflict',
        message: `A key with kid "${kid}" already exists on this app`,
      });
    }

    const validationResult = await validatePublicKey(publicKey, algorithm);
    if (!validationResult.valid) {
      throw createApiError({
        code: 'bad_request',
        message: validationResult.error,
      });
    }

    const newKey = {
      kid,
      publicKey,
      algorithm,
      addedAt: new Date().toISOString(),
    };

    const updatedKeys = [...existingKeys, newKey];
    const updatedAuth = {
      ...appRecord.config.webClient.auth,
      allowAnonymous: appRecord.config.webClient.auth?.allowAnonymous ?? false,
      publicKeys: updatedKeys,
    };

    await updateAppAuthKeysForProject(runDbClient)({
      scopes: { tenantId, projectId },
      id: appId,
      config: {
        type: 'web_client',
        webClient: {
          ...appRecord.config.webClient,
          auth: updatedAuth,
        },
      },
    });

    return c.json({ data: newKey }, 201);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{kid}',
    summary: 'Delete Public Key',
    description: 'Remove a public key by kid',
    operationId: 'delete-app-auth-key',
    tags: ['Apps'],
    permission: requireProjectPermission('edit'),
    request: {
      params: AppAuthKeyWithKidParamsSchema,
    },
    responses: {
      204: {
        description: 'Public key deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, appId, kid } = c.req.valid('param');

    const appRecord = await getAppAuthKeysForProject(runDbClient)({
      scopes: { tenantId, projectId },
      id: appId,
    });

    if (!appRecord) {
      throw createApiError({ code: 'not_found', message: 'App not found' });
    }

    if (appRecord.config.type !== 'web_client') {
      throw createApiError({
        code: 'bad_request',
        message: 'Auth keys are only supported for web_client apps',
      });
    }

    const existingKeys = appRecord.config.webClient.auth?.publicKeys ?? [];
    const keyIndex = existingKeys.findIndex((k) => k.kid === kid);

    if (keyIndex === -1) {
      throw createApiError({
        code: 'not_found',
        message: `Key with kid "${kid}" not found`,
      });
    }

    const updatedKeys = existingKeys.filter((k) => k.kid !== kid);
    const updatedAuth = {
      ...appRecord.config.webClient.auth,
      allowAnonymous: appRecord.config.webClient.auth?.allowAnonymous ?? false,
      publicKeys: updatedKeys,
    };

    await updateAppAuthKeysForProject(runDbClient)({
      scopes: { tenantId, projectId },
      id: appId,
      config: {
        type: 'web_client',
        webClient: {
          ...appRecord.config.webClient,
          auth: updatedAuth,
        },
      },
    });

    return c.body(null, 204);
  }
);

const UpdateAuthSettingsRequestSchema = z
  .object({
    allowAnonymous: z
      .boolean()
      .describe('Whether anonymous access is allowed when JWT verification fails'),
  })
  .openapi('UpdateAuthSettingsRequest');

const AuthSettingsResponseSchema = z
  .object({
    data: z.object({
      allowAnonymous: z.boolean(),
    }),
  })
  .openapi('AuthSettingsResponse');

app.openapi(
  createProtectedRoute({
    method: 'patch',
    path: '/settings',
    summary: 'Update Auth Settings',
    description: 'Update authentication settings for a web client app',
    operationId: 'update-app-auth-settings',
    tags: ['Apps'],
    permission: requireProjectPermission('edit'),
    request: {
      params: AppAuthKeyParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: UpdateAuthSettingsRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Auth settings updated',
        content: {
          'application/json': {
            schema: AuthSettingsResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, appId } = c.req.valid('param');
    const { allowAnonymous } = c.req.valid('json');

    const appRecord = await getAppAuthKeysForProject(runDbClient)({
      scopes: { tenantId, projectId },
      id: appId,
    });

    if (!appRecord) {
      throw createApiError({ code: 'not_found', message: 'App not found' });
    }

    if (appRecord.config.type !== 'web_client') {
      throw createApiError({
        code: 'bad_request',
        message: 'Auth settings are only supported for web_client apps',
      });
    }

    const existingAuth = appRecord.config.webClient.auth;
    const updatedAuth = {
      ...existingAuth,
      publicKeys: existingAuth?.publicKeys ?? [],
      allowAnonymous,
    };

    await updateAppAuthKeysForProject(runDbClient)({
      scopes: { tenantId, projectId },
      id: appId,
      config: {
        type: 'web_client',
        webClient: {
          ...appRecord.config.webClient,
          auth: updatedAuth,
        },
      },
    });

    return c.json({ data: { allowAnonymous } });
  }
);

export default app;
