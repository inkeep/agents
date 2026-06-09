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
  extractMessageText,
  generateId,
  getConversationsByIds,
  getEvaluationJobConfigById,
  getFirstUserMessageByConversations,
  ListResponseSchema,
  listEvaluationJobConfigs,
  listEvaluationResultsByRun,
  listEvaluationRunsByJobConfigId,
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
            schema: ListResponseSchema(EvaluationJobConfigApiSelectSchema),
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
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(200).default(50),
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
    const { page, limit } = c.req.valid('query');

    try {
      // Find evaluation run(s) for this job config
      const jobRuns = await listEvaluationRunsByJobConfigId(runDbClient)({
        scopes: { tenantId, projectId },
        evaluationJobConfigId: configId,
      });

      if (jobRuns.length === 0) {
        return c.json({ data: [], pagination: { page, limit, total: 0, pages: 0 } }) as any;
      }

      // Get all results for all runs
      const allResults = (
        await Promise.all(
          jobRuns.map((run) =>
            listEvaluationResultsByRun(runDbClient)({
              scopes: { tenantId, projectId, evaluationRunId: run.id },
            })
          )
        )
      ).flat();

      // Stable ordering (newest first) so pagination is deterministic across requests.
      allResults.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

      const total = allResults.length;
      const pages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;
      const pageResults = allResults.slice(offset, offset + limit);

      // Enrich only the conversations on this page, and do it with two set-based queries
      // instead of fanning out per-conversation lookups (which exhausted the runtime DB pool).
      const uniqueConversationIds = [...new Set(pageResults.map((r) => r.conversationId))];

      const [conversationsForPage, firstUserMessages] = await Promise.all([
        getConversationsByIds(runDbClient)({
          scopes: { tenantId, projectId },
          conversationIds: uniqueConversationIds,
        }),
        getFirstUserMessageByConversations(runDbClient)({
          scopes: { tenantId, projectId },
          conversationIds: uniqueConversationIds,
        }),
      ]);

      const conversationsById = new Map(conversationsForPage.map((c) => [c.id, c]));

      const conversationInputs = new Map<string, string>();
      for (const message of firstUserMessages) {
        const text = extractMessageText(message.content);
        if (text) {
          conversationInputs.set(message.conversationId, text);
        }
      }

      const enrichedResults = pageResults.map((result) => ({
        ...result,
        input: conversationInputs.get(result.conversationId) || null,
        agentId: conversationsById.get(result.conversationId)?.agentId || null,
        conversationCreatedAt: conversationsById.get(result.conversationId)?.createdAt || null,
      }));

      logger.info(
        { configId, page, limit, total, returned: enrichedResults.length },
        'Retrieved evaluation results for job config'
      );

      return c.json({
        data: enrichedResults as any[],
        pagination: {
          page,
          limit,
          total,
          pages,
        },
      }) as any;
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
