import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  cascadeDeleteByProject,
  checkoutBranch,
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
  listScheduledTriggers,
  type ResolvedRef,
  removeProjectFromSpiceDb,
  type ScheduledTrigger,
  syncProjectToSpiceDb,
  TenantParamsSchema,
  TenantProjectParamsSchema,
  updateFullProjectServerSide,
} from '@inkeep/agents-core';
import type { ManageAppVariables } from 'src/types/app';
import manageDbClient from '../../../data/db/manageDbClient';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import { requirePermission } from '../../../middleware/requirePermission';
import {
  onTriggerCreated,
  onTriggerDeleted,
  onTriggerUpdated,
} from '../../run/services/ScheduledTriggerService';

const logger = getLogger('projectFull');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

// ============================================================================
// Authorization Middleware (explicit per-route)
// ============================================================================

// POST /project-full → org 'project:create'
app.use('/project-full', async (c, next) => {
  if (c.req.method === 'POST') return requirePermission({ project: ['create'] })(c, next);
  return next();
});

// GET /project-full/:projectId/* → project 'view'
app.use('/project-full/:projectId', async (c, next) => {
  if (c.req.method === 'GET') return requireProjectPermission('view')(c, next);
  return next();
});
app.use('/project-full/:projectId/with-relation-ids', async (c, next) => {
  if (c.req.method === 'GET') return requireProjectPermission('view')(c, next);
  return next();
});

// PUT /project-full/:projectId → dynamic: 'project:create' (new) or 'edit' (existing)
const requireProjectUpsertPermission = async (
  c: Parameters<ReturnType<typeof requireProjectPermission>>[0],
  next: Parameters<ReturnType<typeof requireProjectPermission>>[1]
) => {
  const tenantId = c.get('tenantId');
  const projectId = c.req.param('projectId');
  if (!tenantId || !projectId) {
    throw createApiError({ code: 'bad_request', message: 'Missing tenantId or projectId' });
  }
  const exists = await getProjectMetadata(runDbClient)({ tenantId, projectId });
  c.set('isProjectCreate', !exists);
  return exists
    ? requireProjectPermission('edit')(c, next)
    : requirePermission({ project: ['create'] })(c, next);
};

// DELETE /project-full/:projectId → org 'project:delete'
// Note: Registered after PUT to avoid path conflicts

// ============================================================================
// Routes
// ============================================================================

