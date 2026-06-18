import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  computeNextRunAt,
  createApiError,
  createDatasetRunConfig,
  createDatasetRunConfigAgentRelation,
  createDatasetRunConfigEvaluatorRelation,
  createScheduledTrigger,
  DatasetRunConfigApiInsertSchema,
  DatasetRunConfigApiSelectSchema,
  DatasetRunConfigApiUpdateSchema,
  deleteDatasetRunConfig,
  deleteDatasetRunConfigAgentRelation,
  deleteDatasetRunConfigEvaluatorRelation,
  deleteScheduledTrigger,
  findScheduledTriggerByDatasetRunConfigId,
  generateId,
  getDatasetRunConfigAgentRelations,
  getDatasetRunConfigById,
  getDatasetRunConfigEvaluatorRelations,
  getLastRunAtForTrigger,
  ListResponseSchema,
  listDatasetRunConfigs,
  type OrgRole,
  SCHEDULED_TRIGGER_DEFAULT_MAX_RETRIES,
  SCHEDULED_TRIGGER_DEFAULT_RETRY_DELAY_SECONDS,
  SCHEDULED_TRIGGER_DEFAULT_TIMEOUT_SECONDS,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateDatasetRunConfig,
  updateScheduledTrigger,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { HTTPException } from 'hono/http-exception';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';
