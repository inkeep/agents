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
  deleteAppForTenant,
  ErrorResponseSchema,
  generateAppCredential,
  getAppByIdForTenant,
  listAppsPaginated,
  PaginationQueryParamsSchema,
  sanitizeAppConfig,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateAppForTenant,
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
    description: 'List all app credentials for a project',
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

    const sanitizedData = result.data.map((app) => sanitizeAppConfig(app));

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
    const { tenantId, id } = c.req.valid('param');
    const appRecord = await getAppByIdForTenant(runDbClient)({
      scopes: { tenantId },
      id,
    });

    if (!appRecord) {
      throw createApiError({
        code: 'not_found',
        message: 'App not found',
      });
    }

    return c.json({ data: sanitizeAppConfig(appRecord) });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create App',
    description: 'Create a new app credential.',
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

    const result = await createApp(runDbClient)({
      ...body,
      tenantId,
      projectId,
      id: credential.id,
      defaultProjectId: body.defaultAgentId ? (body.defaultProjectId ?? projectId) : null,
      enabled: body.enabled ?? true,
    });

    return c.json(
      {
        data: {
          app: sanitizeAppConfig(result),
        },
      },
      201
    );
  }
);

const updateAppRouteConfig = {
  path: '/{id}' as const,
  summary: 'Update App',
  description: 'Update an app credential configuration',
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
};

const updateAppHandler = async (c: any) => {
  const { tenantId, projectId, id } = c.req.valid('param');
  const body = c.req.valid('json');

  const data = { ...body };
  if ('defaultAgentId' in data) {
    data.defaultProjectId = data.defaultAgentId ? (data.defaultProjectId ?? projectId) : null;
  }

  const updatedApp = await updateAppForTenant(runDbClient)({
    scopes: { tenantId },
    id,
    data,
  });

  if (!updatedApp) {
    throw createApiError({
      code: 'not_found',
      message: 'App not found',
    });
  }

  return c.json({ data: sanitizeAppConfig(updatedApp) });
};

app.openapi(
  createProtectedRoute({ ...updateAppRouteConfig, method: 'patch', operationId: 'update-app' }),
  updateAppHandler
);

app.openapi(
  createProtectedRoute({
    ...updateAppRouteConfig,
    method: 'put',
    operationId: 'update-app-put',
    'x-speakeasy-ignore': true,
  }),
  updateAppHandler
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
    const { tenantId, id } = c.req.valid('param');

    const deleted = await deleteAppForTenant(runDbClient)({
      scopes: { tenantId },
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
