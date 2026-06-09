import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createEvaluationRunConfig,
  createEvaluationRunConfigEvaluationSuiteConfigRelation,
  deleteEvaluationRunConfig,
  deleteEvaluationRunConfigEvaluationSuiteConfigRelation,
  EvaluationResultApiSelectSchema,
  EvaluationRunConfigApiInsertSchema,
  EvaluationRunConfigApiUpdateSchema,
  EvaluationRunConfigWithSuiteConfigsApiSelectSchema,
  extractMessageText,
  generateId,
  getConversationsByIds,
  getEvaluationRunConfigById,
  getEvaluationRunConfigEvaluationSuiteConfigRelations,
  getFirstUserMessageByConversations,
  ListResponseSchema,
  listEvaluationResultsByRun,
  listEvaluationRunConfigsWithSuiteConfigs,
  listEvaluationRunsByRunConfigId,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateEvaluationRunConfig,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('evaluationRunConfigs');

// Require edit permission for write operations
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Evaluation Run Configs',
    operationId: 'list-evaluation-run-configs',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'List of evaluation run configs',
        content: {
          'application/json': {
            schema: ListResponseSchema(EvaluationRunConfigWithSuiteConfigsApiSelectSchema),
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
      const configsWithSuiteConfigs = await listEvaluationRunConfigsWithSuiteConfigs(db)({
        scopes: { tenantId, projectId },
      });

      return c.json({
        data: configsWithSuiteConfigs as any,
        pagination: {
          page: 1,
          limit: configsWithSuiteConfigs.length,
          total: configsWithSuiteConfigs.length,
          pages: 1,
        },
      }) as any;
    } catch (error) {
      logger.error({ error }, 'Failed to list evaluation run configs');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list evaluation run configs',
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
    summary: 'Get Evaluation Run Config by ID',
    operationId: 'get-evaluation-run-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      200: {
        description: 'Evaluation run config details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationRunConfigWithSuiteConfigsApiSelectSchema),
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
      const config = await getEvaluationRunConfigById(db)({
        scopes: { tenantId, projectId, evaluationRunConfigId: configId },
      });

      if (!config) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation run config not found' }),
          404
        ) as any;
      }

      // Get linked suite configs
      const suiteConfigRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(db)({
        scopes: { tenantId, projectId, evaluationRunConfigId: configId },
      });

      return c.json({
        data: {
          ...config,
          suiteConfigIds: suiteConfigRelations.map((rel) => rel.evaluationSuiteConfigId),
        },
      }) as any;
    } catch (error) {
      logger.error({ error, configId }, 'Failed to get evaluation run config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get evaluation run config',
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
    summary: 'Get Evaluation Results by Run Config ID',
    operationId: 'get-evaluation-run-config-results',
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
      // Find evaluation run(s) for this run config
      const runConfigRuns = await listEvaluationRunsByRunConfigId(runDbClient)({
        scopes: { tenantId, projectId },
        evaluationRunConfigId: configId,
      });

      if (runConfigRuns.length === 0) {
        return c.json({ data: [], pagination: { page, limit, total: 0, pages: 0 } }) as any;
      }

      // Get all results for all runs
      const allResults = (
        await Promise.all(
          runConfigRuns.map((run) =>
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
        'Retrieved evaluation results for run config'
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
      logger.error({ error, configId }, 'Failed to get evaluation results for run config');
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

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Evaluation Run Config',
    operationId: 'create-evaluation-run-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: EvaluationRunConfigApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Evaluation run config created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationRunConfigWithSuiteConfigsApiSelectSchema),
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
    const { suiteConfigIds, ...runConfigData } = configData;

    try {
      const id = runConfigData.id || generateId();
      const created = await createEvaluationRunConfig(db)({
        ...runConfigData,
        id,
        tenantId,
        projectId,
        isActive: runConfigData.isActive !== undefined ? runConfigData.isActive : true,
      } as any);

      // Create suite config relations if provided
      if (suiteConfigIds && Array.isArray(suiteConfigIds) && suiteConfigIds.length > 0) {
        await Promise.all(
          suiteConfigIds.map((suiteConfigId: string) =>
            createEvaluationRunConfigEvaluationSuiteConfigRelation(db)({
              tenantId,
              projectId,
              id: generateId(),
              evaluationRunConfigId: id,
              evaluationSuiteConfigId: suiteConfigId,
            } as any)
          )
        );
      }

      // Fetch suite config relations to include in response
      const suiteConfigRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(db)({
        scopes: { tenantId, projectId, evaluationRunConfigId: id },
      });

      logger.info({ configId: id }, 'Evaluation run config created');
      return c.json(
        {
          data: {
            ...created,
            suiteConfigIds: suiteConfigRelations.map((rel) => rel.evaluationSuiteConfigId),
          } as any,
        },
        201
      ) as any;
    } catch (error) {
      logger.error({ error, configData }, 'Failed to create evaluation run config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create evaluation run config',
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
    summary: 'Update Evaluation Run Config',
    operationId: 'update-evaluation-run-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: EvaluationRunConfigApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Evaluation run config updated',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationRunConfigWithSuiteConfigsApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, configId } = c.req.valid('param');
    const configData = c.req.valid('json') as any;
    const { suiteConfigIds, ...runConfigUpdateData } = configData;

    try {
      const updated = await updateEvaluationRunConfig(db)({
        scopes: { tenantId, projectId, evaluationRunConfigId: configId },
        data: runConfigUpdateData,
      });

      if (!updated) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation run config not found' }),
          404
        ) as any;
      }

      // Update suite config relations if provided
      if (suiteConfigIds !== undefined) {
        // Get existing relations
        const existingRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(db)({
          scopes: { tenantId, projectId, evaluationRunConfigId: configId },
        });

        const existingSuiteConfigIds = existingRelations.map((rel) => rel.evaluationSuiteConfigId);
        const newSuiteConfigIds = Array.isArray(suiteConfigIds) ? suiteConfigIds : [];

        // Delete relations that are no longer in the list
        const toDelete = existingSuiteConfigIds.filter((id) => !newSuiteConfigIds.includes(id));
        await Promise.all(
          toDelete.map((suiteConfigId) =>
            deleteEvaluationRunConfigEvaluationSuiteConfigRelation(db)({
              scopes: {
                tenantId,
                projectId,
                evaluationRunConfigId: configId,
                evaluationSuiteConfigId: suiteConfigId,
              },
            })
          )
        );

        // Create new relations
        const toCreate = newSuiteConfigIds.filter((id) => !existingSuiteConfigIds.includes(id));
        await Promise.all(
          toCreate.map((suiteConfigId) =>
            createEvaluationRunConfigEvaluationSuiteConfigRelation(db)({
              tenantId,
              projectId,
              id: generateId(),
              evaluationRunConfigId: configId,
              evaluationSuiteConfigId: suiteConfigId,
            } as any)
          )
        );
      }

      // Fetch suite config relations to include in response
      const suiteConfigRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(db)({
        scopes: { tenantId, projectId, evaluationRunConfigId: configId },
      });

      logger.info({ configId }, 'Evaluation run config updated');
      return c.json({
        data: {
          ...updated,
          suiteConfigIds: suiteConfigRelations.map((rel) => rel.evaluationSuiteConfigId),
        } as any,
      }) as any;
    } catch (error) {
      logger.error({ error, configId, configData }, 'Failed to update evaluation run config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to update evaluation run config',
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
    summary: 'Delete Evaluation Run Config',
    operationId: 'delete-evaluation-run-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      204: {
        description: 'Evaluation run config deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, configId } = c.req.valid('param');

    try {
      const deleted = await deleteEvaluationRunConfig(db)({
        scopes: { tenantId, projectId, evaluationRunConfigId: configId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation run config not found' }),
          404
        ) as any;
      }

      logger.info({ configId }, 'Evaluation run config deleted');
      return c.body(null, 204) as any;
    } catch (error: any) {
      logger.error(
        {
          error: error?.message || error,
          errorStack: error?.stack,
          errorCode: error?.cause?.code,
          errorDetail: error?.cause?.detail,
          errorConstraint: error?.cause?.constraint,
          configId,
        },
        'Failed to delete evaluation run config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message:
            error?.cause?.detail || error?.message || 'Failed to delete evaluation run config',
        }),
        500
      );
    }
  }
);

export default app;
