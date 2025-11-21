import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createDataset,
  createDatasetItem,
  createDatasetItems,
  createDatasetRun,
  createDatasetRunConfig,
  createDatasetRunConfigAgentRelation,
  createDatasetRunConversationRelation,
  createEvaluationJobConfig,
  createEvaluationJobConfigEvaluatorRelation,
  createEvaluationResult,
  createEvaluationRun,
  createEvaluationRunConfig,
  createEvaluationRunConfigEvaluationSuiteConfigRelation,
  createEvaluationSuiteConfig,
  createEvaluationSuiteConfigEvaluatorRelation,
  createEvaluator,
  deleteDataset,
  deleteDatasetItem,
  deleteDatasetRunConfig,
  deleteDatasetRunConfigAgentRelation,
  deleteEvaluationJobConfig,
  deleteEvaluationJobConfigEvaluatorRelation,
  deleteEvaluationResult,
  deleteEvaluationRunConfig,
  deleteEvaluationRunConfigEvaluationSuiteConfigRelation,
  deleteEvaluationSuiteConfig,
  deleteEvaluationSuiteConfigEvaluatorRelation,
  deleteEvaluator,
  generateId,
  getDatasetById,
  getDatasetItemById,
  getDatasetRunById,
  getDatasetRunConfigAgentRelations,
  getDatasetRunConfigById,
  getDatasetRunConfigEvaluationRunConfigRelations,
  getDatasetRunConversationRelations,
  getEvaluationJobConfigById,
  getEvaluationJobConfigEvaluatorRelations,
  getEvaluationResultById,
  getEvaluationRunConfigById,
  getEvaluationRunConfigEvaluationSuiteConfigRelations,
  getEvaluationSuiteConfigById,
  getEvaluationSuiteConfigEvaluatorRelations,
  getEvaluatorById,
  getMessagesByConversation,
  ListResponseSchema,
  listDatasetItems,
  listDatasetRunConfigs,
  listDatasetRuns,
  listDatasets,
  listEvaluationJobConfigs,
  listEvaluationResultsByRun,
  listEvaluationRunConfigs,
  listEvaluationRuns,
  listEvaluationSuiteConfigs,
  listEvaluators,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateDataset,
  updateDatasetItem,
  updateDatasetRun,
  updateDatasetRunConfig,
  updateEvaluationJobConfig,
  updateEvaluationResult,
  updateEvaluationRunConfig,
  updateEvaluationSuiteConfig,
  updateEvaluator,
} from '@inkeep/agents-core';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';
import { inngest } from '../inngest';
import { getLogger } from '../logger';
import { EvaluationService } from '../services/EvaluationService';

const logger = getLogger('evaluations');
const evaluationService = new EvaluationService();

const app = new OpenAPIHono();

// Basic schemas - these should ideally be in validation/schemas.ts but creating here for now
const DatasetApiSelectSchema = z.any();
const DatasetApiInsertSchema = z.any();
const DatasetApiUpdateSchema = z.any();

const DatasetItemApiSelectSchema = z.any();
const DatasetItemApiInsertSchema = z.any();
const DatasetItemApiUpdateSchema = z.any();

const EvaluatorApiSelectSchema = z.any();
const EvaluatorApiInsertSchema = z.any();
const EvaluatorApiUpdateSchema = z.any();

const EvaluationSuiteConfigApiSelectSchema = z.any();
const EvaluationSuiteConfigApiInsertSchema = z.any();
const EvaluationSuiteConfigApiUpdateSchema = z.any();

const EvaluationResultApiSelectSchema = z.any();
const EvaluationResultApiInsertSchema = z.any();
const EvaluationResultApiUpdateSchema = z.any();

const EvaluationJobConfigApiSelectSchema = z.any();
const EvaluationJobConfigApiInsertSchema = z.object({
  jobFilters: z.any().optional(),
  evaluatorIds: z.array(z.string()).optional(),
});
const EvaluationJobConfigApiUpdateSchema = z.object({
  jobFilters: z.any().optional(),
});

const EvaluationRunConfigApiSelectSchema = z.any();
const EvaluationRunConfigApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string(),
  isActive: z.boolean().optional(),
  suiteConfigIds: z.array(z.string()).optional(),
});
const EvaluationRunConfigApiUpdateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  suiteConfigIds: z.array(z.string()).optional(),
  evaluatorIds: z.array(z.string()).optional(),
});

const DatasetRunConfigApiBaseSchema = z.object({
  name: z.string(),
  description: z.string(),
  datasetId: z.string(),
});

