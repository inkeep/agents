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
  ListResponseSchema,
  listDatasetItems,
  listDatasetRuns,
  SingleResponseSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../../data/db/runDbClient';
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
      const filteredRuns = runs.filter((run) => (run as any).datasetId === datasetId);

      // Fetch run config names for all runs
      const runsWithNames = await Promise.all(
        filteredRuns.map(async (run) => {
          if (run.datasetRunConfigId) {
            const runConfig = await getDatasetRunConfigById(db)({
              scopes: { tenantId, projectId, datasetRunConfigId: run.datasetRunConfigId },
            });
            return {
              ...run,
              runConfigName: runConfig?.name || null,
            };
          }
          return {
            ...run,
            runConfigName: null,
          };
        })
      );

      return c.json({
        data: runsWithNames as any,
        pagination: {
          page: 1,
          limit: runsWithNames.length,
          total: runsWithNames.length,
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

      let runConfigName: string | null = null;
      if (run.datasetRunConfigId) {
        // Get the run config to get the name
        const runConfig = await getDatasetRunConfigById(db)({
          scopes: { tenantId, projectId, datasetRunConfigId: run.datasetRunConfigId },
        });
        runConfigName = runConfig?.name || null;
      }

      // Get conversation relations for this run
      const conversationRelations = await getDatasetRunConversationRelations(runDbClient)({
        scopes: { tenantId, projectId, datasetRunId: runId },
      });

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
          runConfigName: runConfigName,
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

export default app;
