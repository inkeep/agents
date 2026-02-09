import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createDataset,
  // Commenting out dataset runs
  // createDatasetRun,
  // createEvaluationJobConfig,
  // createEvaluationJobConfigEvaluatorRelation,
  // createEvaluationRun,
  DatasetApiInsertSchema,
  DatasetApiSelectSchema,
  DatasetApiUpdateSchema,
  // datasetRun,
  deleteDataset,
  // EvalApiClient,
  generateId,
  // getAgentById,
  getDatasetById,
  // getEvaluatorById,
  // InternalServices,
  ListResponseSchema,
  // listDatasetItems,
  listDatasets,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateDataset,
} from '@inkeep/agents-core';
// import { and, eq } from 'drizzle-orm';
// import runDbClient from '../../data/db/runDbClient';
// import { env } from '../../env';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('datasets');

// Require edit permission for write operations
app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.use('/:datasetId', async (c, next) => {
  if (['PATCH', 'DELETE'].includes(c.req.method)) {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List all Datasets',
    operationId: 'list-datasets',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'List of datasets',
        content: {
          'application/json': {
            schema: ListResponseSchema(DatasetApiSelectSchema),
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
      const datasets = await listDatasets(db)({ scopes: { tenantId, projectId } });
      return c.json({
        data: datasets as any,
        pagination: {
          page: 1,
          limit: datasets.length,
          total: datasets.length,
          pages: 1,
        },
      }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId }, 'Failed to list datasets');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to list datasets' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{datasetId}',
    summary: 'Get Dataset by ID',
    operationId: 'get-dataset',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ datasetId: z.string() }),
    },
    responses: {
      200: {
        description: 'Dataset details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(DatasetApiSelectSchema),
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
      const dataset = await getDatasetById(db)({
        scopes: { tenantId, projectId, datasetId },
      });

      if (!dataset) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset not found' }),
          404
        ) as any;
      }

      return c.json({ data: dataset as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, datasetId }, 'Failed to get dataset');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to get dataset' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Dataset',
    operationId: 'create-dataset',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: DatasetApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Dataset created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(DatasetApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const datasetData = c.req.valid('json');

    try {
      const id = (datasetData as any).id || generateId();
      const created = await createDataset(db)({
        ...datasetData,
        id,
        tenantId,
        projectId,
      } as any);

      logger.info({ tenantId, projectId, datasetId: id }, 'Dataset created');
      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, datasetData }, 'Failed to create dataset');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to create dataset' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/{datasetId}',
    summary: 'Update Dataset by ID',
    operationId: 'update-dataset',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ datasetId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: DatasetApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Dataset updated',
        content: {
          'application/json': {
            schema: SingleResponseSchema(DatasetApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, datasetId } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      const updated = await updateDataset(db)({
        scopes: { tenantId, projectId, datasetId },
        data: updateData as any,
      });

      if (!updated) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, datasetId }, 'Dataset updated');
      return c.json({ data: updated as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, datasetId }, 'Failed to update dataset');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to update dataset' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{datasetId}',
    summary: 'Delete Dataset by ID',
    operationId: 'delete-dataset',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ datasetId: z.string() }),
    },
    responses: {
      204: {
        description: 'Dataset deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, datasetId } = c.req.valid('param');

    try {
      const deleted = await deleteDataset(db)({
        scopes: { tenantId, projectId, datasetId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, datasetId }, 'Dataset deleted');
      return c.body(null, 204) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, datasetId }, 'Failed to delete dataset');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to delete dataset' }),
        500
      );
    }
  }
);

