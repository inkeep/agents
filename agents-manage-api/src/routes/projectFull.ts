import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  cascadeDeleteByProject,
  commonGetErrorResponses,
  createApiError,
  createFullProjectServerSide,
  createProjectMetadataAndBranch,
  deleteFullProject,
  deleteProjectWithBranch,
  doltCheckout,
  ErrorResponseSchema,
  FullProjectDefinitionSchema,
  type FullProjectSelect,
  FullProjectSelectResponse,
  type FullProjectSelectWithRelationIds,
  FullProjectSelectWithRelationIdsResponse,
  getFullProject,
  getFullProjectWithRelationIds,
  getProjectMainBranchName,
  getProjectMetadata,
  type ResolvedRef,
  TenantParamsSchema,
  TenantProjectParamsSchema,
  updateFullProjectServerSide,
} from '@inkeep/agents-core';
import manageDbClient from '../data/db/dbClient';
import runDbClient from '../data/db/runDbClient';
import { getLogger } from '../logger';
import { requirePermission } from '../middleware/require-permission';
import type { BaseAppVariables } from '../types/app';

const logger = getLogger('projectFull');

const app = new OpenAPIHono<{ Variables: BaseAppVariables }>();

app.use('/project-full', async (c, next) => {
  if (c.req.method === 'POST') {
    return requirePermission({ project: ['create'] })(c, next);
  }
  return next();
});

