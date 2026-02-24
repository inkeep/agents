import { OpenAPIHono } from '@hono/zod-openapi';
import {
  cascadeDeleteBySubAgent,
  commonGetErrorResponses,
  createApiError,
  createSubAgent,
  deleteSubAgent,
  ErrorResponseSchema,
  generateId,
  getSubAgentById,
  listSubAgentsPaginated,
  PaginationQueryParamsSchema,
  SubAgentApiInsertSchema,
  SubAgentApiUpdateSchema,
  SubAgentIsDefaultError,
  SubAgentListResponse,
  SubAgentResponse,
  TenantProjectAgentIdParamsSchema,
  TenantProjectAgentParamsSchema,
  updateSubAgent,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List SubAgents',
    operationId: 'list-subagents',
    tags: ['SubAgents'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectAgentParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of subAgents retrieved successfully',
        content: {
          'application/json': {
            schema: SubAgentListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    const db = c.get('db');
    const result = await listSubAgentsPaginated(db)({
      scopes: { tenantId, projectId, agentId },
      pagination: { page, limit },
    });
    // Add type field to all subAgents in the response
    const dataWithType = {
      ...result,
      data: result.data.map((subAgent) => ({
        ...subAgent,
        type: 'internal' as const,
      })),
    };

    return c.json(dataWithType);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get SubAgent',
    operationId: 'get-subagent-by-id',
    tags: ['SubAgents'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'SubAgent found',
        content: {
          'application/json': {
            schema: SubAgentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const db = c.get('db');

    const subAgent = await getSubAgentById(db)({
      scopes: { tenantId, projectId, agentId },
      subAgentId: id,
    });

    if (!subAgent) {
      throw createApiError({
        code: 'not_found',
        message: 'SubAgent not found',
      });
    }

    // Add type field to the sub-agent response
    const subAgentWithType = {
      ...subAgent,
      type: 'internal' as const,
    };

    return c.json({ data: subAgentWithType });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create SubAgent',
    operationId: 'create-subagent',
    tags: ['SubAgents'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'SubAgent created successfully',
        content: {
          'application/json': {
            schema: SubAgentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const body = c.req.valid('json');
    const subAgentId = body.id ? String(body.id) : generateId();
    const db = c.get('db');
    const subAgent = await createSubAgent(db)({
      ...body,
      id: subAgentId,
      tenantId,
      projectId,
      agentId,
    });

    // Add type field to the sub-agent response
    const subAgentWithType = {
      ...subAgent,
      type: 'internal' as const,
    };

    return c.json({ data: subAgentWithType }, 201);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update SubAgent',
    operationId: 'update-subagent',
    tags: ['SubAgents'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectAgentIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'SubAgent updated successfully',
        content: {
          'application/json': {
            schema: SubAgentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const db = c.get('db');
    const updatedSubAgent = await updateSubAgent(db)({
      scopes: { tenantId, projectId, agentId },
      subAgentId: id,
      data: body,
    });

    if (!updatedSubAgent) {
      throw createApiError({
        code: 'not_found',
        message: 'SubAgent not found',
      });
    }

    // Add type field to the sub-agent response
    const subAgentWithType = {
      ...updatedSubAgent,
      type: 'internal' as const,
    };

    return c.json({ data: subAgentWithType });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete SubAgent',
    operationId: 'delete-subagent',
    tags: ['SubAgents'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      204: {
        description: 'SubAgent deleted successfully',
      },
      404: {
        description: 'SubAgent not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      409: {
        description: 'SubAgent is set as default and cannot be deleted',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const db = c.get('db');
    const resolvedRef = c.get('resolvedRef');

    try {
      // Delete runtime entities for this subAgent on this branch
      await cascadeDeleteBySubAgent(runDbClient)({
        scopes: { tenantId, projectId },
        subAgentId: id,
        fullBranchName: resolvedRef.name,
      });

      // Delete the subAgent from the config DB
      const deleted = await deleteSubAgent(db)({
        scopes: { tenantId, projectId, agentId },
        subAgentId: id,
      });

      if (!deleted) {
        throw createApiError({
          code: 'not_found',
          message: 'SubAgent not found',
        });
      }

      return c.body(null, 204);
    } catch (error) {
      if (error instanceof SubAgentIsDefaultError) {
        throw createApiError({
          code: 'conflict',
          message: error.message,
        });
      }
      throw error;
    }
  }
);

export default app;
