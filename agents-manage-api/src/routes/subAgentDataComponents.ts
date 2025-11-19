import { createRoute } from '@hono/zod-openapi';
import {
  associateDataComponentWithAgent,
  ComponentAssociationListResponse,
  commonGetErrorResponses,
  createApiError,
  DataComponentArrayResponse,
  ErrorResponseSchema,
  ExistsResponseSchema,
  getAgentsUsingDataComponent,
  getDataComponent,
  getDataComponentsForAgent,
  getSubAgentById,
  isDataComponentAssociatedWithAgent,
  RemovedResponseSchema,
  removeDataComponentFromAgent,
  SubAgentDataComponentApiInsertSchema,
  SubAgentDataComponentResponse,
  TenantProjectAgentParamsSchema,
  TenantProjectAgentSubAgentParamsSchema,
} from '@inkeep/agents-core';
import { z } from 'zod';
import { createAppWithDb } from '../utils/apps';

const app = createAppWithDb();

app.openapi(
  createRoute({
    method: 'get',
    path: '/agent/{subAgentId}',
    summary: 'Get Data Components for Agent',
    operationId: 'get-data-components-for-agent',
    tags: ['Agent Data Component Relations'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema,
    },
    responses: {
      200: {
        description: 'Data components retrieved successfully',
        content: {
          'application/json': {
            schema: DataComponentArrayResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId } = c.req.valid('param');

    const dataComponents = await getDataComponentsForAgent(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
    });

    return c.json({ data: dataComponents });
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/component/{dataComponentId}/agents',
    summary: 'Get Agents Using Data Component',
    operationId: 'get-agents-using-data-component',
    tags: ['Agent Data Component Relations'],
    request: {
      params: TenantProjectAgentParamsSchema.extend({
        dataComponentId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Agents retrieved successfully',
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
    const { tenantId, projectId, dataComponentId } = c.req.valid('param');

    const agents = await getAgentsUsingDataComponent(db)({
      scopes: { tenantId, projectId },
      dataComponentId,
    });

    return c.json({ data: agents });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Associate Data Component with Agent',
    operationId: 'associate-data-component-with-agent',
    tags: ['Agent Data Component Relations'],
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentDataComponentApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Agent data component association created successfully',
        content: {
          'application/json': {
            schema: SubAgentDataComponentResponse,
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
    const { subAgentId, dataComponentId } = c.req.valid('json');

    const [agent, dataComponent] = await Promise.all([
      getSubAgentById(db)({ scopes: { tenantId, projectId, agentId }, subAgentId }),
      getDataComponent(db)({ scopes: { tenantId, projectId }, dataComponentId }),
    ]);

    if (!agent) {
      throw createApiError({
        code: 'not_found',
        message: `Agent with id '${subAgentId}' not found`,
      });
    }

    if (!dataComponent) {
      throw createApiError({
        code: 'not_found',
        message: `Data component with id '${dataComponentId}' not found`,
      });
    }

    const exists = await isDataComponentAssociatedWithAgent(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      dataComponentId,
    });

    if (exists) {
      throw createApiError({
        code: 'conflict',
        message: 'Agent data component association already exists',
      });
    }

    const association = await associateDataComponentWithAgent(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      dataComponentId,
    });

    return c.json({ data: association }, 201);
  }
);

// Remove agent data component association
app.openapi(
  createRoute({
    method: 'delete',
    path: '/agent/{subAgentId}/component/{dataComponentId}',
    summary: 'Remove Data Component from Agent',
    operationId: 'remove-data-component-from-agent',
    tags: ['Agent Data Component Relations'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema.extend({
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
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId, dataComponentId } = c.req.valid('param');

    const removed = await removeDataComponentFromAgent(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
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

app.openapi(
  createRoute({
    method: 'get',
    path: '/agent/{subAgentId}/component/{dataComponentId}/exists',
    summary: 'Check if Data Component is Associated with Agent',
    operationId: 'check-data-component-agent-association',
    tags: ['Agent Data Component Relations'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema.extend({
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
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId, dataComponentId } = c.req.valid('param');

    const exists = await isDataComponentAssociatedWithAgent(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      dataComponentId,
    });

    return c.json({ exists });
  }
);

export default app;