const DatasetRunConfigApiSelectSchema = DatasetRunConfigApiBaseSchema.extend({
  id: z.string(),
  tenantId: z.string(),
  projectId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const DatasetRunConfigApiInsertSchema = DatasetRunConfigApiBaseSchema;

const DatasetRunConfigApiUpdateSchema = DatasetRunConfigApiBaseSchema.partial();

// ============================================================================
// DATASETS
// ============================================================================

app.openapi(
  createRoute({
    method: 'get',
    path: '/datasets',
    summary: 'List Datasets',
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
    const { tenantId, projectId } = c.req.valid('param');

    try {
      const datasets = await listDatasets(dbClient)({ scopes: { tenantId, projectId } });
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
    path: '/datasets/{datasetId}',
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
    const { tenantId, projectId, datasetId } = c.req.valid('param');

    try {
      const dataset = await getDatasetById(dbClient)({
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
    path: '/datasets',
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
    const { tenantId, projectId } = c.req.valid('param');
    const datasetData = c.req.valid('json');

    try {
      const id = (datasetData as any).id || generateId();
      const created = await createDataset(dbClient)({
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
    path: '/datasets/{datasetId}',
    summary: 'Update Dataset',
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
    const { tenantId, projectId, datasetId } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      const updated = await updateDataset(dbClient)({
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
    path: '/datasets/{datasetId}',
    summary: 'Delete Dataset',
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
    const { tenantId, projectId, datasetId } = c.req.valid('param');

    try {
      const deleted = await deleteDataset(dbClient)({
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

// ============================================================================
// DATASET ITEMS
// ============================================================================

app.openapi(
  createRoute({
    method: 'get',
    path: '/datasets/{datasetId}/items',
    summary: 'List Dataset Items',
    operationId: 'list-dataset-items',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ datasetId: z.string() }),
    },
    responses: {
      200: {
        description: 'List of dataset items',
        content: {
          'application/json': {
            schema: ListResponseSchema(DatasetItemApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, datasetId } = c.req.valid('param');

    try {
      const items = await listDatasetItems(dbClient)({
        scopes: { tenantId, projectId, datasetId },
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
      logger.error({ error, tenantId, projectId, datasetId }, 'Failed to list dataset items');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list dataset items',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/datasets/{datasetId}/items/{itemId}',
    summary: 'Get Dataset Item by ID',
    operationId: 'get-dataset-item',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({
        datasetId: z.string(),
        itemId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Dataset item details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(DatasetItemApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, itemId } = c.req.valid('param');

    try {
      const item = await getDatasetItemById(dbClient)({
        scopes: { tenantId, projectId, datasetItemId: itemId },
      });

      if (!item) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset item not found' }),
          404
        ) as any;
      }

      return c.json({ data: item as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, itemId }, 'Failed to get dataset item');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to get dataset item' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/datasets/{datasetId}/items',
    summary: 'Create Dataset Item',
    operationId: 'create-dataset-item',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ datasetId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: DatasetItemApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Dataset item created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(DatasetItemApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, datasetId } = c.req.valid('param');
    const itemData = c.req.valid('json');

    try {
      const id = (itemData as any).id || generateId();
      const created = await createDatasetItem(dbClient)({
        ...itemData,
        id,
        tenantId,
        projectId,
        datasetId,
      } as any);

      logger.info({ tenantId, projectId, datasetId, itemId: id }, 'Dataset item created');
      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, datasetId, itemData },
        'Failed to create dataset item'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create dataset item',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/datasets/{datasetId}/items/bulk',
    summary: 'Create Multiple Dataset Items',
    operationId: 'create-dataset-items-bulk',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ datasetId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: z.array(DatasetItemApiInsertSchema),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Dataset items created',
        content: {
          'application/json': {
            schema: ListResponseSchema(DatasetItemApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, datasetId } = c.req.valid('param');
    const itemsData = c.req.valid('json') as any[];

    try {
      const items = itemsData.map((item) => ({
        ...item,
        id: item.id || generateId(),
        tenantId,
        projectId,
        datasetId,
      }));

      const created = await createDatasetItems(dbClient)(items as any);

      logger.info(
        { tenantId, projectId, datasetId, count: created.length },
        'Dataset items created'
      );
      return c.json({
        data: created as any,
        pagination: {
          page: 1,
          limit: created.length,
          total: created.length,
          pages: 1,
        },
      }, 201) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, datasetId }, 'Failed to create dataset items');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create dataset items',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/datasets/{datasetId}/items/{itemId}',
    summary: 'Update Dataset Item',
    operationId: 'update-dataset-item',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({
        datasetId: z.string(),
        itemId: z.string(),
      }),
      body: {
        content: {
          'application/json': {
            schema: DatasetItemApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Dataset item updated',
        content: {
          'application/json': {
            schema: SingleResponseSchema(DatasetItemApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, itemId } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      const updated = await updateDatasetItem(dbClient)({
        scopes: { tenantId, projectId, datasetItemId: itemId },
        data: updateData as any,
      });

      if (!updated) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset item not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, itemId }, 'Dataset item updated');
      return c.json({ data: updated as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, itemId }, 'Failed to update dataset item');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to update dataset item' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/datasets/{datasetId}/items/{itemId}',
    summary: 'Delete Dataset Item',
    operationId: 'delete-dataset-item',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({
        datasetId: z.string(),
        itemId: z.string(),
      }),
    },
    responses: {
      204: {
        description: 'Dataset item deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, itemId } = c.req.valid('param');

    try {
      const deleted = await deleteDatasetItem(dbClient)({
        scopes: { tenantId, projectId, datasetItemId: itemId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset item not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, itemId }, 'Dataset item deleted');
      return c.body(null, 204) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, itemId }, 'Failed to delete dataset item');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to delete dataset item' }),
        500
      );
    }
  }
);

// ============================================================================
// EVALUATORS
// ============================================================================

app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluators',
    summary: 'List Evaluators',
    operationId: 'list-evaluators',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'List of evaluators',
        content: {
          'application/json': {
            schema: ListResponseSchema(EvaluatorApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');

    try {
      const evaluators = await listEvaluators(dbClient)({ scopes: { tenantId, projectId } });
      return c.json({
        data: evaluators as any,
        pagination: {
          page: 1,
          limit: evaluators.length,
          total: evaluators.length,
          pages: 1,
        },
      }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId }, 'Failed to list evaluators');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to list evaluators' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluators/{evaluatorId}',
    summary: 'Get Evaluator by ID',
    operationId: 'get-evaluator',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ evaluatorId: z.string() }),
    },
    responses: {
      200: {
        description: 'Evaluator details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluatorApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, evaluatorId } = c.req.valid('param');

    try {
      const evaluator = await getEvaluatorById(dbClient)({
        scopes: { tenantId, projectId, evaluatorId },
      });

      if (!evaluator) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluator not found' }),
          404
        ) as any;
      }

      return c.json({ data: evaluator as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, evaluatorId }, 'Failed to get evaluator');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to get evaluator' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/evaluators',
    summary: 'Create Evaluator',
    operationId: 'create-evaluator',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: EvaluatorApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Evaluator created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluatorApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const evaluatorData = c.req.valid('json');

    try {
      const id = (evaluatorData as any).id || generateId();
      const created = await createEvaluator(dbClient)({
        ...evaluatorData,
        id,
        tenantId,
        projectId,
      } as any);

      logger.info({ tenantId, projectId, evaluatorId: id }, 'Evaluator created');
      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, evaluatorData }, 'Failed to create evaluator');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to create evaluator' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/evaluators/{evaluatorId}',
    summary: 'Update Evaluator',
    operationId: 'update-evaluator',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ evaluatorId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: EvaluatorApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Evaluator updated',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluatorApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, evaluatorId } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      const updated = await updateEvaluator(dbClient)({
        scopes: { tenantId, projectId, evaluatorId },
        data: updateData as any,
      });

      if (!updated) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluator not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, evaluatorId }, 'Evaluator updated');
      return c.json({ data: updated as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, evaluatorId }, 'Failed to update evaluator');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to update evaluator' }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/evaluators/{evaluatorId}',
    summary: 'Delete Evaluator',
    operationId: 'delete-evaluator',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ evaluatorId: z.string() }),
    },
    responses: {
      204: {
        description: 'Evaluator deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, evaluatorId } = c.req.valid('param');

    try {
      const deleted = await deleteEvaluator(dbClient)({
        scopes: { tenantId, projectId, evaluatorId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluator not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, evaluatorId }, 'Evaluator deleted');
      return c.body(null, 204) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, evaluatorId }, 'Failed to delete evaluator');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to delete evaluator' }),
        500
      );
    }
  }
);

// ============================================================================
// EVALUATION SUITE CONFIGS
// ============================================================================

app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluation-suite-configs',
    summary: 'List Evaluation Suite Configs',
    operationId: 'list-evaluation-suite-configs',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'List of evaluation suite configs',
        content: {
          'application/json': {
            schema: ListResponseSchema(EvaluationSuiteConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');

    try {
      const configs = await listEvaluationSuiteConfigs(dbClient)({
        scopes: { tenantId, projectId },
      });
      return c.json({
        data: configs as any,
        pagination: {
          page: 1,
          limit: configs.length,
          total: configs.length,
          pages: 1,
        },
      }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId }, 'Failed to list evaluation suite configs');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list evaluation suite configs',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluation-suite-configs/{configId}',
    summary: 'Get Evaluation Suite Config by ID',
    operationId: 'get-evaluation-suite-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      200: {
        description: 'Evaluation suite config details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationSuiteConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');

    try {
      const config = await getEvaluationSuiteConfigById(dbClient)({
        scopes: { tenantId, projectId, evaluationSuiteConfigId: configId },
      });

      if (!config) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation suite config not found' }),
          404
        ) as any;
      }

      return c.json({ data: config as any }) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId },
        'Failed to get evaluation suite config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get evaluation suite config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/evaluation-suite-configs',
    summary: 'Create Evaluation Suite Config',
    operationId: 'create-evaluation-suite-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: EvaluationSuiteConfigApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Evaluation suite config created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationSuiteConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const configData = c.req.valid('json') as any;
    const { evaluatorIds, ...suiteConfigData } = configData;

    try {
      const id = suiteConfigData.id || generateId();
      const created = await createEvaluationSuiteConfig(dbClient)({
        ...suiteConfigData,
        id,
        tenantId,
        projectId,
      } as any);

      // Create evaluator relations if provided
      if (evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0) {
        await Promise.all(
          evaluatorIds.map((evaluatorId: string) =>
            createEvaluationSuiteConfigEvaluatorRelation(dbClient)({
              tenantId,
              projectId,
              id: generateId(),
              evaluationSuiteConfigId: id,
              evaluatorId,
            } as any)
          )
        );
      }

      logger.info({ tenantId, projectId, configId: id }, 'Evaluation suite config created');
      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configData },
        'Failed to create evaluation suite config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create evaluation suite config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/evaluation-suite-configs/{configId}',
    summary: 'Update Evaluation Suite Config',
    operationId: 'update-evaluation-suite-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: EvaluationSuiteConfigApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Evaluation suite config updated',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationSuiteConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      const updated = await updateEvaluationSuiteConfig(dbClient)({
        scopes: { tenantId, projectId, evaluationSuiteConfigId: configId },
        data: updateData as any,
      });

      if (!updated) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation suite config not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, configId }, 'Evaluation suite config updated');
      return c.json({ data: updated as any }) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId },
        'Failed to update evaluation suite config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to update evaluation suite config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/evaluation-suite-configs/{configId}',
    summary: 'Delete Evaluation Suite Config',
    operationId: 'delete-evaluation-suite-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      204: {
        description: 'Evaluation suite config deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');

    try {
      const deleted = await deleteEvaluationSuiteConfig(dbClient)({
        scopes: { tenantId, projectId, evaluationSuiteConfigId: configId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation suite config not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, configId }, 'Evaluation suite config deleted');
      return c.body(null, 204) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId },
        'Failed to delete evaluation suite config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to delete evaluation suite config',
        }),
        500
      );
    }
  }
);

// ============================================================================
// EVALUATION SUITE CONFIG EVALUATOR RELATIONS
// ============================================================================

app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluation-suite-configs/{configId}/evaluators',
    summary: 'List Evaluators for Evaluation Suite Config',
    operationId: 'list-evaluation-suite-config-evaluators',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      200: {
        description: 'List of evaluator relations',
        content: {
          'application/json': {
            schema: z.array(z.any()),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');

    try {
      const relations = await getEvaluationSuiteConfigEvaluatorRelations(dbClient)({
        scopes: { tenantId, projectId, evaluationSuiteConfigId: configId },
      });
      return c.json({ data: relations as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, configId }, 'Failed to list evaluator relations');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list evaluator relations',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/evaluation-suite-configs/{configId}/evaluators/{evaluatorId}',
    summary: 'Add Evaluator to Evaluation Suite Config',
    operationId: 'add-evaluator-to-suite-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({
        configId: z.string(),
        evaluatorId: z.string(),
      }),
    },
    responses: {
      201: {
        description: 'Evaluator relation created',
        content: {
          'application/json': {
            schema: z.any(),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId, evaluatorId } = c.req.valid('param');

    try {
      const id = generateId();
      const created = await createEvaluationSuiteConfigEvaluatorRelation(dbClient)({
        id,
        tenantId,
        projectId,
        evaluationSuiteConfigId: configId,
        evaluatorId,
      } as any);

      logger.info({ tenantId, projectId, configId, evaluatorId }, 'Evaluator relation created');
      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId, evaluatorId },
        'Failed to create evaluator relation'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create evaluator relation',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/evaluation-suite-configs/{configId}/evaluators/{evaluatorId}',
    summary: 'Remove Evaluator from Evaluation Suite Config',
    operationId: 'remove-evaluator-from-suite-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({
        configId: z.string(),
        evaluatorId: z.string(),
      }),
    },
    responses: {
      204: {
        description: 'Evaluator relation deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId, evaluatorId } = c.req.valid('param');

    try {
      const deleted = await deleteEvaluationSuiteConfigEvaluatorRelation(dbClient)({
        scopes: { tenantId, projectId, evaluationSuiteConfigId: configId, evaluatorId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluator relation not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, configId, evaluatorId }, 'Evaluator relation deleted');
      return c.body(null, 204) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId, evaluatorId },
        'Failed to delete evaluator relation'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to delete evaluator relation',
        }),
        500
      );
    }
  }
);

// ============================================================================
// EVALUATION JOB CONFIGS
// ============================================================================

app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluation-job-configs',
    summary: 'List Evaluation Job Configs',
    operationId: 'list-evaluation-job-configs',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'List of evaluation job configs',
        content: {
          'application/json': {
            schema: ListResponseSchema(EvaluationJobConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');

    try {
      const configs = await listEvaluationJobConfigs(dbClient)({
        scopes: { tenantId, projectId },
      });
      return c.json({
        data: configs as any,
        pagination: {
          page: 1,
          limit: configs.length,
          total: configs.length,
          pages: 1,
        },
      }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId }, 'Failed to list evaluation job configs');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list evaluation job configs',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluation-job-configs/{configId}',
    summary: 'Get Evaluation Job Config by ID',
    operationId: 'get-evaluation-job-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      200: {
        description: 'Evaluation job config details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationJobConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');

    try {
      const config = await getEvaluationJobConfigById(dbClient)({
        scopes: { tenantId, projectId, evaluationJobConfigId: configId },
      });

      if (!config) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation job config not found' }),
          404
        ) as any;
      }

      return c.json({ data: config as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, configId }, 'Failed to get evaluation job config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get evaluation job config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/evaluation-job-configs',
    summary: 'Create Evaluation Job Config',
    operationId: 'create-evaluation-job-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: EvaluationJobConfigApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Evaluation job config created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationJobConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const configData = c.req.valid('json') as any;
    const { evaluatorIds, ...jobConfigData } = configData;

    try {
      const id = jobConfigData.id || generateId();
      const created = await createEvaluationJobConfig(dbClient)({
        ...jobConfigData,
        id,
        tenantId,
        projectId,
      } as any);

      // Create evaluator relations if provided
      if (evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0) {
        await Promise.all(
          evaluatorIds.map((evaluatorId: string) =>
            createEvaluationJobConfigEvaluatorRelation(dbClient)({
              tenantId,
              projectId,
              id: generateId(),
              evaluationJobConfigId: id,
              evaluatorId,
            } as any)
          )
        );
      }

      logger.info({ tenantId, projectId, configId: id }, 'Evaluation job config created');

      // Fan out manual bulk evaluation job to Inngest if evaluators are configured
      if (evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0) {
        (async () => {
          try {
            // Filter conversations based on job filters
            const conversations = await evaluationService.filterConversationsForJob({
              tenantId,
              projectId,
              jobFilters: created.jobFilters,
            });

            if (conversations.length === 0) {
              logger.warn(
                { tenantId, projectId, configId: id },
                'No conversations found matching job filters'
              );
              return;
            }

            // Create evaluation run
            const evaluationRun = await createEvaluationRun(dbClient)({
              id: generateId(),
              tenantId,
              projectId,
              evaluationJobConfigId: id,
            });

            // Fan out: send worker event for each conversation
            await inngest.send(
              conversations.map((conv) => ({
                name: 'evaluation/conversation.execute',
                data: {
                  tenantId,
                  projectId,
                  conversationId: conv.id,
                  evaluatorIds,
                  evaluationRunId: evaluationRun.id,
                },
              }))
            );

            logger.info(
              {
                tenantId,
                projectId,
                configId: id,
                conversationCount: conversations.length,
                evaluationRunId: evaluationRun.id,
              },
              'Manual bulk evaluation job queued via Inngest'
            );
          } catch (error) {
            logger.error(
              { error, tenantId, projectId, configId: id },
              'Failed to queue manual bulk evaluation job'
            );
          }
        })();
      } else {
        logger.warn(
          { tenantId, projectId, configId: id },
          'Evaluation job config created without evaluators, skipping job execution'
        );
      }

      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configData },
        'Failed to create evaluation job config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create evaluation job config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/evaluation-job-configs/{configId}',
    summary: 'Update Evaluation Job Config',
    operationId: 'update-evaluation-job-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: EvaluationJobConfigApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Evaluation job config updated',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationJobConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');
    const configData = c.req.valid('json') as any;
    const { evaluatorIds, ...jobConfigUpdateData } = configData;

    try {
      const updated = await updateEvaluationJobConfig(dbClient)({
        scopes: { tenantId, projectId, evaluationJobConfigId: configId },
        data: jobConfigUpdateData,
      });

      if (!updated) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation job config not found' }),
          404
        ) as any;
      }

      // Update evaluator relations if provided
      if (evaluatorIds !== undefined) {
        // Get existing relations
        const existingRelations = await getEvaluationJobConfigEvaluatorRelations(dbClient)({
          scopes: { tenantId, projectId, evaluationJobConfigId: configId },
        });

        const existingEvaluatorIds = existingRelations.map((rel) => rel.evaluatorId);
        const newEvaluatorIds = Array.isArray(evaluatorIds) ? evaluatorIds : [];

        // Delete relations that are no longer in the list
        const toDelete = existingEvaluatorIds.filter((id) => !newEvaluatorIds.includes(id));
        await Promise.all(
          toDelete.map((evaluatorId) =>
            deleteEvaluationJobConfigEvaluatorRelation(dbClient)({
              scopes: { tenantId, projectId, evaluationJobConfigId: configId, evaluatorId },
            })
          )
        );

        // Create new relations
        const toCreate = newEvaluatorIds.filter((id) => !existingEvaluatorIds.includes(id));
        await Promise.all(
          toCreate.map((evaluatorId) =>
            createEvaluationJobConfigEvaluatorRelation(dbClient)({
              tenantId,
              projectId,
              id: generateId(),
              evaluationJobConfigId: configId,
              evaluatorId,
            } as any)
          )
        );
      }

      logger.info({ tenantId, projectId, configId }, 'Evaluation job config updated');
      return c.json({ data: updated as any }) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId },
        'Failed to update evaluation job config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to update evaluation job config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/evaluation-job-configs/{configId}',
    summary: 'Delete Evaluation Job Config',
    operationId: 'delete-evaluation-job-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      204: {
        description: 'Evaluation job config deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');

    try {
      const deleted = await deleteEvaluationJobConfig(dbClient)({
        scopes: { tenantId, projectId, evaluationJobConfigId: configId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation job config not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, configId }, 'Evaluation job config deleted');
      return c.body(null, 204) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId },
        'Failed to delete evaluation job config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to delete evaluation job config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluation-job-configs/{configId}/results',
    summary: 'Get Evaluation Results by Job Config ID',
    operationId: 'get-evaluation-job-config-results',
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
      // Find evaluation run(s) for this job config
      const evaluationRuns = await listEvaluationRuns(dbClient)({
        scopes: { tenantId, projectId },
      });

      const jobRuns = evaluationRuns.filter((run) => run.evaluationJobConfigId === configId);

      if (jobRuns.length === 0) {
        return c.json({ data: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 } }) as any;
      }

      // Get all results for all runs
      const allResults = await Promise.all(
        jobRuns.map((run) =>
          listEvaluationResultsByRun(dbClient)({
            scopes: { tenantId, projectId, evaluationRunId: run.id },
          })
        )
      );

      const results = allResults.flat();

      const uniqueConversationIds = [...new Set(results.map((r) => r.conversationId))];
      const conversationInputs = new Map<string, string>();

      logger.info({ uniqueConversationIds }, '=== FETCHING INPUTS FOR JOB CONFIG CONVERSATIONS ===');

      await Promise.all(
        uniqueConversationIds.map(async (conversationId) => {
          try {
            logger.info({ conversationId }, 'Fetching messages for conversation');
            const messages = await getMessagesByConversation(dbClient)({
              scopes: { tenantId, projectId },
              conversationId,
              pagination: { page: 1, limit: 10 },
            });

            logger.info(
              { conversationId, messageCount: messages.length, messages: messages.map(m => ({ role: m.role, content: m.content })) },
              'Found messages for conversation'
            );

            const messagesChronological = [...messages].reverse();
            const firstUserMessage = messagesChronological.find((msg) => msg.role === 'user');
            logger.info({ conversationId, firstUserMessage }, 'First user message found');
            
            if (firstUserMessage?.content) {
              const text =
                typeof firstUserMessage.content === 'string'
                  ? firstUserMessage.content
                  : firstUserMessage.content.text || '';
              logger.info({ conversationId, text }, 'Extracted text from message');
              conversationInputs.set(conversationId, text);
            } else {
              logger.info({ conversationId }, 'No user message found for conversation');
            }
          } catch (error) {
            logger.error({ error, conversationId }, 'Error fetching conversation');
          }
        })
      );

      logger.info({ conversationInputs: Array.from(conversationInputs.entries()) }, '=== CONVERSATION INPUTS MAP ===');

      const enrichedResults = results.map((result) => ({
        ...result,
        input: conversationInputs.get(result.conversationId) || null,
      }));

      logger.info(
        { enrichedResults: enrichedResults.map(r => ({ id: r.id, conversationId: r.conversationId, input: r.input })) },
        '=== ENRICHED RESULTS ==='
      );

      logger.info(
        { tenantId, projectId, configId, resultCount: enrichedResults.length },
        'Retrieved evaluation results for job config'
      );

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
        'Failed to get evaluation results for job config'
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
    method: 'get',
    path: '/evaluation-run-configs/{configId}/results',
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

    console.log('=== GET EVALUATION RESULTS FOR RUN CONFIG ===');
    console.log('Request params:', { tenantId, projectId, configId });

    try {
      // Find evaluation run(s) for this run config
      const evaluationRuns = await listEvaluationRuns(dbClient)({
        scopes: { tenantId, projectId },
      });

      const runConfigRuns = evaluationRuns.filter((run) => run.evaluationRunConfigId === configId);

      console.log('Found evaluation runs for run config:', {
        tenantId,
        projectId,
        configId,
        totalEvaluationRuns: evaluationRuns.length,
        matchingRunConfigRuns: runConfigRuns.length,
        runConfigRunIds: runConfigRuns.map((r) => r.id),
        allEvaluationRunConfigIds: evaluationRuns.map((r) => ({
          id: r.id,
          evaluationRunConfigId: r.evaluationRunConfigId,
        })),
      });

      if (runConfigRuns.length === 0) {
        console.warn('No evaluation runs found for run config:', {
          tenantId,
          projectId,
          configId,
          totalEvaluationRuns: evaluationRuns.length,
        });
        return c.json({ data: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 } }) as any;
      }

      // Get all results for all runs
      const allResults = await Promise.all(
        runConfigRuns.map(async (run) => {
          const runResults = await listEvaluationResultsByRun(dbClient)({
            scopes: { tenantId, projectId, evaluationRunId: run.id },
          });
          console.log('Results for evaluation run:', {
            evaluationRunId: run.id,
            resultCount: runResults.length,
            conversationIds: runResults.map((r) => r.conversationId),
            evaluatorIds: runResults.map((r) => r.evaluatorId),
          });
          return runResults;
        })
      );

      const results = allResults.flat();

      console.log('Retrieved evaluation results for run config:', {
        tenantId,
        projectId,
        configId,
        resultCount: results.length,
        evaluationRunCount: runConfigRuns.length,
        uniqueConversationIds: [...new Set(results.map((r) => r.conversationId))],
        allResults: results.map((r) => ({
          id: r.id,
          conversationId: r.conversationId,
          evaluatorId: r.evaluatorId,
          evaluationRunId: r.evaluationRunId,
        })),
      });

      const uniqueConversationIds = [...new Set(results.map((r) => r.conversationId))];
      const conversationInputs = new Map<string, string>();

      await Promise.all(
        uniqueConversationIds.map(async (conversationId) => {
          try {
            const messages = await getMessagesByConversation(dbClient)({
              scopes: { tenantId, projectId },
              conversationId,
              pagination: { page: 1, limit: 10 },
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

// ============================================================================
// EVALUATION RESULTS
// ============================================================================

app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluation-results/{resultId}',
    summary: 'Get Evaluation Result by ID',
    operationId: 'get-evaluation-result',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ resultId: z.string() }),
    },
    responses: {
      200: {
        description: 'Evaluation result details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationResultApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, resultId } = c.req.valid('param');

    try {
      const result = await getEvaluationResultById(dbClient)({
        scopes: { tenantId, projectId, evaluationResultId: resultId },
      });

      if (!result) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation result not found' }),
          404
        ) as any;
      }

      return c.json({ data: result as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, resultId }, 'Failed to get evaluation result');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get evaluation result',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/evaluation-results',
    summary: 'Create Evaluation Result',
    operationId: 'create-evaluation-result',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: EvaluationResultApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Evaluation result created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationResultApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const resultData = c.req.valid('json');

    try {
      const id = (resultData as any).id || generateId();
      const created = await createEvaluationResult(dbClient)({
        ...resultData,
        id,
        tenantId,
        projectId,
      } as any);

      logger.info({ tenantId, projectId, resultId: id }, 'Evaluation result created');
      return c.json({ data: created as any }, 201) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, resultData },
        'Failed to create evaluation result'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create evaluation result',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/evaluation-results/{resultId}',
    summary: 'Update Evaluation Result',
    operationId: 'update-evaluation-result',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ resultId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: EvaluationResultApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Evaluation result updated',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationResultApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, resultId } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      const updated = await updateEvaluationResult(dbClient)({
        scopes: { tenantId, projectId, evaluationResultId: resultId },
        data: updateData as any,
      });

      if (!updated) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation result not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, resultId }, 'Evaluation result updated');
      return c.json({ data: updated as any }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, resultId }, 'Failed to update evaluation result');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to update evaluation result',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/evaluation-results/{resultId}',
    summary: 'Delete Evaluation Result',
    operationId: 'delete-evaluation-result',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ resultId: z.string() }),
    },
    responses: {
      204: {
        description: 'Evaluation result deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, resultId } = c.req.valid('param');

    try {
      const deleted = await deleteEvaluationResult(dbClient)({
        scopes: { tenantId, projectId, evaluationResultId: resultId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation result not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, resultId }, 'Evaluation result deleted');
      return c.body(null, 204) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, resultId }, 'Failed to delete evaluation result');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to delete evaluation result',
        }),
        500
      );
    }
  }
);