app.openapi(
  createRoute({
    method: 'post',
    path: '/project-full',
    summary: 'Create Full Project',
    operationId: 'create-full-project',
    tags: ['Projects'],
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
      // Two-phase commit: Wrap all database operations in transactions
      // If SpiceDB sync fails, both DB transactions will rollback automatically
      const createdProject = await runDbClient.transaction(async (runTx) => {
        return await configDb.transaction(async (configTx) => {
          // Phase 1: Database operations (within transactions - not committed yet)

          // 1. Create project in runtime DB and create project main branch
          await createProjectMetadataAndBranch(
            runTx,
            configTx
          )({
            tenantId,
            projectId: validatedProjectData.id,
            createdBy: userId,
          });

          logger.info(
            { tenantId, projectId: validatedProjectData.id },
            'Created project with branch, now populating config'
          );

          // Checkout the project main branch
          const projectMainBranch = getProjectMainBranchName(tenantId, validatedProjectData.id);
          await checkoutBranch(configTx)({
            branchName: projectMainBranch,
            autoCommitPending: true,
          });

          // Update resolvedRef so the middleware commits to the correct branch
          const newResolvedRef: ResolvedRef = {
            type: 'branch',
            name: projectMainBranch,
            hash: '', // Hash will be determined at commit time
          };
          c.set('resolvedRef', newResolvedRef);

          logger.debug({ projectMainBranch }, 'Checked out project branch for config writes');

          // 2. Create full project config in the project branch
          const project = await createFullProjectServerSide(configTx)({
            scopes: { tenantId, projectId: validatedProjectData.id },
            projectData: validatedProjectData,
          });

          // Phase 2: Sync to SpiceDB (still within transaction scope)
          // If this fails, both transactions will rollback automatically
          if (userId) {
            await syncProjectToSpiceDb({
              tenantId,
              projectId: validatedProjectData.id,
              creatorUserId: userId,
            });
          }

          // If we reach here, both transactions will commit
          return project;
        });
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

      // Handle SpiceDB sync failures - transactions already rolled back
      // Check for gRPC error characteristics (SpiceDB uses gRPC via @authzed/authzed-node)
      const isGrpcError = error?.metadata !== undefined && typeof error?.code === 'number';
      const mentionsSpiceDb = error?.message?.includes('SpiceDB');
      if (mentionsSpiceDb || isGrpcError) {
        logger.error(
          {
            error,
            tenantId,
            projectId: validatedProjectData.id,
            userId,
          },
          'Failed to sync project to SpiceDB - database transactions rolled back'
        );
        throw createApiError({
          code: 'internal_server_error',
          message: 'Failed to set up project authorization. No changes were made to the database.',
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
    tags: ['Projects'],
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
    tags: ['Projects'],
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
// Authorization: dynamic - 'project:create' (new) or 'edit' (existing)
app.use('/project-full/:projectId', async (c, next) => {
  if (c.req.method === 'PUT') return requireProjectUpsertPermission(c, next);
  return next();
});

app.openapi(
  createRoute({
    method: 'put',
    path: '/project-full/{projectId}',
    summary: 'Update Full Project',
    operationId: 'update-full-project',
    tags: ['Projects'],
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

      // Use cached result from middleware (permission already checked there)
      const isCreate = c.get('isProjectCreate') ?? false;

      // Two-phase commit for creates, regular update for existing projects
      if (isCreate) {
        // Project doesn't exist - create it with branch first
        await createProjectMetadataAndBranch(
          runDbClient,
          configDb
        )({
          tenantId,
          projectId,
          createdBy: userId,
        });

        logger.info({ tenantId, projectId }, 'Created project with branch for PUT (upsert)');

        // Checkout the project main branch
        const projectMainBranch = getProjectMainBranchName(tenantId, projectId);
        await checkoutBranch(configDb)({ branchName: projectMainBranch, autoCommitPending: true });
      }

      // fetch existing scheduled triggers for all agents
      const existingTriggersByAgent = new Map<string, ScheduledTrigger[]>();
      if (!isCreate) {
        const agents = Object.keys(validatedProjectData.agents || {});
        for (const agentId of agents) {
          const existingTriggers = await listScheduledTriggers(configDb)({
            scopes: { tenantId, projectId, agentId },
          });
          existingTriggersByAgent.set(agentId, existingTriggers);
        }
      }

      // Update/create the full project using server-side data layer operations
      const updatedProject: FullProjectSelect = isCreate
        ? await runDbClient.transaction(async (runTx) => {
            return await configDb.transaction(async (configTx) => {
              // Phase 1: Database operations (within transactions)

              // Create project with branch first
              await createProjectMetadataAndBranch(
                runTx,
                configTx
              )({
                tenantId,
                projectId,
                createdBy: userId,
              });

              logger.info({ tenantId, projectId }, 'Created project with branch for PUT (upsert)');

              // Checkout the project main branch
              const projectMainBranch = getProjectMainBranchName(tenantId, projectId);
              await checkoutBranch(configTx)({
                branchName: projectMainBranch,
                autoCommitPending: true,
              });

              // Create the full project config
              const project = await createFullProjectServerSide(configTx)({
                scopes: { tenantId, projectId },
                projectData: validatedProjectData,
              });

              // Phase 2: Sync to SpiceDB (within transaction scope)
              // If this fails, both transactions will rollback automatically
              if (userId) {
                await syncProjectToSpiceDb({
                  tenantId,
                  projectId,
                  creatorUserId: userId,
                });
              }

              return project;
            });
          })
        : await updateFullProjectServerSide(configDb)({
            scopes: { tenantId, projectId },
            projectData: validatedProjectData,
          });

      // Reconcile scheduled trigger workflows for all agents in the project
      try {
        const agents = Object.keys(validatedProjectData.agents || {});

        logger.info(
          { tenantId, projectId, agentIds: agents, agentCount: agents.length },
          'Starting scheduled trigger workflow reconciliation'
        );

        // Process all agents in parallel
        await Promise.all(
          agents.map(async (agentId) => {
            const existingTriggersForAgent = existingTriggersByAgent.get(agentId) || [];
            const newTriggersForAgent = await listScheduledTriggers(configDb)({
              scopes: { tenantId, projectId, agentId },
            });

            logger.info(
              {
                tenantId,
                projectId,
                agentId,
                existingCount: existingTriggersForAgent.length,
                newCount: newTriggersForAgent.length,
              },
              'Reconciling scheduled triggers for agent'
            );

            const existingTriggerMap = new Map(existingTriggersForAgent.map((t) => [t.id, t]));
            const newTriggerMap = new Map(newTriggersForAgent.map((t) => [t.id, t]));

            // Collect all workflow operations to parallelize them
            const workflowOperations: Promise<void>[] = [];

            // Handle created and updated triggers
            for (const trigger of newTriggersForAgent) {
              const existing = existingTriggerMap.get(trigger.id);

              if (!existing) {
                // New trigger
                workflowOperations.push(
                  onTriggerCreated(trigger)
                    .then(() =>
                      logger.info(
                        { tenantId, projectId, agentId, scheduledTriggerId: trigger.id },
                        'Started workflow for new scheduled trigger'
                      )
                    )
                    .catch((err) =>
                      logger.error(
                        { err, tenantId, projectId, agentId, scheduledTriggerId: trigger.id },
                        'Failed to start workflow for new scheduled trigger'
                      )
                    )
                );
              } else {
                // Updated trigger
                const scheduleChanged =
                  existing.cronExpression !== trigger.cronExpression ||
                  String(existing.runAt) !== String(trigger.runAt);
                const previousEnabled = existing.enabled;

                if (scheduleChanged || previousEnabled !== trigger.enabled) {
                  workflowOperations.push(
                    onTriggerUpdated({ trigger, previousEnabled, scheduleChanged })
                      .then(() =>
                        logger.info(
                          { tenantId, projectId, agentId, scheduledTriggerId: trigger.id },
                          'Updated workflow for scheduled trigger'
                        )
                      )
                      .catch((err) =>
                        logger.error(
                          { err, tenantId, projectId, agentId, scheduledTriggerId: trigger.id },
                          'Failed to update workflow for scheduled trigger'
                        )
                      )
                  );
                }
              }
            }

            // Handle deleted triggers
            for (const existing of existingTriggersForAgent) {
              if (!newTriggerMap.has(existing.id)) {
                workflowOperations.push(
                  onTriggerDeleted(existing)
                    .then(() =>
                      logger.info(
                        { tenantId, projectId, agentId, scheduledTriggerId: existing.id },
                        'Stopped workflow for deleted scheduled trigger'
                      )
                    )
                    .catch((err) =>
                      logger.error(
                        { err, tenantId, projectId, agentId, scheduledTriggerId: existing.id },
                        'Failed to stop workflow for deleted scheduled trigger'
                      )
                    )
                );
              }
            }

            // Execute all workflow operations for this agent in parallel
            await Promise.allSettled(workflowOperations);
          })
        );

        logger.info(
          { tenantId, projectId, agentCount: agents.length },
          'Completed scheduled trigger workflow reconciliation'
        );
      } catch (err) {
        logger.error(
          { err, tenantId, projectId },
          'Failed to reconcile scheduled trigger workflows after project update'
        );
      }

      return c.json({ data: updatedProject }, isCreate ? 201 : 200);
    } catch (error: any) {
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

      // Handle SpiceDB sync failures for creates - transactions already rolled back
      const isCreate = c.get('isProjectCreate') ?? false;
      if (isCreate) {
        // Check for gRPC error characteristics (SpiceDB uses gRPC via @authzed/authzed-node)
        const isGrpcError = error?.metadata !== undefined && typeof error?.code === 'number';
        const mentionsSpiceDb = error?.message?.includes('SpiceDB');
        if (mentionsSpiceDb || isGrpcError) {
          logger.error(
            {
              error,
              tenantId,
              projectId,
              userId,
            },
            'Failed to sync project to SpiceDB - database transactions rolled back'
          );
          throw createApiError({
            code: 'internal_server_error',
            message:
              'Failed to set up project authorization. No changes were made to the database.',
          });
        }
      }

      throw createApiError({
        code: 'internal_server_error',
        message: error instanceof Error ? error.message : 'Failed to update project',
      });
    }
  }
);

// Authorization: org 'project:delete'
app.use('/project-full/:projectId', async (c, next) => {
  if (c.req.method === 'DELETE') return requirePermission({ project: ['delete'] })(c, next);
  return next();
});

app.openapi(
  createRoute({
    method: 'delete',
    path: '/project-full/{projectId}',
    summary: 'Delete Full Project',
    operationId: 'delete-full-project',
    tags: ['Projects'],
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

      // Ensure the request connection isn't still checked out to the branch we're about to delete.
      await doltCheckout(configDb)({ branch: 'main' });

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

      // 4. Clean up SpiceDB relationships
      // This removes all authorization relationships for the project
      try {
        await removeProjectFromSpiceDb({
          tenantId,
          projectId,
        });
        logger.info({ tenantId, projectId }, 'Removed project from SpiceDB');
      } catch (spiceDbError) {
        // Log but don't fail - the project data is already deleted
        // This could leave orphaned auth relationships, but won't affect functionality
        logger.warn(
          {
            spiceDbError,
            tenantId,
            projectId,
          },
          'Failed to remove project from SpiceDB - orphaned auth relationships may remain'
        );
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
