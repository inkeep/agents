import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  AgentToolRelationApiInsertSchema,
  AgentToolRelationApiSelectSchema,
  AgentToolRelationApiUpdateSchema,
  type AgentToolRelationSelect,
  commonGetErrorResponses,
  createAgentToolRelation,
  createApiError,
  deleteAgentToolRelation,
  ErrorResponseSchema,
  getAgentsForTool,
  getAgentToolRelationByAgent,
  getAgentToolRelationById,
  getAgentToolRelationByTool,
  getToolsForAgent,
  IdParamsSchema,
  ListResponseSchema,
  listAgentToolRelations,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantProjectGraphParamsSchema,
  TenantProjectParamsSchema,
  updateAgentToolRelation,
} from '@inkeep/agents-core';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

// List agent tool relations
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Agent Tool Relations',
    operationId: 'list-agent-tool-relations',
    tags: ['CRUD Agent Tool Relations'],
    request: {
      params: TenantProjectGraphParamsSchema,
      query: PaginationQueryParamsSchema.extend({
        agentId: z.string().optional(),
        toolId: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: 'List of agent tool relations retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(AgentToolRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId } = c.req.valid('param');
    const { page, limit, agentId, toolId } = c.req.valid('query');

    let result: {
      data: AgentToolRelationSelect[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    };

    // Filter by agent if provided
    if (agentId) {
      const dbResult = await getAgentToolRelationByAgent(dbClient)({
        scopes: { tenantId, projectId, graphId, agentId },
        pagination: { page, limit },
      });
      result = {
        data: dbResult.data,
        pagination: dbResult.pagination,
      };
    }
    // Filter by tool if provided
    else if (toolId) {
      const dbResult = await getAgentToolRelationByTool(dbClient)({
        scopes: { tenantId, projectId, graphId },
        toolId,
        pagination: { page, limit },
      });
      result = {
        data: dbResult.data,
        pagination: dbResult.pagination,
      };
    }
    // Default: get all agent tool relations
    else {
      const dbResult = await listAgentToolRelations(dbClient)({
        scopes: { tenantId, projectId, graphId },
        pagination: { page, limit },
      });
      result = {
        data: dbResult.data,
        pagination: dbResult.pagination,
      };
    }

    return c.json(result);
  }
);

// Get agent tool relation by ID
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Agent Tool Relation',
    operationId: 'get-agent-tool-relation',
    tags: ['CRUD Agent Tool Relations'],
    request: {
      params: TenantProjectGraphParamsSchema.merge(IdParamsSchema),
    },
    responses: {
      200: {
        description: 'Agent tool relation found',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentToolRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId, id } = c.req.valid('param');
    const agentToolRelation = await getAgentToolRelationById(dbClient)({
      scopes: { tenantId, projectId, graphId, agentId: id },
      relationId: id,
    });

    if (!agentToolRelation) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent tool relation not found',
      });
    }

    return c.json({ data: agentToolRelation });
  }
);

// Get tools for a specific agent (with tool details)
app.openapi(
  createRoute({
    method: 'get',
    path: '/agent/{agentId}/tools',
    summary: 'Get Tools for Agent',
    operationId: 'get-tools-for-agent',
    tags: ['CRUD Agent Tool Relations'],
    request: {
      params: TenantProjectGraphParamsSchema.extend({
        agentId: z.string(),
      }),
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'Tools for agent retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(AgentToolRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId, agentId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    const dbResult = await getToolsForAgent(dbClient)({
      scopes: { tenantId, projectId, graphId, agentId },
      pagination: { page, limit },
    });

    const result = {
      data: dbResult.data,
      pagination: dbResult.pagination,
    };

    return c.json(result);
  }
);

// Get agents for a specific tool (with agent details)
app.openapi(
  createRoute({
    method: 'get',
    path: '/tool/{toolId}/agents',
    summary: 'Get Agents for Tool',
    operationId: 'get-agents-for-tool',
    tags: ['CRUD Agent Tool Relations'],
    request: {
      params: TenantProjectGraphParamsSchema.extend({
        toolId: z.string(),
      }),
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'Agents for tool retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(AgentToolRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId, toolId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    const dbResult = await getAgentsForTool(dbClient)({
      scopes: { tenantId, projectId, graphId },
      toolId,
      pagination: { page, limit },
    });

    return c.json(dbResult);
  }
);

// Create agent tool relation
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Agent Tool Relation',
    operationId: 'create-agent-tool-relation',
    tags: ['CRUD Agent Tool Relations'],
    request: {
      params: TenantProjectGraphParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AgentToolRelationApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Agent tool relation created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentToolRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId } = c.req.valid('param');
    const body = c.req.valid('json');

    // Check if relation already exists (prevent duplicates)
    const existingRelations = await listAgentToolRelations(dbClient)({
      scopes: { tenantId, projectId, graphId },
      pagination: { limit: 1000 },
    });
    const isDuplicate = existingRelations.data.some((relation) => {
      const typedRelation = relation as AgentToolRelationSelect;
      return typedRelation.agentId === body.agentId && typedRelation.toolId === body.toolId;
    });

    if (isDuplicate) {
      throw createApiError({
        code: 'unprocessable_entity',
        message: 'Agent tool relation already exists',
      });
    }

    try {
      const agentToolRelation = await createAgentToolRelation(dbClient)({
        scopes: { tenantId, projectId },
        graphId,
        data: body,
      });
      return c.json({ data: agentToolRelation }, 201);
    } catch (error) {
      // Handle foreign key constraint violations
      if (
        error instanceof Error &&
        (error.message.includes('FOREIGN KEY constraint failed') ||
          error.message.includes('foreign key constraint') ||
          error.message.includes('SQLITE_CONSTRAINT_FOREIGNKEY') ||
          (error as any).code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
          (error as any)?.cause?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY')
      ) {
        throw createApiError({
          code: 'bad_request',
          message: 'Invalid agent ID or tool ID - referenced entity does not exist',
        });
      }
      throw error;
    }
  }
);

// Update agent tool relation
app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Agent Tool Relation',
    operationId: 'update-agent-tool-relation',
    tags: ['CRUD Agent Tool Relations'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
      body: {
        content: {
          'application/json': {
            schema: AgentToolRelationApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Agent tool relation updated successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentToolRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    console.log('id', id);
    const body = await c.req.valid('json');

    // Check if there are any fields to update
    if (Object.keys(body).length === 0) {
      throw createApiError({
        code: 'bad_request',
        message: 'No fields to update',
      });
    }

    const updatedAgentToolRelation = await updateAgentToolRelation(dbClient)({
      scopes: { tenantId, projectId },
      relationId: id,
      data: body,
    });

    if (!updatedAgentToolRelation) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent tool relation not found',
      });
    }

    return c.json({ data: updatedAgentToolRelation });
  }
);

// Delete agent tool relation
app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Agent Tool Relation',
    operationId: 'delete-agent-tool-relation',
    tags: ['CRUD Agent Tool Relations'],
    request: {
      params: TenantProjectGraphParamsSchema.merge(IdParamsSchema),
    },
    responses: {
      204: {
        description: 'Agent tool relation deleted successfully',
      },
      404: {
        description: 'Agent tool relation not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId, id } = c.req.valid('param');
    const deleted = await deleteAgentToolRelation(dbClient)({
      scopes: { tenantId, projectId, graphId },
      relationId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent tool relation not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
