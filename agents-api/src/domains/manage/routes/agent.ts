import { OpenAPIHono } from '@hono/zod-openapi';
import {
  AgentApiInsertSchema,
  AgentApiUpdateSchema,
  AgentListResponse,
  AgentResponse,
  AgentWithinContextOfProjectResponse,
  AgentWithinContextOfProjectSelectResponse,
  canViewProject,
  commonGetErrorResponses,
  createAgent,
  createApiError,
  DuplicateAgentRequestSchema,
  deleteAgent,
  duplicateFullAgentServerSide,
  ErrorResponseSchema,
  generateId,
  getAgentById,
  getAgentSubAgentInfos,
  getFullAgentDefinition,
  type ImportAgentRequest,
  ImportAgentRequestSchema,
  ImportAgentResponseSchema,
  listAgentsPaginated,
  PaginationQueryParamsSchema,
  RelatedAgentInfoListResponse,
  TenantProjectAgentParamsSchema,
  TenantProjectAgentSubAgentParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  type OrgRole,
  throwIfUniqueConstraintError,
  updateAgent,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { clearWorkspaceConnectionCache } from '@inkeep/agents-work-apps/slack';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import {
  type ManageRouteHandler,
  openapiRegisterPutPatchRoutesForLegacy,
} from '../../../utils/openapiDualRoute';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

type ImportAgentHandlerContext = {
  req: {
    valid(target: 'param'): { tenantId: string; projectId: string };
    valid(target: 'json'): ImportAgentRequest;
  };
  get(key: 'userId' | 'tenantId' | 'tenantRole'): string | undefined;
};

export const importAgentHandler = async (c: ImportAgentHandlerContext) => {
  const { projectId } = c.req.valid('param');
  const body = c.req.valid('json');

  if (body.sourceProjectId === projectId) {
    throw createApiError({
      code: 'bad_request',
      message:
        'Source and target project must differ. Use /duplicate to copy within the same project.',
    });
  }

  if (process.env.ENVIRONMENT !== 'test') {
    const userId = c.get('userId');
    const tenantId = c.get('tenantId');

    if (!userId || !tenantId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'User or organization context not found',
      });
    }

    if (userId !== 'system' && !userId.startsWith('apikey:')) {
      const hasSourceProjectAccess = await canViewProject({
        userId,
        tenantId,
        projectId: body.sourceProjectId,
        orgRole: c.get('tenantRole') as OrgRole,
      });

      if (!hasSourceProjectAccess) {
        throw createApiError({
          code: 'not_found',
          message: 'Project not found',
        });
      }
    }
  }

  throw createApiError({
    code: 'internal_server_error',
    message: 'Import agent service not implemented',
  });
};

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

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/import',
    summary: 'Import Agent',
    operationId: 'import-agent',
    tags: ['Agents'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ImportAgentRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Agent imported successfully',
        content: {
          'application/json': {
            schema: ImportAgentResponseSchema,
          },
        },
      },
      409: {
        description: 'Import conflict',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => importAgentHandler(c as ImportAgentHandlerContext)
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{agentId}/duplicate',
    summary: 'Duplicate Agent',
    operationId: 'duplicate-agent',
    tags: ['Agents'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: DuplicateAgentRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Agent duplicated successfully',
        content: {
          'application/json': {
            schema: AgentWithinContextOfProjectSelectResponse,
          },
        },
      },
      409: {
        description: 'Agent already exists',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const body = c.req.valid('json');

    const duplicatedAgent = await duplicateFullAgentServerSide(db)({
      scopes: { tenantId, projectId, agentId },
      ...body,
    });

    return c.json({ data: duplicatedAgent }, 201);
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
