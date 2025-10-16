import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  AgentApiInsertSchema,
  AgentApiSelectSchema,
  AgentApiUpdateSchema,
  AgentListResponse,
  AgentResponse,
  AgentWithinContextOfProjectSchema,
  commonGetErrorResponses,
  createAgent,
  createApiError,
  deleteAgent,
  ErrorResponseSchema,
  getAgentById,
  getAgentSubAgentInfos,
  getFullAgentDefinition,
  ListResponseSchema,
  listAgents,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantProjectAgentParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateAgent,
} from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Agents',
    operationId: 'list-agents',
    tags: ['Agents'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of agents retrieved successfully',
        content: {
          'application/json': {
            schema: AgentListResponse,
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

    const agent = await listAgents(dbClient)({ scopes: { tenantId, projectId } });
    return c.json({
      data: agent,
      pagination: {
        page,
        limit,
        total: agent.length,
        pages: Math.ceil(agent.length / limit),
      },
    });
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Agent',
    operationId: 'get-agent',
    tags: ['Agents'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Agent found',
        content: {
          'application/json': {
            schema: AgentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const agent = await getAgentById(dbClient)({
      scopes: { tenantId, projectId, agentId: id },
    });

    if (!agent) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    return c.json({ data: agent });
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{agentId}/sub-agents/{subAgentId}/related',
    summary: 'Get Related Agent Infos',
    operationId: 'get-related-agent-infos',
    tags: ['Agent'],
    request: {
      params: TenantProjectParamsSchema.extend({
        agentId: z.string(),
        subAgentId: z.string(),
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
    const { tenantId, projectId, agentId, subAgentId } = c.req.valid('param');

    const relatedAgents = await getAgentSubAgentInfos(dbClient)({
      scopes: { tenantId, projectId },
      agentId: agentId,
      subAgentId: subAgentId,
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

app.openapi(
  createRoute({
    method: 'get',
    path: '/{agentId}/full',
    summary: 'Get Full Agent Definition',
    operationId: 'get-full-agent-definition',
    tags: ['Agent'],
    request: {
      params: TenantProjectAgentParamsSchema,
    },
    responses: {
      200: {
        description: 'Full agent definition retrieved successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentWithinContextOfProjectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');

    const fullAgent = await getFullAgentDefinition(dbClient)({
      scopes: { tenantId, projectId, agentId },
    });

    if (!fullAgent) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    return c.json({ data: fullAgent });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Agent',
    operationId: 'create-agent',
    tags: ['Agents'],
    request: {
      params: TenantProjectParamsSchema,
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
            schema: AgentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const validatedBody = c.req.valid('json');

    const agent = await createAgent(dbClient)({
      tenantId,
      projectId,
      id: validatedBody.id || nanoid(),
      name: validatedBody.name,
      defaultSubAgentId: validatedBody.defaultSubAgentId,
      contextConfigId: validatedBody.contextConfigId ?? undefined,
    });

    return c.json({ data: agent }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Agent',
    operationId: 'update-agent',
    tags: ['Agents'],
    request: {
      params: TenantProjectIdParamsSchema,
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
            schema: AgentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const validatedBody = c.req.valid('json');

    const updatedAgent = await updateAgent(dbClient)({
      scopes: { tenantId, projectId, agentId: id },
      data: {
        defaultSubAgentId: validatedBody.defaultSubAgentId,
        contextConfigId: validatedBody.contextConfigId ?? undefined,
      },
    });

    if (!updatedAgent) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    return c.json({ data: updatedAgent });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Agent',
    operationId: 'delete-agent',
    tags: ['Agents'],
    request: {
      params: TenantProjectIdParamsSchema,
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
    const { tenantId, projectId, id } = c.req.valid('param');
    const deleted = await deleteAgent(dbClient)({
      scopes: { tenantId, projectId, agentId: id },
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
