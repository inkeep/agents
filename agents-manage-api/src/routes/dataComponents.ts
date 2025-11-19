import { createRoute } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createDataComponent,
  DataComponentApiInsertSchema,
  DataComponentApiUpdateSchema,
  DataComponentListResponse,
  DataComponentResponse,
  deleteDataComponent,
  ErrorResponseSchema,
  getDataComponent,
  listDataComponentsPaginated,
  PaginationQueryParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateDataComponent,
  validatePropsAsJsonSchema,
} from '@inkeep/agents-core';
import { createAppWithDb } from '../utils/apps';

const app = createAppWithDb();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Data Components',
    operationId: 'list-data-components',
    tags: ['Data Component'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of data components retrieved successfully',
        content: {
          'application/json': {
            schema: DataComponentListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    const result = await listDataComponentsPaginated(db)({
      scopes: { tenantId, projectId },
      pagination: { page, limit },
    });
    return c.json(result);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Data Component',
    operationId: 'get-data-component-by-id',
    tags: ['Data Component'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Data component found',
        content: {
          'application/json': {
            schema: DataComponentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const dataComponent = await getDataComponent(db)({
      scopes: { tenantId, projectId },
      dataComponentId: id,
    });

    if (!dataComponent) {
      throw createApiError({
        code: 'not_found',
        message: 'Data component not found',
      });
    }

    return c.json({ data: dataComponent });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Data Component',
    operationId: 'create-data-component',
    tags: ['Data Component'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: DataComponentApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Data component created successfully',
        content: {
          'application/json': {
            schema: DataComponentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    if (body.props) {
      const propsValidation = validatePropsAsJsonSchema(body.props);
      if (!propsValidation.isValid) {
        const errorMessages = propsValidation.errors
          .map((e) => `${e.field}: ${e.message}`)
          .join(', ');
        throw createApiError({
          code: 'bad_request',
          message: `Invalid props schema: ${errorMessages}`,
        });
      }
    }

    const dataComponentData = {
      ...body,
      tenantId,
      projectId,
    };

    const dataComponent = await createDataComponent(db)(dataComponentData);

    return c.json({ data: dataComponent }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Data Component',
    operationId: 'update-data-component',
    tags: ['Data Component'],
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: DataComponentApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Data component updated successfully',
        content: {
          'application/json': {
            schema: DataComponentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    if (body.props !== undefined && body.props !== null) {
      const propsValidation = validatePropsAsJsonSchema(body.props);
      if (!propsValidation.isValid) {
        const errorMessages = propsValidation.errors
          .map((e) => `${e.field}: ${e.message}`)
          .join(', ');
        throw createApiError({
          code: 'bad_request',
          message: `Invalid props schema: ${errorMessages}`,
        });
      }
    }

    const updatedDataComponent = await updateDataComponent(db)({
      scopes: { tenantId, projectId },
      dataComponentId: id,
      data: body,
    });

    if (!updatedDataComponent) {
      throw createApiError({
        code: 'not_found',
        message: 'Data component not found',
      });
    }

    return c.json({ data: updatedDataComponent });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Data Component',
    operationId: 'delete-data-component',
    tags: ['Data Component'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Data component deleted successfully',
      },
      404: {
        description: 'Data component not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');

    const deleted = await deleteDataComponent(db)({
      scopes: { tenantId, projectId },
      dataComponentId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Data component not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
