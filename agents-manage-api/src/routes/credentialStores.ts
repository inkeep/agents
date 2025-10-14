import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  CredentialStoreType,
  commonGetErrorResponses,
  createApiError,
} from '@inkeep/agents-core';
import { z } from 'zod';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

const CredentialStoreStatusSchema = z.object({
  id: z.string().describe('Unique identifier of the credential store'),
  type: z.enum(CredentialStoreType),
  available: z.boolean().describe('Whether the store is functional and ready to use'),
  reason: z.string().nullable().describe('Reason why store is not available, if applicable'),
});

const CredentialStoresStatusResponseSchema = z.object({
  stores: z
    .array(CredentialStoreStatusSchema)
    .describe('List of registered credential stores with their status'),
});

const CredentialStoreSetRequestSchema = z.object({
  key: z.string().describe('The credential key to set'),
  value: z.string().describe('The credential value to store'),
});

const CredentialStoreSetResponseSchema = z.object({
  success: z.boolean().describe('Whether the credential was successfully stored'),
  message: z.string().describe('Success or error message'),
});


app.openapi(
  createRoute({
    method: 'get',
    path: '/status',
    summary: 'Get Credential Stores Status',
    operationId: 'get-credential-stores-status',
    tags: ['Credential Store'],
    responses: {
      200: {
        description: 'Credential stores status retrieved successfully',
        content: {
          'application/json': {
            schema: CredentialStoresStatusResponseSchema,
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
      stores: storeStatuses,
    });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/:storeId/set',
    summary: 'Set Credential in Store',
    operationId: 'set-credential-in-store',
    tags: ['Credential Store'],
    request: {
      params: z.object({
        tenantId: z.string(),
        projectId: z.string(),
        storeId: z.string().describe('The credential store ID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: CredentialStoreSetRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Credential set successfully',
        content: {
          'application/json': {
            schema: CredentialStoreSetResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { storeId } = c.req.param();
    const { key, value } = await c.req.json();
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
      // Check if store is available
      const { available, reason } = await store.checkAvailability();
      if (!available) {
        throw createApiError({
          code: 'internal_server_error',
          message: `Credential store '${storeId}' is not available: ${reason}`,
        });
      }

      // Set the credential in the store
      await store.set(key, value);

      return c.json({
        success: true,
        message: `Credential '${key}' successfully stored in ${store.type} store '${storeId}'`,
      });
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
