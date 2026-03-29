import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AgentDatasetRelationApiSelectSchema,
  commonGetErrorResponses,
  createAgentDatasetRelation,
  createApiError,
  deleteAgentDatasetRelation,
  generateId,
  getAgentDatasetRelationsByDataset,
  ListResponseSchema,
  SingleResponseSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('agentDatasetRelations');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{datasetId}/agents',
    summary: 'List Agents for Dataset',
    operationId: 'list-dataset-agents',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ datasetId: z.string() }),
    },
    responses: {
      200: {
        description: 'List of agent relations for this dataset',
        content: {
          'application/json': {
            schema: ListResponseSchema(AgentDatasetRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, datasetId } = c.req.valid('param');

    try {
      const relations = await getAgentDatasetRelationsByDataset(db)({
        scopes: { tenantId, projectId, datasetId },
      });
      return c.json({ data: relations }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, datasetId }, 'Failed to list dataset agents');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list dataset agents',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{datasetId}/agents/{agentId}',
    summary: 'Add Agent to Dataset',
    operationId: 'add-agent-to-dataset',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({
        datasetId: z.string(),
        agentId: z.string(),
      }),
    },
    responses: {
      201: {
        description: 'Agent relation created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentDatasetRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, datasetId, agentId } = c.req.valid('param');

    try {
      const id = generateId();
      const created = await createAgentDatasetRelation(db)({
        id,
        tenantId,
        projectId,
        datasetId,
        agentId,
      });

      logger.info({ tenantId, projectId, datasetId, agentId }, 'Agent-dataset relation created');
      return c.json({ data: created }, 201) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, datasetId, agentId },
        'Failed to create agent-dataset relation'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to add agent to dataset',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{datasetId}/agents/{agentId}',
    summary: 'Remove Agent from Dataset',
    operationId: 'remove-agent-from-dataset',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({
        datasetId: z.string(),
        agentId: z.string(),
      }),
    },
    responses: {
      204: {
        description: 'Agent relation deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, datasetId, agentId } = c.req.valid('param');

    try {
      const deleted = await deleteAgentDatasetRelation(db)({
        scopes: { tenantId, projectId, agentId, datasetId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Agent-dataset relation not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, datasetId, agentId }, 'Agent-dataset relation deleted');
      return c.body(null, 204) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, datasetId, agentId },
        'Failed to delete agent-dataset relation'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to remove agent from dataset',
        }),
        500
      );
    }
  }
);

export default app;
