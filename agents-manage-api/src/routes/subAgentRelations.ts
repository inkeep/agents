import { createRoute } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createSubAgentRelation,
  deleteSubAgentRelation,
  ErrorResponseSchema,
  generateId,
  getAgentRelationById,
  getAgentRelationsBySource,
  getSubAgentRelationsByTarget,
  listAgentRelations,
  type Pagination,
  PaginationQueryParamsSchema,
  SubAgentRelationApiInsertSchema,
  type SubAgentRelationApiSelect,
  SubAgentRelationApiUpdateSchema,
  SubAgentRelationListResponse,
  SubAgentRelationQuerySchema,
  SubAgentRelationResponse,
  TenantProjectAgentIdParamsSchema,
  TenantProjectAgentParamsSchema,
  updateAgentRelation,
  validateSubAgent,
} from '@inkeep/agents-core';
import { createAppWithDb } from '../utils/apps';

const app = createAppWithDb();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Sub Agent Relations',
    operationId: 'list-sub-agent-relations',
    tags: ['Sub Agent Relations'],
    request: {
      params: TenantProjectAgentParamsSchema,
      query: PaginationQueryParamsSchema.merge(SubAgentRelationQuerySchema),
    },
    responses: {
      200: {
        description: 'List of sub agent relations retrieved successfully',
        content: {
          'application/json': {
            schema: SubAgentRelationListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const { page = 1, limit = 10, sourceSubAgentId, targetSubAgentId } = c.req.valid('query');
    const pageNum = Number(page);
    const limitNum = Math.min(Number(limit), 100);

    try {
      let result: { data: SubAgentRelationApiSelect[]; pagination: Pagination };

      if (sourceSubAgentId) {
        const rawResult = await getAgentRelationsBySource(db)({
          scopes: { tenantId, projectId, agentId },
          sourceSubAgentId,
          pagination: { page: pageNum, limit: limitNum },
        });
        result = { ...rawResult, data: rawResult.data };
      } else if (targetSubAgentId) {
        const rawResult = await getSubAgentRelationsByTarget(db)({
          scopes: { tenantId, projectId, agentId },
          targetSubAgentId,
          pagination: { page: pageNum, limit: limitNum },
        });
        result = { ...rawResult, data: rawResult.data };
      } else {
        const rawResult = await listAgentRelations(db)({
          scopes: { tenantId, projectId, agentId },
          pagination: { page: pageNum, limit: limitNum },
        });
        result = { ...rawResult, data: rawResult.data };
      }

      return c.json(result);
    } catch (_error) {
      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to retrieve sub agent relations',
      });
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Sub Agent Relation',
    operationId: 'get-sub-agent-relation-by-id',
    tags: ['Sub Agent Relations'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Sub Agent relation found',
        content: {
          'application/json': {
            schema: SubAgentRelationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const agentRelation = (await getAgentRelationById(db)({
      scopes: { tenantId, projectId, agentId },
      relationId: id,
    })) as SubAgentRelationApiSelect | null;

    if (!agentRelation) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub Agent Relation not found',
      });
    }

    return c.json({ data: agentRelation });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Sub Agent Relation',
    operationId: 'create-sub-agent-relation',
    tags: ['Sub Agent Relations'],
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentRelationApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Sub Agent Relation created successfully',
        content: {
          'application/json': {
            schema: SubAgentRelationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const body = await c.req.valid('json');

    if (body.targetSubAgentId) {
      const subAgentExists = await validateSubAgent(db)({
        scopes: { tenantId, projectId, agentId, subAgentId: body.targetSubAgentId },
      });
      if (!subAgentExists) {
        throw createApiError({
          code: 'bad_request',
          message: `Sub agent with ID ${body.targetSubAgentId} not found`,
        });
      }
    }

    const existingRelations = await listAgentRelations(db)({
      scopes: { tenantId, projectId, agentId },
      pagination: { page: 1, limit: 1000 },
    });

    const isDuplicate = existingRelations.data.some((relation) => {
      if (relation.agentId !== agentId || relation.sourceSubAgentId !== body.sourceSubAgentId) {
        return false;
      }

      return relation.targetSubAgentId === body.targetSubAgentId;
    });

    if (isDuplicate) {
      throw createApiError({
        code: 'unprocessable_entity',
        message: `A relation between these agents in this agent already exists`,
      });
    }

    const relationData = {
      agentId,
      tenantId,
      id: generateId(),
      projectId,
      sourceSubAgentId: body.sourceSubAgentId,
      targetSubAgentId: body.targetSubAgentId,
      relationType: body.relationType,
    };

    const agentRelation = await createSubAgentRelation(db)({
      ...relationData,
    });

    return c.json({ data: agentRelation }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Sub Agent Relation',
    operationId: 'update-sub-agent-relation',
    tags: ['Sub Agent Relations'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentRelationApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Sub Agent relation updated successfully',
        content: {
          'application/json': {
            schema: SubAgentRelationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const body = await c.req.valid('json');

    const updatedAgentRelation = await updateAgentRelation(db)({
      scopes: { tenantId, projectId, agentId },
      relationId: id,
      data: body,
    });

    if (!updatedAgentRelation) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub Agent Relation not found',
      });
    }

    return c.json({ data: updatedAgentRelation });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Sub Agent Relation',
    operationId: 'delete-sub-agent-relation',
    tags: ['Sub Agent Relations'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Sub Agent Relation deleted successfully',
      },
      404: {
        description: 'Sub Agent Relation not found',
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
    const { tenantId, projectId, agentId, id } = c.req.valid('param');

    const deleted = await deleteSubAgentRelation(db)({
      scopes: { tenantId, projectId, agentId },
      relationId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub Agent Relation not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
