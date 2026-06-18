import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  DatasetRunApiSelectSchema,
  extractMessageText,
  findScheduledTriggerByDatasetRunConfigId,
  getConversation,
  getConversationsByIds,
  getDatasetItemById,
  getDatasetRunById,
  getDatasetRunConfigAgentRelations,
  getDatasetRunConfigById,
  getDatasetRunConfigEvaluatorRelations,
  getDatasetRunConversationRelationByConversation,
  getDatasetRunConversationRelations,
  getLastAssistantMessageByConversations,
  ListResponseSchema,
  listDatasetItems,
  listDatasetRuns,
  listScheduledTriggerInvocationsByDatasetRunId,
  SingleResponseSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';
import { createInvocationAndQueue, executeDatasetRun } from '../../../evals/services/datasetRun';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('datasetRuns');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/by-dataset/{datasetId}',
    summary: 'List Dataset Runs by Dataset ID',
    operationId: 'list-dataset-runs',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ datasetId: z.string() }),
    },
    responses: {
      200: {
        description: 'List of dataset runs',
        content: {
          'application/json': {
            schema: ListResponseSchema(DatasetRunApiSelectSchema),
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
      const runs = await listDatasetRuns(runDbClient)({ scopes: { tenantId, projectId } });
      const filteredRuns = runs.filter((run) => run.datasetId === datasetId);

      const runsWithMeta = await Promise.all(
        filteredRuns.map(async (run) => {
          const runConfig = run.datasetRunConfigId
            ? await getDatasetRunConfigById(db)({
                scopes: { tenantId, projectId, datasetRunConfigId: run.datasetRunConfigId },
              })
            : null;
          return {
            ...run,
            runConfigName: runConfig?.name ?? null,
          };
        })
      );

      return c.json({
        data: runsWithMeta as any,
        pagination: {
          page: 1,
          limit: runsWithMeta.length,
          total: runsWithMeta.length,
          pages: 1,
        },
      }) as any;
    } catch (error) {
      logger.error({ error, datasetId }, 'Failed to list dataset runs');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list dataset runs',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{runId}',
    summary: 'Get Dataset Run by ID',
    operationId: 'get-dataset-run',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ runId: z.string() }),
    },
    responses: {
      200: {
        description: 'Dataset run with conversations',
        content: {
          'application/json': {
            schema: SingleResponseSchema(
              DatasetRunApiSelectSchema.extend({
                items: z.array(
                  z.object({
                    id: z.string(),
                    tenantId: z.string(),
                    projectId: z.string(),
                    datasetId: z.string(),
                    input: z.any().nullable().optional(),
                    expectedOutput: z.any().nullable().optional(),
                    createdAt: z.string(),
                    updatedAt: z.string(),
                    conversations: z.array(
                      z.object({
                        id: z.string(),
                        conversationId: z.string(),
                        datasetRunId: z.string(),
                        agentId: z.string().nullable().optional(),
                        output: z.string().nullable().optional(),
                        createdAt: z.string(),
                        updatedAt: z.string(),
                      })
                    ),
                  })
                ),
              })
            ),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, runId } = c.req.valid('param');

    try {
      const run = await getDatasetRunById(runDbClient)({
        scopes: { tenantId, projectId, datasetRunId: runId },
      });

      if (!run) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset run not found' }),
          404
        ) as any;
      }

      const [runConfig, conversationRelations] = await Promise.all([
        run.datasetRunConfigId
          ? getDatasetRunConfigById(db)({
              scopes: { tenantId, projectId, datasetRunConfigId: run.datasetRunConfigId },
            })
          : Promise.resolve(null),
        getDatasetRunConversationRelations(runDbClient)({
          scopes: { tenantId, projectId, datasetRunId: runId },
        }),
      ]);

      const runConfigName = runConfig?.name ?? null;

      // Get all dataset items for this dataset
      const datasetItems = await listDatasetItems(db)({
        scopes: { tenantId, projectId, datasetId: run.datasetId },
      });

      // Enrich every conversation in the run with two set-based queries (agent id + latest
      // assistant message) instead of a per-conversation fan-out, then group by dataset item.
      // The per-conversation loop exhausted the runtime DB connection pool on large runs.
      const allConversationIds = [
        ...new Set(conversationRelations.map((rel) => rel.conversationId).filter(Boolean)),
      ] as string[];

      const [conversationsForRun, lastAssistantMessages] = await Promise.all([
        getConversationsByIds(runDbClient)({
          scopes: { tenantId, projectId },
          conversationIds: allConversationIds,
        }),
        getLastAssistantMessageByConversations(runDbClient)({
          scopes: { tenantId, projectId },
          conversationIds: allConversationIds,
        }),
      ]);

      const agentIdByConversation = new Map(
        conversationsForRun.map((conversation) => [conversation.id, conversation.agentId ?? null])
      );
      const outputByConversation = new Map<string, string | null>();
      for (const message of lastAssistantMessages) {
        outputByConversation.set(
          message.conversationId,
          extractMessageText(message.content) || null
        );
      }

      // Match conversations with dataset items using datasetItemId.
      // This works correctly even with async processing since we store datasetItemId in the relation.
      const itemsWithConversations = datasetItems.map((item) => {
        const conversationsWithOutput = conversationRelations
          .filter((conv) => conv.datasetItemId === item.id)
          .map((conv) => ({
            ...conv,
            output: outputByConversation.get(conv.conversationId) ?? null,
            agentId: agentIdByConversation.get(conv.conversationId) ?? null,
          }));

        return {
          ...item,
          conversations: conversationsWithOutput,
        };
      });

      return c.json({
        data: {
          ...run,
          runConfigName,
          items: itemsWithConversations,
        } as any,
      }) as any;
    } catch (error) {
      logger.error({ error, runId }, 'Failed to get dataset run');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get dataset run',
        }),
        500
      );
    }
  }
);

const DatasetRunItemResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  projectId: z.string(),
  agentId: z.string(),
  datasetRunId: z.string(),
  datasetItemId: z.string(),
  status: z.string(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  attemptNumber: z.number(),
  createdAt: z.string(),
  conversationId: z.string().nullable().optional(),
});

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{runId}/items',
    summary: 'Get Dataset Run Items',
    operationId: 'get-dataset-run-items',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ runId: z.string() }),
      query: z.object({ status: z.string().optional() }),
    },
    responses: {
      200: {
        description: 'List of dataset run invocations',
        content: {
          'application/json': {
            schema: ListResponseSchema(DatasetRunItemResponseSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, runId } = c.req.valid('param');
    const { status } = c.req.valid('query');

    try {
      const [invocations, relations] = await Promise.all([
        listScheduledTriggerInvocationsByDatasetRunId(runDbClient)({
          scopes: { tenantId, projectId },
          datasetRunId: runId,
          filters: status ? { status } : undefined,
        }),
        getDatasetRunConversationRelations(runDbClient)({
          scopes: { tenantId, projectId, datasetRunId: runId },
        }),
      ]);

      const items = invocations.map((inv) => {
        const datasetItemId = (inv.resolvedPayload as Record<string, unknown> | null)
          ?.datasetItemId as string | undefined;
        const rel = relations.find(
          (r) => r.datasetItemId === datasetItemId && r.conversationId !== undefined
        );
        return {
          id: inv.id,
          tenantId: inv.tenantId,
          projectId: inv.projectId,
          agentId: inv.agentId,
          datasetRunId: runId,
          datasetItemId: datasetItemId ?? '',
          status: inv.status,
          startedAt: inv.startedAt ?? null,
          completedAt: inv.completedAt ?? null,
          attemptNumber: inv.attemptNumber,
          createdAt: inv.createdAt,
          conversationId: rel?.conversationId ?? null,
        };
      });

      return c.json({
        data: items as any,
        pagination: {
          page: 1,
          limit: items.length,
          total: items.length,
          pages: 1,
        },
      }) as any;
    } catch (error) {
      logger.error({ error, runId }, 'Failed to get dataset run items');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get dataset run items',
        }),
        500
      );
    }
  }
);