import { executeDatasetRun } from '../../../evals/services/datasetRun';
import { validateRunAsUserId } from '../triggerHelpers';

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
      logger.error({ error }, 'Failed to list dataset run configs');
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
            schema: SingleResponseSchema(
              DatasetRunConfigApiSelectSchema.extend({
                agentIds: z.array(z.string()).optional(),
                evaluatorIds: z.array(z.string()).optional(),
              })
            ),
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

      const [agentRelations, evaluatorRelations] = await Promise.all([
        getDatasetRunConfigAgentRelations(db)({
          scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
        }),
        getDatasetRunConfigEvaluatorRelations(db)({
          scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
        }),
      ]);

      return c.json({
        data: {
          ...config,
          agentIds: agentRelations.map((r) => r.agentId),
          evaluatorIds: evaluatorRelations.map((r) => r.evaluatorId),
        },
      }) as any;
    } catch (error) {
      logger.error({ error, runConfigId }, 'Failed to get dataset run config');
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

      if (evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0) {
        await Promise.all(
          evaluatorIds.map((evaluatorId: string) =>
            createDatasetRunConfigEvaluatorRelation(db)({
              tenantId,
              projectId,
              id: generateId(),
              datasetRunConfigId: id,
              evaluatorId,
            })
          )
        );
      }

      logger.info({ runConfigId: id }, 'Dataset run config created');
      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error({ error, configData }, 'Failed to create dataset run config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create dataset run config',
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
              runAsUserId: z.string().optional().describe('User ID to run dataset items as'),
              dispatchDelayMs: z
                .number()
                .int()
                .min(0)
                .max(600_000)
                .optional()
                .describe('Delay in ms between each item execution (overrides schedule default)'),
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
    const { tenantId, projectId, runConfigId } = c.req.valid('param');
    const db = c.get('db');
    const {
      evaluatorIds: bodyEvaluatorIds,
      branchName,
      runAsUserId,
      dispatchDelayMs: bodyDispatchDelayMs,
    } = c.req.valid('json');

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

      const [agentRelations, evaluatorRelations, scheduledTrigger] = await Promise.all([
        getDatasetRunConfigAgentRelations(db)({
          scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
        }),
        getDatasetRunConfigEvaluatorRelations(db)({
          scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
        }),
        findScheduledTriggerByDatasetRunConfigId(runDbClient)({
          tenantId,
          projectId,
          datasetRunConfigId: runConfigId,
        }),
      ]);

      if (agentRelations.length === 0) {
        return c.json(
          createApiError({
            code: 'bad_request',
            message:
              'No agents configured for this run config. Add agents to the run configuration.',
          }),
          400
        ) as any;
      }

      const configEvaluatorIds = evaluatorRelations.map((r) => r.evaluatorId);
      const effectiveEvaluatorIds =
        bodyEvaluatorIds ?? (configEvaluatorIds.length > 0 ? configEvaluatorIds : undefined);
      const effectiveDispatchDelayMs = bodyDispatchDelayMs ?? config.dispatchDelayMs ?? 0;

      const rawRef = c.req.query('ref') || c.req.header('x-inkeep-ref');
      const effectiveRef = branchName || (rawRef && rawRef !== 'main' ? rawRef : undefined);

      const agentIds = agentRelations.map((r) => r.agentId);

      if (runAsUserId) {
        const callerId = c.get('userId') ?? 'system';
        const tenantRole = c.get('tenantRole') as OrgRole;
        await validateRunAsUserId({
          runAsUserId,
          callerId,
          tenantId,
          projectId,
          tenantRole,
        });
      }

      const result = await executeDatasetRun({
        tenantId,
        projectId,
        datasetRunConfigId: runConfigId,
        agentIds,
        manageDb: db,
        resolvedRef: c.get('resolvedRef'),
        evaluatorIds: effectiveEvaluatorIds,
        runAsUserId,
        ref: effectiveRef,
        scheduledTriggerId: scheduledTrigger?.id,
        staggerDelayMs: effectiveDispatchDelayMs,
      });

      logger.info(
        { runConfigId, datasetRunId: result.datasetRunId, totalItems: result.totalItems },
        'Dataset run triggered'
      );

      const failedCount = result.failedInvocations + result.failedQueueing;
      return c.json(
        {
          datasetRunId: result.datasetRunId,
          datasetRunIds: [result.datasetRunId],
          status: 'pending' as const,
          totalItems: result.totalItems,
          ...(failedCount > 0 ? { failedCount } : {}),
        },
        202
      );
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      logger.error({ error, runConfigId }, 'Failed to trigger dataset run');
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
    const { agentIds, evaluatorIds, ...runConfigUpdateData } = configData as any;

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

      if (agentIds !== undefined) {
        const existingRelations = await getDatasetRunConfigAgentRelations(db)({
          scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
        });

        const existingAgentIds = existingRelations.map((rel) => rel.agentId);
        const newAgentIds = Array.isArray(agentIds) ? agentIds : [];

        const agentsToDelete = existingAgentIds.filter((id) => !newAgentIds.includes(id));
        await Promise.all(
          agentsToDelete.map((agentId) =>
            deleteDatasetRunConfigAgentRelation(db)({
              scopes: { tenantId, projectId, datasetRunConfigId: runConfigId, agentId },
            })
          )
        );

        const agentsToCreate = newAgentIds.filter((id) => !existingAgentIds.includes(id));
        await Promise.all(
          agentsToCreate.map((agentId) =>
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

      if (evaluatorIds !== undefined) {
        const existingEvalRelations = await getDatasetRunConfigEvaluatorRelations(db)({
          scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
        });

        const existingEvalIds = existingEvalRelations.map((rel) => rel.evaluatorId);
        const newEvalIds = Array.isArray(evaluatorIds) ? (evaluatorIds as string[]) : [];

        const evalsToDelete = existingEvalIds.filter((id) => !newEvalIds.includes(id));
        await Promise.all(
          evalsToDelete.map((evaluatorId) =>
            deleteDatasetRunConfigEvaluatorRelation(db)({
              scopes: { tenantId, projectId, datasetRunConfigId: runConfigId, evaluatorId },
            })
          )
        );

        const evalsToCreate = newEvalIds.filter((id) => !existingEvalIds.includes(id));
        await Promise.all(
          evalsToCreate.map((evaluatorId) =>
            createDatasetRunConfigEvaluatorRelation(db)({
              tenantId,
              projectId,
              id: generateId(),
              datasetRunConfigId: runConfigId,
              evaluatorId,
            })
          )
        );
      }

      logger.info({ runConfigId }, 'Dataset run config updated');
      return c.json({ data: updated as any }) as any;
    } catch (error) {
      logger.error({ error, runConfigId, configData }, 'Failed to update dataset run config');
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

      logger.info({ runConfigId }, 'Dataset run config deleted');
      return c.body(null, 204) as any;
    } catch (error: any) {
      logger.error(
        {
          error: error?.message || error,
          errorStack: error?.stack,
          errorCode: error?.cause?.code,
          errorDetail: error?.cause?.detail,
          errorConstraint: error?.cause?.constraint,
          runConfigId,
        },
        'Failed to delete dataset run config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to delete dataset run config',
        }),
        500
      );
    }
  }
);

