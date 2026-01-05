import {
  commonGetErrorResponses,
  createApiError,
  createDatasetRun,
  createDatasetRunConfig,
  createDatasetRunConfigAgentRelation,
  createEvaluationJobConfig,
  createEvaluationJobConfigEvaluatorRelation,
  createEvaluationRun,
  deleteDatasetRunConfig,
  deleteDatasetRunConfigAgentRelation,
  generateId,
  getAgentById,
  getDatasetById,
  getDatasetRunConfigAgentRelations,
  getDatasetRunConfigById,
  getEvaluatorById,
  ListResponseSchema,
  listDatasetItems,
  listDatasetRunConfigs,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateDatasetRunConfig,
  datasetRun,
  DatasetRunConfigApiSelectSchema,
  DatasetRunConfigApiInsertSchema,
  DatasetRunConfigApiUpdateSchema,
} from '@inkeep/agents-core';
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { start } from 'workflow/api';
import manageDbClient from '../../data/db/manageDbClient';
import { getLogger } from '../../logger';
import { runDatasetItemWorkflow } from '../../workflow';
import runDbClient from 'src/data/db/runDbClient';

const app = new OpenAPIHono();
const logger = getLogger('datasetRunConfigs');

app.openapi(
  createRoute({
    method: 'get',
    path: '/datasets/{datasetId}/run-configs',
    summary: 'List Dataset Run Configs',
    operationId: 'list-dataset-run-configs',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ datasetId: z.string() }),
    },
    responses: {
      200: {
        description: 'List of dataset run configs',
        content: {
          'application/json': {
            schema: ListResponseSchema(DatasetRunConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');

    try {
      const configs = await listDatasetRunConfigs(manageDbClient)({ scopes: { tenantId, projectId } });
      const filteredConfigs = configs.filter(
        (config) => (config as any).datasetId === c.req.valid('param').datasetId
      );
      return c.json({
        data: filteredConfigs as any,
        pagination: {
          page: 1,
          limit: filteredConfigs.length,
          total: filteredConfigs.length,
          pages: 1,
        },
      }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId }, 'Failed to list dataset run configs');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list dataset run configs',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/dataset-run-configs/{runConfigId}',
    summary: 'Get Dataset Run Config by ID',
    operationId: 'get-dataset-run-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ runConfigId: z.string() }),
    },
    responses: {
      200: {
        description: 'Dataset run config details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(DatasetRunConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, runConfigId } = c.req.valid('param');

    try {
      const config = await getDatasetRunConfigById(manageDbClient)({
        scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
      });

      if (!config) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset run config not found' }),
          404
        ) as any;
      }

      return c.json({
        data: config,
      }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, runConfigId }, 'Failed to get dataset run config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get dataset run config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/dataset-run-configs',
    summary: 'Create Dataset Run Config',
    operationId: 'create-dataset-run-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: DatasetRunConfigApiInsertSchema.extend({
              agentIds: z.array(z.string()).optional(),
              evaluatorIds: z.array(z.string()).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Dataset run config created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(DatasetRunConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const configData = c.req.valid('json') as any;

    const { agentIds, evaluatorIds, ...runConfigData } = configData;

    logger.info(
      {
        tenantId,
        projectId,
        agentIds,
        evaluatorIds,
        evaluatorIdsType: typeof evaluatorIds,
        evaluatorIdsIsArray: Array.isArray(evaluatorIds),
        evaluatorIdsLength: Array.isArray(evaluatorIds) ? evaluatorIds.length : 0,
        hasEvaluators: evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0,
        configDataKeys: Object.keys(configData),
        runConfigDataKeys: Object.keys(runConfigData),
      },
      'Creating dataset run config with evaluators'
    );

    try {
      const id = runConfigData.id || generateId();
      const created = await createDatasetRunConfig(manageDbClient)({
        ...runConfigData,
        id,
        tenantId,
        projectId,
      });

      // Create agent relations if provided
      if (agentIds && Array.isArray(agentIds) && agentIds.length > 0) {
        await Promise.all(
          agentIds.map((agentId: string) =>
            createDatasetRunConfigAgentRelation(manageDbClient)({
              tenantId,
              projectId,
              id: generateId(),
              datasetRunConfigId: id,
              agentId,
            })
          )
        );
      }

      logger.info({ tenantId, projectId, runConfigId: id }, 'Dataset run config created');

      // Create dataset run immediately and process items asynchronously
      try {
        const datasetRunId = generateId();
        
        // Create dataset run first (without eval job config)
        await createDatasetRun(runDbClient)({
          id: datasetRunId,
          tenantId,
          projectId,
          datasetId: runConfigData.datasetId,
          datasetRunConfigId: id,
          evaluationJobConfigId: undefined, // Will be linked after conversations exist
        });

        logger.info(
          {
            tenantId,
            projectId,
            runConfigId: id,
            datasetRunId,
            hasEvaluators: !!(evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0),
          },
          'Dataset run created, processing items'
        );

        // Process dataset items (evaluations will be queued via workflow)
        logger.info(
          {
            tenantId,
            projectId,
            datasetRunId,
            runConfigId: id,
            evaluatorIds,
            evaluatorIdsType: typeof evaluatorIds,
            evaluatorIdsIsArray: Array.isArray(evaluatorIds),
            evaluatorIdsLength: Array.isArray(evaluatorIds) ? evaluatorIds.length : 0,
            hasEvaluators: evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0,
          },
          'Starting dataset run processing with evaluators'
        );

        // Queue all dataset items via workflow system (fire-and-forget)
        // Get all dataset items and agents
        const datasetItems = await listDatasetItems(manageDbClient)({
          scopes: { tenantId, projectId, datasetId: runConfigData.datasetId },
        });

        const agentRelations = await getDatasetRunConfigAgentRelations(manageDbClient)({
          scopes: { tenantId, projectId, datasetRunConfigId: id },
        });

        // Create evaluation run if evaluators are configured
        let evaluationRunId: string | undefined;
        let evalJobConfigId: string | undefined;
        if (evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0) {
          // Create evaluation job config first
          evalJobConfigId = generateId();
          await createEvaluationJobConfig(manageDbClient)({
            id: evalJobConfigId,
            tenantId,
            projectId,
            jobFilters: {
              datasetRunIds: [datasetRunId],
            },
          });

          // Create evaluator relations
          await Promise.all(
            evaluatorIds.map((evaluatorId: string) =>
              createEvaluationJobConfigEvaluatorRelation(manageDbClient)({
                tenantId,
                projectId,
                id: generateId(),
                evaluationJobConfigId: evalJobConfigId!,
                evaluatorId,
              })
            )
          );

          // Update dataset run to link the eval job config
          await manageDbClient
            .update(datasetRun)
            .set({ evaluationJobConfigId: evalJobConfigId })
            .where(
              and(
                eq(datasetRun.tenantId, tenantId),
                eq(datasetRun.projectId, projectId),
                eq(datasetRun.id, datasetRunId)
              )
            );

          // Create evaluation run linked to the job config
          evaluationRunId = generateId();
          await createEvaluationRun(runDbClient)({
            id: evaluationRunId,
            tenantId,
            projectId,
            evaluationJobConfigId: evalJobConfigId,
          });
        }

        // Queue each dataset item as a workflow - process sequentially to avoid TransactionConflict
        // Vercel Queue doesn't handle parallel writes well, so we process one at a time
        let itemsQueued = 0;
        let itemsFailed = 0;

        for (const agentRelation of agentRelations) {
          for (const datasetItem of datasetItems) {
            const workflowPayload = {
              tenantId,
              projectId,
              agentId: agentRelation.agentId,
              datasetItemId: datasetItem.id,
              datasetItemInput: datasetItem.input,
              datasetItemSimulationAgent: datasetItem.simulationAgent as any,
              datasetRunId,
              evaluatorIds: evaluatorIds && Array.isArray(evaluatorIds) ? evaluatorIds : undefined,
              evaluationRunId,
            };

            // Calculate payload size to detect if it's too large for queue
            const payloadJson = JSON.stringify(workflowPayload);
            const payloadBytes = Buffer.byteLength(payloadJson, 'utf8');

            // Use unique ID per dataset item to avoid TransactionConflict in Vercel Queue
            const uniqueRunId = `${datasetRunId}:${agentRelation.agentId}:${datasetItem.id}`;

            logger.info(
              {
                datasetItemId: datasetItem.id,
                agentId: agentRelation.agentId,
                uniqueRunId,
                payloadKeys: Object.keys(workflowPayload),
                payloadBytes,
                payloadKB: (payloadBytes / 1024).toFixed(2),
                hasInput: !!datasetItem.input,
                inputType: typeof datasetItem.input,
                inputLength: typeof datasetItem.input === 'string' ? (datasetItem.input as string).length : JSON.stringify(datasetItem.input)?.length ?? 0,
                hasSimulationAgent: !!datasetItem.simulationAgent,
              },
              'Starting workflow for dataset item'
            );

            try {
              // Sequential processing prevents TransactionConflict in Vercel Queue
              // The uniqueRunId is for logging/debugging only (start() doesn't support idempotency keys)
              const result = await start(runDatasetItemWorkflow, [workflowPayload]);
              logger.info(
                { datasetItemId: datasetItem.id, uniqueRunId, result },
                'Workflow started successfully'
              );
              itemsQueued++;
            } catch (err: any) {
              logger.error(
                {
                  datasetItemId: datasetItem.id,
                  uniqueRunId,
                  error: err,
                  errorName: err?.name,
                  errorMessage: err?.message,
                  errorStack: err?.stack,
                  errorStatus: err?.status,
                  errorUrl: err?.url,
                },
                'Failed to start workflow for dataset item'
              );
              itemsFailed++;
              // Continue with other items instead of failing the whole batch
            }
          }
        }

        logger.info(
          {
            tenantId,
            projectId,
            runConfigId: id,
            datasetRunId,
            itemsQueued,
            itemsFailed,
            agentsUsed: agentRelations.length,
            datasetItemCount: datasetItems.length,
            hasEvaluators: !!(evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0),
          },
          'Dataset run items queued via workflow'
        );

        // If all items failed, throw an error
        if (itemsQueued === 0 && itemsFailed > 0) {
          throw new Error(`All ${itemsFailed} workflow items failed to queue`);
        }
      } catch (runError) {
        // Log error but don't fail the config creation
        logger.error(
          {
            error: runError,
            tenantId,
            projectId,
            runConfigId: id,
          },
          'Failed to create/execute dataset run, but config was created'
        );
      }

      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configData },
        'Failed to create dataset run config'
      );
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String(error.message)
            : 'Failed to create dataset run config';
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: errorMessage,
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/dataset-run-configs/{runConfigId}',
    summary: 'Update Dataset Run Config',
    operationId: 'update-dataset-run-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ runConfigId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: DatasetRunConfigApiUpdateSchema.extend({
              agentIds: z.array(z.string()).optional(),
              evaluatorIds: z.array(z.string()).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Dataset run config updated',
        content: {
          'application/json': {
            schema: SingleResponseSchema(DatasetRunConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, runConfigId } = c.req.valid('param');
    const configData = c.req.valid('json');
    const { agentIds, ...runConfigUpdateData } = configData as any;

    try {
      const updated = await updateDatasetRunConfig(manageDbClient)({
        scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
        data: runConfigUpdateData,
      });

      if (!updated) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset run config not found' }),
          404
        ) as any;
      }

      // Update agent relations if provided
      if (agentIds !== undefined) {
        // Get existing relations
        const existingRelations = await getDatasetRunConfigAgentRelations(manageDbClient)({
          scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
        });

        const existingAgentIds = existingRelations.map((rel) => rel.agentId);
        const newAgentIds = Array.isArray(agentIds) ? agentIds : [];

        // Delete relations that are no longer in the list
        const toDelete = existingAgentIds.filter((id) => !newAgentIds.includes(id));
        await Promise.all(
          toDelete.map((agentId) =>
            deleteDatasetRunConfigAgentRelation(manageDbClient)({
              scopes: { tenantId, projectId, datasetRunConfigId: runConfigId, agentId },
            })
          )
        );

        // Create new relations
        const toCreate = newAgentIds.filter((id) => !existingAgentIds.includes(id));
        await Promise.all(
          toCreate.map((agentId) =>
            createDatasetRunConfigAgentRelation(manageDbClient)({
              tenantId,
              projectId,
              id: generateId(),
              datasetRunConfigId: runConfigId,
              agentId,
            } as any)
          )
        );
      }

      // Note: evaluatorIds are only used when creating a new dataset run,
      // not when updating an existing config. Updates don't trigger new runs.

      logger.info({ tenantId, projectId, runConfigId }, 'Dataset run config updated');
      return c.json({ data: updated as any }) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, runConfigId, configData },
        'Failed to update dataset run config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to update dataset run config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/dataset-run-configs/{runConfigId}',
    summary: 'Delete Dataset Run Config',
    operationId: 'delete-dataset-run-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ runConfigId: z.string() }),
    },
    responses: {
      204: {
        description: 'Dataset run config deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, runConfigId } = c.req.valid('param');

    try {
      const deleted = await deleteDatasetRunConfig(manageDbClient)({
        scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset run config not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, runConfigId }, 'Dataset run config deleted');
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
          runConfigId,
        },
        'Failed to delete dataset run config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: error?.cause?.detail || error?.message || 'Failed to delete dataset run config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/datasets/{datasetId}/trigger',
    summary: 'Trigger Dataset Run',
    operationId: 'trigger-dataset-run',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ datasetId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              agentIds: z.array(z.string()).min(1, 'At least one agent is required'),
              evaluatorIds: z.array(z.string()).optional(),
            }),
          },
        },
      },
    },
    responses: {
      202: {
        description: 'Dataset run triggered',
        content: {
          'application/json': {
            schema: z.object({
              message: z.string(),
              datasetRunId: z.string(),
              datasetId: z.string(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, datasetId } = c.req.valid('param');
    const { agentIds, evaluatorIds } = c.req.valid('json');

    try {
      // Verify dataset exists
      const dataset = await getDatasetById(manageDbClient)({
        scopes: { tenantId, projectId, datasetId },
      });

      if (!dataset) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset not found' }),
          404
        ) as any;
      }

      // Verify all agents exist
      const agents = await Promise.all(
        agentIds.map((agentId: string) =>
          getAgentById(manageDbClient)({
            scopes: { tenantId, projectId, agentId },
          })
        )
      );

      const missingAgents = agentIds.filter((id: string, index: number) => !agents[index]);
      if (missingAgents.length > 0) {
        return c.json(
          createApiError({
            code: 'not_found',
            message: `Agents not found: ${missingAgents.join(', ')}`,
          }),
          404
        ) as any;
      }

      // Verify all evaluators exist if provided
      if (evaluatorIds && evaluatorIds.length > 0) {
        const evaluators = await Promise.all(
          evaluatorIds.map((evaluatorId: string) =>
            getEvaluatorById(manageDbClient)({
              scopes: { tenantId, projectId, evaluatorId },
            })
          )
        );

        const missingEvaluators = evaluatorIds.filter((id: string, index: number) => !evaluators[index]);
        if (missingEvaluators.length > 0) {
          return c.json(
            createApiError({
              code: 'not_found',
              message: `Evaluators not found: ${missingEvaluators.join(', ')}`,
            }),
            404
          ) as any;
        }
      }

      // Create new dataset run
      const datasetRunId = generateId();
      await createDatasetRun(runDbClient)({
        id: datasetRunId,
        tenantId,
        projectId,
        datasetId,
        datasetRunConfigId: undefined as any,  // TODO: Fix schema to make this optional
        evaluationJobConfigId: undefined,
      });

      // Get all dataset items
      const datasetItems = await listDatasetItems(manageDbClient)({
        scopes: { tenantId, projectId, datasetId },
      });

      // Create evaluation job config and run if evaluators provided
      let evaluationRunId: string | undefined;
      let evalJobConfigId: string | undefined;
      if (evaluatorIds && evaluatorIds.length > 0) {
        // Create evaluation job config
        evalJobConfigId = generateId();
        await createEvaluationJobConfig(manageDbClient)({
          id: evalJobConfigId,
          tenantId,
          projectId,
          jobFilters: {
            datasetRunIds: [datasetRunId],
          },
        });

        // Create evaluator relations
        await Promise.all(
          evaluatorIds.map((evaluatorId: string) =>
            createEvaluationJobConfigEvaluatorRelation(manageDbClient)({
              tenantId,
              projectId,
              id: generateId(),
              evaluationJobConfigId: evalJobConfigId!,
              evaluatorId,
            })
          )
        );

        // Update dataset run to link the eval job config
        await manageDbClient
          .update(datasetRun)
          .set({ evaluationJobConfigId: evalJobConfigId })
          .where(
            and(
              eq(datasetRun.tenantId, tenantId),
              eq(datasetRun.projectId, projectId),
              eq(datasetRun.id, datasetRunId)
            )
          );

        // Create evaluation run linked to job config
        evaluationRunId = generateId();
        await createEvaluationRun(runDbClient)({
          id: evaluationRunId,
          tenantId,
          projectId,
          evaluationJobConfigId: evalJobConfigId,
        });
      }

      // Queue all dataset items via workflow SEQUENTIALLY to avoid TransactionConflict in Vercel Queue
      // (start() doesn't support idempotency keys, so we must process one at a time)
      let itemsQueued = 0;
      let itemsFailed = 0;
      for (const agentId of agentIds) {
        for (const datasetItem of datasetItems) {
          const uniqueRunId = `${datasetRunId}:${agentId}:${datasetItem.id}`;
          try {
            await start(runDatasetItemWorkflow, [{
              tenantId,
              projectId,
              agentId,
              datasetItemId: datasetItem.id,
              datasetItemInput: datasetItem.input,
              datasetItemSimulationAgent: datasetItem.simulationAgent as any,
              datasetRunId,
              evaluatorIds: evaluatorIds && evaluatorIds.length > 0 ? evaluatorIds : undefined,
              evaluationRunId,
            }]);
            itemsQueued++;
            logger.info(
              { datasetItemId: datasetItem.id, agentId, uniqueRunId },
              'Workflow started successfully'
            );
          } catch (err: any) {
            itemsFailed++;
            logger.error(
              {
                datasetItemId: datasetItem.id,
                agentId,
                uniqueRunId,
                error: err,
                errorName: err?.name,
                errorMessage: err?.message,
              },
              'Failed to start workflow for dataset item'
            );
          }
        }
      }

      logger.info(
        {
          tenantId,
          projectId,
          datasetId,
          datasetRunId,
          itemsQueued,
          itemsFailed,
          agentCount: agentIds.length,
          datasetItemCount: datasetItems.length,
          hasEvaluators: !!(evaluatorIds && evaluatorIds.length > 0),
        },
        'Dataset run items queued via workflow'
      );

      return c.json(
        {
          message: 'Dataset run triggered successfully',
          datasetRunId,
          datasetId,
        },
        202
      ) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, datasetId },
        'Failed to trigger dataset run'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to trigger dataset run',
        }),
        500
      );
    }
  }
);

export default app;
