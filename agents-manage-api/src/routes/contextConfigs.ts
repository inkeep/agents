import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  ContextConfigApiInsertSchema,
  ContextConfigApiSelectSchema,
  ContextConfigApiUpdateSchema,
  commonDeleteErrorResponses,
  commonGetErrorResponses,
  commonUpdateErrorResponses,
  createApiError,
  createContextConfig,
  deleteContextConfig,
  getContextConfigById,
  IdParamsSchema,
  ListResponseSchema,
  listContextConfigsPaginated,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateContextConfig,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Context Configurations',
    operationId: 'list-context-configs',
    tags: ['CRUD Context Config'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of context configurations retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(ContextConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    const result = await listContextConfigsPaginated(dbClient)({
      scopes: { tenantId, projectId },
      pagination: { page, limit },
    });
    return c.json(result);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Context Configuration',
    operationId: 'get-context-config-by-id',
    tags: ['CRUD Context Config'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
    },
    responses: {
      200: {
        description: 'Context configuration found',
        content: {
          'application/json': {
            schema: SingleResponseSchema(ContextConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const contextConfig = await getContextConfigById(dbClient)({
      scopes: { tenantId, projectId },
      id,
    });

    if (!contextConfig) {
      throw createApiError({
        code: 'not_found',
        message: 'Context configuration not found',
      });
    }

    return c.json({ data: contextConfig });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Context Configuration',
    operationId: 'create-context-config',
    tags: ['CRUD Context Config'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ContextConfigApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Context configuration created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(ContextConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    const configData = {
      tenantId,
      projectId,
      ...body,
    };
    const contextConfig = await createContextConfig(dbClient)(configData);

    return c.json({ data: contextConfig }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Context Configuration',
    operationId: 'update-context-config',
    tags: ['CRUD Context Config'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
      body: {
        content: {
          'application/json': {
            schema: ContextConfigApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Context configuration updated successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(ContextConfigApiSelectSchema),
          },
        },
      },
      ...commonUpdateErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const updatedContextConfig = await updateContextConfig(dbClient)({
      scopes: { tenantId, projectId },
      id,
      data: body,
    });

    if (!updatedContextConfig) {
      throw createApiError({
        code: 'not_found',
        message: 'Context configuration not found',
      });
    }

    return c.json({ data: updatedContextConfig });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Context Configuration',
    operationId: 'delete-context-config',
    tags: ['CRUD Context Config'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
    },
    responses: {
      204: {
        description: 'Context configuration deleted successfully',
      },
      ...commonDeleteErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');

    const deleted = await deleteContextConfig(dbClient)({
      scopes: { tenantId, projectId },
      id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Context configuration not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
