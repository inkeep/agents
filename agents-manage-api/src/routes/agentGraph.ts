// @ts-nocheck
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { listAgentGraphs } from '@inkeep/agents-core';
import { env } from '../../env';
import { commonGetErrorResponses, createApiError } from '@inkeep/agents-core';
import {
  createAgentGraph,
  deleteAgentGraph,
  getAgentGraph,
  getAgentGraphByGraphId,
  getAgentGraphWithDefaultAgent,
  getFullGraphDefinition,
  getGraphAgentInfos,
  updateAgentGraph,
  AgentApiSelectSchema,
  AgentGraphApiInsertSchema,
  AgentGraphApiSelectSchema,
  AgentGraphApiUpdateSchema,
  ErrorResponseSchema,
  FullGraphDefinitionSchema,
  IdParamsSchema,
  ListResponseSchema,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

// List agent graphs
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Agent Graphs',
    operationId: 'list-agent-graphs',
    tags: ['CRUD Agent Graph'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of agent graphs retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(AgentGraphApiSelectSchema),
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

    const graphs = await listAgentGraphs(dbClient)({ scopes: { tenantId, projectId } });
    return c.json({
      data: graphs,
      pagination: {
        page,
        limit,
        total: graphs.length,
        pages: Math.ceil(graphs.length / limit),
      },
    });
  }
);

// Get agent graph by ID
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Agent Graph',
    operationId: 'get-agent-graph',
    tags: ['CRUD Agent Graph'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
    },
    responses: {
      200: {
        description: 'Agent graph found',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentGraphApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const graph = await getAgentGraph(dbClient)({
      scopes: { tenantId, projectId },
      graphId: id,
    });

    if (!graph) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent graph not found',
      });
    }

    return c.json({ data: graph });
  }
);

// Get related agent infos for a specific agent within a graph
app.openapi(
  createRoute({
    method: 'get',
    path: '/{graphId}/agents/{agentId}/related',
    summary: 'Get Related Agent Infos',
    operationId: 'get-related-agent-infos',
    tags: ['CRUD Agent Graph'],
    request: {
      params: TenantProjectParamsSchema.extend({
        graphId: z.string(),
        agentId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Related agent infos retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(
              z.object({
                id: z.string(),
                name: z.string(),
                description: z.string(),
              })
            ),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId, agentId } = c.req.valid('param');

    const relatedAgents = await getGraphAgentInfos(dbClient)({
      scopes: { tenantId, projectId },
      graphId,
      agentId,
    });

    return c.json({
      data: relatedAgents,
      pagination: {
        page: 1,
        limit: relatedAgents.length,
        total: relatedAgents.length,
        pages: 1,
      },
    });
  }
);

// Get full graph definition
app.openapi(
  createRoute({
    method: 'get',
    path: '/{graphId}/full',
    summary: 'Get Full Graph Definition',
    operationId: 'get-full-graph-definition',
    tags: ['CRUD Agent Graph'],
    request: {
      params: TenantProjectParamsSchema.extend({
        graphId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Full graph definition retrieved successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(FullGraphDefinitionSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId } = c.req.valid('param');

    const fullGraph = await getFullGraphDefinition(dbClient)({
      scopes: { tenantId, projectId },
      graphId,
    });

    if (!fullGraph) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent graph not found',
      });
    }

    return c.json({ data: fullGraph });
  }
);

// Create agent graph
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Agent Graph',
    operationId: 'create-agent-graph',
    tags: ['CRUD Agent Graph'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AgentGraphApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Agent graph created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentGraphApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const validatedBody = c.req.valid('json');

    const graph = await createAgentGraph(dbClient)({
      tenantId,
      projectId,
      id: validatedBody.id || nanoid(),
      name: validatedBody.name,
      defaultAgentId: validatedBody.defaultAgentId,
      contextConfigId: validatedBody.contextConfigId ?? undefined,
    });

    return c.json({ data: graph }, 201);
  }
);

// Update agent graph
app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Agent Graph',
    operationId: 'update-agent-graph',
    tags: ['CRUD Agent Graph'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
      body: {
        content: {
          'application/json': {
            schema: AgentGraphApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Agent graph updated successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentGraphApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const validatedBody = c.req.valid('json');

    const updatedGraph = await updateAgentGraph(dbClient)({
      scopes: { tenantId, projectId },
      graphId: id,
      data: {
        defaultAgentId: validatedBody.defaultAgentId,
        contextConfigId: validatedBody.contextConfigId ?? undefined,
      },
    });

    if (!updatedGraph) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent graph not found',
      });
    }

    return c.json({ data: updatedGraph });
  }
);

// Delete agent graph
app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Agent Graph',
    operationId: 'delete-agent-graph',
    tags: ['CRUD Agent Graph'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
    },
    responses: {
      204: {
        description: 'Agent graph deleted successfully',
      },
      404: {
        description: 'Agent graph not found',
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
    const deleted = await deleteAgentGraph(dbClient)({
      scopes: { tenantId, projectId },
      graphId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent graph not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
