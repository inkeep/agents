import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AgentEvaluatorRelationApiSelectSchema,
  commonGetErrorResponses,
  createAgentEvaluatorRelation,
  createApiError,
  deleteAgentEvaluatorRelation,
  generateId,
  getAgentEvaluatorRelationsByEvaluator,
  getAgentIdsForEvaluators,
  isUniqueConstraintError,
  ListResponseSchema,
  SingleResponseSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('agentEvaluatorRelations');

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/batch-agent-scopes',
    summary: 'Batch get agent scopes for evaluators',
    operationId: 'batch-get-evaluator-agent-scopes',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              evaluatorIds: z.array(z.string()).min(1).max(200),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Map of evaluator ID to array of scoped agent IDs',
        content: {
          'application/json': {
            schema: z.object({
              data: z.record(z.string(), z.array(z.string())),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const { evaluatorIds } = c.req.valid('json');

    try {
      const resultMap = await getAgentIdsForEvaluators(db)({
        scopes: { tenantId, projectId },
        evaluatorIds,
      });
      const data: Record<string, string[]> = {};
      for (const [key, value] of resultMap) {
        data[key] = value;
      }
      return c.json({ data }) as any;
    } catch (error) {
      logger.error({ error, evaluatorIds }, 'Failed to batch get evaluator agent scopes');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to batch get evaluator agent scopes',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{evaluatorId}/agents',
    summary: 'List Agents for Evaluator',
    operationId: 'list-evaluator-agents',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ evaluatorId: z.string() }),
    },
    responses: {
      200: {
        description: 'List of agent relations for this evaluator',
        content: {
          'application/json': {
            schema: ListResponseSchema(AgentEvaluatorRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, evaluatorId } = c.req.valid('param');

    try {
      const relations = await getAgentEvaluatorRelationsByEvaluator(db)({
        scopes: { tenantId, projectId, evaluatorId },
      });
      return c.json({ data: relations }) as any;
    } catch (error) {
      logger.error({ error, evaluatorId }, 'Failed to list evaluator agents');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list evaluator agents',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{evaluatorId}/agents/{agentId}',
    summary: 'Add Agent to Evaluator',
    operationId: 'add-agent-to-evaluator',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({
        evaluatorId: z.string(),
        agentId: z.string(),
      }),
    },
    responses: {
      201: {
        description: 'Agent relation created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentEvaluatorRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, evaluatorId, agentId } = c.req.valid('param');

    try {
      const id = generateId();
      const created = await createAgentEvaluatorRelation(db)({
        id,
        tenantId,
        projectId,
        evaluatorId,
        agentId,
      });

      logger.info({ evaluatorId }, 'Agent-evaluator relation created');
      return c.json({ data: created }, 201) as any;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await getAgentEvaluatorRelationsByEvaluator(db)({
          scopes: { tenantId, projectId, evaluatorId },
        });
        const match = existing.find((r) => r.agentId === agentId);
        if (match) {
          return c.json({ data: match }, 200) as any;
        }
      }

      logger.error({ error, evaluatorId }, 'Failed to create agent-evaluator relation');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to add agent to evaluator',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{evaluatorId}/agents/{agentId}',
    summary: 'Remove Agent from Evaluator',
    operationId: 'remove-agent-from-evaluator',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({
        evaluatorId: z.string(),
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
    const { tenantId, projectId, evaluatorId, agentId } = c.req.valid('param');

    try {
      const deleted = await deleteAgentEvaluatorRelation(db)({
        scopes: { tenantId, projectId, agentId, evaluatorId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Agent-evaluator relation not found' }),
          404
        ) as any;
      }

      logger.info({ evaluatorId }, 'Agent-evaluator relation deleted');
      return c.body(null, 204) as any;
    } catch (error) {
      logger.error({ error, evaluatorId }, 'Failed to delete agent-evaluator relation');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to remove agent from evaluator',
        }),
        500
      );
    }
  }
);

export default app;
