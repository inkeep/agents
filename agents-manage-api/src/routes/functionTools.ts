import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createFunctionTool,
  deleteFunctionTool,
  FunctionToolApiInsertSchema,
  FunctionToolApiSelectSchema,
  FunctionToolApiUpdateSchema,
  getFunctionToolById,
  ListResponseSchema,
  listFunctionTools,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantProjectAgentParamsSchema,
  updateFunctionTool,
} from '@inkeep/agents-core';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

const logger = getLogger('functionTools');

const app = new OpenAPIHono();

// List function tools
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Function Tools',
    operationId: 'list-function-tools',
    tags: ['Function Tools'],
    request: {
      params: TenantProjectAgentParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of function tools retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(FunctionToolApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    try {
      const result = await listFunctionTools(dbClient)({
        scopes: { tenantId, projectId, agentId },
        pagination: { page, limit },
      });

      return c.json(result) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, agentId }, 'Failed to list function tools');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to list function tools' }),
        500
      );
    }
  }
);

// Get function tool by ID
app.openapi(
  createRoute({
    method: 'get',
    path: '/:id',
    summary: 'Get Function Tool by ID',
    operationId: 'get-function-tool',
    tags: ['Function Tools'],
    request: {
      params: TenantProjectAgentParamsSchema.extend({
        id: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Function tool retrieved successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(FunctionToolApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');

    try {
      const functionTool = await getFunctionToolById(dbClient)({
        scopes: { tenantId, projectId, agentId },
        functionToolId: id,
      });

      if (!functionTool) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Function tool not found' }),
          404
        );
      }

      return c.json({ data: functionTool }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, agentId, id }, 'Failed to get function tool');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to get function tool' }),
        500
      );
    }
  }
);

// Create function tool
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Function Tool',
    operationId: 'create-function-tool',
    tags: ['Function Tools'],
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: FunctionToolApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Function tool created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(FunctionToolApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const body = c.req.valid('json');

    try {
      const id = body.id || nanoid();

      const functionTool = await createFunctionTool(dbClient)({
        scopes: { tenantId, projectId, agentId },
        data: {
          ...body,
          id,
        },
      });

      return c.json({ data: functionTool }, 201) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, agentId, body }, 'Failed to create function tool');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create function tool',
        }),
        500
      );
    }
  }
);

// Update function tool
app.openapi(
  createRoute({
    method: 'put',
    path: '/:id',
    summary: 'Update Function Tool',
    operationId: 'update-function-tool',
    tags: ['Function Tools'],
    request: {
      params: TenantProjectAgentParamsSchema.extend({
        id: z.string(),
      }),
      body: {
        content: {
          'application/json': {
            schema: FunctionToolApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Function tool updated successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(FunctionToolApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    try {
      const functionTool = await updateFunctionTool(dbClient)({
        scopes: { tenantId, projectId, agentId },
        functionToolId: id,
        data: body,
      });

      if (!functionTool) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Function tool not found' }),
          404
        );
      }

      return c.json({ data: functionTool }) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, agentId, id, body },
        'Failed to update function tool'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to update function tool',
        }),
        500
      );
    }
  }
);

// Delete function tool
app.openapi(
  createRoute({
    method: 'delete',
    path: '/:id',
    summary: 'Delete Function Tool',
    operationId: 'delete-function-tool',
    tags: ['Function Tools'],
    request: {
      params: TenantProjectAgentParamsSchema.extend({
        id: z.string(),
      }),
    },
    responses: {
      204: {
        description: 'Function tool deleted successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');

    try {
      const deleted = await deleteFunctionTool(dbClient)({
        scopes: { tenantId, projectId, agentId },
        functionToolId: id,
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Function tool not found' }),
          404
        );
      }

      return c.body(null, 204);
    } catch (error) {
      logger.error({ error, tenantId, projectId, agentId, id }, 'Failed to delete function tool');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to delete function tool',
        }),
        500
      );
    }
  }
);

export default app;
