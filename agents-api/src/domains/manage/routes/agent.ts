import { OpenAPIHono } from '@hono/zod-openapi';
import {
  AgentApiInsertSchema,
  AgentApiUpdateSchema,
  AgentListResponse,
  AgentResponse,
  AgentWithinContextOfProjectResponse,
  commonGetErrorResponses,
  createAgent,
  createApiError,
  dbResultToMcpTool,
  deleteAgent,
  ErrorResponseSchema,
  generateId,
  getAgentById,
  getAgentSubAgentInfos,
  getFullAgentDefinition,
  getToolById,
  listAgentsPaginated,
  listAgentToolRelations,
  PaginationQueryParamsSchema,
  RelatedAgentInfoListResponse,
  TenantProjectAgentParamsSchema,
  TenantProjectAgentSubAgentParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  ToolStatusSchema,
  throwIfUniqueConstraintError,
  updateAgent,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { clearWorkspaceConnectionCache } from '@inkeep/agents-work-apps/slack';
import { z } from 'zod';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import {
  type ManageRouteHandler,
  openapiRegisterPutPatchRoutesForLegacy,
} from '../../../utils/openapiDualRoute';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Agents',
    operationId: 'list-agents',
    tags: ['Agents'],
    permission: requireProjectPermission('view'),
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
  createProtectedRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Agent',
    operationId: 'get-agent',
    tags: ['Agents'],
    permission: requireProjectPermission('view'),
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
  createProtectedRoute({
    method: 'get',
    path: '/{agentId}/sub-agents/{subAgentId}/related',
    summary: 'Get Related Agent Infos',
    operationId: 'get-related-agent-infos',
    tags: ['Agents'],
    permission: requireProjectPermission('view'),
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
  createProtectedRoute({
    method: 'get',
    path: '/{agentId}/full',
    summary: 'Get Full Agent Definition',
    operationId: 'get-full-agent-definition',
    tags: ['Agents'],
    permission: requireProjectPermission('view'),
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

const AgentToolStatusItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: ToolStatusSchema,
    lastError: z.string().nullable(),
    expiresAt: z.string().nullable(),
    imageUrl: z.string().nullable(),
    subAgentIds: z.array(z.string()),
  })
  .openapi('AgentToolStatusItem');

const AgentToolStatusListResponseSchema = z
  .object({
    data: z.array(AgentToolStatusItemSchema),
  })
  .openapi('AgentToolStatusListResponse');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{agentId}/tool-status',
    summary: 'Get Tool Status for Agent',
    description:
      'Returns a deduped list of MCP tools used by any sub-agent of the given agent, with live health status. Probes each unique MCP server once.',
    operationId: 'get-agent-tool-status',
    tags: ['Agents', 'Tools'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectAgentParamsSchema,
      query: z.object({
        status: ToolStatusSchema.optional(),
      }),
    },
    responses: {
      200: {
        description: 'Agent tool status retrieved successfully',
        content: {
          'application/json': {
            schema: AgentToolStatusListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const { status: statusFilter } = c.req.valid('query');
    const credentialStores = c.get('credentialStores');
    const userId = c.get('userId');

    const agent = await getAgentById(db)({
      scopes: { tenantId, projectId, agentId },
    });
    if (!agent) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    const subAgentIdsByToolId = new Map<string, Set<string>>();
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const relationsResult = await listAgentToolRelations(db)({
        scopes: { tenantId, projectId, agentId },
        pagination: { page, limit: 100 },
      });
      for (const relation of relationsResult.data) {
        const set = subAgentIdsByToolId.get(relation.toolId) ?? new Set<string>();
        set.add(relation.subAgentId);
        subAgentIdsByToolId.set(relation.toolId, set);
      }
      hasMore = page < relationsResult.pagination.pages;
      page++;
    }

    const uniqueToolIds = Array.from(subAgentIdsByToolId.keys());

    const PROBE_CONCURRENCY = 5;
    const probedTools: Awaited<ReturnType<typeof dbResultToMcpTool>>[] = [];
    for (let i = 0; i < uniqueToolIds.length; i += PROBE_CONCURRENCY) {
      const batch = uniqueToolIds.slice(i, i + PROBE_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (toolId) => {
          const tool = await getToolById(db)({ scopes: { tenantId, projectId }, toolId });
          if (!tool) {
            return null;
          }
          return dbResultToMcpTool(tool, db, credentialStores, undefined, userId);
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value !== null) {
          probedTools.push(r.value);
        }
      }
    }

    const data = probedTools
      .map((tool) => ({
        id: tool.id,
        name: tool.name,
        status: tool.status,
        lastError: tool.lastError ?? null,
        expiresAt: tool.expiresAt ?? null,
        imageUrl: tool.imageUrl ?? null,
        subAgentIds: Array.from(subAgentIdsByToolId.get(tool.id) ?? []),
      }))
      .filter((tool) => (statusFilter ? tool.status === statusFilter : true));

    return c.json({ data });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Agent',
    operationId: 'create-agent',
    tags: ['Agents'],
    permission: requireProjectPermission('edit'),
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
        ...validatedBody,
        id: validatedBody.id || generateId(),
        tenantId,
        projectId,
      });

      return c.json({ data: agent }, 201);
    } catch (error: any) {
      throwIfUniqueConstraintError(
        error,
        `An agent with ID '${validatedBody.id || 'unknown'}' already exists`
      );

      // Re-throw other errors to be handled by the global error handler
      throw error;
    }
  }
);

const updateAgentRouteConfig = {
  path: '/{id}' as const,
  summary: 'Update Agent',
  tags: ['Agents'],
  permission: requireProjectPermission('edit'),
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
};

const updateAgentHandler: ManageRouteHandler<typeof updateAgentRouteConfig> = async (c) => {
  const db = c.get('db');
  const { tenantId, projectId, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');

  const updatedAgent = await updateAgent(db)({
    scopes: { tenantId, projectId, agentId: id },
    data: validatedBody,
  });

  if (!updatedAgent) {
    throw createApiError({
      code: 'not_found',
      message: 'Agent not found',
    });
  }

  return c.json({ data: updatedAgent });
};

openapiRegisterPutPatchRoutesForLegacy(app, updateAgentRouteConfig, updateAgentHandler, {
  operationId: 'update-agent',
});

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Agent',
    operationId: 'delete-agent',
    tags: ['Agents'],
    permission: requireProjectPermission('edit'),
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
    const { tenantId, projectId, id } = c.req.valid('param');

    const deleted = await deleteAgent(db)({
      scopes: { tenantId, projectId, agentId: id },
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    clearWorkspaceConnectionCache();

    return c.body(null, 204);
  }
);

export default app;
