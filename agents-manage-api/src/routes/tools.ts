import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { CredentialStoreRegistry, ServerConfig } from '@inkeep/agents-core';
import {
  commonGetErrorResponses,
  createApiError,
  createTool,
  type DatabaseClient,
  dbResultToMcpTool,
  deleteTool,
  ErrorResponseSchema,
  generateId,
  getToolById,
  listTools,
  type McpTool,
  McpToolListResponse,
  McpToolResponse,
  PaginationQueryParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  ToolApiInsertSchema,
  ToolApiUpdateSchema,
  ToolStatusSchema,
  updateTool,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

const logger = getLogger('tools');

type AppVariables = {
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
  db: DatabaseClient;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Tools',
    operationId: 'list-tools',
    tags: ['Tools'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema.extend({
        status: ToolStatusSchema.optional(),
      }),
    },
    responses: {
      200: {
        description: 'List of tools retrieved successfully',
        content: {
          'application/json': {
            schema: McpToolListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const { page, limit, status } = c.req.valid('query');

    let result: {
      data: McpTool[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    };
    const credentialStores = c.get('credentialStores');

    // Filter by status if provided
    if (status) {
      const dbResult = await listTools(db)({
        scopes: { tenantId, projectId },
        pagination: { page, limit },
      });
      result = {
        data: (
          await Promise.all(
            dbResult.data.map(
              async (tool) => await dbResultToMcpTool(tool, dbClient, credentialStores)
            )
          )
        ).filter((tool) => tool.status === status),
        pagination: dbResult.pagination,
      };
    } else {
      // Use paginated results from operations
      const dbResult = await listTools(db)({
        scopes: { tenantId, projectId },
        pagination: { page, limit },
      });
      result = {
        data: await Promise.all(
          dbResult.data.map(
            async (tool) => await dbResultToMcpTool(tool, dbClient, credentialStores)
          )
        ),
        pagination: dbResult.pagination,
      };
    }

    return c.json(result);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Tool',
    operationId: 'get-tool',
    tags: ['Tools'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Tool found',
        content: {
          'application/json': {
            schema: McpToolResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const tool = await getToolById(db)({ scopes: { tenantId, projectId }, toolId: id });
    if (!tool) {
      throw createApiError({
        code: 'not_found',
        message: 'Tool not found',
      });
    }

    const credentialStores = c.get('credentialStores');

    return c.json({
      data: await dbResultToMcpTool(tool, dbClient, credentialStores),
    });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Tool',
    operationId: 'create-tool',
    tags: ['Tools'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ToolApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Tool created successfully',
        content: {
          'application/json': {
            schema: McpToolResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');
    const credentialStores = c.get('credentialStores');

    logger.info({ body }, 'body');

    const id = body.id || generateId();

    const tool = await createTool(db)({
      tenantId,
      projectId,
      id,
      name: body.name,
      config: body.config,
      credentialReferenceId: body.credentialReferenceId,
      imageUrl: body.imageUrl,
      headers: body.headers,
    });

    return c.json(
      {
        data: await dbResultToMcpTool(tool, dbClient, credentialStores),
      },
      201
    );
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Tool',
    operationId: 'update-tool',
    tags: ['Tools'],
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ToolApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Tool updated successfully',
        content: {
          'application/json': {
            schema: McpToolResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');
    const credentialStores = c.get('credentialStores');

    if (Object.keys(body).length === 0) {
      throw createApiError({
        code: 'bad_request',
        message: 'No fields to update',
      });
    }

    const updatedTool = await updateTool(db)({
      scopes: { tenantId, projectId },
      toolId: id,
      data: {
        name: body.name,
        config: body.config,
        credentialReferenceId: body.credentialReferenceId,
        imageUrl: body.imageUrl,
        headers: body.headers,
      },
    });

    if (!updatedTool) {
      throw createApiError({
        code: 'not_found',
        message: 'Tool not found',
      });
    }

    return c.json({
      data: await dbResultToMcpTool(updatedTool, dbClient, credentialStores),
    });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Tool',
    operationId: 'delete-tool',
    tags: ['Tools'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Tool deleted successfully',
      },
      404: {
        description: 'Tool not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const deleted = await deleteTool(db)({ scopes: { tenantId, projectId }, toolId: id });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Tool not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
