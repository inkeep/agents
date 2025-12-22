import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createProject,
  createProjectMetadataAndBranch,
  deleteProject,
  deleteProjectWithBranch,
  doltCheckout,
  ErrorResponseSchema,
  getProject,
  getProjectMainBranchName,
  listProjectsWithMetadataPaginated,
  PaginationQueryParamsSchema,
  ProjectApiInsertSchema,
  ProjectApiUpdateSchema,
  ProjectListResponse,
  ProjectResponse,
  TenantIdParamsSchema,
  TenantParamsSchema,
  updateProject,
  cascadeDeleteByProject,
  type ResolvedRef,
} from '@inkeep/agents-core';
import { requirePermission } from '../middleware/require-permission';
import type { BaseAppVariables } from '../types/app';
import { speakeasyOffsetLimitPagination } from './shared';
import runDbClient from '../data/db/runDbClient';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono<{ Variables: BaseAppVariables }>();

app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return requirePermission({ project: ['create'] })(c, next);
  }
  return next();
});

app.use('/:id', async (c, next) => {
  if (c.req.method === 'PATCH') {
    return requirePermission({ project: ['update'] })(c, next);
  }
  if (c.req.method === 'DELETE') {
    return requirePermission({ project: ['delete'] })(c, next);
  }
  return next();
});

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
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const configDb = c.get('db');
    const { tenantId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    // Use the new function that gets projects from runtime DB
    // and fetches metadata from each project's branch in config DB
    const result = await listProjectsWithMetadataPaginated(
      runDbClient,
      configDb
    )({
      tenantId,
      pagination: { page, limit },
    });

    // Transform the result to match the existing ProjectListResponse schema
    const transformedData = result.data.map((project) => ({
      id: project.id,
      tenantId: project.tenantId,
      name: project.name ?? project.id, // Fall back to ID if no name set
      description: project.description,
      models: project.models,
      stopWhen: project.stopWhen,
      createdAt: project.createdAt,
      updatedAt: project.configUpdatedAt ?? project.createdAt,
    }));

    return c.json({
      data: transformedData,
      pagination: result.pagination,
    });
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
    const configDb = c.get('db');
    const userId = c.get('userId');
    const { tenantId } = c.req.valid('param');
    const body = c.req.valid('json');

    try {
      // 1. Create project in runtime DB and create project main branch
      const runtimeProject = await createProjectMetadataAndBranch(
        runDbClient,
        dbClient
      )({
        tenantId,
        projectId: body.id,
        createdBy: userId,
      });

      // 2. Checkout the newly created project branch on the middleware's connection
      // This ensures writes go to the project branch, not tenant main
      const projectMainBranch = getProjectMainBranchName(tenantId, body.id);
      await doltCheckout(configDb)({ branch: projectMainBranch });

      // Update resolvedRef so the middleware commits to the correct branch
      const newResolvedRef: ResolvedRef = {
        type: 'branch',
        name: projectMainBranch,
        hash: '',
      };
      c.set('resolvedRef', newResolvedRef);

      // 3. Create project config in the project branch
      const projectConfig = await createProject(configDb)({
        tenantId,
        ...body,
      });

      return c.json(
        {
          data: {
            ...projectConfig,
            mainBranchName: runtimeProject.mainBranchName,
          },
        },
        201
      );
    } catch (error: any) {
      // Handle duplicate project (PostgreSQL unique constraint violation)
      if (error?.cause?.code === '23505' || error?.message?.includes('already exists')) {
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

    // Update project config in config DB (versioned)
    // The branch-scoped-db middleware handles checking out the right branch
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
    description: 'Delete a project and its branch. Must be called from the main branch.',
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
    const configDb = c.get('db');
    const resolvedRef = c.get('resolvedRef');
    const { tenantId, id } = c.req.valid('param');

    // Enforce that deletion only happens from the main branch
    const expectedMainBranch = `${tenantId}_${id}_main`;
    if (resolvedRef?.name !== expectedMainBranch) {
      throw createApiError({
        code: 'bad_request',
        message: 'Project deletion must be performed from the main branch',
      });
    }

    try {
      // 1. Delete runtime entities for this project
      await cascadeDeleteByProject(runDbClient)({
        scopes: { tenantId, projectId: id },
        fullBranchName: resolvedRef.name,
      });

      // 2. Delete project config from config DB (on current branch)
      await deleteProject(configDb)({
        scopes: { tenantId, projectId: id },
      });

      // 3. Delete project from runtime DB and delete project branch
      const deleted = await deleteProjectWithBranch(
        runDbClient,
        dbClient
      )({
        tenantId,
        projectId: id,
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
