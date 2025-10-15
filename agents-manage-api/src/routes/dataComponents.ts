import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
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
import { stream } from 'hono/streaming';
import dbClient from '../data/db/dbClient';
import { env } from '../env';

const app = new OpenAPIHono();

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
    const { tenantId, projectId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    const result = await listDataComponentsPaginated(dbClient)({
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
    const { tenantId, projectId, id } = c.req.valid('param');
    const dataComponent = await getDataComponent(dbClient)({
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

    const dataComponent = await createDataComponent(dbClient)(dataComponentData);

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

    const updatedDataComponent = await updateDataComponent(dbClient)({
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
    const { tenantId, projectId, id } = c.req.valid('param');

    const deleted = await deleteDataComponent(dbClient)({
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

app.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/generate-preview',
    summary: 'Generate Component Preview',
    operationId: 'generate-component-preview',
    tags: ['Data Component'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Streaming component code generation',
        content: {
          'text/plain': {
            schema: { type: 'string' },
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');

    const runApiUrl = env.AGENTS_RUN_API_URL;
    const url = `${runApiUrl}/v1/${tenantId}/projects/${projectId}/data-components/${id}/generate-preview`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw createApiError({
          code: 'internal_server_error',
          message: `Failed to generate preview: ${response.statusText}`,
        });
      }

      if (!response.body) {
        throw createApiError({
          code: 'internal_server_error',
          message: 'No response body from preview generation',
        });
      }

      c.header('Content-Type', 'text/plain; charset=utf-8');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');

      return stream(c, async (stream) => {
        const responseBody = response.body;
        if (!responseBody) {
          throw createApiError({
            code: 'internal_server_error',
            message: 'Response body is null',
          });
        }

        const reader = responseBody.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            await stream.write(text);
          }
        } catch {
          throw createApiError({
            code: 'internal_server_error',
            message: 'Error streaming preview generation',
          });
        }
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to generate component preview',
      });
    }
  }
);

export default app;
