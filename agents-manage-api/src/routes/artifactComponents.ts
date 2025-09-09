import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  ArtifactComponentApiInsertSchema,
  ArtifactComponentApiSelectSchema,
  ArtifactComponentApiUpdateSchema,
  commonGetErrorResponses,
  createApiError,
  createArtifactComponent,
  deleteArtifactComponent,
  ErrorResponseSchema,
  getArtifactComponentById,
  IdParamsSchema,
  ListResponseSchema,
  listArtifactComponentsPaginated,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateArtifactComponent,
} from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Artifact Components',
    operationId: 'list-artifact-components',
    tags: ['CRUD Artifact Component'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of artifact components retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(ArtifactComponentApiSelectSchema),
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

    const result = await listArtifactComponentsPaginated(dbClient)({
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
    summary: 'Get Artifact Component',
    operationId: 'get-artifact-component-by-id',
    tags: ['CRUD Artifact Component'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
    },
    responses: {
      200: {
        description: 'Artifact component found',
        content: {
          'application/json': {
            schema: SingleResponseSchema(ArtifactComponentApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const artifactComponent = await getArtifactComponentById(dbClient)({
      scopes: { tenantId, projectId },
      id,
    });

    if (!artifactComponent) {
      throw createApiError({
        code: 'not_found',
        message: 'Artifact component not found',
      });
    }

    return c.json({ data: artifactComponent });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Artifact Component',
    operationId: 'create-artifact-component',
    tags: ['CRUD Artifact Component'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ArtifactComponentApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Artifact component created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(ArtifactComponentApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    const finalId = body.id ? String(body.id) : nanoid();
    const componentData = {
      tenantId,
      projectId,
      id: finalId,
      name: String(body.name),
      description: String(body.description),
      summaryProps: body.summaryProps || undefined,
      fullProps: body.fullProps || undefined,
    };
    const artifactComponent = await createArtifactComponent(dbClient)({
      ...componentData,
    });

    return c.json({ data: artifactComponent }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Artifact Component',
    operationId: 'update-artifact-component',
    tags: ['CRUD Artifact Component'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
      body: {
        content: {
          'application/json': {
            schema: ArtifactComponentApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Artifact component updated successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(ArtifactComponentApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const updatedArtifactComponent = await updateArtifactComponent(dbClient)({
      scopes: { tenantId, projectId },
      id,
      data: {
        name: body.name ? String(body.name) : undefined,
        description: body.description ? String(body.description) : undefined,
        summaryProps: body.summaryProps || undefined,
        fullProps: body.fullProps || undefined,
      },
    });

    if (!updatedArtifactComponent) {
      throw createApiError({
        code: 'not_found',
        message: 'Artifact component not found',
      });
    }

    return c.json({ data: updatedArtifactComponent });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Artifact Component',
    operationId: 'delete-artifact-component',
    tags: ['CRUD Artifact Component'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
    },
    responses: {
      204: {
        description: 'Artifact component deleted successfully',
      },
      404: {
        description: 'Artifact component not found',
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

    const deleted = await deleteArtifactComponent(dbClient)({
      scopes: { tenantId, projectId },
      id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Artifact component not found',
      });
    }

    // Always return 204 for DELETE operations (idempotent)
    return c.body(null, 204);
  }
);

export default app;
