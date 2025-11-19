import { createRoute } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createProject,
  deleteProject,
  ErrorResponseSchema,
  getProject,
  listProjectsPaginated,
  PaginationQueryParamsSchema,
  ProjectApiInsertSchema,
  ProjectApiUpdateSchema,
  ProjectListResponse,
  ProjectResponse,
  TenantIdParamsSchema,
  TenantParamsSchema,
  updateProject,
} from '@inkeep/agents-core';

import { createAppWithDb } from '../utils/apps';

const app = createAppWithDb();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Projects',
    description: 'List all projects within a tenant with pagination',
    operationId: 'list-projects',
    tags: ['Projects'],
    request: {
      params: TenantParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of projects retrieved successfully',
        content: {
          'application/json': {
            schema: ProjectListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    const result = await listProjectsPaginated(db)({
      tenantId,
      pagination: { page, limit },
    });
    return c.json(result);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Project',
    description: 'Get a single project by ID',
    operationId: 'get-project-by-id',
    tags: ['Projects'],
    request: {
      params: TenantIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Project found',
        content: {
          'application/json': {
            schema: ProjectResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, id } = c.req.valid('param');
    const project = await getProject(db)({ scopes: { tenantId, projectId: id } });

    if (!project) {
      throw createApiError({
        code: 'not_found',
        message: 'Project not found',
      });
    }

    return c.json({ data: project });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Project',
    description: 'Create a new project',
    operationId: 'create-project',
    tags: ['Projects'],
    request: {
      params: TenantParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ProjectApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Project created successfully',
        content: {
          'application/json': {
            schema: ProjectResponse,
          },
        },
      },
      409: {
        description: 'Project already exists',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId } = c.req.valid('param');
    const body = c.req.valid('json');

    try {
      const project = await createProject(db)({
        tenantId,
        ...body,
      });

      return c.json({ data: project }, 201);
    } catch (error: any) {
      // Handle duplicate project (PostgreSQL unique constraint violation)
      if (error?.cause?.code === '23505') {
        throw createApiError({
          code: 'conflict',
          message: 'Project with this ID already exists',
        });
      }
      throw error;
    }
  }
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    summary: 'Update Project',
    description: 'Update an existing project',
    operationId: 'update-project',
    tags: ['Projects'],
    request: {
      params: TenantIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ProjectApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Project updated successfully',
        content: {
          'application/json': {
            schema: ProjectResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const project = await updateProject(db)({
      scopes: { tenantId, projectId: id },
      data: body,
    });

    if (!project) {
      throw createApiError({
        code: 'not_found',
        message: 'Project not found',
      });
    }

    return c.json({ data: project });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Project',
    description: 'Delete a project. Will fail if the project has existing resources.',
    operationId: 'delete-project',
    tags: ['Projects'],
    request: {
      params: TenantIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Project deleted successfully',
      },
      409: {
        description: 'Cannot delete project with existing resources',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, id } = c.req.valid('param');

    try {
      const deleted = await deleteProject(db)({
        scopes: { tenantId, projectId: id },
      });

      if (!deleted) {
        throw createApiError({
          code: 'not_found',
          message: 'Project not found',
        });
      }

      return c.body(null, 204);
    } catch (error: any) {
      if (error.message?.includes('Cannot delete project with existing resources')) {
        throw createApiError({
          code: 'conflict',
          message: 'Cannot delete project with existing resources',
        });
      }
      throw error;
    }
  }
);

export default app;
