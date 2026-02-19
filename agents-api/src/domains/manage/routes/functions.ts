import { OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  deleteFunction,
  FunctionApiInsertSchema,
  FunctionApiUpdateSchema,
  FunctionListResponse,
  FunctionResponse,
  generateId,
  getFunction,
  listFunctionsPaginated,
  PaginationQueryParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  upsertFunction,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const logger = getLogger('functions');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Functions',
    operationId: 'list-functions',
    tags: ['Functions'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of functions',
        content: {
          'application/json': {
            schema: FunctionListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    try {
      const result = await listFunctionsPaginated(db)({
        scopes: { tenantId, projectId },
        pagination: { page, limit },
      });

      return c.json(result) as any;
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to list functions');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to list functions' }),
        500
      ) as any;
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}',
    permission: requireProjectPermission('view'),
    summary: 'Get Function by ID',
    operationId: 'get-function',
    tags: ['Functions'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Function details',
        content: {
          'application/json': {
            schema: FunctionResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');

    try {
      // Functions are project-scoped
      const functionData = await getFunction(db)({
        functionId: id,
        scopes: { tenantId, projectId },
      });

      if (!functionData) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Function not found' }),
          404
        ) as any;
      }

      return c.json({ data: functionData as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, id }, 'Failed to get function');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to get function' }),
        500
      ) as any;
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    permission: requireProjectPermission('edit'),
    summary: 'Create Function',
    operationId: 'create-function',
    tags: ['Functions'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: FunctionApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Function created',
        content: {
          'application/json': {
            schema: FunctionResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const functionData = c.req.valid('json');

    try {
      // Generate ID if not provided
      const id = functionData.id || generateId();

      await upsertFunction(db)({
        data: {
          ...functionData,
          id,
        },
        scopes: { tenantId, projectId },
      });

      const created = await getFunction(db)({
        functionId: id,
        scopes: { tenantId, projectId },
      });

      logger.info({ tenantId, functionId: id }, 'Function created');

      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error({ error, tenantId, functionData }, 'Failed to create function');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to create function' }),
        500
      ) as any;
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'put',
    path: '/{id}',
    permission: requireProjectPermission('edit'),
    summary: 'Update Function',
    operationId: 'update-function',
    tags: ['Functions'],
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: FunctionApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Function updated',
        content: {
          'application/json': {
            schema: FunctionResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      const existing = await getFunction(db)({
        functionId: id,
        scopes: { tenantId, projectId },
      });
      if (!existing) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Function not found' }),
          404
        ) as any;
      }

      await upsertFunction(db)({
        data: {
          ...existing,
          ...updateData,
          id,
        },
        scopes: { tenantId, projectId },
      });

      const updated = await getFunction(db)({
        functionId: id,
        scopes: { tenantId, projectId },
      });

      logger.info({ tenantId, functionId: id }, 'Function updated');

      return c.json({ data: updated as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, id, updateData }, 'Failed to update function');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to update function' }),
        500
      ) as any;
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}',
    permission: requireProjectPermission('edit'),
    summary: 'Delete Function',
    operationId: 'delete-function',
    tags: ['Functions'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Function deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');

    try {
      const existing = await getFunction(db)({
        functionId: id,
        scopes: { tenantId, projectId },
      });
      if (!existing) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Function not found' }),
          404
        ) as any;
      }

      await deleteFunction(db)({
        functionId: id,
        scopes: { tenantId, projectId },
      });

      logger.info({ tenantId, functionId: id }, 'Function deleted');

      return c.body(null, 204) as any;
    } catch (error) {
      logger.error({ error, tenantId, id }, 'Failed to delete function');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to delete function' }),
        500
      ) as any;
    }
  }
);

export default app;
