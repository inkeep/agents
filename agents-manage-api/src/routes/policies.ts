import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createPolicy,
  deletePolicy,
  ErrorResponseSchema,
  getPolicyById,
  listPolicies,
  PaginationQueryParamsSchema,
  PolicyApiInsertSchema,
  PolicyApiUpdateSchema,
  PolicyListResponse,
  PolicyResponse,
  RemovedResponseSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import { requirePermission } from '../middleware/require-permission';
import type { BaseAppVariables } from '../types/app';
import { speakeasyOffsetLimitPagination } from './shared';

const app = new OpenAPIHono<{ Variables: BaseAppVariables }>();

app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return requirePermission({ policy: ['create'] })(c, next);
  }
  return next();
});

app.use('/:id', async (c, next) => {
  if (c.req.method === 'PUT') {
    return requirePermission({ policy: ['update'] })(c, next);
  }
  if (c.req.method === 'DELETE') {
    return requirePermission({ policy: ['delete'] })(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Policies',
    operationId: 'list-policies',
    tags: ['Policies'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'Policies retrieved successfully',
        content: {
          'application/json': {
            schema: PolicyListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    const result = await listPolicies(dbClient)({
      scopes: { tenantId, projectId },
      pagination: { page, limit },
    });

    return c.json(result);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Policy',
    operationId: 'get-policy',
    tags: ['Policies'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Policy found',
        content: {
          'application/json': {
            schema: PolicyResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const policy = await getPolicyById(dbClient)({
      scopes: { tenantId, projectId },
      policyId: id,
    });

    if (!policy) {
      throw createApiError({
        code: 'not_found',
        message: 'Policy not found',
      });
    }

    return c.json({ data: policy });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Policy',
    operationId: 'create-policy',
    tags: ['Policies'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: PolicyApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Policy created successfully',
        content: {
          'application/json': {
            schema: PolicyResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    const policy = await createPolicy(dbClient)({
      ...body,
      tenantId,
      projectId,
    });

    return c.json({ data: policy }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Policy',
    operationId: 'update-policy',
    tags: ['Policies'],
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: PolicyApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Policy updated successfully',
        content: {
          'application/json': {
            schema: PolicyResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const policy = await updatePolicy(dbClient)({
      scopes: { tenantId, projectId },
      policyId: id,
      data: body,
    });

    if (!policy) {
      throw createApiError({
        code: 'not_found',
        message: 'Policy not found',
      });
    }

    return c.json({ data: policy });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Policy',
    operationId: 'delete-policy',
    tags: ['Policies'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Policy deleted successfully',
        content: {
          'application/json': {
            schema: RemovedResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
      404: {
        description: 'Policy not found',
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

    const removed = await deletePolicy(dbClient)({
      scopes: { tenantId, projectId },
      policyId: id,
    });

    if (!removed) {
      throw createApiError({
        code: 'not_found',
        message: 'Policy not found',
      });
    }

    return c.json({ message: 'Policy deleted', removed: true });
  }
);

export default app;
