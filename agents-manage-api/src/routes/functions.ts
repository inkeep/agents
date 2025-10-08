import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  ErrorResponseSchema,
  FunctionApiInsertSchema,
  FunctionApiSelectSchema,
  FunctionApiUpdateSchema,
  IdParamsSchema,
  ListResponseSchema,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantParamsSchema,
} from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

const logger = getLogger('functions');

const app = new OpenAPIHono();

// List functions (global entities)
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Functions',
    operationId: 'list-functions',
    tags: ['Functions'],
    request: {
      params: TenantParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of functions',
        content: {
          'application/json': {
            schema: ListResponseSchema(FunctionApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    try {
      const offset = (page - 1) * limit;

      // Functions are global - no tenant/project filtering
      const functions = await dbClient
        .select()
        .from(dbClient.schema.functions)
        .limit(limit)
        .offset(offset);

      const totalCount = await dbClient
        .select({ count: dbClient.count() })
        .from(dbClient.schema.functions);

      return c.json({
        data: functions,
        pagination: {
          page,
          limit,
          total: totalCount[0]?.count || 0,
        },
      });
    } catch (error) {
      logger.error('Failed to list functions', { error, tenantId });
      return c.json(createApiError('Failed to list functions'), 500);
    }
  }
);

// Get function by ID
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Function by ID',
    operationId: 'get-function',
    tags: ['Functions'],
    request: {
      params: IdParamsSchema,
    },
    responses: {
      200: {
        description: 'Function details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(FunctionApiSelectSchema),
          },
        },
      },
      404: {
        description: 'Function not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, id } = c.req.valid('param');

    try {
      // Functions are global - query by ID only
      const functionData = await dbClient
        .select()
        .from(dbClient.schema.functions)
        .where(dbClient.eq(dbClient.schema.functions.id, id))
        .limit(1);

      if (!functionData.length) {
        return c.json(createApiError('Function not found'), 404);
      }

      return c.json({ data: functionData[0] });
    } catch (error) {
      logger.error('Failed to get function', { error, tenantId, id });
      return c.json(createApiError('Failed to get function'), 500);
    }
  }
);

// Create function
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Function',
    operationId: 'create-function',
    tags: ['Functions'],
    request: {
      params: TenantParamsSchema,
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
            schema: SingleResponseSchema(FunctionApiSelectSchema),
          },
        },
      },
      400: {
        description: 'Invalid request',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const functionData = c.req.valid('json');

    try {
      // Generate ID if not provided
      const id = functionData.id || nanoid();

      // Functions are global entities (no tenant/project scoping)
      const newFunction = {
        ...functionData,
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await dbClient
        .insert(dbClient.schema.functions)
        .values(newFunction)
        .returning();

      logger.info('Function created', { tenantId, functionId: id });

      return c.json({ data: result[0] }, 201);
    } catch (error) {
      logger.error('Failed to create function', { error, tenantId, functionData });
      return c.json(createApiError('Failed to create function'), 500);
    }
  }
);

// Update function
app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Function',
    operationId: 'update-function',
    tags: ['Functions'],
    request: {
      params: IdParamsSchema,
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
            schema: SingleResponseSchema(FunctionApiSelectSchema),
          },
        },
      },
      404: {
        description: 'Function not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, id } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      // Functions are global - update by ID only
      const result = await dbClient
        .update(dbClient.schema.functions)
        .set({
          ...updateData,
          updatedAt: new Date().toISOString(),
        })
        .where(dbClient.eq(dbClient.schema.functions.id, id))
        .returning();

      if (!result.length) {
        return c.json(createApiError('Function not found'), 404);
      }

      logger.info('Function updated', { tenantId, functionId: id });

      return c.json({ data: result[0] });
    } catch (error) {
      logger.error('Failed to update function', { error, tenantId, id, updateData });
      return c.json(createApiError('Failed to update function'), 500);
    }
  }
);

// Delete function
app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Function',
    operationId: 'delete-function',
    tags: ['Functions'],
    request: {
      params: IdParamsSchema,
    },
    responses: {
      204: {
        description: 'Function deleted',
      },
      404: {
        description: 'Function not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, id } = c.req.valid('param');

    try {
      // Functions are global - delete by ID only
      const result = await dbClient
        .delete(dbClient.schema.functions)
        .where(dbClient.eq(dbClient.schema.functions.id, id))
        .returning();

      if (!result.length) {
        return c.json(createApiError('Function not found'), 404);
      }

      logger.info('Function deleted', { tenantId, functionId: id });

      return c.body(null, 204);
    } catch (error) {
      logger.error('Failed to delete function', { error, tenantId, id });
      return c.json(createApiError('Failed to delete function'), 500);
    }
  }
);

export default app;
