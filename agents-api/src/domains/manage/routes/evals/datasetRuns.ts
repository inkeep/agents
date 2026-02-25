import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  DatasetRunApiSelectSchema,
  getConversation,
  getDatasetRunById,
  getDatasetRunConfigById,
  getDatasetRunConversationRelations,
  getMessagesByConversation,
  getScheduledTriggerInvocationStatusSummary,
  ListResponseSchema,
  listDatasetItems,
  listDatasetRuns,
  listScheduledTriggerInvocationsByTriggerId,
  SingleResponseSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

function deriveRunStatus(summary: {
  pending: number;
  running: number;
  completed: number;
  failed: number;
}): string {
  const { pending, running, completed, failed } = summary;
  const total = pending + running + completed + failed;
  if (total > 0 && pending + running === 0) return 'completed';
  return 'pending';
}

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
      const filteredRuns = runs.filter((run) => (run as any).datasetId === datasetId);

      const runsWithMeta = await Promise.all(
        filteredRuns.map(async (run) => {
          const [runConfig, summary] = await Promise.all([
            run.datasetRunConfigId
              ? getDatasetRunConfigById(db)({
                  scopes: { tenantId, projectId, datasetRunConfigId: run.datasetRunConfigId },
                })
              : Promise.resolve(null),
            getScheduledTriggerInvocationStatusSummary(runDbClient)({
              scopes: { tenantId, projectId },
              scheduledTriggerId: run.id,
            }),
          ]);
          const total = summary.pending + summary.running + summary.completed + summary.failed;
          return {
            ...run,
            runConfigName: runConfig?.name ?? null,
            status: deriveRunStatus(summary),
            totalItems: total,
            completedItems: summary.completed,
            failedItems: summary.failed,
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
      logger.error({ error, tenantId, projectId, datasetId }, 'Failed to list dataset runs');
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
                items: z.array(
                  z.object({
                    id: z.string(),
                    tenantId: z.string(),
                    projectId: z.string(),
                    datasetId: z.string(),
                    input: z.any().nullable().optional(),
                    expectedOutput: z.any().nullable().optional(),
                    simulationAgent: z.any().nullable().optional(),
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

      const [runConfig, summary, conversationRelations] = await Promise.all([
        run.datasetRunConfigId
          ? getDatasetRunConfigById(db)({
              scopes: { tenantId, projectId, datasetRunConfigId: run.datasetRunConfigId },
            })
          : Promise.resolve(null),
        getScheduledTriggerInvocationStatusSummary(runDbClient)({
          scopes: { tenantId, projectId },
          scheduledTriggerId: runId,
        }),
        getDatasetRunConversationRelations(runDbClient)({
          scopes: { tenantId, projectId, datasetRunId: runId },
        }),
      ]);

      const runConfigName = runConfig?.name ?? null;
      const totalItems = summary.pending + summary.running + summary.completed + summary.failed;

      // Get all dataset items for this dataset
      const datasetItems = await listDatasetItems(db)({
        scopes: { tenantId, projectId, datasetId: run.datasetId },
      });

      // Match conversations with dataset items using datasetItemId
      // This works correctly even with async processing since we store datasetItemId in the relation
      const itemsWithConversations = await Promise.all(
        datasetItems.map(async (item) => {
          // Find conversations for this item using datasetItemId
          const itemConversations = conversationRelations.filter(
            (conv) => conv.datasetItemId === item.id
          );

          // Fetch output (assistant response) and agentId for each conversation
          const conversationsWithOutput = await Promise.all(
            itemConversations.map(async (conv) => {
              try {
                // Fetch conversation to get sub-agent ID, then look up parent agent ID
                const conversation = await getConversation(runDbClient)({
                  scopes: { tenantId, projectId },
                  conversationId: conv.conversationId,
                });

                const agentId: string | null = conversation?.agentId || null;

                const messages = await getMessagesByConversation(runDbClient)({
                  scopes: { tenantId, projectId },
                  conversationId: conv.conversationId,
                  pagination: { page: 1, limit: 100 },
                });

                // Find the assistant/agent response (most recent one)
                const assistantMessage = messages
                  .filter((msg) => msg.role === 'assistant' || msg.role === 'agent')
                  .sort(
                    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  )[0];

                let output: string | null = null;
                if (assistantMessage?.content) {
                  if (typeof assistantMessage.content === 'string') {
                    output = assistantMessage.content;
                  } else if (
                    typeof assistantMessage.content === 'object' &&
                    assistantMessage.content !== null &&
                    'text' in assistantMessage.content
                  ) {
                    output =
                      typeof assistantMessage.content.text === 'string'
                        ? assistantMessage.content.text
                        : null;
                  }
                }

                return {
                  ...conv,
                  output,
                  agentId,
                };
              } catch (error) {
                logger.warn(
                  { error, conversationId: conv.conversationId },
                  'Failed to fetch conversation output'
                );
                return {
                  ...conv,
                  output: null,
                  agentId: null,
                };
              }
            })
          );

          return {
            ...item,
            conversations: conversationsWithOutput,
          };
        })
      );

      // Also fetch output and agentId for all conversations in the main conversations array
      const conversationsWithOutput = await Promise.all(
        conversationRelations.map(async (conv) => {
          try {
            // Fetch conversation to get sub-agent ID, then look up parent agent ID
            const conversation = await getConversation(runDbClient)({
              scopes: { tenantId, projectId },
              conversationId: conv.conversationId,
            });

            const agentId: string | null = conversation?.agentId || null;

            const messages = await getMessagesByConversation(runDbClient)({
              scopes: { tenantId, projectId },
              conversationId: conv.conversationId,
              pagination: { page: 1, limit: 100 },
            });

            const assistantMessage = messages
              .filter((msg) => msg.role === 'assistant' || msg.role === 'agent')
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

            let output: string | null = null;
            if (assistantMessage?.content) {
              if (typeof assistantMessage.content === 'string') {
                output = assistantMessage.content;
              } else if (
                typeof assistantMessage.content === 'object' &&
                assistantMessage.content !== null &&
                'text' in assistantMessage.content
              ) {
                output =
                  typeof assistantMessage.content.text === 'string'
                    ? assistantMessage.content.text
                    : null;
              }
            }

            return {
              ...conv,
              output,
              agentId,
            };
          } catch (error) {
            logger.warn(
              { error, conversationId: conv.conversationId },
              'Failed to fetch conversation output'
            );
            return {
              ...conv,
              output: null,
              agentId: null,
            };
          }
        })
      );

      return c.json({
        data: {
          ...run,
          runConfigName,
          status: deriveRunStatus(summary),
          totalItems,
          completedItems: summary.completed,
          failedItems: summary.failed,
          conversations: conversationsWithOutput,
          items: itemsWithConversations,
        } as any,
      }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, runId }, 'Failed to get dataset run');
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
        listScheduledTriggerInvocationsByTriggerId(runDbClient)({
          scopes: { tenantId, projectId },
          scheduledTriggerId: runId,
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
          datasetRunId: inv.scheduledTriggerId,
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
      logger.error({ error, tenantId, projectId, runId }, 'Failed to get dataset run items');
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

export default app;
