import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createSubAgentTeamAgentRelation,
  deleteSubAgentTeamAgentRelation,
  ErrorResponseSchema,
  generateId,
  getSubAgentTeamAgentRelationById,
  listSubAgentTeamAgentRelations,
  type Pagination,
  PaginationQueryParamsSchema,
  SubAgentTeamAgentRelationApiInsertSchema,
  type SubAgentTeamAgentRelationApiSelect,
  SubAgentTeamAgentRelationApiUpdateSchema,
  SubAgentTeamAgentRelationListResponse,
  SubAgentTeamAgentRelationResponse,
  TenantProjectAgentSubAgentIdParamsSchema,
  TenantProjectAgentSubAgentParamsSchema,
  updateSubAgentTeamAgentRelation,
} from '@inkeep/agents-core';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.use('/:id', async (c, next) => {
  if (c.req.method === 'PUT') {
    return requireProjectPermission('edit')(c, next);
  }
  if (c.req.method === 'DELETE') {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Sub Agent Team Agent Relations',
    operationId: 'list-sub-agent-team-agent-relations',
    tags: ['SubAgents'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of sub agent team agent relations retrieved successfully',
        content: {
          'application/json': {
            schema: SubAgentTeamAgentRelationListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId } = c.req.valid('param');
    const { page = 1, limit = 10 } = c.req.valid('query');
    const pageNum = Number(page);
    const limitNum = Math.min(Number(limit), 100);

    try {
      const result: { data: SubAgentTeamAgentRelationApiSelect[]; pagination: Pagination } =
        await listSubAgentTeamAgentRelations(db)({
          scopes: { tenantId, projectId, agentId, subAgentId },
          pagination: { page: pageNum, limit: limitNum },
        });

      return c.json(result);
    } catch {
      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to retrieve sub agent team agent relations',
      });
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Sub Agent Team Agent Relation',
    operationId: 'get-sub-agent-team-agent-relation-by-id',
    tags: ['SubAgents'],
    request: {
      params: TenantProjectAgentSubAgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Sub Agent team agent relation found',
        content: {
          'application/json': {
            schema: SubAgentTeamAgentRelationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId, id } = c.req.valid('param');
    const relation = await getSubAgentTeamAgentRelationById(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      relationId: id,
    });

    if (!relation) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub Agent Team Agent Relation not found',
      });
    }

    return c.json({ data: relation });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Sub Agent Team Agent Relation',
    operationId: 'create-sub-agent-team-agent-relation',
    tags: ['SubAgents'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentTeamAgentRelationApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Sub Agent Team Agent Relation created successfully',
        content: {
          'application/json': {
            schema: SubAgentTeamAgentRelationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId } = c.req.valid('param');
    const body = await c.req.valid('json');

    // Check for duplicate relation
    const existingRelations = await listSubAgentTeamAgentRelations(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      pagination: { page: 1, limit: 1000 },
    });

    const isDuplicate = existingRelations.data.some(
      (relation) =>
        relation.targetAgentId === body.targetAgentId && relation.subAgentId === subAgentId
    );

    if (isDuplicate) {
      throw createApiError({
        code: 'unprocessable_entity',
        message: `A relation between this sub-agent and team agent already exists`,
      });
    }

    const relation = await createSubAgentTeamAgentRelation(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      relationId: generateId(),
      data: {
        targetAgentId: body.targetAgentId,
        headers: body.headers || null,
      },
    });

    return c.json({ data: relation }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Sub Agent Team Agent Relation',
    operationId: 'update-sub-agent-team-agent-relation',
    tags: ['SubAgents'],
    request: {
      params: TenantProjectAgentSubAgentIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentTeamAgentRelationApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Sub Agent team agent relation updated successfully',
        content: {
          'application/json': {
            schema: SubAgentTeamAgentRelationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId, id } = c.req.valid('param');
    const body = await c.req.valid('json');

    const updatedRelation = await updateSubAgentTeamAgentRelation(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      relationId: id,
      data: body,
    });

    if (!updatedRelation) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub Agent Team Agent Relation not found',
      });
    }

    return c.json({ data: updatedRelation });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Sub Agent Team Agent Relation',
    operationId: 'delete-sub-agent-team-agent-relation',
    tags: ['SubAgents'],
    request: {
      params: TenantProjectAgentSubAgentIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Sub Agent Team Agent Relation deleted successfully',
      },
      404: {
        description: 'Sub Agent Team Agent Relation not found',
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
    const { tenantId, projectId, agentId, subAgentId, id } = c.req.valid('param');

    const deleted = await deleteSubAgentTeamAgentRelation(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      relationId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub Agent Team Agent Relation not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
