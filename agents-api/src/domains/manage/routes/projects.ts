import { OpenAPIHono } from '@hono/zod-openapi';
import {
  cascadeDeleteByProject,
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
  listAccessibleProjectIds,
  listProjectsWithMetadataPaginated,
  type OrgRole,
  PaginationQueryParamsSchema,
  ProjectApiInsertSchema,
  ProjectApiUpdateSchema,
  ProjectListResponse,
  ProjectResponse,
  type ResolvedRef,
  removeProjectFromSpiceDb,
  syncProjectToSpiceDb,
  TenantIdParamsSchema,
  TenantParamsSchema,
  updateProject,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedManageTenantAuth } from '@inkeep/agents-core/middleware';
import { requirePermission } from 'src/middleware/requirePermission';
import type { ManageAppVariables } from 'src/types/app';
import manageDbClient from '../../../data/db/manageDbClient';
import runDbClient from '../../../data/db/runDbClient';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

// POST /projects - Create project (org-level action, requires org permission)
// GET/PATCH /projects/:id - Project-level actions (require SpiceDB permission)
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Projects',
    description:
      'List all projects within a tenant with pagination. When authorization is enabled, only returns projects the user has access to.',
    operationId: 'list-projects',
    tags: ['Projects'],
    permission: inheritedManageTenantAuth(),
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
    const userId = c.get('userId');
    const tenantRole = c.get('tenantRole') || 'member';
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    // Get accessible project IDs based on authorization
    let accessibleIds: string[] | undefined;
    if (userId) {
      const result = await listAccessibleProjectIds({
        userId,
        orgRole: tenantRole as OrgRole,
      });
      if (result !== 'all') {
        accessibleIds = result;
      }
    }

    // Use the new function that gets projects from runtime DB
    // and fetches metadata from each project's branch in config DB
    const result = await listProjectsWithMetadataPaginated(
      runDbClient,
      configDb
    )({ tenantId, pagination: { page, limit }, projectIds: accessibleIds });

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
  createProtectedRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Project',
    description: 'Get a single project by ID',
    operationId: 'get-project-by-id',
    tags: ['Projects'],
    permission: requireProjectPermission('view'),
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
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Project',
    description:
      'Create a new project. When authorization is enabled, the creator is automatically granted admin role.',
    operationId: 'create-project',
    tags: ['Projects'],
    permission: requirePermission({ project: ['create'] }),
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
        configDb
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

      // Sync to SpiceDB: link project to org and grant creator admin role
      if (!userId) {
        throw createApiError({
          code: 'unauthorized',
          message: 'User not found',
        });
      }

      try {
        await syncProjectToSpiceDb({
          tenantId,
          projectId: body.id,
          creatorUserId: userId,
        });
      } catch (syncError) {
        // Log but don't fail the request
        console.warn('Failed to sync project to SpiceDB:', syncError);
      }

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
  createProtectedRoute({
    method: 'patch',
    path: '/{id}',
    summary: 'Update Project',
    description: 'Update an existing project',
    operationId: 'update-project',
    tags: ['Projects'],
    permission: requireProjectPermission('edit'),
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
  createProtectedRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Project',
    description: 'Delete a project and its branch. Must be called from the main branch.',
    operationId: 'delete-project',
    tags: ['Projects'],
    permission: requirePermission({ project: ['delete'] }),
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

      // Ensure the request connection isn't still checked out to the branch we're about to delete.
      await doltCheckout(configDb)({ branch: 'main' });

      // 3. Delete project from runtime DB and delete project branch
      const deleted = await deleteProjectWithBranch(
        runDbClient,
        manageDbClient
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

      // Remove from SpiceDB
      try {
        await removeProjectFromSpiceDb({ tenantId, projectId: id });
      } catch (syncError) {
        console.warn('Failed to remove project from SpiceDB:', syncError);
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
