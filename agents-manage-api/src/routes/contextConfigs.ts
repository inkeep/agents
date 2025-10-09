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
  ListResponseSchema,
  listContextConfigsPaginated,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantProjectGraphIdParamsSchema,
  TenantProjectGraphParamsSchema,
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
    tags: ['Context Config'],
    request: {
      params: TenantProjectGraphParamsSchema,
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
    const { tenantId, projectId, graphId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    const result = await listContextConfigsPaginated(dbClient)({
      scopes: { tenantId, projectId, graphId },
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
    tags: ['Context Config'],
    request: {
      params: TenantProjectGraphIdParamsSchema,
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
    const { tenantId, projectId, graphId, id } = c.req.valid('param');
    const contextConfig = await getContextConfigById(dbClient)({
      scopes: { tenantId, projectId, graphId },
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
    tags: ['Context Config'],
    request: {
      params: TenantProjectGraphParamsSchema,
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
    const { tenantId, projectId, graphId } = c.req.valid('param');
    const body = c.req.valid('json');

    const configData = {
      tenantId,
      projectId,
      graphId,
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
    tags: ['Context Config'],
    request: {
      params: TenantProjectGraphIdParamsSchema,
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
    const { tenantId, projectId, graphId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const updatedContextConfig = await updateContextConfig(dbClient)({
      scopes: { tenantId, projectId, graphId },
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
    tags: ['Context Config'],
    request: {
      params: TenantProjectGraphIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Context configuration deleted successfully',
      },
      ...commonDeleteErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId, id } = c.req.valid('param');

    const deleted = await deleteContextConfig(dbClient)({
      scopes: { tenantId, projectId, graphId },
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
