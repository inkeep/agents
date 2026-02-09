import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  AgentApiInsertSchema,
  AgentApiUpdateSchema,
  AgentListResponse,
  AgentResponse,
  AgentWithinContextOfProjectResponse,
  cascadeDeleteByAgent,
  commonGetErrorResponses,
  createAgent,
  createApiError,
  deleteAgent,
  ErrorResponseSchema,
  generateId,
  getAgentById,
  getAgentSubAgentInfos,
  getFullAgentDefinition,
  listAgentsPaginated,
  listSubAgents,
  PaginationQueryParamsSchema,
  RelatedAgentInfoListResponse,
  TenantProjectAgentParamsSchema,
  TenantProjectAgentSubAgentParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateAgent,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
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
  if (['PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

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
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    const result = await listAgentsPaginated(db)({
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
    const db = c.get('db');

    const agent = await getAgentById(db)({
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
    tags: ['Agents'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema,
    },
    responses: {
      200: {
        description: 'Related agent infos retrieved successfully',
        content: {
          'application/json': {
            schema: RelatedAgentInfoListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, subAgentId } = c.req.valid('param');
    const db = c.get('db');

    const relatedAgents = await getAgentSubAgentInfos(db)({
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
    tags: ['Agents'],
    request: {
      params: TenantProjectAgentParamsSchema,
    },
    responses: {
      200: {
        description: 'Full agent definition retrieved successfully',
        content: {
          'application/json': {
            schema: AgentWithinContextOfProjectResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const db = c.get('db');

    const fullAgent = await getFullAgentDefinition(db)({
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
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const validatedBody = c.req.valid('json');

    try {
      const agent = await createAgent(db)({
        tenantId,
        projectId,
        id: validatedBody.id || generateId(),
        name: validatedBody.name,
        description: validatedBody.description,
        defaultSubAgentId: validatedBody.defaultSubAgentId,
        contextConfigId: validatedBody.contextConfigId ?? undefined,
      });

      return c.json({ data: agent }, 201);
    } catch (error: any) {
      // Handle duplicate agent (PostgreSQL unique constraint violation)
      if (error?.cause?.code === '23505') {
        const agentId = validatedBody.id || 'unknown';
        throw createApiError({
          code: 'conflict',
          message: `An agent with ID '${agentId}' already exists`,
        });
      }

      // Re-throw other errors to be handled by the global error handler
      throw error;
    }
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
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const validatedBody = c.req.valid('json');

    const updatedAgent = await updateAgent(db)({
      scopes: { tenantId, projectId, agentId: id },
      data: {
        name: validatedBody.name,
        description: validatedBody.description,
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
    const db = c.get('db');
    const resolvedRef = c.get('resolvedRef');
    const { tenantId, projectId, id } = c.req.valid('param');

    // Get all subAgentIds for this agent before deleting
    const subAgents = await listSubAgents(db)({
      scopes: { tenantId, projectId, agentId: id },
    });
    const subAgentIds = subAgents.map((sa) => sa.id);

    // Delete runtime entities for this agent on this branch
    await cascadeDeleteByAgent(runDbClient)({
      scopes: { tenantId, projectId, agentId: id },
      fullBranchName: resolvedRef.name,
      subAgentIds,
    });

    // Delete the agent from the config DB
    const deleted = await deleteAgent(db)({
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
