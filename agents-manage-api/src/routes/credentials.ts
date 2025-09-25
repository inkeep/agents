import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  CredentialReferenceApiInsertSchema,
  CredentialReferenceApiSelectSchema,
  CredentialReferenceApiUpdateSchema,
  type CredentialStoreRegistry,
  commonGetErrorResponses,
  createApiError,
  createCredentialReference,
  deleteCredentialReference,
  ErrorResponseSchema,
  getCredentialReferenceById,
  getCredentialReferenceWithTools,
  getCredentialStoreLookupKeyFromRetrievalParams,
  IdParamsSchema,
  ListResponseSchema,
  listCredentialReferencesPaginated,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateCredentialReference,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Credentials',
    operationId: 'list-credentials',
    tags: ['Credential'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of credentials retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(CredentialReferenceApiSelectSchema),
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

    const result = await listCredentialReferencesPaginated(dbClient)({
      scopes: { tenantId, projectId },
      pagination: { page, limit },
    });

    const validatedResult = ListResponseSchema(CredentialReferenceApiSelectSchema).parse(result);
    return c.json(validatedResult);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Credential',
    operationId: 'get-credential-by-id',
    tags: ['Credential'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
    },
    responses: {
      200: {
        description: 'Credential found',
        content: {
          'application/json': {
            schema: SingleResponseSchema(CredentialReferenceApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const credential = await getCredentialReferenceWithTools(dbClient)({
      scopes: { tenantId, projectId },
      id,
    });

    if (!credential) {
      throw createApiError({
        code: 'not_found',
        message: 'Credential not found',
      });
    }

    const validatedCredential = CredentialReferenceApiSelectSchema.parse(credential);
    return c.json({ data: validatedCredential });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Credential',
    operationId: 'create-credential',
    tags: ['Credential'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: CredentialReferenceApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Credential created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(CredentialReferenceApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    const credentialData = {
      ...body,
      tenantId,
      projectId,
    };

    const credential = await createCredentialReference(dbClient)(credentialData);
    const validatedCredential = CredentialReferenceApiSelectSchema.parse(credential);
    return c.json({ data: validatedCredential }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Credential',
    operationId: 'update-credential',
    tags: ['Credential'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
      body: {
        content: {
          'application/json': {
            schema: CredentialReferenceApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Credential updated successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(CredentialReferenceApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const updatedCredential = await updateCredentialReference(dbClient)({
      scopes: { tenantId, projectId },
      id,
      data: body,
    });

    if (!updatedCredential) {
      throw createApiError({
        code: 'not_found',
        message: 'Credential not found',
      });
    }

    const validatedCredential = CredentialReferenceApiSelectSchema.parse(updatedCredential);
    return c.json({ data: validatedCredential });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Credential',
    operationId: 'delete-credential',
    tags: ['Credential'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
    },
    responses: {
      204: {
        description: 'Credential deleted successfully',
      },
      404: {
        description: 'Credential not found',
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

    const credential = await getCredentialReferenceById(dbClient)({
      scopes: { tenantId, projectId },
      id,
    });

    if (!credential) {
      throw createApiError({
        code: 'not_found',
        message: 'Credential not found',
      });
    }

    const credentialStores = c.get('credentialStores');
    const credentialStore = credentialStores.get(credential.credentialStoreId);

    if (credentialStore && credential.retrievalParams) {
      const lookupKey = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams: credential.retrievalParams,
        credentialStoreType: credentialStore.type,
      });

      if (!lookupKey) {
        throw createApiError({
          code: 'bad_request',
          message: 'Could not generate lookup key for credential store',
        });
      }

      try {
        await credentialStore.delete(lookupKey);
      } catch (error) {
        // Log the error but continue with database deletion for graceful failure handling
        console.error(
          `Failed to delete credential from external store "${credential.credentialStoreId}":`,
          error
        );
      }
    }

    const deleted = await deleteCredentialReference(dbClient)({
      scopes: { tenantId, projectId },
      id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Failed to delete credential',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
