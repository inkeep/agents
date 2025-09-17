import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  AgentRelationApiInsertSchema,
  type AgentRelationApiSelect,
  AgentRelationApiSelectSchema,
  AgentRelationApiUpdateSchema,
  AgentRelationQuerySchema,
  commonGetErrorResponses,
  createAgentRelation,
  createApiError,
  deleteAgentRelation,
  ErrorResponseSchema,
  getAgentRelationById,
  getAgentRelationsBySource,
  getAgentRelationsByTarget,
  getExternalAgentRelations,
  IdParamsSchema,
  ListResponseSchema,
  listAgentRelations,
  type Pagination,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateAgentRelation,
  validateExternalAgent,
  validateInternalAgent,
} from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

// List agent relations
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Agent Relations',
    operationId: 'list-agent-relations',
    tags: ['CRUD Agent Relations'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema.merge(AgentRelationQuerySchema),
    },
    responses: {
      200: {
        description: 'List of agent relations retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(AgentRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const {
      page = 1,
      limit = 10,
      sourceAgentId,
      targetAgentId,
      externalAgentId,
    } = c.req.valid('query');
    const pageNum = Number(page);
    const limitNum = Math.min(Number(limit), 100);

    try {
      let result: { data: AgentRelationApiSelect[]; pagination: Pagination };

      if (sourceAgentId) {
        const rawResult = await getAgentRelationsBySource(dbClient)({
          scopes: { tenantId, projectId },
          sourceAgentId,
          pagination: { page: pageNum, limit: limitNum },
        });
        result = { ...rawResult, data: rawResult.data };
      } else if (targetAgentId) {
        const rawResult = await getAgentRelationsByTarget(dbClient)({
          scopes: { tenantId, projectId },
          targetAgentId,
          pagination: { page: pageNum, limit: limitNum },
        });
        result = { ...rawResult, data: rawResult.data };
      } else if (externalAgentId) {
        const rawResult = await getExternalAgentRelations(dbClient)({
          scopes: { tenantId, projectId },
          externalAgentId,
          pagination: { page: pageNum, limit: limitNum },
        });
        result = { ...rawResult, data: rawResult.data };
      } else {
        const rawResult = await listAgentRelations(dbClient)({
          scopes: { tenantId, projectId, graphId: 'default' },
          pagination: { page: pageNum, limit: limitNum },
        });
        result = { ...rawResult, data: rawResult.data };
      }

      return c.json(result);
    } catch (_error) {
      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to retrieve agent relations',
      });
    }
  }
);

// Get agent relation by ID
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Agent Relation',
    operationId: 'get-agent-relation-by-id',
    tags: ['CRUD Agent Relations'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
    },
    responses: {
      200: {
        description: 'Agent relation found',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const agentRelation = (await getAgentRelationById(dbClient)({
      scopes: { tenantId, projectId, graphId: 'default' },
      relationId: id,
    })) as AgentRelationApiSelect | null;

    if (!agentRelation) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent relation not found',
      });
    }

    return c.json({ data: agentRelation });
  }
);

// Create agent relation
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Agent Relation',
    operationId: 'create-agent-relation',
    tags: ['CRUD Agent Relations'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AgentRelationApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Agent relation created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const body = await c.req.valid('json');

    // Determine if this is an external agent relationship
    const isExternalAgent = body.externalAgentId != null;

    // Validate that the target agent exists in the appropriate table
    if (isExternalAgent && body.externalAgentId) {
      // Check if external agent exists
      const externalAgentExists = await validateExternalAgent(dbClient)({
        scopes: { tenantId, projectId },
        agentId: body.externalAgentId,
      });
      if (!externalAgentExists) {
        throw createApiError({
          code: 'bad_request',
          message: `External agent with ID ${body.externalAgentId} not found`,
        });
      }
    }

    if (!isExternalAgent && body.targetAgentId) {
      // Check if internal agent exists
      const internalAgentExists = await validateInternalAgent(dbClient)({
        scopes: { tenantId, projectId },
        agentId: body.targetAgentId,
      });
      if (!internalAgentExists) {
        throw createApiError({
          code: 'bad_request',
          message: `Internal agent with ID ${body.targetAgentId} not found`,
        });
      }
    }

    // Check if relation already exists (prevent duplicates)
    const existingRelations = await listAgentRelations(dbClient)({
      scopes: { tenantId, projectId, graphId: body.graphId },
      pagination: { page: 1, limit: 1000 },
    });

    const isDuplicate = existingRelations.data.some((relation) => {
      if (relation.graphId !== body.graphId || relation.sourceAgentId !== body.sourceAgentId) {
        return false;
      }

      // Check for duplicate based on relationship type
      if (isExternalAgent) {
        return relation.externalAgentId === body.externalAgentId;
      }
      return relation.targetAgentId === body.targetAgentId;
    });

    if (isDuplicate) {
      const agentType = isExternalAgent ? 'external' : 'internal';
      throw createApiError({
        code: 'unprocessable_entity',
        message: `A relation between these agents (${agentType}) in this graph already exists`,
      });
    }

    // Create the relation with the correct data structure
    const relationData = {
      graphId: body.graphId,
      tenantId,
      id: nanoid(),
      projectId,
      sourceAgentId: body.sourceAgentId,
      targetAgentId: isExternalAgent ? undefined : body.targetAgentId,
      externalAgentId: isExternalAgent ? body.externalAgentId : undefined,
      relationType: body.relationType,
    };

    const agentRelation = await createAgentRelation(dbClient)({
      ...relationData,
    });

    return c.json({ data: agentRelation }, 201);
  }
);

// Update agent relation
app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Agent Relation',
    operationId: 'update-agent-relation',
    tags: ['CRUD Agent Relations'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
      body: {
        content: {
          'application/json': {
            schema: AgentRelationApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Agent relation updated successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = await c.req.valid('json');

    const updatedAgentRelation = await updateAgentRelation(dbClient)({
      scopes: { tenantId, projectId },
      relationId: id,
      data: body,
    });

    if (!updatedAgentRelation) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent relation not found',
      });
    }

    return c.json({ data: updatedAgentRelation });
  }
);

// Delete agent relation
app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Agent Relation',
    operationId: 'delete-agent-relation',
    tags: ['CRUD Agent Relations'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
    },
    responses: {
      204: {
        description: 'Agent relation deleted successfully',
      },
      404: {
        description: 'Agent relation not found',
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

    const deleted = await deleteAgentRelation(dbClient)({
      scopes: { tenantId, projectId },
      relationId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent relation not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
