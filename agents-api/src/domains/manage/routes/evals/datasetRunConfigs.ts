import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createDatasetRun,
  createDatasetRunConfig,
  createDatasetRunConfigAgentRelation,
  createEvaluationJobConfig,
  createEvaluationJobConfigEvaluatorRelation,
  createEvaluationRun,
  DatasetRunConfigApiInsertSchema,
  DatasetRunConfigApiSelectSchema,
  DatasetRunConfigApiUpdateSchema,
  deleteDatasetRunConfig,
  deleteDatasetRunConfigAgentRelation,
  generateId,
  getDatasetRunConfigAgentRelations,
  getDatasetRunConfigById,
  ListResponseSchema,
  linkDatasetRunToEvaluationJobConfig,
  listDatasetItems,
  listDatasetRunConfigs,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateDatasetRunConfig,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { queueDatasetRunItems } from 'src/domains/evals/services/datasetRun';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('datasetRunConfigs');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/by-dataset/{datasetId}',
    summary: 'List Dataset Run Configs by Dataset ID',
    operationId: 'list-dataset-run-configs',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
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
    const db = c.get('db');

    try {
      const configs = await listDatasetRunConfigs(db)({ scopes: { tenantId, projectId } });
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
  createProtectedRoute({
    method: 'get',
    path: '/{runConfigId}',
    summary: 'Get Dataset Run Config by ID',
    operationId: 'get-dataset-run-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
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
    const db = c.get('db');

    try {
      const config = await getDatasetRunConfigById(db)({
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
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Dataset Run Config',
    operationId: 'create-dataset-run-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
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
    const db = c.get('db');
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
      const created = await createDatasetRunConfig(db)({
        ...runConfigData,
        id,
        tenantId,
        projectId,
      });

      // Create agent relations if provided
      if (agentIds && Array.isArray(agentIds) && agentIds.length > 0) {
        await Promise.all(
          agentIds.map((agentId: string) =>
            createDatasetRunConfigAgentRelation(db)({
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
            hasEvaluators: !!(
              evaluatorIds &&
              Array.isArray(evaluatorIds) &&
              evaluatorIds.length > 0
            ),
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
        const datasetItems = await listDatasetItems(db)({
          scopes: { tenantId, projectId, datasetId: runConfigData.datasetId },
        });

        const agentRelations = await getDatasetRunConfigAgentRelations(db)({
          scopes: { tenantId, projectId, datasetRunConfigId: id },
        });

        // Create evaluation run if evaluators are configured
        let evaluationRunId: string | undefined;
        let evalJobConfigId: string | undefined;
        if (evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0) {
          // Create evaluation job config first
          const jobConfigId = generateId();
          evalJobConfigId = jobConfigId;
          await createEvaluationJobConfig(db)({
            id: jobConfigId,
            tenantId,
            projectId,
            jobFilters: {
              datasetRunIds: [datasetRunId],
            },
          });

          // Create evaluator relations
          await Promise.all(
            evaluatorIds.map((evaluatorId: string) =>
              createEvaluationJobConfigEvaluatorRelation(db)({
                tenantId,
                projectId,
                id: generateId(),
                evaluationJobConfigId: jobConfigId,
                evaluatorId,
              })
            )
          );

          // Update dataset run to link the eval job config
          await linkDatasetRunToEvaluationJobConfig(runDbClient)({
            scopes: { tenantId, projectId, datasetRunId },
            evaluationJobConfigId: evalJobConfigId,
          });

          // Create evaluation run linked to the job config
          evaluationRunId = generateId();
          await createEvaluationRun(runDbClient)({
            id: evaluationRunId,
            tenantId,
            projectId,
            evaluationJobConfigId: evalJobConfigId,
          });
        }

        // Build items array (cartesian product of agents × datasetItems)
        const items = agentRelations.flatMap((agentRelation) =>
          datasetItems.map((datasetItem) => ({
            agentId: agentRelation.agentId,
            id: datasetItem.id,
            input: datasetItem.input,
            expectedOutput: datasetItem.expectedOutput,
            simulationAgent: datasetItem.simulationAgent,
          }))
        );

        const result = await queueDatasetRunItems({
          tenantId,
          projectId,
          datasetRunId,
          items,
          evaluatorIds,
          evaluationRunId,
        });

        logger.info(
          {
            tenantId,
            projectId,
            runConfigId: id,
            datasetRunId,
            itemsQueued: result.queued,
            itemsFailed: result.failed,
            agentsUsed: agentRelations.length,
            datasetItemCount: datasetItems.length,
            hasEvaluators: !!(
              evaluatorIds &&
              Array.isArray(evaluatorIds) &&
              evaluatorIds.length > 0
            ),
          },
          'Dataset run items queued via eval API'
        );

        // If all items failed, throw an error
        if (result.queued === 0 && result.failed > 0) {
          throw new Error(`All ${result.failed} workflow items failed to queue`);
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
  createProtectedRoute({
    method: 'patch',
    path: '/{runConfigId}',
    summary: 'Update Dataset Run Config',
    operationId: 'update-dataset-run-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
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
    const db = c.get('db');
    const configData = c.req.valid('json');
    const { agentIds, ...runConfigUpdateData } = configData as any;

    try {
      const updated = await updateDatasetRunConfig(db)({
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
        const existingRelations = await getDatasetRunConfigAgentRelations(db)({
          scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
        });

        const existingAgentIds = existingRelations.map((rel) => rel.agentId);
        const newAgentIds = Array.isArray(agentIds) ? agentIds : [];

        // Delete relations that are no longer in the list
        const toDelete = existingAgentIds.filter((id) => !newAgentIds.includes(id));
        await Promise.all(
          toDelete.map((agentId) =>
            deleteDatasetRunConfigAgentRelation(db)({
              scopes: { tenantId, projectId, datasetRunConfigId: runConfigId, agentId },
            })
          )
        );

        // Create new relations
        const toCreate = newAgentIds.filter((id) => !existingAgentIds.includes(id));
        await Promise.all(
          toCreate.map((agentId) =>
            createDatasetRunConfigAgentRelation(db)({
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
  createProtectedRoute({
    method: 'delete',
    path: '/{runConfigId}',
    summary: 'Delete Dataset Run Config',
    operationId: 'delete-dataset-run-config',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
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
    const db = c.get('db');

    try {
      const deleted = await deleteDatasetRunConfig(db)({
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

export default app;
