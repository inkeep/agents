import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  AgentApiInsertSchema,
  AgentApiSelectSchema,
  AgentApiUpdateSchema,
  commonGetErrorResponses,
  createAgent,
  createApiError,
  deleteAgent,
  ErrorResponseSchema,
  getAgentById,
  ListResponseSchema,
  listAgentsPaginated,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantProjectGraphParamsSchema,
  TenantProjectGraphIdParamsSchema,
  updateAgent,
} from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Agents',
    operationId: 'list-agents',
    tags: ['Agent'],
    request: {
      params: TenantProjectGraphParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of agents retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(AgentApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    const result = await listAgentsPaginated(dbClient)({
      scopes: { tenantId, projectId, graphId },
      pagination: { page, limit },
    });
    // Add type field to all agents in the response
    const dataWithType = {
      ...result,
      data: result.data.map((agent) => ({
        ...agent,
        type: 'internal' as const,
      })),
    };

    return c.json(dataWithType);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Agent',
    operationId: 'get-agent-by-id',
    tags: ['Agent'],
    request: {
      params: TenantProjectGraphIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Agent found',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId, id } = c.req.valid('param');
    const agent = await getAgentById(dbClient)({
      scopes: { tenantId, projectId, graphId },
      agentId: id,
    });

    if (!agent) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    // Add type field to the agent response
    const agentWithType = {
      ...agent,
      type: 'internal' as const,
    };

    return c.json({ data: agentWithType });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Agent',
    operationId: 'create-agent',
    tags: ['Agent'],
    request: {
      params: TenantProjectGraphParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AgentApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Agent created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId } = c.req.valid('param');
    const body = c.req.valid('json');
    const agentId = body.id ? String(body.id) : nanoid();
    const agent = await createAgent(dbClient)({
      ...body,
      id: agentId,
      tenantId,
      projectId,
      graphId,
    });

    // Add type field to the agent response
    const agentWithType = {
      ...agent,
      type: 'internal' as const,
    };

    return c.json({ data: agentWithType }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Agent',
    operationId: 'update-agent',
    tags: ['Agent'],
    request: {
      params: TenantProjectGraphIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AgentApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Agent updated successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const updatedAgent = await updateAgent(dbClient)({
      scopes: { tenantId, projectId, graphId },
      agentId: id,
      data: body,
    });

    if (!updatedAgent) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    // Add type field to the agent response
    const agentWithType = {
      ...updatedAgent,
      type: 'internal' as const,
    };

    return c.json({ data: agentWithType });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Agent',
    operationId: 'delete-agent',
    tags: ['Agent'],
    request: {
      params: TenantProjectGraphIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Agent deleted successfully',
      },
      404: {
        description: 'Agent not found',
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

    const deleted = await deleteAgent(dbClient)({
      scopes: { tenantId, projectId, graphId },
      agentId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
