import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createEvaluationJobConfig,
  createEvaluationJobConfigEvaluatorRelation,
  deleteEvaluationJobConfig,
  EvaluationJobConfigApiInsertSchema,
  EvaluationJobConfigApiSelectSchema,
  type EvaluationJobFilterCriteria,
  EvaluationResultApiSelectSchema,
  generateId,
  getDatasetRunsByIds,
  getEvaluationJobConfigById,
  ListResponseSchema,
  listDatasetRunConfigs,
  listEvaluationJobConfigs,
  listEvaluationResultsPaginated,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';
import { queueEvaluationJobConversations } from '../../../evals/services/evaluationJob';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('evaluationJobConfigs');

const EvaluationJobConfigsListResponseSchema = ListResponseSchema(
  EvaluationJobConfigApiSelectSchema
).extend({
  datasetRunNames: z.record(z.string(), z.string()).optional(),
});

// Require edit permission for write operations
/**
 * Extract plain filter criteria from a potential Filter wrapper.
 * Returns null if the filter is a complex and/or combinator.
 */
function getPlainJobFilters<T extends Record<string, unknown>>(
  filter: T | { and: unknown[] } | { or: unknown[] } | null | undefined
): T | null {
  if (!filter) return null;
  if ('and' in filter || 'or' in filter) {
    // Complex filters not yet supported for trigger
    return null;
  }
  return filter as T;
}

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Evaluation Job Configs',
    operationId: 'list-evaluation-job-configs',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'List of evaluation job configs',
        content: {
          'application/json': {
            schema: EvaluationJobConfigsListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const db = c.get('db');

    try {
      const configs = await listEvaluationJobConfigs(db)({
        scopes: { tenantId, projectId },
      });

      const datasetRunIds = new Set<string>();
      for (const config of configs) {
        const criteria = config.jobFilters as EvaluationJobFilterCriteria | null | undefined;
        if (criteria?.datasetRunIds) {
          for (const id of criteria.datasetRunIds) {
            datasetRunIds.add(id);
          }
        }
      }

      const datasetRunNames: Record<string, string> = {};
      if (datasetRunIds.size > 0) {
        const [datasetRuns, runConfigs] = await Promise.all([
          getDatasetRunsByIds(runDbClient)({
            scopes: { tenantId, projectId },
            datasetRunIds: [...datasetRunIds],
          }).catch((error) => {
            logger.warn({ error }, 'Failed to fetch dataset runs for name resolution');
            return [] as Awaited<ReturnType<ReturnType<typeof getDatasetRunsByIds>>>;
          }),
          listDatasetRunConfigs(db)({ scopes: { tenantId, projectId } }).catch((error) => {
            logger.warn({ error }, 'Failed to fetch dataset run configs for name resolution');
            return [] as Awaited<ReturnType<ReturnType<typeof listDatasetRunConfigs>>>;
          }),
        ]);

        const configNameById = new Map(runConfigs.map((rc) => [rc.id, rc.name]));

        for (const run of datasetRuns) {
          const name = run.datasetRunConfigId && configNameById.get(run.datasetRunConfigId);
          if (name) {
            datasetRunNames[run.id] = name;
          }
        }
      }

      return c.json({
        data: configs as any,
        datasetRunNames,
        pagination: {
          page: 1,
          limit: configs.length,
          total: configs.length,
          pages: 1,
        },
      }) as any;
    } catch (error) {
      logger.error({ error }, 'Failed to list evaluation job configs');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list evaluation job configs',
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
    summary: 'Get Evaluation Job Config by ID',
    operationId: 'get-evaluation-job-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      200: {
        description: 'Evaluation job config details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationJobConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');
    const db = c.get('db');

    try {
      const config = await getEvaluationJobConfigById(db)({
        scopes: { tenantId, projectId, evaluationJobConfigId: configId },
      });

      if (!config) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation job config not found' }),
          404
        ) as any;
      }

      return c.json({ data: config as any }) as any;
    } catch (error) {
      logger.error({ error, configId }, 'Failed to get evaluation job config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get evaluation job config',
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
    summary: 'Create Evaluation Job Config',
    operationId: 'create-evaluation-job-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: EvaluationJobConfigApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Evaluation job config created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationJobConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const db = c.get('db');
    const configData = c.req.valid('json') as any;
    const { evaluatorIds, ...jobConfigData } = configData;

    try {
      const id = jobConfigData.id || generateId();
      const created = await createEvaluationJobConfig(db)({
        ...jobConfigData,
        id,
        tenantId,
        projectId,
      } as any);

      // Create evaluator relations if provided
      if (evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0) {
        await Promise.all(
          evaluatorIds.map((evaluatorId: string) =>
            createEvaluationJobConfigEvaluatorRelation(db)({
              tenantId,
              projectId,
              id: generateId(),
              evaluationJobConfigId: id,
              evaluatorId,
            } as any)
          )
        );
      }

      logger.info({ configId: id }, 'Evaluation job config created');

      // Fan out manual bulk evaluation job to eval API if evaluators are configured
      if (evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0) {
        queueEvaluationJobConversations({
          tenantId,
          projectId,
          evaluationJobConfigId: id,
          evaluatorIds,
          jobFilters: getPlainJobFilters<EvaluationJobFilterCriteria>(created.jobFilters),
          resolvedRef: c.get('resolvedRef'),
        })
          .then((result) => {
            logger.info(
              {
                configId: id,
                conversationCount: result.conversationCount,
                queued: result.queued,
                failed: result.failed,
                evaluationRunId: result.evaluationRunId,
              },
              'Manual bulk evaluation job triggered'
            );
          })
          .catch((error) => {
            logger.error({ error, configId: id }, 'Failed to trigger manual bulk evaluation job');
          });
      } else {
        logger.warn(
          { configId: id },
          'Evaluation job config created without evaluators, skipping job execution'
        );
      }

      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error({ error, configData }, 'Failed to create evaluation job config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create evaluation job config',
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
    summary: 'Delete Evaluation Job Config',
    operationId: 'delete-evaluation-job-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      204: {
        description: 'Evaluation job config deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');
    const db = c.get('db');

    try {
      const deleted = await deleteEvaluationJobConfig(db)({
        scopes: { tenantId, projectId, evaluationJobConfigId: configId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation job config not found' }),
          404
        ) as any;
      }

      logger.info({ configId }, 'Evaluation job config deleted');
      return c.body(null, 204) as any;
    } catch (error) {
      logger.error({ error, configId }, 'Failed to delete evaluation job config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to delete evaluation job config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{configId}/results',
    summary: 'Get Evaluation Results by Job Config ID',
    operationId: 'get-evaluation-job-config-results',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
      query: PaginationQueryParamsSchema.extend({
        evaluatorId: z.string().optional(),
        agentId: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: 'Evaluation results retrieved',
        content: {
          'application/json': {
            schema: ListResponseSchema(EvaluationResultApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');
    const { page, limit, evaluatorId, agentId } = c.req.valid('query');

    try {
      const result = await listEvaluationResultsPaginated(runDbClient)({
        scopes: { tenantId, projectId },
        evaluationJobConfigId: configId,
        filters: {
          evaluatorId: evaluatorId || undefined,
          agentId: agentId || undefined,
        },
        pagination: { page, limit },
      });

      logger.info(
        { configId, total: result.pagination.total, page: result.pagination.page },
        'Retrieved evaluation results for job config'
      );

      return c.json(result) as any;
    } catch (error) {
      logger.error({ error, configId }, 'Failed to get evaluation results for job config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get evaluation results',
        }),
        500
      );
    }
  }
);

export default app;
