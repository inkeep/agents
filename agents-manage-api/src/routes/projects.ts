import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createProject,
  deleteProject,
  ErrorResponseSchema,
  getProject,
  isAuthzEnabled,
  listAccessibleProjectIds,
  listProjectsPaginated,
  PaginationQueryParamsSchema,
  ProjectApiInsertSchema,
  ProjectApiUpdateSchema,
  ProjectListResponse,
  ProjectResponse,
  removeProjectFromSpiceDb,
  syncProjectToSpiceDb,
  TenantIdParamsSchema,
  TenantParamsSchema,
  updateProject,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import { requireProjectPermission } from '../middleware/project-access';
import { requirePermission } from '../middleware/require-permission';
import type { BaseAppVariables } from '../types/app';
import { speakeasyOffsetLimitPagination } from './shared';

const app = new OpenAPIHono<{ Variables: BaseAppVariables }>();

app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return requirePermission({ project: ['create'] })(c, next);
  }
  return next();
});

app.use('/:id', async (c, next) => {
  if (c.req.method === 'GET') {
    // Use project access check for viewing individual projects
    return requireProjectPermission('view')(c, next);
  }
  if (c.req.method === 'PATCH') {
    // Users with 'edit' permission can update project
    return requireProjectPermission('edit')(c, next);
  }
  if (c.req.method === 'DELETE') {
    // Users with 'edit' permission can delete project
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Projects',
    description:
      'List all projects within a tenant with pagination. When authorization is enabled, only returns projects the user has access to.',
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
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const userId = c.get('userId');
    const tenantRole = c.get('tenantRole') || 'member';
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    // Get accessible project IDs for this user
    const orgRole = tenantRole as 'owner' | 'admin' | 'member';
    const accessibleIds = await listAccessibleProjectIds({
      tenantId,
      userId,
      orgRole,
    });

    // If 'all', no filtering needed (authz disabled or user is org admin)
    if (accessibleIds === 'all') {
      const result = await listProjectsPaginated(dbClient)({
        tenantId,
        pagination: { page, limit },
      });
      return c.json(result);
    }

    // If no accessible projects, return empty list
    if (accessibleIds.length === 0) {
      return c.json({
        data: [],
        pagination: { page, limit, total: 0, pages: 0 },
      });
    }

    // Filter by accessible project IDs
    const result = await listProjectsPaginated(dbClient)({
      tenantId,
      pagination: { page, limit },
      projectIds: accessibleIds,
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
    const { tenantId, id } = c.req.valid('param');
    const project = await getProject(dbClient)({ scopes: { tenantId, projectId: id } });

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
    description:
      'Create a new project. When authorization is enabled, the creator is automatically granted admin role.',
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
    const { tenantId } = c.req.valid('param');
    const userId = c.get('userId');
    const body = c.req.valid('json');

    try {
      const project = await createProject(dbClient)({
        tenantId,
        ...body,
      });

      // Sync to SpiceDB: link project to org and grant creator admin role
      if (isAuthzEnabled()) {
        try {
          await syncProjectToSpiceDb({
            tenantId,
            projectId: project.id,
            creatorUserId: userId,
          });
        } catch (syncError) {
          // Log but don't fail the request
          console.warn('Failed to sync project to SpiceDB:', syncError);
        }
      }

      return c.json({ data: project }, 201);
    } catch (error: unknown) {
      // Handle duplicate project (PostgreSQL unique constraint violation)
      if (
        error &&
        typeof error === 'object' &&
        'cause' in error &&
        error.cause &&
        typeof error.cause === 'object' &&
        'code' in error.cause &&
        error.cause.code === '23505'
      ) {
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
    const { tenantId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const project = await updateProject(dbClient)({
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
    const { tenantId, id } = c.req.valid('param');

    try {
      const deleted = await deleteProject(dbClient)({
        scopes: { tenantId, projectId: id },
      });

      if (!deleted) {
        throw createApiError({
          code: 'not_found',
          message: 'Project not found',
        });
      }

      // Remove from SpiceDB
      if (isAuthzEnabled()) {
        try {
          await removeProjectFromSpiceDb({ projectId: id });
        } catch (syncError) {
          console.warn('Failed to remove project from SpiceDB:', syncError);
        }
      }

      return c.body(null, 204);
    } catch (error: unknown) {
      if (error instanceof Error && error.message?.includes('Cannot delete project')) {
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
