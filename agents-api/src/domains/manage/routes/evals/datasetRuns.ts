import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  DatasetRunApiSelectSchema,
  getConversation,
  getDatasetRunById,
  getDatasetRunConfigById,
  getDatasetRunConversationRelations,
  getEvaluationJobConfigEvaluatorRelations,
  getInProcessFetch,
  getMessagesByConversation,
  ListResponseSchema,
  listDatasetItems,
  listDatasetRuns,
  listScheduledTriggerInvocationsByTriggerId,
  SingleResponseSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../../data/db/runDbClient';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

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
              status: z.literal('pending'),
              totalItems: z.number(),
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

      let evaluatorIds = body.evaluatorIds;
      if (!evaluatorIds && sourceRun.evaluationJobConfigId) {
        const evaluatorRelations = await getEvaluationJobConfigEvaluatorRelations(db)({
          scopes: {
            tenantId,
            projectId,
            evaluationJobConfigId: sourceRun.evaluationJobConfigId,
          },
        });
        if (evaluatorRelations.length > 0) {
          evaluatorIds = evaluatorRelations.map((rel) => rel.evaluatorId);
        }
      }

      const sourceRef = sourceRun.ref as { branchName?: string } | null | undefined;
      const branchName = body.branchName ?? sourceRef?.branchName;

      const triggerUrl = `${env.INKEEP_AGENTS_API_URL.replace(
        /\/$/,
        ''
      )}/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${sourceRun.datasetRunConfigId}/run`;

      const forwardedHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const authHeader = c.req.header('authorization');
      if (authHeader) forwardedHeaders.Authorization = authHeader;
      const cookieHeader = c.req.header('cookie');
      if (cookieHeader) forwardedHeaders.cookie = cookieHeader;
      const adminSecret = c.req.header('x-inkeep-admin-secret');
      if (adminSecret) forwardedHeaders['x-inkeep-admin-secret'] = adminSecret;
      const apiKey = c.req.header('x-api-key');
      if (apiKey) forwardedHeaders['x-api-key'] = apiKey;

      const response = await getInProcessFetch()(triggerUrl, {
        method: 'POST',
        headers: forwardedHeaders,
        body: JSON.stringify({
          ...(evaluatorIds ? { evaluatorIds } : {}),
          ...(branchName ? { branchName } : {}),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(
          { runId, status: response.status, body: errorBody },
          'Rerun delegation to trigger endpoint failed'
        );
        try {
          const parsed = JSON.parse(errorBody);
          return c.json(parsed, response.status as any);
        } catch {
          return c.json(
            createApiError({
              code: 'internal_server_error',
              message: `Rerun failed: ${response.status}`,
            }),
            response.status as any
          );
        }
      }

      const result = (await response.json()) as {
        datasetRunId: string;
        status: 'pending';
        totalItems: number;
      };

      logger.info(
        { sourceRunId: runId, newRunId: result.datasetRunId, totalItems: result.totalItems },
        'Dataset run rerun triggered'
      );

      return c.json(result, 202);
    } catch (error) {
      logger.error({ error, runId }, 'Failed to rerun dataset run');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: error instanceof Error ? error.message : 'Failed to rerun dataset run',
        }),
        500
      );
    }
  }
);

export default app;
