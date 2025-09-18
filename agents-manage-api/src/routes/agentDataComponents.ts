import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  AgentDataComponentApiInsertSchema,
  AgentDataComponentApiSelectSchema,
  associateDataComponentWithAgent,
  commonGetErrorResponses,
  createApiError,
  DataComponentApiSelectSchema,
  ErrorResponseSchema,
  ExistsResponseSchema,
  getAgentById,
  getAgentsUsingDataComponent,
  getDataComponent,
  getDataComponentsForAgent,
  isDataComponentAssociatedWithAgent,
  RemovedResponseSchema,
  removeDataComponentFromAgent,
  SingleResponseSchema,
  TenantProjectGraphParamsSchema,
} from '@inkeep/agents-core';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

// List data components for a specific agent in a graph
app.openapi(
  createRoute({
    method: 'get',
    path: '/agent/:agentId',
    summary: 'Get Data Components for Agent',
    operationId: 'get-data-components-for-agent',
    tags: ['CRUD Agent Data Component Relations'],
    request: {
      params: TenantProjectGraphParamsSchema.extend({
        agentId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Data components retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(DataComponentApiSelectSchema),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId, agentId } = c.req.valid('param');

    const dataComponents = await getDataComponentsForAgent(dbClient)({
      scopes: { tenantId, projectId, graphId, agentId },
    });

    return c.json({ data: dataComponents });
  }
);

// List agent ids using a specific data component
app.openapi(
  createRoute({
    method: 'get',
    path: '/component/:dataComponentId/agents',
    summary: 'Get Agents Using Data Component',
    operationId: 'get-agents-using-data-component',
    tags: ['CRUD Agent Data Component Relations'],
    request: {
      params: TenantProjectGraphParamsSchema.extend({
        dataComponentId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Agents retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(
                z.object({
                  agentId: z.string(),
                  createdAt: z.string(),
                })
              ),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, dataComponentId } = c.req.valid('param');

    const agents = await getAgentsUsingDataComponent(dbClient)({
      scopes: { tenantId, projectId },
      dataComponentId,
    });

    return c.json({ data: agents });
  }
);

// Create agent data component association
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Associate Data Component with Agent',
    operationId: 'associate-data-component-with-agent',
    tags: ['CRUD Agent Data Component Relations'],
    request: {
      params: TenantProjectGraphParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AgentDataComponentApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Agent data component association created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentDataComponentApiSelectSchema),
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
    const { tenantId, projectId, graphId } = c.req.valid('param');
    const { agentId, dataComponentId } = c.req.valid('json');

    const [agent, dataComponent] = await Promise.all([
      getAgentById(dbClient)({ scopes: { tenantId, projectId, graphId }, agentId }),
      getDataComponent(dbClient)({ scopes: { tenantId, projectId }, dataComponentId }),
    ]);

    if (!agent) {
      throw createApiError({
        code: 'not_found',
        message: `Agent with id '${agentId}' not found`,
      });
    }

    if (!dataComponent) {
      throw createApiError({
        code: 'not_found',
        message: `Data component with id '${dataComponentId}' not found`,
      });
    }

    // Check if association already exists
    const exists = await isDataComponentAssociatedWithAgent(dbClient)({
      scopes: { tenantId, projectId, graphId, agentId },
      dataComponentId,
    });

    if (exists) {
      throw createApiError({
        code: 'conflict',
        message: 'Agent data component association already exists',
      });
    }

    const association = await associateDataComponentWithAgent(dbClient)({
      scopes: { tenantId, projectId, graphId, agentId },
      dataComponentId,
    });

    return c.json({ data: association }, 201);
  }
);

// Remove agent data component association
app.openapi(
  createRoute({
    method: 'delete',
    path: '/agent/:agentId/component/:dataComponentId',
    summary: 'Remove Data Component from Agent',
    operationId: 'remove-data-component-from-agent',
    tags: ['CRUD Agent Data Component Relations'],
    request: {
      params: TenantProjectGraphParamsSchema.extend({
        agentId: z.string(),
        dataComponentId: z.string(),
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
    const { tenantId, projectId, graphId, agentId, dataComponentId } = c.req.valid('param');

    const removed = await removeDataComponentFromAgent(dbClient)({
      scopes: { tenantId, projectId, graphId, agentId },
      dataComponentId,
    });

    if (!removed) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent data component association not found',
      });
    }

    return c.json({
      message: 'Association removed successfully',
      removed: true,
    });
  }
);

// Check if data component is associated with agent
app.openapi(
  createRoute({
    method: 'get',
    path: '/agent/:agentId/component/:dataComponentId/exists',
    summary: 'Check if Data Component is Associated with Agent',
    operationId: 'check-data-component-agent-association',
    tags: ['CRUD Agent Data Component Relations'],
    request: {
      params: TenantProjectGraphParamsSchema.extend({
        agentId: z.string(),
        dataComponentId: z.string(),
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
    const { tenantId, projectId, graphId, agentId, dataComponentId } = c.req.valid('param');

    const exists = await isDataComponentAssociatedWithAgent(dbClient)({
      scopes: { tenantId, projectId, graphId, agentId },
      dataComponentId,
    });

    return c.json({ exists });
  }
);

export default app;
