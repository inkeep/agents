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
  createScheduledTriggerInvocation,
  DatasetRunConfigApiInsertSchema,
  DatasetRunConfigApiSelectSchema,
  DatasetRunConfigApiUpdateSchema,
  deleteDatasetRunConfig,
  deleteDatasetRunConfigAgentRelation,
  generateId,
  getAgentDatasetRelationsByDataset,
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
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';
import type { DatasetRunQueueItem } from '../../../evals/services/datasetRun';
import { queueDatasetRunItems } from '../../../evals/services/datasetRun';

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
        (config) => config.datasetId === c.req.valid('param').datasetId
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

    const { agentIds, evaluatorIds: _evaluatorIds, ...runConfigData } = configData;

    try {
      const id = runConfigData.id || generateId();
      const created = await createDatasetRunConfig(db)({
        ...runConfigData,
        id,
        tenantId,
        projectId,
      });

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
      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configData },
        'Failed to create dataset run config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: error instanceof Error ? error.message : 'Failed to create dataset run config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{runConfigId}/run',
    summary: 'Trigger Dataset Run',
    operationId: 'trigger-dataset-run',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({ runConfigId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              branchName: z.string().optional(),
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
    const { tenantId, projectId, runConfigId } = c.req.valid('param');
    const db = c.get('db');
    const { evaluatorIds, branchName } = c.req.valid('json');

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

      const datasetId = config.datasetId;
      const [datasetItems, allAgentRelations, datasetAgentRelations] = await Promise.all([
        listDatasetItems(db)({
          scopes: { tenantId, projectId, datasetId },
        }),
        getDatasetRunConfigAgentRelations(db)({
          scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
        }),
        getAgentDatasetRelationsByDataset(db)({
          scopes: { tenantId, projectId, datasetId },
        }),
      ]);

      if (datasetItems.length === 0) {
        return c.json(
          createApiError({
            code: 'bad_request',
            message: 'Dataset has no items. Add items to the dataset before triggering a run.',
          }),
          400
        ) as any;
      }

      if (allAgentRelations.length === 0) {
        return c.json(
          createApiError({
            code: 'bad_request',
            message:
              'No agents configured for this run config. Add agents to the run configuration.',
          }),
          400
        ) as any;
      }

      let agentRelations = allAgentRelations;
      if (datasetAgentRelations.length > 0) {
        const allowedAgentIds = new Set(datasetAgentRelations.map((r) => r.agentId));
        agentRelations = allAgentRelations.filter((r) => allowedAgentIds.has(r.agentId));

        if (agentRelations.length < allAgentRelations.length) {
          const excluded = allAgentRelations
            .filter((r) => !allowedAgentIds.has(r.agentId))
            .map((r) => r.agentId);
          logger.info(
            { runConfigId, datasetId, excludedAgents: excluded },
            'Excluded agents not scoped to this dataset'
          );
        }

        if (agentRelations.length === 0) {
          return c.json(
            createApiError({
              code: 'bad_request',
              message:
                'None of the configured agents are scoped to this dataset. Update the dataset agent scope or run config agents.',
            }),
            400
          ) as any;
        }
      }

      const datasetRunId = generateId();

      await createDatasetRun(runDbClient)({
        id: datasetRunId,
        tenantId,
        projectId,
        datasetId: config.datasetId,
        datasetRunConfigId: runConfigId,
        evaluationJobConfigId: undefined,
        ref: c.get('resolvedRef'),
      });

      let evaluationRunId: string | undefined;
      if (evaluatorIds && evaluatorIds.length > 0) {
        const jobConfigId = generateId();
        await createEvaluationJobConfig(db)({
          id: jobConfigId,
          tenantId,
          projectId,
          jobFilters: { datasetRunIds: [datasetRunId] },
        });
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
        await linkDatasetRunToEvaluationJobConfig(runDbClient)({
          scopes: { tenantId, projectId, datasetRunId },
          evaluationJobConfigId: jobConfigId,
        });
        evaluationRunId = generateId();
        await createEvaluationRun(runDbClient)({
          id: evaluationRunId,
          tenantId,
          projectId,
          evaluationJobConfigId: jobConfigId,
          ref: c.get('resolvedRef'),
        });
      }

      const invocationPairs = agentRelations.flatMap((agentRelation) =>
        datasetItems.map((datasetItem) => ({
          agentId: agentRelation.agentId,
          datasetItem,
        }))
      );

      const invocations = await Promise.all(
        invocationPairs.map(({ agentId, datasetItem }) =>
          createScheduledTriggerInvocation(runDbClient)({
            id: generateId(),
            tenantId,
            projectId,
            agentId,
            scheduledTriggerId: datasetRunId,
            status: 'pending',
            scheduledFor: new Date().toISOString(),
            resolvedPayload: {
              datasetItemId: datasetItem.id,
              datasetRunId,
              messages: datasetItem.input.messages,
            },
            idempotencyKey: `${datasetRunId}-${agentId}-${datasetItem.id}`,
            attemptNumber: 1,
          })
        )
      );

      const invocationMap = new Map<string, (typeof invocations)[number]>();
      for (let idx = 0; idx < invocationPairs.length; idx++) {
        const pair = invocationPairs[idx];
        invocationMap.set(`${pair.agentId}:${pair.datasetItem.id}`, invocations[idx]);
      }

      const items: DatasetRunQueueItem[] = agentRelations.flatMap((agentRelation) =>
        datasetItems.map((datasetItem) => {
          const inv = invocationMap.get(`${agentRelation.agentId}:${datasetItem.id}`);
          if (!inv) {
            throw new Error(
              `Missing invocation for agent ${agentRelation.agentId} and dataset item ${datasetItem.id}`
            );
          }
          return {
            agentId: agentRelation.agentId,
            id: datasetItem.id,
            input: datasetItem.input,
            expectedOutput: datasetItem.expectedOutput,
            scheduledTriggerInvocationId: inv.id,
          };
        })
      );

      const rawRef = c.req.query('ref') || c.req.header('x-inkeep-ref');
      const effectiveRef = branchName || (rawRef && rawRef !== 'main' ? rawRef : undefined);

      logger.info(
        {
          tenantId,
          projectId,
          runConfigId,
          datasetRunId,
          branchName,
          rawRef,
          effectiveRef,
          resolvedRefName: c.get('resolvedRef')?.name,
        },
        'Queueing dataset run items with ref'
      );

      await queueDatasetRunItems({
        tenantId,
        projectId,
        datasetRunId,
        items,
        evaluatorIds,
        evaluationRunId,
        ref: effectiveRef,
      });

      logger.info(
        { tenantId, projectId, runConfigId, datasetRunId, totalItems: items.length },
        'Dataset run triggered'
      );

      return c.json({ datasetRunId, status: 'pending' as const, totalItems: items.length }, 202);
    } catch (error) {
      logger.error({ error, tenantId, projectId, runConfigId }, 'Failed to trigger dataset run');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: error instanceof Error ? error.message : 'Failed to trigger dataset run',
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
