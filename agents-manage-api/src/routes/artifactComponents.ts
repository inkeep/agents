import { createRoute } from '@hono/zod-openapi';
import {
  ArtifactComponentApiInsertSchema,
  ArtifactComponentApiUpdateSchema,
  ArtifactComponentListResponse,
  ArtifactComponentResponse,
  commonGetErrorResponses,
  createApiError,
  createArtifactComponent,
  deleteArtifactComponent,
  ErrorResponseSchema,
  generateId,
  getArtifactComponentById,
  listArtifactComponentsPaginated,
  PaginationQueryParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateArtifactComponent,
  validatePropsAsJsonSchema,
} from '@inkeep/agents-core';
import { createAppWithDb } from '../utils/apps';

const app = createAppWithDb();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Artifact Components',
    operationId: 'list-artifact-components',
    tags: ['Artifact Component'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of artifact components retrieved successfully',
        content: {
          'application/json': {
            schema: ArtifactComponentListResponse,
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

    const result = await listArtifactComponentsPaginated(db)({
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
    tags: ['Artifact Component'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Artifact component found',
        content: {
          'application/json': {
            schema: ArtifactComponentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const artifactComponent = await getArtifactComponentById(db)({
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
    tags: ['Artifact Component'],
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
            schema: ArtifactComponentResponse,
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

    if (body.props !== null && body.props !== undefined) {
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

    const finalId = body.id ? String(body.id) : generateId();
    const componentData = {
      tenantId,
      projectId,
      id: finalId,
      name: String(body.name),
      description: String(body.description),
      props: body.props ?? null,
    };

    try {
      const artifactComponent = await createArtifactComponent(db)({
        ...componentData,
      });

      return c.json({ data: artifactComponent }, 201);
    } catch (error: any) {
      // Handle duplicate artifact component (PostgreSQL unique constraint violation)
      if (error?.cause?.code === '23505') {
        throw createApiError({
          code: 'conflict',
          message: `Artifact component with ID '${finalId}' already exists`,
        });
      }

      // Re-throw other errors to be handled by the global error handler
      throw error;
    }
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Artifact Component',
    operationId: 'update-artifact-component',
    tags: ['Artifact Component'],
    request: {
      params: TenantProjectIdParamsSchema,
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
            schema: ArtifactComponentResponse,
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

    const updateData: any = {};

    // Only include fields that are actually provided in the request
    if (body.name !== undefined) {
      updateData.name = String(body.name);
    }
    if (body.description !== undefined) {
      updateData.description = String(body.description);
    }
    if (body.props !== undefined) {
      updateData.props = body.props ?? null;
    }

    const updatedArtifactComponent = await updateArtifactComponent(db)({
      scopes: { tenantId, projectId },
      id,
      data: updateData,
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
    tags: ['Artifact Component'],
    request: {
      params: TenantProjectIdParamsSchema,
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
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');

    const deleted = await deleteArtifactComponent(db)({
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
