import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createEvaluationJobConfigEvaluatorRelation,
  deleteEvaluationJobConfigEvaluatorRelation,
  generateId,
  getEvaluationJobConfigEvaluatorRelations,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('evaluationJobConfigEvaluatorRelations');

// Require edit permission for write operations
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{configId}/evaluators',
    summary: 'List Evaluators for Evaluation Job Config',
    operationId: 'list-evaluation-job-config-evaluators',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      200: {
        description: 'List of evaluator relations',
        content: {
          'application/json': {
            schema: z.array(z.any()),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, configId } = c.req.valid('param');

    try {
      const relations = await getEvaluationJobConfigEvaluatorRelations(db)({
        scopes: { tenantId, projectId, evaluationJobConfigId: configId },
      });
      return c.json({ data: relations as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, configId }, 'Failed to list evaluator relations');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list evaluator relations',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{configId}/evaluators/{evaluatorId}',
    summary: 'Add Evaluator to Evaluation Job Config',
    operationId: 'add-evaluator-to-job-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({
        configId: z.string(),
        evaluatorId: z.string(),
      }),
    },
    responses: {
      201: {
        description: 'Evaluator relation created',
        content: {
          'application/json': {
            schema: z.any(),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, configId, evaluatorId } = c.req.valid('param');

    try {
      const id = generateId();
      const created = await createEvaluationJobConfigEvaluatorRelation(db)({
        id,
        tenantId,
        projectId,
        evaluationJobConfigId: configId,
        evaluatorId,
      } as any);

      logger.info({ tenantId, projectId, configId, evaluatorId }, 'Evaluator relation created');
      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId, evaluatorId },
        'Failed to create evaluator relation'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create evaluator relation',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{configId}/evaluators/{evaluatorId}',
    summary: 'Remove Evaluator from Evaluation Job Config',
    operationId: 'remove-evaluator-from-job-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({
        configId: z.string(),
        evaluatorId: z.string(),
      }),
    },
    responses: {
      204: {
        description: 'Evaluator relation deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, configId, evaluatorId } = c.req.valid('param');

    try {
      const deleted = await deleteEvaluationJobConfigEvaluatorRelation(db)({
        scopes: { tenantId, projectId, evaluationJobConfigId: configId, evaluatorId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluator relation not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, configId, evaluatorId }, 'Evaluator relation deleted');
      return c.body(null, 204) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId, evaluatorId },
        'Failed to delete evaluator relation'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to delete evaluator relation',
        }),
        500
      );
    }
  }
);

export default app;
