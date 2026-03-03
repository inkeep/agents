import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AppApiCreationResponseSchema,
  AppApiInsertSchema,
  AppApiUpdateSchema,
  AppListResponse,
  AppResponse,
  commonGetErrorResponses,
  createApiError,
  createApp,
  deleteApp,
  ErrorResponseSchema,
  generateAppCredential,
  generateAppSecret,
  getAppById,
  listAppsPaginated,
  PaginationQueryParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateApp,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'get',
    permission: requireProjectPermission('view'),
    path: '/',
    summary: 'List Apps',
    description: 'List all app credentials for a project with optional pagination and type filter',
    operationId: 'list-apps',
    tags: ['Apps'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema.extend({
        type: z.enum(['web_client', 'api']).optional().describe('Filter by app type'),
      }),
    },
    responses: {
      200: {
        description: 'List of apps retrieved successfully',
        content: {
          'application/json': {
            schema: AppListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);
    const type = c.req.query('type') as 'web_client' | 'api' | undefined;

    const result = await listAppsPaginated(runDbClient)({
      scopes: { tenantId, projectId },
      pagination: { page, limit },
      type,
    });

    const sanitizedData = result.data.map(({ keyHash, tenantId, projectId, ...app }) => app);

    return c.json({
      data: sanitizedData,
      pagination: result.pagination,
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get App',
    description: 'Get a specific app credential by ID',
    operationId: 'get-app-by-id',
    tags: ['Apps'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'App found',
        content: {
          'application/json': {
            schema: AppResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const appRecord = await getAppById(runDbClient)({
      scopes: { tenantId, projectId },
      id,
    });

    if (!appRecord) {
      throw createApiError({
        code: 'not_found',
        message: 'App not found',
      });
    }

    const { keyHash: _, tenantId: __, projectId: ___, ...sanitized } = appRecord;

    return c.json({ data: sanitized });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create App',
    description: 'Create a new app credential. For API type, returns the secret (shown only once).',
    operationId: 'create-app',
    tags: ['Apps'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AppApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'App created successfully',
        content: {
          'application/json': {
            schema: AppApiCreationResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    const credential = generateAppCredential();
    let keyHash: string | undefined;
    let keyPrefix: string | undefined;
    let appSecret: string | undefined;

    if (body.type === 'api') {
      const secretData = await generateAppSecret(credential.publicId);
      keyHash = secretData.keyHash;
      keyPrefix = secretData.keyPrefix;
      appSecret = secretData.secret;
    }

    const result = await createApp(runDbClient)({
      tenantId,
      projectId,
      id: credential.id,
      publicId: credential.publicId,
      name: body.name,
      description: body.description,
      type: body.type,
      agentAccessMode: body.agentAccessMode ?? 'selected',
      allowedAgentIds: body.allowedAgentIds ?? [],
      defaultAgentId: body.defaultAgentId,
      enabled: body.enabled ?? true,
      config: body.config,
      keyHash,
      keyPrefix,
    });

    const { keyHash: _, tenantId: __, projectId: ___, ...sanitized } = result;

    return c.json(
      {
        data: {
          app: sanitized,
          appSecret,
        },
      },
      201
    );
  }
);

app.openapi(
  createProtectedRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update App',
    description: 'Update an app credential configuration',
    operationId: 'update-app',
    tags: ['Apps'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AppApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'App updated successfully',
        content: {
          'application/json': {
            schema: AppResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const updatedApp = await updateApp(runDbClient)({
      scopes: { tenantId, projectId },
      id,
      data: body,
    });

    if (!updatedApp) {
      throw createApiError({
        code: 'not_found',
        message: 'App not found',
      });
    }

    const { keyHash: _, tenantId: __, projectId: ___, ...sanitized } = updatedApp;

    return c.json({ data: sanitized });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete App',
    description: 'Delete an app credential permanently',
    operationId: 'delete-app',
    tags: ['Apps'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      204: {
        description: 'App deleted successfully',
      },
      404: {
        description: 'App not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');

    const deleted = await deleteApp(runDbClient)({
      scopes: { tenantId, projectId },
      id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'App not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
