import {
  commonGetErrorResponses,
  createApiError,
  createDataset,
  deleteDataset,
  generateId,
  getDatasetById,
  ListResponseSchema,
  listDatasets,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateDataset,
  DatasetApiSelectSchema,
  DatasetApiInsertSchema,
  DatasetApiUpdateSchema,
} from '@inkeep/agents-core';
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi';
import manageDbClient from '../../data/db/manageDbClient';
import { getLogger } from '../../logger';

const app = new OpenAPIHono();
const logger = getLogger('datasets');

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
      const datasets = await listDatasets(manageDbClient)({ scopes: { tenantId, projectId } });
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
      const dataset = await getDatasetById(manageDbClient)({
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
      const created = await createDataset(manageDbClient)({
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
      const updated = await updateDataset(manageDbClient)({
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
      const deleted = await deleteDataset(manageDbClient)({
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

export default app;

