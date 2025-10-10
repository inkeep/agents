import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  ApiKeyApiCreationResponseSchema,
  ApiKeyApiInsertSchema,
  ApiKeyApiSelectSchema,
  ApiKeyApiUpdateSchema,
  commonGetErrorResponses,
  createApiError,
  createApiKey,
  deleteApiKey,
  ErrorResponseSchema,
  generateApiKey,
  getApiKeyById,
  ListResponseSchema,
  listApiKeysPaginated,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateApiKey,
} from '@inkeep/agents-core';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List API Keys',
    description: 'List all API keys for a tenant with optional pagination',
    operationId: 'list-api-keys',
    tags: ['API Keys'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema.extend({
        graphId: z.string().optional().describe('Filter by graph ID'),
      }),
    },
    responses: {
      200: {
        description: 'List of API keys retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(ApiKeyApiSelectSchema),
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
    const graphId = c.req.query('graphId');

    const result = await listApiKeysPaginated(dbClient)({
      scopes: { tenantId, projectId },
      pagination: { page, limit },
      graphId,
    });
    // Remove sensitive fields from response
    const sanitizedData = result.data.map(({ keyHash, tenantId, projectId, ...apiKey }) => apiKey);

    return c.json({
      data: sanitizedData,
      pagination: result.pagination,
    });
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get API Key',
    description: 'Get a specific API key by ID (does not return the actual key)',
    operationId: 'get-api-key-by-id',
    tags: ['API Keys'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'API key found',
        content: {
          'application/json': {
            schema: SingleResponseSchema(ApiKeyApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const apiKey = await getApiKeyById(dbClient)({
      scopes: { tenantId, projectId },
      id,
    });

    if (!apiKey || apiKey === undefined) {
      throw createApiError({
        code: 'not_found',
        message: 'API key not found',
      });
    }

    // Remove sensitive fields from response
    const { keyHash: _, tenantId: __, projectId: ___, ...sanitizedApiKey } = apiKey;

    return c.json({
      data: {
        ...sanitizedApiKey,
        lastUsedAt: sanitizedApiKey.lastUsedAt ?? null,
        expiresAt: sanitizedApiKey.expiresAt ?? null,
      },
    });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create API Key',
    description: 'Create a new API key for a graph. Returns the full key (shown only once).',
    operationId: 'create-api-key',
    tags: ['API Keys'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ApiKeyApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'API key created successfully',
        content: {
          'application/json': {
            schema: ApiKeyApiCreationResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');
    const keyData = await generateApiKey();

    const { key, ...keyDataWithoutKey } = keyData;
    const insertData = {
      tenantId,
      projectId,
      name: body.name,
      graphId: body.agentId,
      ...keyDataWithoutKey,
      expiresAt: body.expiresAt || undefined,
    };

    try {
      const result = await createApiKey(dbClient)(insertData);
      // Remove sensitive fields from the apiKey object (but keep the full key)
      const { keyHash: _, tenantId: __, projectId: ___, ...sanitizedApiKey } = result;

      return c.json(
        {
          data: {
            apiKey: {
              ...sanitizedApiKey,
              lastUsedAt: sanitizedApiKey.lastUsedAt ?? null,
              expiresAt: sanitizedApiKey.expiresAt ?? null,
            },
            key: key,
          },
        },
        201
      );
    } catch (error: any) {
      // Handle foreign key constraint violations (invalid graphId)
      if (error?.cause?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || error?.cause?.rawCode === 787) {
        throw createApiError({
          code: 'bad_request',
          message: 'Invalid graphId - graph does not exist',
        });
      }

      // Re-throw other errors to be handled by the global error handler
      throw error;
    }
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update API Key',
    description: 'Update an API key (currently only expiration date can be changed)',
    operationId: 'update-api-key',
    tags: ['API Keys'],
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ApiKeyApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'API key updated successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(ApiKeyApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const updatedApiKey = await updateApiKey(dbClient)({
      scopes: { tenantId, projectId },
      id,
      data: {
        expiresAt: body.expiresAt,
        name: body.name,
      },
    });

    if (!updatedApiKey) {
      throw createApiError({
        code: 'not_found',
        message: 'API key not found',
      });
    }

    // Remove sensitive fields from response
    const { keyHash: _, tenantId: __, projectId: ___, ...sanitizedApiKey } = updatedApiKey;

    return c.json({
      data: {
        ...sanitizedApiKey,
        lastUsedAt: sanitizedApiKey.lastUsedAt ?? null,
        expiresAt: sanitizedApiKey.expiresAt ?? null,
      },
    });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete API Key',
    description: 'Delete an API key permanently',
    operationId: 'delete-api-key',
    tags: ['API Keys'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      204: {
        description: 'API key deleted successfully',
      },
      404: {
        description: 'API key not found',
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

    const deleted = await deleteApiKey(dbClient)({
      scopes: { tenantId, projectId },
      id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'API key not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
