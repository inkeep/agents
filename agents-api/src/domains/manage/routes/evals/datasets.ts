import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createDataset,
  DatasetApiInsertSchema,
  DatasetApiSelectSchema,
  DatasetApiUpdateSchema,
  deleteDataset,
  generateId,
  getDatasetById,
  ListResponseSchema,
  listDatasets,
  listDatasetsForAgent,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateDataset,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('datasets');

// Require edit permission for write operations
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List all Datasets',
    operationId: 'list-datasets',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
      query: z.object({
        agentId: z.string().optional(),
      }),
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
    const { agentId } = c.req.valid('query');

    try {
      const datasets = agentId
        ? await listDatasetsForAgent(db)({ scopes: { tenantId, projectId }, agentId })
        : await listDatasets(db)({ scopes: { tenantId, projectId } });
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
  createProtectedRoute({
    method: 'get',
    path: '/{datasetId}',
    summary: 'Get Dataset by ID',
    operationId: 'get-dataset',
    tags: ['Evaluations'],
    permission: requireProjectPermission('view'),
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
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Dataset',
    operationId: 'create-dataset',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
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
      const id = generateId();
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
  createProtectedRoute({
    method: 'patch',
    path: '/{datasetId}',
    summary: 'Update Dataset by ID',
    operationId: 'update-dataset',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
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
  createProtectedRoute({
    method: 'delete',
    path: '/{datasetId}',
    summary: 'Delete Dataset by ID',
    operationId: 'delete-dataset',
    tags: ['Evaluations'],
    permission: requireProjectPermission('edit'),
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

export default app;