app.use('/project-full/:projectId', async (c, next) => {
  if (c.req.method === 'PUT') {
    return requirePermission({ project: ['update'] })(c, next);
  }
  if (c.req.method === 'DELETE') {
    return requirePermission({ project: ['delete'] })(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'post',
    path: '/project-full',
    summary: 'Create Full Project',
    operationId: 'create-full-project',
    tags: ['Full Project'],
    description:
      'Create a complete project with all Agents, Sub Agents, tools, and relationships from JSON definition',
    request: {
      params: TenantParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: FullProjectDefinitionSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Full project created successfully',
        content: {
          'application/json': {
            schema: FullProjectSelectResponse,
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
    const projectData = c.req.valid('json');

    const validatedProjectData = FullProjectDefinitionSchema.parse(projectData);

    try {
      // 1. Create project in runtime DB and create project main branch
      await createProjectMetadataAndBranch(
        runDbClient,
        manageDbClient
      )({
        tenantId,
        projectId: validatedProjectData.id,
        createdBy: userId,
      });

      logger.info(
        { tenantId, projectId: validatedProjectData.id },
        'Created project with branch, now populating config'
      );

      // 2. Checkout the newly created project branch on the middleware's connection
      // This ensures writes go to the project branch, not tenant main
      const projectMainBranch = getProjectMainBranchName(tenantId, validatedProjectData.id);
      await doltCheckout(configDb)({ branch: projectMainBranch });

      // Update resolvedRef so the middleware commits to the correct branch
      const newResolvedRef: ResolvedRef = {
        type: 'branch',
        name: projectMainBranch,
        hash: '', // Hash will be determined at commit time
      };
      c.set('resolvedRef', newResolvedRef);

      logger.debug({ projectMainBranch }, 'Checked out project branch for config writes');

      // 3. Create full project config in the project branch
      const createdProject = await createFullProjectServerSide(configDb)({
        scopes: { tenantId, projectId: validatedProjectData.id },
        projectData: validatedProjectData,
      });

      return c.json({ data: createdProject }, 201);
    } catch (error: any) {
      // Handle duplicate project creation (PostgreSQL unique constraint violation)
      logger.error({ error }, 'Error creating project');
      if (error?.cause?.code === '23505' || error?.message?.includes('already exists')) {
        throw createApiError({
          code: 'conflict',
          message: `Project with ID '${projectData.id}' already exists`,
        });
      }

      // Re-throw other errors to be handled by the global error handler
      throw error;
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/project-full/{projectId}',
    summary: 'Get Full Project',
    operationId: 'get-full-project',
    tags: ['Full Project'],
    description:
      'Retrieve a complete project definition with all Agents, Sub Agents, tools, and relationships',
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'Full project found',
        content: {
          'application/json': {
            schema: FullProjectSelectResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const db = c.get('db');

    try {
      const project: FullProjectSelect | null = await getFullProject(db)({
        scopes: { tenantId, projectId },
      });

      if (!project) {
        throw createApiError({
          code: 'not_found',
          message: 'Project not found',
        });
      }

      return c.json({ data: project });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw createApiError({
          code: 'not_found',
          message: 'Project not found',
        });
      }

      throw createApiError({
        code: 'internal_server_error',
        message: error instanceof Error ? error.message : 'Failed to retrieve project',
      });
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/project-full/{projectId}/with-relation-ids',
    summary: 'Get Full Project with Relation IDs',
    operationId: 'get-full-project-with-relation-ids',
    tags: ['Full Project'],
    description:
      'Retrieve a complete project definition with all Agents, Sub Agents, tools, and relationships',
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'Full project found',
        content: {
          'application/json': {
            schema: FullProjectSelectWithRelationIdsResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const db = c.get('db');

    try {
      const project: FullProjectSelectWithRelationIds | null = await getFullProjectWithRelationIds(
        db
      )({ scopes: { tenantId, projectId } });

      if (!project) {
        throw createApiError({
          code: 'not_found',
          message: 'Project not found',
        });
      }

      return c.json({ data: project });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw createApiError({
          code: 'not_found',
          message: 'Project not found',
        });
      }

      throw createApiError({
        code: 'internal_server_error',
        message: error instanceof Error ? error.message : 'Failed to retrieve project',
      });
    }
  }
);

// Update/upsert full project
app.openapi(
  createRoute({
    method: 'put',
    path: '/project-full/{projectId}',
    summary: 'Update Full Project',
    operationId: 'update-full-project',
    tags: ['Full Project'],
    description:
      'Update or create a complete project with all Agents, Sub Agents, tools, and relationships from JSON definition',
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: FullProjectDefinitionSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Full project updated successfully',
        content: {
          'application/json': {
            schema: FullProjectSelectResponse,
          },
        },
      },
      201: {
        description: 'Full project created successfully',
        content: {
          'application/json': {
            schema: FullProjectSelectResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const projectData = c.req.valid('json');
    const configDb = c.get('db');
    const userId = c.get('userId');

    try {
      const validatedProjectData = FullProjectDefinitionSchema.parse(projectData);

      if (projectId !== validatedProjectData.id) {
        throw createApiError({
          code: 'bad_request',
          message: `Project ID mismatch: expected ${projectId}, got ${validatedProjectData.id}`,
        });
      }

      // Check if project exists in runtime DB (source of truth)
      const runtimeProject = await getProjectMetadata(runDbClient)({ tenantId, projectId });
      const isCreate = !runtimeProject;

      if (isCreate) {
        // Project doesn't exist - create it with branch first
        await createProjectMetadataAndBranch(
          runDbClient,
          manageDbClient
        )({
          tenantId,
          projectId,
          createdBy: userId,
        });

        logger.info({ tenantId, projectId }, 'Created project with branch for PUT (upsert)');
      }

      // Update/create the full project using server-side data layer operations
      const updatedProject: FullProjectSelect = isCreate
        ? await createFullProjectServerSide(configDb)({
            scopes: { tenantId, projectId },
            projectData: validatedProjectData,
          })
        : await updateFullProjectServerSide(configDb)({
            scopes: { tenantId, projectId },
            projectData: validatedProjectData,
          });

      return c.json({ data: updatedProject }, isCreate ? 201 : 200);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw createApiError({
          code: 'bad_request',
          message: 'Invalid project definition',
        });
      }

      if (error instanceof Error && error.message.includes('ID mismatch')) {
        throw createApiError({
          code: 'bad_request',
          message: error.message,
        });
      }

      throw createApiError({
        code: 'internal_server_error',
        message: error instanceof Error ? error.message : 'Failed to update project',
      });
    }
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/project-full/{projectId}',
    summary: 'Delete Full Project',
    operationId: 'delete-full-project',
    tags: ['Full Project'],
    description:
      'Delete a complete project and cascade to all related entities (Agents, Sub Agents, tools, relationships)',
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      204: {
        description: 'Project deleted successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const configDb = c.get('db');
    const resolvedRef = c.get('resolvedRef');

    // Enforce that deletion only happens from the main branch
    const expectedMainBranch = `${tenantId}_${projectId}_main`;
    if (resolvedRef?.name !== expectedMainBranch) {
      throw createApiError({
        code: 'bad_request',
        message: 'Project deletion must be performed from the main branch',
      });
    }

    try {
      // 1. Delete runtime entities for this project
      await cascadeDeleteByProject(runDbClient)({
        scopes: { tenantId, projectId },
        fullBranchName: resolvedRef.name,
      });

      // 2. Delete the full project config from the config DB
      await deleteFullProject(configDb)({
        scopes: { tenantId, projectId },
      });

      // 3. Delete project from runtime DB and delete project branch
      const deleted = await deleteProjectWithBranch(
        runDbClient,
        manageDbClient
      )({
        tenantId,
        projectId,
      });

      if (!deleted) {
        throw createApiError({
          code: 'not_found',
          message: 'Project not found',
        });
      }

      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw createApiError({
          code: 'not_found',
          message: 'Project not found',
        });
      }

      throw createApiError({
        code: 'internal_server_error',
        message: error instanceof Error ? error.message : 'Failed to delete project',
      });
    }
  }
);

export default app;
