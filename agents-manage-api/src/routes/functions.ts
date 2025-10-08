import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  deleteFunction,
  ErrorResponseSchema,
  FunctionApiInsertSchema,
  FunctionApiSelectSchema,
  FunctionApiUpdateSchema,
  getFunction,
  IdParamsSchema,
  ListResponseSchema,
  listFunctions,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantParamsSchema,
  upsertFunction,
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

    try {
      // Functions are global - list all
      const functions = await listFunctions(dbClient)();

      return c.json({
        data: functions as any,
        pagination: {
          page: 1,
          limit: functions.length,
          total: functions.length,
          pages: 1,
        },
      });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to list functions');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to list functions' }),
        500
      );
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
      params: TenantParamsSchema.merge(IdParamsSchema),
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
      const functionData = await getFunction(dbClient)({ functionId: id });

      if (!functionData) {
        return c.json(createApiError({ code: 'not_found', message: 'Function not found' }), 404);
      }

      return c.json({ data: functionData as any });
    } catch (error) {
      logger.error({ error, tenantId, id }, 'Failed to get function');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to get function' }),
        500
      );
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
      await upsertFunction(dbClient)({
        data: {
          ...functionData,
          id,
        },
      });

      const created = await getFunction(dbClient)({ functionId: id });

      logger.info({ tenantId, functionId: id }, 'Function created');

      return c.json({ data: created as any }, 201);
    } catch (error) {
      logger.error({ error, tenantId, functionData }, 'Failed to create function');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to create function' }),
        500
      );
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
      params: TenantParamsSchema.merge(IdParamsSchema),
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
      // Check if function exists
      const existing = await getFunction(dbClient)({ functionId: id });
      if (!existing) {
        return c.json(createApiError({ code: 'not_found', message: 'Function not found' }), 404);
      }

      // Functions are global - update by ID only
      await upsertFunction(dbClient)({
        data: {
          ...existing,
          ...updateData,
          id,
        },
      });

      const updated = await getFunction(dbClient)({ functionId: id });

      logger.info({ tenantId, functionId: id }, 'Function updated');

      return c.json({ data: updated as any });
    } catch (error) {
      logger.error({ error, tenantId, id, updateData }, 'Failed to update function');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to update function' }),
        500
      );
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
      params: TenantParamsSchema.merge(IdParamsSchema),
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
      // Check if function exists
      const existing = await getFunction(dbClient)({ functionId: id });
      if (!existing) {
        return c.json(createApiError({ code: 'not_found', message: 'Function not found' }), 404);
      }

      // Functions are global - delete by ID only
      await deleteFunction(dbClient)({ functionId: id });

      logger.info({ tenantId, functionId: id }, 'Function deleted');

      return c.body(null, 204);
    } catch (error) {
      logger.error({ error, tenantId, id }, 'Failed to delete function');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to delete function' }),
        500
      );
    }
  }
);

export default app;
