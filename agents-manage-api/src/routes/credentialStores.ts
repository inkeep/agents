import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  CreateCredentialInStoreRequestSchema,
  CreateCredentialInStoreResponseSchema,
  CredentialStoreListResponseSchema,
  commonGetErrorResponses,
  createApiError,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import type { PublicAppVariables } from '../types/app';

const app = new OpenAPIHono<{ Variables: PublicAppVariables }>();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Credential Stores',
    operationId: 'list-credential-stores',
    tags: ['Credential Store'],
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'List of credential stores retrieved successfully',
        content: {
          'application/json': {
            schema: CredentialStoreListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const credentialStores = c.get('credentialStores');
    const allStores = credentialStores.getAll();

    const storeStatuses = await Promise.all(
      allStores.map(async (store) => {
        const { available, reason } = await store.checkAvailability();

        return {
          id: store.id,
          type: store.type,
          available,
          reason: reason || null,
        };
      })
    );

    return c.json({
      data: storeStatuses,
    });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/credentials',
    summary: 'Create Credential in Store',
    operationId: 'create-credential-in-store',
    tags: ['Credential Store'],
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: CreateCredentialInStoreRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Credential created successfully',
        content: {
          'application/json': {
            schema: CreateCredentialInStoreResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { id: storeId } = c.req.param();
    const { key, value, metadata } = await c.req.json();
    const credentialStores = c.get('credentialStores');

    // Find the specific credential store
    const store = credentialStores.get(storeId);
    if (!store) {
      throw createApiError({
        code: 'not_found',
        message: `Credential store '${storeId}' not found`,
      });
    }

    try {
      const { available, reason } = await store.checkAvailability();
      if (!available) {
        throw createApiError({
          code: 'internal_server_error',
          message: `Credential store '${storeId}' is not available: ${reason}`,
        });
      }

      // Set the credential in the store
      await store.set(key, value, metadata ?? {});

      return c.json(
        {
          data: {
            key,
            storeId,
            createdAt: new Date().toISOString(),
          },
        },
        201
      );
    } catch (error) {
      console.error(`Error setting credential in store ${storeId}:`, error);
      throw createApiError({
        code: 'internal_server_error',
        message: `Failed to store credential: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }
);

export default app;