const RerunBodySchema = z
  .object({
    branchName: z.string().optional().describe('Override the branch/ref used by the new run'),
    evaluatorIds: z
      .array(z.string())
      .optional()
      .describe('Override evaluator IDs. Defaults to the evaluators attached to the source run.'),
  })
  .optional();

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{runId}/rerun',
    summary: 'Rerun a past dataset run',
    operationId: 'rerun-dataset-run',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({ runId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: RerunBodySchema,
          },
        },
      },
    },
    responses: {
      202: {
        description: 'Dataset run rerun triggered',
        content: {
          'application/json': {
            schema: z.object({
              datasetRunId: z.string(),
              datasetRunIds: z.array(z.string()),
              status: z.literal('pending'),
              totalItems: z.number(),
              failedCount: z.number().optional(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, runId } = c.req.valid('param');
    const body = (c.req.valid('json') ?? {}) as { branchName?: string; evaluatorIds?: string[] };

    try {
      const sourceRun = await getDatasetRunById(runDbClient)({
        scopes: { tenantId, projectId, datasetRunId: runId },
      });

      if (!sourceRun) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset run not found' }),
          404
        ) as any;
      }

      if (!sourceRun.datasetRunConfigId) {
        return c.json(
          createApiError({
            code: 'bad_request',
            message:
              'This run was not created from a run config and cannot be rerun. Create a new run config instead.',
          }),
          400
        ) as any;
      }

      const datasetRunConfigId = sourceRun.datasetRunConfigId;

      const [agentRelations, configEvaluatorRelations, config, scheduledTrigger] =
        await Promise.all([
          getDatasetRunConfigAgentRelations(db)({
            scopes: { tenantId, projectId, datasetRunConfigId },
          }),
          getDatasetRunConfigEvaluatorRelations(db)({
            scopes: { tenantId, projectId, datasetRunConfigId },
          }),
          getDatasetRunConfigById(db)({
            scopes: { tenantId, projectId, datasetRunConfigId },
          }),
          findScheduledTriggerByDatasetRunConfigId(runDbClient)({
            tenantId,
            projectId,
            datasetRunConfigId,
          }),
        ]);

      const configEvaluatorIds = configEvaluatorRelations.map((r) => r.evaluatorId);
      const effectiveEvaluatorIds =
        body.evaluatorIds ?? (configEvaluatorIds.length > 0 ? configEvaluatorIds : undefined);
      const effectiveDispatchDelayMs = config?.dispatchDelayMs ?? 0;

      const sourceRef = sourceRun.ref as { branchName?: string } | null | undefined;
      const branchName = body.branchName ?? sourceRef?.branchName;
      const agentIds = agentRelations.map((r) => r.agentId);

      const result = await executeDatasetRun({
        tenantId,
        projectId,
        datasetRunConfigId,
        agentIds,
        manageDb: db,
        resolvedRef: c.get('resolvedRef'),
        evaluatorIds: effectiveEvaluatorIds,
        ref: branchName,
        scheduledTriggerId: scheduledTrigger?.id,
        staggerDelayMs: effectiveDispatchDelayMs,
      });

      logger.info(
        {
          sourceRunId: runId,
          datasetRunId: result.datasetRunId,
          totalItems: result.totalItems,
        },
        'Dataset run rerun triggered'
      );

      return c.json(
        {
          datasetRunId: result.datasetRunId,
          datasetRunIds: [result.datasetRunId],
          status: 'pending' as const,
          totalItems: result.totalItems,
        },
        202
      );
    } catch (error) {
      logger.error({ error, runId }, 'Failed to rerun dataset run');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to rerun dataset run',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/by-conversation/{conversationId}',
    summary: 'Get dataset run info for a conversation',
    operationId: 'get-dataset-run-by-conversation',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ conversationId: z.string() }),
    },
    responses: {
      200: {
        description: 'Dataset run info for the conversation',
        content: {
          'application/json': {
            schema: z
              .object({
                datasetRunId: z.string(),
                datasetItemId: z.string(),
                conversationId: z.string(),
              })
              .nullable(),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, conversationId } = c.req.valid('param');

    try {
      const relation = await getDatasetRunConversationRelationByConversation(runDbClient)({
        scopes: { tenantId, projectId, conversationId },
      });

      if (!relation) {
        return c.json(null, 200);
      }

      return c.json(
        {
          datasetRunId: relation.datasetRunId,
          datasetItemId: relation.datasetItemId,
          conversationId: relation.conversationId,
        },
        200
      );
    } catch (error) {
      logger.error({ error, conversationId }, 'Failed to get dataset run by conversation');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get dataset run by conversation',
        }),
        500
      ) as any;
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{runId}/items/{itemId}/rerun',
    summary: 'Rerun a single dataset item',
    operationId: 'rerun-dataset-run-item',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({
        runId: z.string(),
        itemId: z.string(),
      }),
    },
    responses: {
      202: {
        description: 'Dataset item rerun triggered',
        content: {
          'application/json': {
            schema: z.object({
              invocationId: z.string(),
              datasetRunId: z.string(),
              datasetItemId: z.string(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, runId, itemId } = c.req.valid('param');
    const db = c.get('db');

    try {
      const run = await getDatasetRunById(runDbClient)({
        scopes: { tenantId, projectId, datasetRunId: runId },
      });

      if (!run) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset run not found' }),
          404
        ) as any;
      }

      const relations = await getDatasetRunConversationRelations(runDbClient)({
        scopes: { tenantId, projectId, datasetRunId: runId },
      });

      const itemRelation = relations.find((r) => r.datasetItemId === itemId);
      if (!itemRelation) {
        return c.json(
          createApiError({
            code: 'not_found',
            message: 'Dataset item not found in this run',
          }),
          404
        ) as any;
      }

      const originalConversation = await getConversation(runDbClient)({
        scopes: { tenantId, projectId },
        conversationId: itemRelation.conversationId,
      });

      if (!originalConversation) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Original conversation not found' }),
          404
        ) as any;
      }

      const agentId = originalConversation.agentId;
      if (!agentId) {
        return c.json(
          createApiError({ code: 'bad_request', message: 'Original conversation has no agent' }),
          400
        ) as any;
      }

      const datasetItem = await getDatasetItemById(db)({
        scopes: { tenantId, projectId, datasetItemId: itemId },
      });

      if (!datasetItem) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset item not found' }),
          404
        ) as any;
      }

      const scheduledTrigger = run.datasetRunConfigId
        ? await findScheduledTriggerByDatasetRunConfigId(runDbClient)({
            tenantId,
            projectId,
            datasetRunConfigId: run.datasetRunConfigId,
          })
        : undefined;
      const triggerScope = scheduledTrigger?.id ?? runId;

      const { invocationId } = await createInvocationAndQueue({
        tenantId,
        projectId,
        datasetRunId: runId,
        agentId,
        scheduledTriggerId: triggerScope,
        datasetItem,
        idempotencyKey: `rerun-${runId}-${itemRelation.conversationId}`,
        resolvedPayload: {
          datasetItemId: itemId,
          datasetRunId: runId,
          messages: datasetItem.input.messages,
          rerunOf: itemRelation.conversationId,
        },
        ref: (run.ref as { branchName?: string } | null)?.branchName ?? undefined,
      });

      logger.info({ runId, itemId, invocationId, agentId }, 'Dataset item rerun triggered');

      return c.json({ invocationId, datasetRunId: runId, datasetItemId: itemId }, 202);
    } catch (error) {
      logger.error({ error, runId, itemId }, 'Failed to rerun dataset item');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to rerun dataset item',
        }),
        500
      );
    }
  }
);

export default app;