// ============================================================================
// DATASET RUN CONFIGS
// ============================================================================

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
      const configs = await listDatasetRunConfigs(dbClient)({ scopes: { tenantId, projectId } });
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
      const config = await getDatasetRunConfigById(dbClient)({
        scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
      });

      if (!config) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset run config not found' }),
          404
        ) as any;
      }

      // Fetch evaluation run config relations to include enabled status
      const evalRunConfigRelations = await getDatasetRunConfigEvaluationRunConfigRelations(
        dbClient
      )({
        scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
      });

      return c.json({
        data: {
          ...config,
          evaluationRunConfigs: evalRunConfigRelations.map((rel) => ({
            id: rel.evaluationRunConfigId,
            enabled: rel.enabled,
          })),
        } as any,
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

    logger.info(
      {
        tenantId,
        projectId,
        configDataKeys: Object.keys(configData),
        configDataEvaluatorIds: configData.evaluatorIds,
        configDataEvaluatorIdsType: typeof configData.evaluatorIds,
        fullConfigData: JSON.stringify(configData),
      },
      'Received dataset run config request - BEFORE destructuring'
    );

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
      'Creating dataset run config with evaluators - AFTER destructuring'
    );

    try {
      const id = runConfigData.id || generateId();
      const created = await createDatasetRunConfig(dbClient)({
        ...runConfigData,
        id,
        tenantId,
        projectId,
      } as any);

      // Create agent relations if provided
      if (agentIds && Array.isArray(agentIds) && agentIds.length > 0) {
        await Promise.all(
          agentIds.map((agentId: string) =>
            createDatasetRunConfigAgentRelation(dbClient)({
              tenantId,
              projectId,
              id: generateId(),
              datasetRunConfigId: id,
              agentId,
            } as any)
          )
        );
      }

      logger.info({ tenantId, projectId, runConfigId: id }, 'Dataset run config created');

      // Create dataset run immediately and process items asynchronously
      try {
        const datasetRunId = generateId();
        
        // Create evaluation job config first if evaluators are provided
        let evalJobConfigId: string | undefined;
        if (evaluatorIds && Array.isArray(evaluatorIds) && evaluatorIds.length > 0) {
          evalJobConfigId = generateId();
          await createEvaluationJobConfig(dbClient)({
            id: evalJobConfigId,
            tenantId,
            projectId,
            jobFilters: {
              datasetRunIds: [datasetRunId],
            },
          } as any);

          // Create evaluator relations
          await Promise.all(
            evaluatorIds.map((evaluatorId: string) =>
              createEvaluationJobConfigEvaluatorRelation(dbClient)({
                tenantId,
                projectId,
                id: generateId(),
                evaluationJobConfigId: evalJobConfigId!,
                evaluatorId,
              } as any)
            )
          );

          // Create evaluation run for this job
          const evaluationRunId = generateId();
          await createEvaluationRun(dbClient)({
            id: evaluationRunId,
            tenantId,
            projectId,
            evaluationJobConfigId: evalJobConfigId,
          });

          logger.info(
            {
              tenantId,
              projectId,
              datasetRunId,
              evalJobConfigId,
              evaluationRunId,
              evaluatorCount: evaluatorIds.length,
            },
            'Evaluation job config and run created before dataset run'
          );
        }

        // Create dataset run with evaluation job config if available
        await createDatasetRun(dbClient)({
          id: datasetRunId,
          tenantId,
          projectId,
          datasetId: runConfigData.datasetId,
          datasetRunConfigId: id,
          evaluationJobConfigId: evalJobConfigId,
        });

        logger.info(
          {
            tenantId,
            projectId,
            runConfigId: id,
            datasetRunId,
            hasEvalJobConfig: !!evalJobConfigId,
          },
          'Dataset run created, processing items asynchronously'
        );

        // Process dataset items asynchronously (fire-and-forget)
        const evaluationService = new EvaluationService();
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
          'Starting async dataset run processing with evaluators in closure'
        );

        (async () => {
          try {
            logger.info(
              {
                tenantId,
                projectId,
                datasetRunId,
                evaluatorIds,
                evaluatorIdsType: typeof evaluatorIds,
                isArray: Array.isArray(evaluatorIds),
              },
              'Inside async closure - checking evaluatorIds'
            );

            // Get all dataset items
            const datasetItems = await listDatasetItems(dbClient)({
              scopes: { tenantId, projectId, datasetId: runConfigData.datasetId },
            });

            // Get all agents for this run config
            const agentRelations = await getDatasetRunConfigAgentRelations(dbClient)({
              scopes: { tenantId, projectId, datasetRunConfigId: id },
            });

            const conversationRelations: Array<{
              tenantId: string;
              projectId: string;
              id: string;
              datasetRunId: string;
              conversationId: string;
              datasetItemId: string;
            }> = [];

            for (const agentRelation of agentRelations) {
              for (const datasetItem of datasetItems) {
                try {
                  // Pass datasetRunId to the chat API via header so it can link to the evaluation job
                  // The relation will be created after the conversation completes
                  const result = await evaluationService.runDatasetItem({
                    tenantId,
                    projectId,
                    agentId: agentRelation.agentId,
                    datasetItem,
                    datasetRunId,
                  });

                  // Only create conversation relation if the API call succeeded
                  // If there's an error (especially 400 Bad Request), the conversation may not exist
                  // Check if we have both a conversationId AND no error (or only a non-blocking error)
                  const shouldCreateRelation =
                    result.conversationId &&
                    (!result.error || !result.error.includes('Chat API error: 400'));

                  if (shouldCreateRelation && result.conversationId) {
                    const relationId = generateId();
                    conversationRelations.push({
                      tenantId,
                      projectId,
                      id: relationId,
                      datasetRunId: datasetRunId,
                      conversationId: result.conversationId,
                      datasetItemId: datasetItem.id,
                    });

                    // Create conversation relation immediately as each item completes
                    try {
                      await createDatasetRunConversationRelation(dbClient)({
                        tenantId,
                        projectId,
                        id: relationId,
                        datasetRunId: datasetRunId,
                        conversationId: result.conversationId,
                        datasetItemId: datasetItem.id,
                      } as any);
                    } catch (relationError: any) {
                      // If foreign key constraint fails, the conversation doesn't exist
                      // Log and continue - this is expected for failed API calls
                      if (
                        relationError?.cause?.code === '23503' ||
                        relationError?.code === '23503'
                      ) {
                        logger.warn(
                          {
                            tenantId,
                            projectId,
                            datasetRunId,
                            datasetItemId: datasetItem.id,
                            conversationId: result.conversationId,
                            error: result.error,
                          },
                          'Conversation does not exist, skipping relation creation (API call likely failed)'
                        );
                      } else {
                        throw relationError;
                      }
                    }
                  } else {
                    logger.warn(
                      {
                        tenantId,
                        projectId,
                        datasetRunId,
                        datasetItemId: datasetItem.id,
                        conversationId: result.conversationId,
                        error: result.error,
                      },
                      'Skipping conversation relation creation due to API error'
                    );
                  }
                } catch (itemError) {
                  logger.error(
                    {
                      error: itemError,
                      tenantId,
                      projectId,
                      datasetRunId,
                      datasetItemId: datasetItem.id,
                      agentId: agentRelation.agentId,
                    },
                    'Failed to process dataset item (non-blocking)'
                  );
                  // Continue processing other items
                }
              }
            }

            logger.info(
              {
                tenantId,
                projectId,
                runConfigId: id,
                datasetRunId,
                itemsProcessed: datasetItems.length,
                agentsUsed: agentRelations.length,
                conversationsCreated: conversationRelations.length,
              },
              'Dataset run processing completed'
            );

            // Evaluation job already created before dataset run processing
            // (created before processing items to avoid race conditions)
            logger.info(
              {
                tenantId,
                projectId,
                datasetRunId,
                conversationCount: conversationRelations.length,
              },
              'Dataset run processing complete - evaluations will trigger as conversations complete'
            );
          } catch (processError) {
            logger.error(
              {
                error: processError,
                tenantId,
                projectId,
                datasetRunId,
                runConfigId: id,
              },
              'Failed to process dataset run items (non-blocking)'
            );
          }
        })();
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
      const updated = await updateDatasetRunConfig(dbClient)({
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
        const existingRelations = await getDatasetRunConfigAgentRelations(dbClient)({
          scopes: { tenantId, projectId, datasetRunConfigId: runConfigId },
        });

        const existingAgentIds = existingRelations.map((rel) => rel.agentId);
        const newAgentIds = Array.isArray(agentIds) ? agentIds : [];

        // Delete relations that are no longer in the list
        const toDelete = existingAgentIds.filter((id) => !newAgentIds.includes(id));
        await Promise.all(
          toDelete.map((agentId) =>
            deleteDatasetRunConfigAgentRelation(dbClient)({
              scopes: { tenantId, projectId, datasetRunConfigId: runConfigId, agentId },
            })
          )
        );

        // Create new relations
        const toCreate = newAgentIds.filter((id) => !existingAgentIds.includes(id));
        await Promise.all(
          toCreate.map((agentId) =>
            createDatasetRunConfigAgentRelation(dbClient)({
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
      const deleted = await deleteDatasetRunConfig(dbClient)({
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

// ============================================================================
// DATASET RUNS
// ============================================================================

const DatasetRunApiSelectSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  projectId: z.string(),
  datasetId: z.string(),
  datasetRunConfigId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/datasets/{datasetId}/runs',
    summary: 'List Dataset Runs',
    operationId: 'list-dataset-runs',
    tags: ['Evaluations'],
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
    const { tenantId, projectId, datasetId } = c.req.valid('param');

    try {
      const runs = await listDatasetRuns(dbClient)({ scopes: { tenantId, projectId } });
      const filteredRuns = runs.filter((run) => (run as any).datasetId === datasetId);

      // Fetch run config names for all runs
      const runsWithNames = await Promise.all(
        filteredRuns.map(async (run) => {
          try {
            const runConfig = await getDatasetRunConfigById(dbClient)({
              scopes: { tenantId, projectId, datasetRunConfigId: run.datasetRunConfigId },
            });
            return {
              ...run,
              runConfigName: runConfig?.name || null,
            };
          } catch {
            return {
              ...run,
              runConfigName: null,
            };
          }
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
  createRoute({
    method: 'get',
    path: '/dataset-runs/{runId}',
    summary: 'Get Dataset Run',
    operationId: 'get-dataset-run',
    tags: ['Evaluations'],
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
    const { tenantId, projectId, runId } = c.req.valid('param');

    try {
      const run = await getDatasetRunById(dbClient)({
        scopes: { tenantId, projectId, datasetRunId: runId },
      });

      if (!run) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset run not found' }),
          404
        ) as any;
      }

      // Get the run config to get the name
      const runConfig = await getDatasetRunConfigById(dbClient)({
        scopes: { tenantId, projectId, datasetRunConfigId: run.datasetRunConfigId },
      });

      // Get conversation relations for this run
      const conversationRelations = await getDatasetRunConversationRelations(dbClient)({
        scopes: { tenantId, projectId, datasetRunId: runId },
      });

      // Get all dataset items for this dataset
      const datasetItems = await listDatasetItems(dbClient)({
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

          // Fetch output (assistant response) for each conversation
          const conversationsWithOutput = await Promise.all(
            itemConversations.map(async (conv) => {
              try {
                const messages = await getMessagesByConversation(dbClient)({
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
                };
              } catch (error) {
                logger.warn(
                  { error, conversationId: conv.conversationId },
                  'Failed to fetch conversation output'
                );
                return {
                  ...conv,
                  output: null,
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

      // Also fetch output for all conversations in the main conversations array
      const conversationsWithOutput = await Promise.all(
        conversationRelations.map(async (conv) => {
          try {
            const messages = await getMessagesByConversation(dbClient)({
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
            };
          } catch (error) {
            logger.warn(
              { error, conversationId: conv.conversationId },
              'Failed to fetch conversation output'
            );
            return {
              ...conv,
              output: null,
            };
          }
        })
      );

      return c.json({
        data: {
          ...run,
          runConfigName: runConfig?.name || null,
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

// ============================================================================
// EVALUATION RUN CONFIGS
// ============================================================================

app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluation-run-configs',
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
            schema: ListResponseSchema(EvaluationRunConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');

    try {
      const configs = await listEvaluationRunConfigs(dbClient)({
        scopes: { tenantId, projectId },
      });

      // Fetch suite config relations for all configs
      const configsWithSuiteConfigs = await Promise.all(
        configs.map(async (config) => {
          const suiteConfigRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(
            dbClient
          )({
            scopes: { tenantId, projectId, evaluationRunConfigId: config.id },
          });
          return {
            ...config,
            suiteConfigIds: suiteConfigRelations.map((rel) => rel.evaluationSuiteConfigId),
          };
        })
      );

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
    path: '/evaluation-run-configs/{configId}',
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
            schema: SingleResponseSchema(EvaluationRunConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');

    try {
      const config = await getEvaluationRunConfigById(dbClient)({
        scopes: { tenantId, projectId, evaluationRunConfigId: configId },
      });

      if (!config) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation run config not found' }),
          404
        ) as any;
      }

      // Get linked suite configs
      const suiteConfigRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(
        dbClient
      )({
        scopes: { tenantId, projectId, evaluationRunConfigId: configId },
      });

      return c.json({
        data: {
          ...config,
          suiteConfigIds: suiteConfigRelations.map((rel) => rel.evaluationSuiteConfigId),
        } as any,
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
    method: 'post',
    path: '/evaluation-run-configs',
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
            schema: SingleResponseSchema(EvaluationRunConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const configData = c.req.valid('json') as any;
    const { suiteConfigIds, ...runConfigData } = configData;

    try {
      const id = runConfigData.id || generateId();
      const created = await createEvaluationRunConfig(dbClient)({
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
            createEvaluationRunConfigEvaluationSuiteConfigRelation(dbClient)({
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
      const suiteConfigRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(
        dbClient
      )({
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
    path: '/evaluation-run-configs/{configId}',
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
            schema: SingleResponseSchema(EvaluationRunConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');
    const configData = c.req.valid('json') as any;
    const { suiteConfigIds, ...runConfigUpdateData } = configData;

    try {
      const updated = await updateEvaluationRunConfig(dbClient)({
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
        const existingRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(
          dbClient
        )({
          scopes: { tenantId, projectId, evaluationRunConfigId: configId },
        });

        const existingSuiteConfigIds = existingRelations.map((rel) => rel.evaluationSuiteConfigId);
        const newSuiteConfigIds = Array.isArray(suiteConfigIds) ? suiteConfigIds : [];

        // Delete relations that are no longer in the list
        const toDelete = existingSuiteConfigIds.filter((id) => !newSuiteConfigIds.includes(id));
        await Promise.all(
          toDelete.map((suiteConfigId) =>
            deleteEvaluationRunConfigEvaluationSuiteConfigRelation(dbClient)({
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
            createEvaluationRunConfigEvaluationSuiteConfigRelation(dbClient)({
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
      const suiteConfigRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(
        dbClient
      )({
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
    path: '/evaluation-run-configs/{configId}',
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
    const { tenantId, projectId, configId } = c.req.valid('param');

    try {
      const deleted = await deleteEvaluationRunConfig(dbClient)({
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
