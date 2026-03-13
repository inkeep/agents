import { OpenAPIHono } from '@hono/zod-openapi';
import {
  CredentialReferenceApiInsertSchema,
  CredentialReferenceApiSelectSchema,
  CredentialReferenceApiUpdateSchema,
  CredentialReferenceListResponse,
  CredentialReferenceResponse,
  type CredentialStore,
  commonGetErrorResponses,
  createApiError,
  createCredentialReference,
  deleteCredentialReference,
  ErrorResponseSchema,
  getCredentialReferenceById,
  getCredentialReferenceWithResources,
  getCredentialStoreLookupKeyFromRetrievalParams,
  getUserScopedCredentialReference,
  ListResponseSchema,
  listCredentialReferencesPaginated,
  PaginationQueryParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateCredentialReference,
  upsertCredentialReference,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

// Write operations require 'edit' permission on the project
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Credentials',
    operationId: 'list-credentials',
    tags: ['Credentials'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of credentials retrieved successfully',
        content: {
          'application/json': {
            schema: CredentialReferenceListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    const result = await listCredentialReferencesPaginated(db)({
      scopes: { tenantId, projectId },
      pagination: { page, limit },
    });

    const validatedResult = ListResponseSchema(CredentialReferenceApiSelectSchema).parse(result);
    return c.json(validatedResult);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Credential',
    operationId: 'get-credential-by-id',
    tags: ['Credentials'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Credential found',
        content: {
          'application/json': {
            schema: CredentialReferenceResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const db = c.get('db');
    const credential = await getCredentialReferenceWithResources(db)({
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
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Credential',
    operationId: 'create-credential',
    tags: ['Credentials'],
    permission: requireProjectPermission('edit'),
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
      200: {
        description: 'Credential updated successfully (user-scoped upsert)',
        content: {
          'application/json': {
            schema: CredentialReferenceResponse,
          },
        },
      },
      201: {
        description: 'Credential created successfully',
        content: {
          'application/json': {
            schema: CredentialReferenceResponse,
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

    const credentialData = {
      ...body,
      tenantId,
      projectId,
    };

    let oldLookupKey: string | null | undefined;
    let oldStore: CredentialStore | undefined;

    const isUserScoped = !!(credentialData.toolId && credentialData.userId);
    let hadExistingUserScopedCredential = false;
    // For user-scoped credentials, clean up the old credential store connection before upserting
    if (isUserScoped) {
      const existingCredential = await getUserScopedCredentialReference(db)({
        scopes: { tenantId, projectId },
        // biome-ignore lint/style/noNonNullAssertion: narrowed by isUserScoped guard above
        toolId: credentialData.toolId!,
        // biome-ignore lint/style/noNonNullAssertion: narrowed by isUserScoped guard above
        userId: credentialData.userId!,
      });
      hadExistingUserScopedCredential = existingCredential != null;

      if (existingCredential?.retrievalParams) {
        const credentialStores = c.get('credentialStores');
        oldStore = credentialStores.get(existingCredential.credentialStoreId);

        if (oldStore) {
          oldLookupKey = getCredentialStoreLookupKeyFromRetrievalParams({
            retrievalParams: existingCredential.retrievalParams,
            credentialStoreType: oldStore.type,
          });
        }
      }
    }

    const credential = isUserScoped
      ? await upsertCredentialReference(db)({ data: credentialData })
      : await createCredentialReference(db)(credentialData);

    if (oldLookupKey && oldStore) {
      try {
        await oldStore.delete(oldLookupKey);
      } catch {
        // Best-effort cleanup — don't block the upsert if the old connection is already gone
      }
    }

    const validatedCredential = CredentialReferenceApiSelectSchema.parse(credential);
    const status = isUserScoped && hadExistingUserScopedCredential ? 200 : 201;
    return c.json({ data: validatedCredential }, status);
  }
);

const updateCredentialRouteConfig = {
  path: '/{id}' as const,
  summary: 'Update Credential',
  tags: ['Credentials'],
  permission: requireProjectPermission('edit'),
  request: {
    params: TenantProjectIdParamsSchema,
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
          schema: CredentialReferenceResponse,
        },
      },
    },
    ...commonGetErrorResponses,
  },
};

const updateCredentialHandler = async (c: any) => {
  const db = c.get('db');
  const { tenantId, projectId, id } = c.req.valid('param');
  const body = c.req.valid('json');

  const updatedCredential = await updateCredentialReference(db)({
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
};

app.openapi(
  createProtectedRoute({
    ...updateCredentialRouteConfig,
    method: 'patch',
    operationId: 'update-credential',
  }),
  updateCredentialHandler
);

app.openapi(
  createProtectedRoute({
    ...updateCredentialRouteConfig,
    method: 'put',
    operationId: 'update-credential-put',
    'x-speakeasy-ignore': true,
  }),
  updateCredentialHandler
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Credential',
    operationId: 'delete-credential',
    tags: ['Credentials'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectIdParamsSchema,
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
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');

    const credential = await getCredentialReferenceById(db)({
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

    const deleted = await deleteCredentialReference(db)({
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
