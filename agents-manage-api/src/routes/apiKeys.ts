import { createRoute } from '@hono/zod-openapi';
import {
  ApiKeyApiCreationResponseSchema,
  ApiKeyApiInsertSchema,
  ApiKeyApiUpdateSchema,
  ApiKeyListResponse,
  ApiKeyResponse,
  commonGetErrorResponses,
  createApiError,
  createApiKey,
  deleteApiKey,
  ErrorResponseSchema,
  generateApiKey,
  getApiKeyById,
  listApiKeysPaginated,
  PaginationQueryParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateApiKey,
} from '@inkeep/agents-core';
import { z } from 'zod';
import { createAppWithDb } from '../utils/apps';

const app = createAppWithDb();

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
        agentId: z.string().optional().describe('Filter by agent ID'),
      }),
    },
    responses: {
      200: {
        description: 'List of API keys retrieved successfully',
        content: {
          'application/json': {
            schema: ApiKeyListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);
    const agentId = c.req.query('agentId');

    const result = await listApiKeysPaginated(db)({
      scopes: { tenantId, projectId },
      pagination: { page, limit },
      agentId: agentId,
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
            schema: ApiKeyResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const apiKey = await getApiKeyById(db)({
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
    description: 'Create a new API key for an agent. Returns the full key (shown only once).',
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
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');
    const keyData = await generateApiKey(tenantId, projectId);

    const { key, ...keyDataWithoutKey } = keyData;
    const insertData = {
      tenantId,
      projectId,
      name: body.name,
      agentId: body.agentId,
      ...keyDataWithoutKey,
      expiresAt: body.expiresAt || undefined,
    };

    try {
      const result = await createApiKey(db)(insertData);
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
      // Handle foreign key constraint violations (PostgreSQL foreign key violation)
      if (error?.cause?.code === '23503') {
        throw createApiError({
          code: 'bad_request',
          message: 'Invalid agentId - agent does not exist',
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
            schema: ApiKeyResponse,
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

    const updatedApiKey = await updateApiKey(db)({
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
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');

    const deleted = await deleteApiKey(db)({
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
