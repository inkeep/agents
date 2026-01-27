import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  addFunctionToolToSubAgent,
  ComponentAssociationListResponse,
  commonGetErrorResponses,
  createApiError,
  ErrorResponseSchema,
  ExistsResponseSchema,
  FunctionToolListResponse,
  getFunctionToolById,
  getFunctionToolsForSubAgent,
  getSubAgentById,
  getSubAgentsUsingFunctionTool,
  isFunctionToolAssociatedWithSubAgent,
  RemovedResponseSchema,
  removeFunctionToolFromSubAgent,
  SubAgentFunctionToolRelationApiInsertSchema,
  SubAgentFunctionToolRelationResponse,
  TenantProjectAgentParamsSchema,
  TenantProjectAgentSubAgentParamsSchema,
} from '@inkeep/agents-core';

import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.use('/sub-agent/:subAgentId/function-tool/:functionToolId', async (c, next) => {
  if (c.req.method === 'DELETE') {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/sub-agent/{subAgentId}',
    summary: 'Get Function Tools for SubAgent',
    operationId: 'get-function-tools-for-sub-agent',
    tags: ['SubAgents', 'Function Tools'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema,
    },
    responses: {
      200: {
        description: 'Function tools retrieved successfully',
        content: {
          'application/json': {
            schema: FunctionToolListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId } = c.req.valid('param');

    const result = await getFunctionToolsForSubAgent(db)({
      scopes: { tenantId, projectId, agentId },
      subAgentId,
    });

    return c.json(result);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/function-tool/{functionToolId}/sub-agents',
    summary: 'Get SubAgents Using Function Tool',
    operationId: 'get-sub-agents-using-function-tool',
    tags: ['SubAgents', 'Function Tools'],
    request: {
      params: TenantProjectAgentParamsSchema.extend({
        functionToolId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'SubAgents retrieved successfully',
        content: {
          'application/json': {
            schema: ComponentAssociationListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, functionToolId } = c.req.valid('param');

    const agents = await getSubAgentsUsingFunctionTool(db)({
      scopes: { tenantId, projectId, agentId },
      functionToolId,
    });

    return c.json({ data: agents });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Associate Function Tool with SubAgent',
    operationId: 'associate-function-tool-with-sub-agent',
    tags: ['SubAgents', 'Function Tools'],
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentFunctionToolRelationApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'SubAgent function tool association created successfully',
        content: {
          'application/json': {
            schema: SubAgentFunctionToolRelationResponse,
          },
        },
      },
      409: {
        description: 'Association already exists',
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
    const { subAgentId, functionToolId } = c.req.valid('json');

    const [subAgent, functionTool] = await Promise.all([
      getSubAgentById(db)({ scopes: { tenantId, projectId, agentId }, subAgentId }),
      getFunctionToolById(db)({ scopes: { tenantId, projectId, agentId }, functionToolId }),
    ]);

    if (!subAgent) {
      throw createApiError({
        code: 'not_found',
        message: `SubAgent with id '${subAgentId}' not found`,
      });
    }

    if (!functionTool) {
      throw createApiError({
        code: 'not_found',
        message: `Function tool with id '${functionToolId}' not found`,
      });
    }

    const exists = await isFunctionToolAssociatedWithSubAgent(db)({
      scopes: { tenantId, projectId, agentId },
      subAgentId,
      functionToolId,
    });

    if (exists) {
      throw createApiError({
        code: 'conflict',
        message: 'SubAgent function tool association already exists',
      });
    }

    const association = await addFunctionToolToSubAgent(db)({
      scopes: { tenantId, projectId, agentId },
      subAgentId,
      functionToolId,
    });

    return c.json({ data: association }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/sub-agent/{subAgentId}/function-tool/{functionToolId}',
    summary: 'Remove Function Tool from SubAgent',
    operationId: 'remove-function-tool-from-sub-agent',
    tags: ['SubAgents', 'Function Tools'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema.extend({
        functionToolId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Association removed successfully',
        content: {
          'application/json': {
            schema: RemovedResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId, functionToolId } = c.req.valid('param');

    const removed = await removeFunctionToolFromSubAgent(db)({
      scopes: { tenantId, projectId, agentId },
      subAgentId,
      functionToolId,
    });

    if (!removed) {
      throw createApiError({
        code: 'not_found',
        message: 'SubAgent function tool association not found',
      });
    }

    return c.json({
      message: 'Association removed successfully',
      removed: true,
    });
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/sub-agent/{subAgentId}/function-tool/{functionToolId}/exists',
    summary: 'Check if Function Tool is Associated with SubAgent',
    operationId: 'check-function-tool-sub-agent-association',
    tags: ['SubAgents', 'Function Tools'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema.extend({
        functionToolId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Association status retrieved successfully',
        content: {
          'application/json': {
            schema: ExistsResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId, functionToolId } = c.req.valid('param');

    const exists = await isFunctionToolAssociatedWithSubAgent(db)({
      scopes: { tenantId, projectId, agentId },
      subAgentId,
      functionToolId,
    });

    return c.json({ exists });
  }
);

export default app;