const ScheduleBodySchema = z.object({
  cronExpression: z.string().min(1).describe('Cron expression for the schedule'),
  cronTimezone: z.string().optional().default('UTC').describe('Timezone for the cron schedule'),
  enabled: z.boolean().optional().default(true).describe('Whether the schedule is active'),
  maxRetries: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .describe('Number of retry attempts (0-10)'),
  retryDelaySeconds: z
    .number()
    .int()
    .min(10)
    .max(3600)
    .optional()
    .describe('Seconds between retries (10-3600)'),
  timeoutSeconds: z
    .number()
    .int()
    .min(30)
    .max(780)
    .optional()
    .describe('Execution timeout (30-780)'),
});

const ScheduleResponseSchema = z.object({
  id: z.string(),
  cronExpression: z.string(),
  cronTimezone: z.string(),
  enabled: z.boolean(),
  maxRetries: z.number().optional(),
  retryDelaySeconds: z.number().optional(),
  timeoutSeconds: z.number().optional(),
  nextRunAt: z.string().nullable().optional(),
  lastRunAt: z.string().nullable().optional(),
});

app.openapi(
  createProtectedRoute({
    method: 'put',
    path: '/{runConfigId}/schedule',
    summary: 'Set or update schedule for a dataset run config',
    operationId: 'set-dataset-run-config-schedule',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({ runConfigId: z.string() }),
      body: {
        content: {
          'application/json': { schema: ScheduleBodySchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Schedule set successfully',
        content: {
          'application/json': { schema: ScheduleResponseSchema },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, runConfigId } = c.req.valid('param');
    const db = c.get('db');
    const body = c.req.valid('json');
    const callerId = c.get('userId') ?? 'system';

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

      const existing = await findScheduledTriggerByDatasetRunConfigId(runDbClient)({
        tenantId,
        projectId,
        datasetRunConfigId: runConfigId,
      });

      const nextRunAt = body.enabled
        ? computeNextRunAt({
            cronExpression: body.cronExpression,
            cronTimezone: body.cronTimezone,
          })
        : null;

      let trigger: Awaited<ReturnType<ReturnType<typeof createScheduledTrigger>>>;
      if (existing) {
        trigger = await updateScheduledTrigger(runDbClient)({
          scopes: { tenantId, projectId, agentId: existing.agentId ?? undefined },
          scheduledTriggerId: existing.id,
          data: {
            cronExpression: body.cronExpression,
            cronTimezone: body.cronTimezone,
            enabled: body.enabled,
            nextRunAt,
            maxRetries: body.maxRetries ?? existing.maxRetries,
            retryDelaySeconds: body.retryDelaySeconds ?? existing.retryDelaySeconds,
            timeoutSeconds: body.timeoutSeconds ?? existing.timeoutSeconds,
          },
        });
      } else {
        trigger = await createScheduledTrigger(runDbClient)({
          id: generateId(),
          tenantId,
          projectId,
          agentId: null,
          datasetRunConfigId: runConfigId,
          name: config.name ?? runConfigId,
          cronExpression: body.cronExpression,
          cronTimezone: body.cronTimezone,
          enabled: body.enabled,
          maxRetries: body.maxRetries ?? SCHEDULED_TRIGGER_DEFAULT_MAX_RETRIES,
          retryDelaySeconds:
            body.retryDelaySeconds ?? SCHEDULED_TRIGGER_DEFAULT_RETRY_DELAY_SECONDS,
          timeoutSeconds: body.timeoutSeconds ?? SCHEDULED_TRIGGER_DEFAULT_TIMEOUT_SECONDS,
          createdBy: callerId,
          ref: 'main',
          nextRunAt,
        });
      }

      const lastRunAt = existing
        ? await getLastRunAtForTrigger(runDbClient)({
            scopes: { tenantId, projectId },
            scheduledTriggerId: trigger.id,
          })
        : null;

      return c.json(
        {
          id: trigger.id,
          cronExpression: trigger.cronExpression ?? body.cronExpression,
          cronTimezone: trigger.cronTimezone ?? body.cronTimezone ?? 'UTC',
          enabled: trigger.enabled,
          maxRetries: trigger.maxRetries ?? SCHEDULED_TRIGGER_DEFAULT_MAX_RETRIES,
          retryDelaySeconds:
            trigger.retryDelaySeconds ?? SCHEDULED_TRIGGER_DEFAULT_RETRY_DELAY_SECONDS,
          timeoutSeconds: trigger.timeoutSeconds ?? SCHEDULED_TRIGGER_DEFAULT_TIMEOUT_SECONDS,
          nextRunAt: trigger.nextRunAt ?? null,
          lastRunAt,
        },
        200
      );
    } catch (error) {
      logger.error({ error, runConfigId }, 'Failed to set schedule');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to set schedule',
        }),
        500
      );
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{runConfigId}/schedule',
    summary: 'Get schedule for a dataset run config',
    operationId: 'get-dataset-run-config-schedule',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ runConfigId: z.string() }),
    },
    responses: {
      200: {
        description: 'Schedule details',
        content: {
          'application/json': {
            schema: ScheduleResponseSchema.nullable(),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, runConfigId } = c.req.valid('param');

    try {
      const trigger = await findScheduledTriggerByDatasetRunConfigId(runDbClient)({
        tenantId,
        projectId,
        datasetRunConfigId: runConfigId,
      });

      if (!trigger) {
        return c.json(null, 200);
      }

      const lastRunAt = await getLastRunAtForTrigger(runDbClient)({
        scopes: { tenantId, projectId },
        scheduledTriggerId: trigger.id,
      });

      return c.json(
        {
          id: trigger.id,
          cronExpression: trigger.cronExpression ?? '',
          cronTimezone: trigger.cronTimezone ?? 'UTC',
          enabled: trigger.enabled,
          maxRetries: trigger.maxRetries ?? SCHEDULED_TRIGGER_DEFAULT_MAX_RETRIES,
          retryDelaySeconds:
            trigger.retryDelaySeconds ?? SCHEDULED_TRIGGER_DEFAULT_RETRY_DELAY_SECONDS,
          timeoutSeconds: trigger.timeoutSeconds ?? SCHEDULED_TRIGGER_DEFAULT_TIMEOUT_SECONDS,
          dispatchDelayMs: trigger.dispatchDelayMs ?? undefined,
          runAsUserId: trigger.runAsUserId ?? null,
          nextRunAt: trigger.nextRunAt ?? null,
          lastRunAt,
        },
        200
      );
    } catch (error) {
      logger.error({ error, runConfigId }, 'Failed to get schedule');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get schedule',
        }),
        500
      ) as any;
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{runConfigId}/schedule',
    summary: 'Delete schedule for a dataset run config',
    operationId: 'delete-dataset-run-config-schedule',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema.extend({ runConfigId: z.string() }),
    },
    responses: {
      204: { description: 'Schedule deleted' },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, runConfigId } = c.req.valid('param');

    try {
      const trigger = await findScheduledTriggerByDatasetRunConfigId(runDbClient)({
        tenantId,
        projectId,
        datasetRunConfigId: runConfigId,
      });

      if (trigger) {
        await deleteScheduledTrigger(runDbClient)({
          scopes: { tenantId, projectId, agentId: trigger.agentId ?? undefined },
          scheduledTriggerId: trigger.id,
        });
      }

      return c.body(null, 204) as any;
    } catch (error) {
      logger.error({ error, runConfigId }, 'Failed to delete schedule');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to delete schedule',
        }),
        500
      );
    }
  }
);

export default app;
