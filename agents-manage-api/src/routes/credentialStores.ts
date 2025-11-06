import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  CredentialStoreType,
  commonGetErrorResponses,
  createApiError,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { z } from 'zod';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

const CredentialStoreSchema = z.object({
  id: z.string().describe('Unique identifier of the credential store'),
  type: z.enum(CredentialStoreType),
  available: z.boolean().describe('Whether the store is functional and ready to use'),
  reason: z.string().nullable().describe('Reason why store is not available, if applicable'),
});

const CredentialStoreListResponseSchema = z.object({
  data: z.array(CredentialStoreSchema).describe('List of credential stores'),
});

const CreateCredentialInStoreRequestSchema = z.object({
  key: z.string().describe('The credential key'),
  value: z.string().describe('The credential value'),
  metadata: z.record(z.string(), z.string()).nullish().describe('The metadata for the credential'),
});

const CreateCredentialInStoreResponseSchema = z.object({
  data: z.object({
    key: z.string().describe('The credential key'),
    storeId: z.string().describe('The store ID where credential was created'),
    createdAt: z.string().describe('ISO timestamp of creation'),
  }),
});

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
      params: TenantProjectIdParamsSchema.extend({
        id: z.string().describe('The credential store ID'),
      }),
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
