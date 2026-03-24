import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createEvaluationSuiteConfig,
  createEvaluationSuiteConfigEvaluatorRelation,
  deleteEvaluationSuiteConfig,
  EvaluationSuiteConfigApiInsertSchema,
  EvaluationSuiteConfigApiSelectSchema,
  EvaluationSuiteConfigApiUpdateSchema,
  generateId,
  getEvaluationSuiteConfigById,
  ListResponseSchema,
  listEvaluationSuiteConfigs,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateEvaluationSuiteConfig,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('evaluationSuiteConfigs');

// Require edit permission for write operations
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Evaluation Suite Configs',
    operationId: 'list-evaluation-suite-configs',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'List of evaluation suite configs',
        content: {
          'application/json': {
            schema: ListResponseSchema(EvaluationSuiteConfigApiSelectSchema),
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
      const configs = await listEvaluationSuiteConfigs(db)({
        scopes: { tenantId, projectId },
      });
      return c.json({
        data: configs as any,
        pagination: {
          page: 1,
          limit: configs.length,
          total: configs.length,
          pages: 1,
        },
      }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId }, 'Failed to list evaluation suite configs');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list evaluation suite configs',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{configId}',
    summary: 'Get Evaluation Suite Config by ID',
    operationId: 'get-evaluation-suite-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      200: {
        description: 'Evaluation suite config details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationSuiteConfigApiSelectSchema),
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
      const config = await getEvaluationSuiteConfigById(db)({
        scopes: { tenantId, projectId, evaluationSuiteConfigId: configId },
      });

      if (!config) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation suite config not found' }),
          404
        ) as any;
      }

      return c.json({ data: config as any }) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId },
        'Failed to get evaluation suite config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get evaluation suite config',
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
    summary: 'Create Evaluation Suite Config',
    operationId: 'create-evaluation-suite-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: EvaluationSuiteConfigApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Evaluation suite config created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationSuiteConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const configData = c.req.valid('json') as any;
    const { evaluatorIds, ...suiteConfigData } = configData;

    try {
      const id = suiteConfigData.id || generateId();
      const created = await createEvaluationSuiteConfig(db)({
        ...suiteConfigData,
        id,
        tenantId,
        projectId,
      } as any);

      // Create evaluator relations if provided
      if (evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0) {
        await Promise.all(
          evaluatorIds.map((evaluatorId: string) =>
            createEvaluationSuiteConfigEvaluatorRelation(db)({
              tenantId,
              projectId,
              id: generateId(),
              evaluationSuiteConfigId: id,
              evaluatorId,
            } as any)
          )
        );
      }

      logger.info({ tenantId, projectId, configId: id }, 'Evaluation suite config created');
      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configData },
        'Failed to create evaluation suite config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create evaluation suite config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'patch',
    path: '/{configId}',
    summary: 'Update Evaluation Suite Config',
    operationId: 'update-evaluation-suite-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: EvaluationSuiteConfigApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Evaluation suite config updated',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationSuiteConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, configId } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      const updated = await updateEvaluationSuiteConfig(db)({
        scopes: { tenantId, projectId, evaluationSuiteConfigId: configId },
        data: updateData as any,
      });

      if (!updated) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation suite config not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, configId }, 'Evaluation suite config updated');
      return c.json({ data: updated as any }) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId },
        'Failed to update evaluation suite config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to update evaluation suite config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{configId}',
    summary: 'Delete Evaluation Suite Config',
    operationId: 'delete-evaluation-suite-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      204: {
        description: 'Evaluation suite config deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, configId } = c.req.valid('param');

    try {
      const deleted = await deleteEvaluationSuiteConfig(db)({
        scopes: { tenantId, projectId, evaluationSuiteConfigId: configId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation suite config not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, configId }, 'Evaluation suite config deleted');
      return c.body(null, 204) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId },
        'Failed to delete evaluation suite config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to delete evaluation suite config',
        }),
        500
      );
    }
  }
);

export default app;
