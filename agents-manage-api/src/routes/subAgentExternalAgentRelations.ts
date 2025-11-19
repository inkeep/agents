import { createRoute } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createSubAgentExternalAgentRelation,
  deleteSubAgentExternalAgentRelation,
  ErrorResponseSchema,
  getSubAgentExternalAgentRelationById,
  listSubAgentExternalAgentRelations,
  type Pagination,
  PaginationQueryParamsSchema,
  SubAgentExternalAgentRelationApiInsertSchema,
  type SubAgentExternalAgentRelationApiSelect,
  SubAgentExternalAgentRelationApiUpdateSchema,
  SubAgentExternalAgentRelationListResponse,
  SubAgentExternalAgentRelationResponse,
  TenantProjectAgentSubAgentIdParamsSchema,
  TenantProjectAgentSubAgentParamsSchema,
  updateSubAgentExternalAgentRelation,
} from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import { createAppWithDb } from '../utils/apps';

const app = createAppWithDb();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Sub Agent External Agent Relations',
    operationId: 'list-sub-agent-external-agent-relations',
    tags: ['Sub Agent External Agent Relations'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of sub agent external agent relations retrieved successfully',
        content: {
          'application/json': {
            schema: SubAgentExternalAgentRelationListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId } = c.req.valid('param');
    const { page = 1, limit = 10 } = c.req.valid('query');
    const pageNum = Number(page);
    const limitNum = Math.min(Number(limit), 100);

    try {
      const result: { data: SubAgentExternalAgentRelationApiSelect[]; pagination: Pagination } =
        await listSubAgentExternalAgentRelations(db)({
          scopes: { tenantId, projectId, agentId, subAgentId },
          pagination: { page: pageNum, limit: limitNum },
        });

      return c.json(result);
    } catch (_error) {
      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to retrieve sub agent external agent relations',
      });
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Sub Agent External Agent Relation',
    operationId: 'get-sub-agent-external-agent-relation-by-id',
    tags: ['Sub Agent External Agent Relations'],
    request: {
      params: TenantProjectAgentSubAgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Sub Agent external agent relation found',
        content: {
          'application/json': {
            schema: SubAgentExternalAgentRelationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId, id } = c.req.valid('param');
    const relation = (await getSubAgentExternalAgentRelationById(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      relationId: id,
    })) as SubAgentExternalAgentRelationApiSelect | null;

    if (!relation) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub Agent External Agent Relation not found',
      });
    }

    return c.json({ data: relation });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Sub Agent External Agent Relation',
    operationId: 'create-sub-agent-external-agent-relation',
    tags: ['Sub Agent External Agent Relations'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentExternalAgentRelationApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Sub Agent External Agent Relation created successfully',
        content: {
          'application/json': {
            schema: SubAgentExternalAgentRelationResponse,
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
    const existingRelations = await listSubAgentExternalAgentRelations(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      pagination: { page: 1, limit: 1000 },
    });

    const isDuplicate = existingRelations.data.some(
      (relation) =>
        relation.externalAgentId === body.externalAgentId && relation.subAgentId === subAgentId
    );

    if (isDuplicate) {
      throw createApiError({
        code: 'unprocessable_entity',
        message: `A relation between this sub-agent and external agent already exists`,
      });
    }

    const relation = await createSubAgentExternalAgentRelation(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      relationId: nanoid(),
      data: {
        externalAgentId: body.externalAgentId,
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
    summary: 'Update Sub Agent External Agent Relation',
    operationId: 'update-sub-agent-external-agent-relation',
    tags: ['Sub Agent External Agent Relations'],
    request: {
      params: TenantProjectAgentSubAgentIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentExternalAgentRelationApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Sub Agent external agent relation updated successfully',
        content: {
          'application/json': {
            schema: SubAgentExternalAgentRelationResponse,
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

    const updatedRelation = await updateSubAgentExternalAgentRelation(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      relationId: id,
      data: body,
    });

    if (!updatedRelation) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub Agent External Agent Relation not found',
      });
    }

    return c.json({ data: updatedRelation });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Sub Agent External Agent Relation',
    operationId: 'delete-sub-agent-external-agent-relation',
    tags: ['Sub Agent External Agent Relations'],
    request: {
      params: TenantProjectAgentSubAgentIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Sub Agent External Agent Relation deleted successfully',
      },
      404: {
        description: 'Sub Agent External Agent Relation not found',
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

    const deleted = await deleteSubAgentExternalAgentRelation(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      relationId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Sub Agent External Agent Relation not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
