import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
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
  generateId,
  getConversation,
  getEvaluationRunConfigById,
  getEvaluationRunConfigEvaluationSuiteConfigRelations,
  getMessagesByConversation,
  ListResponseSchema,
  listEvaluationResultsByRun,
  listEvaluationRunConfigsWithSuiteConfigs,
  listEvaluationRuns,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateEvaluationRunConfig,
} from '@inkeep/agents-core';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('evaluationRunConfigs');

// Require edit permission for write operations
app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.use('/:configId', async (c, next) => {
  if (['PATCH', 'DELETE'].includes(c.req.method)) {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Evaluation Run Configs',
    operationId: 'list-evaluation-run-configs',
    tags: ['Evaluations'],
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
      logger.error({ error, tenantId, projectId }, 'Failed to list evaluation run configs');
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
  createRoute({
    method: 'get',
    path: '/{configId}',
    summary: 'Get Evaluation Run Config by ID',
    operationId: 'get-evaluation-run-config',
    tags: ['Evaluations'],
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
      logger.error({ error, tenantId, projectId, configId }, 'Failed to get evaluation run config');
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
  createRoute({
    method: 'get',
    path: '/{configId}/results',
    summary: 'Get Evaluation Results by Run Config ID',
    operationId: 'get-evaluation-run-config-results',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
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

    try {
      // Find evaluation run(s) for this run config
      const evaluationRuns = await listEvaluationRuns(runDbClient)({
        scopes: { tenantId, projectId },
      });

      const runConfigRuns = evaluationRuns.filter((run) => run.evaluationRunConfigId === configId);

      if (runConfigRuns.length === 0) {
        return c.json({ data: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 } }) as any;
      }

      // Get all results for all runs
      const allResults = await Promise.all(
        runConfigRuns.map(async (run) => {
          const runResults = await listEvaluationResultsByRun(runDbClient)({
            scopes: { tenantId, projectId, evaluationRunId: run.id },
          });
          return runResults;
        })
      );

      const results = allResults.flat();

      const uniqueConversationIds = [...new Set(results.map((r) => r.conversationId))] as string[];
      const conversationInputs = new Map<string, string>();
      const conversationAgents = new Map<string, string>();
      const conversationCreatedAts = new Map<string, string>();

      await Promise.all(
        uniqueConversationIds.map(async (conversationId: string) => {
          try {
            // Fetch conversation to get sub-agent ID, then look up parent agent ID
            const conversation = await getConversation(runDbClient)({
              scopes: { tenantId, projectId },
              conversationId,
            });
            if (conversation?.agentId) {
              conversationAgents.set(conversationId, conversation.agentId);
            }
            if (conversation?.createdAt) {
              conversationCreatedAts.set(conversationId, conversation.createdAt);
            }

            const messages = await getMessagesByConversation(runDbClient)({
              scopes: { tenantId, projectId },
              conversationId,
              pagination: { page: 1, limit: 100 },
            });

            const messagesChronological = [...messages].reverse();
            const firstUserMessage = messagesChronological.find((msg) => msg.role === 'user');
            if (firstUserMessage?.content) {
              const text =
                typeof firstUserMessage.content === 'string'
                  ? firstUserMessage.content
                  : firstUserMessage.content.text || '';
              conversationInputs.set(conversationId, text);
            }
          } catch (error) {
            logger.warn({ error, conversationId }, 'Failed to fetch conversation input');
          }
        })
      );

      const enrichedResults = results.map((result) => ({
        ...result,
        input: conversationInputs.get(result.conversationId) || null,
        agentId: conversationAgents.get(result.conversationId) || null,
        conversationCreatedAt: conversationCreatedAts.get(result.conversationId) || null,
      }));

      return c.json({
        data: enrichedResults as any[],
        pagination: {
          page: 1,
          limit: enrichedResults.length,
          total: enrichedResults.length,
          pages: 1,
        },
      }) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId },
        'Failed to get evaluation results for run config'
      );
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
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Evaluation Run Config',
    operationId: 'create-evaluation-run-config',
    tags: ['Evaluations'],
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

      logger.info({ tenantId, projectId, configId: id }, 'Evaluation run config created');
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
      logger.error(
        { error, tenantId, projectId, configData },
        'Failed to create evaluation run config'
      );
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
  createRoute({
    method: 'patch',
    path: '/{configId}',
    summary: 'Update Evaluation Run Config',
    operationId: 'update-evaluation-run-config',
    tags: ['Evaluations'],
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

      logger.info({ tenantId, projectId, configId }, 'Evaluation run config updated');
      return c.json({
        data: {
          ...updated,
          suiteConfigIds: suiteConfigRelations.map((rel) => rel.evaluationSuiteConfigId),
        } as any,
      }) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId, configData },
        'Failed to update evaluation run config'
      );
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
  createRoute({
    method: 'delete',
    path: '/{configId}',
    summary: 'Delete Evaluation Run Config',
    operationId: 'delete-evaluation-run-config',
    tags: ['Evaluations'],
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

      logger.info({ tenantId, projectId, configId }, 'Evaluation run config deleted');
      return c.body(null, 204) as any;
    } catch (error: any) {
      logger.error(
        {
          error: error?.message || error,
          errorStack: error?.stack,
          errorCode: error?.cause?.code,
          errorDetail: error?.cause?.detail,
          errorConstraint: error?.cause?.constraint,
          tenantId,
          projectId,
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
