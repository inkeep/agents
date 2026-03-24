import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createEvaluationResult,
  deleteEvaluationResult,
  EvaluationResultApiInsertSchema,
  EvaluationResultApiSelectSchema,
  EvaluationResultApiUpdateSchema,
  generateId,
  getEvaluationResultById,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateEvaluationResult,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('evaluationResults');

// Require edit permission for write operations
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{resultId}',
    summary: 'Get Evaluation Result by ID',
    operationId: 'get-evaluation-result',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ resultId: z.string() }),
    },
    responses: {
      200: {
        description: 'Evaluation result details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationResultApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, resultId } = c.req.valid('param');

    try {
      const result = await getEvaluationResultById(runDbClient)({
        scopes: { tenantId, projectId, evaluationResultId: resultId },
      });

      if (!result) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation result not found' }),
          404
        ) as any;
      }

      return c.json({ data: result as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, resultId }, 'Failed to get evaluation result');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get evaluation result',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Evaluation Result',
    operationId: 'create-evaluation-result',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: EvaluationResultApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Evaluation result created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationResultApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const resultData = c.req.valid('json');

    try {
      const id = (resultData as any).id || generateId();
      const created = await createEvaluationResult(runDbClient)({
        ...resultData,
        id,
        tenantId,
        projectId,
      });

      logger.info({ tenantId, projectId, resultId: id }, 'Evaluation result created');
      return c.json({ data: created as any }, 201) as any;
    } catch (error: any) {
      logger.error(
        { error, tenantId, projectId, resultData },
        'Failed to create evaluation result'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create evaluation result',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'patch',
    path: '/{resultId}',
    summary: 'Update Evaluation Result',
    operationId: 'update-evaluation-result',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({ resultId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: EvaluationResultApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Evaluation result updated',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationResultApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, resultId } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      const updated = await updateEvaluationResult(runDbClient)({
        scopes: { tenantId, projectId, evaluationResultId: resultId },
        data: updateData,
      });

      if (!updated) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation result not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, resultId }, 'Evaluation result updated');
      return c.json({ data: updated as any }) as any;
    } catch (error: any) {
      logger.error({ error, tenantId, projectId, resultId }, 'Failed to update evaluation result');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to update evaluation result',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{resultId}',
    summary: 'Delete Evaluation Result',
    operationId: 'delete-evaluation-result',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({ resultId: z.string() }),
    },
    responses: {
      204: {
        description: 'Evaluation result deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, resultId } = c.req.valid('param');

    try {
      const deleted = await deleteEvaluationResult(runDbClient)({
        scopes: { tenantId, projectId, evaluationResultId: resultId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation result not found' }),
          404
        );
      }

      logger.info({ tenantId, projectId, resultId }, 'Evaluation result deleted');
      return c.body(null, 204);
    } catch (error) {
      logger.error({ error, tenantId, projectId, resultId }, 'Failed to delete evaluation result');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to delete evaluation result',
        }),
        500
      );
    }
  }
);

export default app;
