import { createRoute } from '@hono/zod-openapi';
import {
  ContextConfigApiInsertSchema,
  ContextConfigApiUpdateSchema,
  ContextConfigListResponse,
  ContextConfigResponse,
  commonDeleteErrorResponses,
  commonGetErrorResponses,
  commonUpdateErrorResponses,
  createApiError,
  createContextConfig,
  deleteContextConfig,
  getContextConfigById,
  listContextConfigsPaginated,
  PaginationQueryParamsSchema,
  TenantProjectAgentIdParamsSchema,
  TenantProjectAgentParamsSchema,
  updateContextConfig,
} from '@inkeep/agents-core';
import { createAppWithDb } from '../utils/apps';

const app = createAppWithDb();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Context Configurations',
    operationId: 'list-context-configs',
    tags: ['Context Config'],
    request: {
      params: TenantProjectAgentParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of context configurations retrieved successfully',
        content: {
          'application/json': {
            schema: ContextConfigListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    const result = await listContextConfigsPaginated(db)({
      scopes: { tenantId, projectId, agentId },
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
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Context configuration found',
        content: {
          'application/json': {
            schema: ContextConfigResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const contextConfig = await getContextConfigById(db)({
      scopes: { tenantId, projectId, agentId },
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
      params: TenantProjectAgentParamsSchema,
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
            schema: ContextConfigResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const body = c.req.valid('json');

    const configData = {
      tenantId,
      projectId,
      agentId,
      ...body,
    };
    const contextConfig = await createContextConfig(db)(configData);

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
      params: TenantProjectAgentIdParamsSchema,
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
            schema: ContextConfigResponse,
          },
        },
      },
      ...commonUpdateErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const updatedContextConfig = await updateContextConfig(db)({
      scopes: { tenantId, projectId, agentId },
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
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Context configuration deleted successfully',
      },
      ...commonDeleteErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');

    const deleted = await deleteContextConfig(db)({
      scopes: { tenantId, projectId, agentId },
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
