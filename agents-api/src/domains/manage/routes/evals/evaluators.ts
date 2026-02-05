import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createEvaluator,
  deleteEvaluator,
  EvaluatorApiInsertSchema,
  EvaluatorApiSelectSchema,
  EvaluatorApiUpdateSchema,
  generateId,
  getEvaluatorById,
  getEvaluatorsByIds,
  ListResponseSchema,
  listEvaluators,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateEvaluator,
} from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('evaluators');

// Require edit permission for write operations
// Note: POST /batch is a read operation (batch fetch), so only POST / needs edit
app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.use('/:evaluatorId', async (c, next) => {
  if (['PATCH', 'DELETE'].includes(c.req.method)) {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Evaluators',
    operationId: 'list-evaluators',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'List of evaluators',
        content: {
          'application/json': {
            schema: ListResponseSchema(EvaluatorApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');

    try {
      const evaluators = await listEvaluators(db)({ scopes: { tenantId, projectId } });
      return c.json({
        data: evaluators as any,
        pagination: {
          page: 1,
          limit: evaluators.length,
          total: evaluators.length,
          pages: 1,
        },
      }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId }, 'Failed to list evaluators');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to list evaluators' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{evaluatorId}',
    summary: 'Get Evaluator by ID',
    operationId: 'get-evaluator',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ evaluatorId: z.string() }),
    },
    responses: {
      200: {
        description: 'Evaluator details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluatorApiSelectSchema),
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
      const evaluator = await getEvaluatorById(db)({
        scopes: { tenantId, projectId, evaluatorId },
      });

      if (!evaluator) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluator not found' }),
          404
        ) as any;
      }

      return c.json({ data: evaluator as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, evaluatorId }, 'Failed to get evaluator');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to get evaluator' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/batch',
    summary: 'Get Evaluators by IDs',
    operationId: 'get-evaluators-batch',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              evaluatorIds: z.array(z.string()).min(1, 'At least one evaluator ID is required'),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'List of evaluators',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(EvaluatorApiSelectSchema),
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
      const evaluators = await getEvaluatorsByIds(db)({
        scopes: { tenantId, projectId },
        evaluatorIds,
      });

      return c.json({ data: evaluators as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, evaluatorIds }, 'Failed to get evaluators batch');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to get evaluators' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Evaluator',
    operationId: 'create-evaluator',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: EvaluatorApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Evaluator created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluatorApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const evaluatorData = c.req.valid('json');

    try {
      const id = (evaluatorData as any).id || generateId();
      const created = await createEvaluator(db)({
        ...evaluatorData,
        id,
        tenantId,
        projectId,
      } as any);

      logger.info({ tenantId, projectId, evaluatorId: id }, 'Evaluator created');
      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, evaluatorData }, 'Failed to create evaluator');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to create evaluator' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/{evaluatorId}',
    summary: 'Update Evaluator',
    operationId: 'update-evaluator',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ evaluatorId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: EvaluatorApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Evaluator updated',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluatorApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, evaluatorId } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      const updated = await updateEvaluator(db)({
        scopes: { tenantId, projectId, evaluatorId },
        data: updateData as any,
      });

      if (!updated) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluator not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, evaluatorId }, 'Evaluator updated');
      return c.json({ data: updated as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, evaluatorId }, 'Failed to update evaluator');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to update evaluator' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{evaluatorId}',
    summary: 'Delete Evaluator',
    operationId: 'delete-evaluator',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ evaluatorId: z.string() }),
    },
    responses: {
      204: {
        description: 'Evaluator deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, evaluatorId } = c.req.valid('param');

    try {
      const deleted = await deleteEvaluator(db)({
        scopes: { tenantId, projectId, evaluatorId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluator not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, evaluatorId }, 'Evaluator deleted');
      return c.body(null, 204) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, evaluatorId }, 'Failed to delete evaluator');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to delete evaluator' }),
        500
      );
    }
  }
);

export default app;
