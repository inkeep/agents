import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createFullProjectServerSide,
  deleteFullProject,
  ErrorResponseSchema,
  type FullProjectDefinition,
  FullProjectDefinitionSchema,
  getFullProject,
  SingleResponseSchema,
  updateFullProjectServerSide,
} from '@inkeep/agents-core';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

const logger = getLogger('projectFull');

const app = new OpenAPIHono();

// Schema for path parameters with projectId
const ProjectIdParamsSchema = z
  .object({
    tenantId: z.string().openapi({
      description: 'Tenant identifier',
      example: 'tenant_123',
    }),
    projectId: z.string().openapi({
      description: 'Project identifier',
      example: 'project_456',
    }),
  })
  .openapi('ProjectIdParams');

// Schema for tenant parameters only
const TenantParamsSchema = z
  .object({
    tenantId: z.string().openapi({
      description: 'Tenant identifier',
      example: 'tenant_123',
    }),
  })
  .openapi('TenantParams');

// Create full project from JSON
app.openapi(
  createRoute({
    method: 'post',
    path: '/project-full',
    summary: 'Create Full Project',
    operationId: 'create-full-project',
    tags: ['Full Project'],
    description:
      'Create a complete project with all graphs, agents, tools, and relationships from JSON definition',
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
            schema: SingleResponseSchema(FullProjectDefinitionSchema),
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
    const projectData = c.req.valid('json');

    // Validate the project data
    const validatedProjectData = FullProjectDefinitionSchema.parse(projectData);

    try {
      // Create the full project using the server-side data layer operations
      const createdProject = await createFullProjectServerSide(dbClient, logger)(
        { tenantId, projectId: validatedProjectData.id },
        validatedProjectData
      );

      return c.json({ data: createdProject }, 201);
    } catch (error: any) {
      // Handle duplicate project creation (SQLite primary key constraint)
      if (error?.cause?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error?.cause?.rawCode === 1555) {
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

// Get full project by ID
app.openapi(
  createRoute({
    method: 'get',
    path: '/project-full/{projectId}',
    summary: 'Get Full Project',
    operationId: 'get-full-project',
    tags: ['Full Project'],
    description:
      'Retrieve a complete project definition with all graphs, agents, tools, and relationships',
    request: {
      params: ProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Full project found',
        content: {
          'application/json': {
            schema: SingleResponseSchema(FullProjectDefinitionSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');

    try {
      const project: FullProjectDefinition | null = await getFullProject(
        dbClient,
        logger
      )({
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

// Update/upsert full project
app.openapi(
  createRoute({
    method: 'put',
    path: '/project-full/{projectId}',
    summary: 'Update Full Project',
    operationId: 'update-full-project',
    tags: ['Full Project'],
    description:
      'Update or create a complete project with all graphs, agents, tools, and relationships from JSON definition',
    request: {
      params: ProjectIdParamsSchema,
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
            schema: SingleResponseSchema(FullProjectDefinitionSchema),
          },
        },
      },
      201: {
        description: 'Full project created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(FullProjectDefinitionSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const projectData = c.req.valid('json');

    try {
      // Validate the project data
      const validatedProjectData = FullProjectDefinitionSchema.parse(projectData);

      // Validate that the URL projectId matches the data.id
      if (projectId !== validatedProjectData.id) {
        throw createApiError({
          code: 'bad_request',
          message: `Project ID mismatch: expected ${projectId}, got ${validatedProjectData.id}`,
        });
      }

      // Check if the project exists first to determine status code
      const existingProject: FullProjectDefinition | null = await getFullProject(
        dbClient,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      const isCreate = !existingProject;

      // Update/create the full project using server-side data layer operations
      const updatedProject: FullProjectDefinition = isCreate
        ? await createFullProjectServerSide(dbClient, logger)(
            { tenantId, projectId },
            validatedProjectData
          )
        : await updateFullProjectServerSide(dbClient, logger)(
            { tenantId, projectId },
            validatedProjectData
          );

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

// Delete full project
app.openapi(
  createRoute({
    method: 'delete',
    path: '/project-full/{projectId}',
    summary: 'Delete Full Project',
    operationId: 'delete-full-project',
    tags: ['Full Project'],
    description:
      'Delete a complete project and cascade to all related entities (graphs, agents, tools, relationships)',
    request: {
      params: ProjectIdParamsSchema,
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

    try {
      const deleted = await deleteFullProject(
        dbClient,
        logger
      )({
        scopes: { tenantId, projectId },
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