// Temporarily commented out - dataset run capability disabled
// app.openapi(
//   createRoute({
//     method: 'post',
//     path: '/{datasetId}/trigger',
//     summary: 'Trigger Dataset Run',
//     operationId: 'trigger-dataset-run',
//     tags: ['Evaluations'],
//     request: {
//       params: TenantProjectParamsSchema.extend({ datasetId: z.string() }),
//       body: {
//         content: {
//           'application/json': {
//             schema: z.object({
//               agentIds: z.array(z.string()).min(1, 'At least one agent is required'),
//               evaluatorIds: z.array(z.string()).optional(),
//             }),
//           },
//         },
//       },
//     },
//     responses: {
//       202: {
//         description: 'Dataset run triggered',
//         content: {
//           'application/json': {
//             schema: z.object({
//               message: z.string(),
//               datasetRunId: z.string(),
//               datasetId: z.string(),
//             }),
//           },
//         },
//       },
//       ...commonGetErrorResponses,
//     },
//   }),
//   async (c) => {
//     const { tenantId, projectId, datasetId } = c.req.valid('param');
//     const db = c.get('db');
//     const { agentIds, evaluatorIds } = c.req.valid('json');
//
//     try {
//       // Verify dataset exists
//       const dataset = await getDatasetById(db)({
//         scopes: { tenantId, projectId, datasetId },
//       });
//
//       if (!dataset) {
//         return c.json(
//           createApiError({ code: 'not_found', message: 'Dataset not found' }),
//           404
//         ) as any;
//       }
//
//       // Verify all agents exist
//       const agents = await Promise.all(
//         agentIds.map((agentId: string) =>
//           getAgentById(db)({
//             scopes: { tenantId, projectId, agentId },
//           })
//         )
//       );
//
//       const missingAgents = agentIds.filter((id: string, index: number) => !agents[index]);
//       if (missingAgents.length > 0) {
//         return c.json(
//           createApiError({
//             code: 'not_found',
//             message: `Agents not found: ${missingAgents.join(', ')}`,
//           }),
//           404
//         ) as any;
//       }
//
//       // Verify all evaluators exist if provided
//       if (evaluatorIds && evaluatorIds.length > 0) {
//         const evaluators = await Promise.all(
//           evaluatorIds.map((evaluatorId: string) =>
//             getEvaluatorById(db)({
//               scopes: { tenantId, projectId, evaluatorId },
//             })
//           )
//         );
//
//         const missingEvaluators = evaluatorIds.filter(
//           (id: string, index: number) => !evaluators[index]
//         );
//         if (missingEvaluators.length > 0) {
//           return c.json(
//             createApiError({
//               code: 'not_found',
//               message: `Evaluators not found: ${missingEvaluators.join(', ')}`,
//             }),
//             404
//           ) as any;
//         }
//       }
//
//       // Create new dataset run
//       const datasetRunId = generateId();
//       await createDatasetRun(runDbClient)({
//         id: datasetRunId,
//         tenantId,
//         projectId,
//         datasetId,
//         datasetRunConfigId: undefined as any, // TODO: Fix schema to make this optional
//         evaluationJobConfigId: undefined,
//       });
//
//       // Get all dataset items
//       const datasetItems = await listDatasetItems(db)({
//         scopes: { tenantId, projectId, datasetId },
//       });
//
//       // Create evaluation job config and run if evaluators provided
//       let evaluationRunId: string | undefined;
//       let evalJobConfigId: string | undefined;
//       if (evaluatorIds && evaluatorIds.length > 0) {
//         // Create evaluation job config
//         evalJobConfigId = generateId();
//         await createEvaluationJobConfig(db)({
//           id: evalJobConfigId,
//           tenantId,
//           projectId,
//           jobFilters: {
//             datasetRunIds: [datasetRunId],
//           },
//         });
//
//         // Create evaluator relations
//         await Promise.all(
//           evaluatorIds.map((evaluatorId: string) =>
//             createEvaluationJobConfigEvaluatorRelation(db)({
//               tenantId,
//               projectId,
//               id: generateId(),
//               evaluationJobConfigId: evalJobConfigId!,
//               evaluatorId,
//             })
//           )
//         );
//
//         // Update dataset run to link the eval job config (datasetRun is in runtime DB)
//         await runDbClient
//           .update(datasetRun)
//           .set({ evaluationJobConfigId: evalJobConfigId })
//           .where(
//             and(
//               eq(datasetRun.tenantId, tenantId),
//               eq(datasetRun.projectId, projectId),
//               eq(datasetRun.id, datasetRunId)
//             )
//           );
//
//         // Create evaluation run linked to job config
//         evaluationRunId = generateId();
//         await createEvaluationRun(runDbClient)({
//           id: evaluationRunId,
//           tenantId,
//           projectId,
//           evaluationJobConfigId: evalJobConfigId,
//         });
//       }
//
//       // Build items array (cartesian product of agentIds × datasetItems)
//       const items = agentIds.flatMap((agentId: string) =>
//         datasetItems.map((datasetItem) => ({
//           agentId,
//           id: datasetItem.id,
//           input: datasetItem.input,
//           expectedOutput: datasetItem.expectedOutput,
//           simulationAgent: datasetItem.simulationAgent,
//         }))
//       );
//
//       // Trigger dataset run via eval API
//       const evalClient = new EvalApiClient({
//         apiUrl: env.INKEEP_AGENTS_EVAL_API_URL,
//         tenantId,
//         projectId,
//         auth: {
//           mode: 'internalService',
//           internalServiceName: InternalServices.INKEEP_AGENTS_EVAL_API,
//         },
//       });
//
//       const result = await evalClient.triggerDatasetRun({
//         datasetRunId,
//         items,
//         evaluatorIds: evaluatorIds && evaluatorIds.length > 0 ? evaluatorIds : undefined,
//         evaluationRunId,
//       });
//
//       logger.info(
//         {
//           tenantId,
//           projectId,
//           datasetId,
//           datasetRunId,
//           itemsQueued: result.queued,
//           itemsFailed: result.failed,
//           agentCount: agentIds.length,
//           datasetItemCount: datasetItems.length,
//           hasEvaluators: !!(evaluatorIds && evaluatorIds.length > 0),
//         },
//         'Dataset run items queued via eval API'
//       );
//
//       return c.json(
//         {
//           message: 'Dataset run triggered successfully',
//           datasetRunId,
//           datasetId,
//         },
//         202
//       ) as any;
//     } catch (error) {
//       logger.error({ error, tenantId, projectId, datasetId }, 'Failed to trigger dataset run');
//       return c.json(
//         createApiError({
//           code: 'internal_server_error',
//           message: 'Failed to trigger dataset run',
//         }),
//         500
//       );
//     }
//   }
// );

export default app;
