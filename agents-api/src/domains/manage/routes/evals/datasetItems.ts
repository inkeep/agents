import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createDatasetItem,
  createDatasetItems,
  DatasetItemApiInsertSchema,
  DatasetItemApiSelectSchema,
  DatasetItemApiUpdateSchema,
  deleteDatasetItem,
  generateId,
  getDatasetItemById,
  ListResponseSchema,
  listDatasetItems,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateDatasetItem,
} from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import { requireProjectPermission } from '../../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('datasetItems');

app.use('/:datasetId/items', async (c, next) => {
  if (c.req.method === 'POST') {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.use('/:datasetId/items/bulk', async (c, next) => {
  if (c.req.method === 'POST') {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.use('/:datasetId/items/:itemId', async (c, next) => {
  if (['PATCH', 'DELETE'].includes(c.req.method)) {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/{datasetId}',
    summary: 'List Dataset Items by Dataset ID',
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
    const db = c.get('db');
    const { tenantId, projectId, datasetId } = c.req.valid('param');

    try {
      const items = await listDatasetItems(db)({
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
    path: '/{datasetId}/items/{itemId}',
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
    const db = c.get('db');
    const { tenantId, projectId, itemId } = c.req.valid('param');

    try {
      const item = await getDatasetItemById(db)({
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
    path: '/{datasetId}/items',
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
    const db = c.get('db');
    const { tenantId, projectId, datasetId } = c.req.valid('param');
    const itemData = c.req.valid('json');

    try {
      const id = (itemData as any).id || generateId();
      const created = await createDatasetItem(db)({
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
    path: '/{datasetId}/items/bulk',
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
    const db = c.get('db');
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

      const created = await createDatasetItems(db)(items as any);

      logger.info(
        { tenantId, projectId, datasetId, count: created.length },
        'Dataset items created'
      );
      return c.json(
        {
          data: created as any,
          pagination: {
            page: 1,
            limit: created.length,
            total: created.length,
            pages: 1,
          },
        },
        201
      ) as any;
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
    path: '/{datasetId}/items/{itemId}',
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
    const db = c.get('db');
    const { tenantId, projectId, itemId } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      const updated = await updateDatasetItem(db)({
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
    path: '/{datasetId}/items/{itemId}',
    summary: 'Delete Dataset Item by ID',
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
    const db = c.get('db');
    const { tenantId, projectId, itemId } = c.req.valid('param');

    try {
      const deleted = await deleteDatasetItem(db)({
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

export default app;
