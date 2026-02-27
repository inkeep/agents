import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AgentWithinContextOfProjectResponse,
  AgentWithinContextOfProjectSchema,
  commonGetErrorResponses,
  createApiError,
  createFullAgentServerSide,
  deleteFullAgent,
  ErrorResponseSchema,
  type FullAgentDefinition,
  getFullAgent,
  listScheduledTriggers,
  type ScheduledTrigger,
  TenantProjectAgentParamsSchema,
  TenantProjectParamsSchema,
  updateFullAgentServerSide,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import {
  onTriggerCreated,
  onTriggerDeleted,
  onTriggerUpdated,
} from '../../run/services/ScheduledTriggerService';

const logger = getLogger('agentFull');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    permission: requireProjectPermission('edit'),
    summary: 'Create Full Agent',
    operationId: 'create-full-agent',
    tags: ['Agents'],
    description:
      'Create a complete agent with all agents, tools, and relationships from JSON definition',
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AgentWithinContextOfProjectSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Full agent created successfully',
        content: {
          'application/json': {
            schema: AgentWithinContextOfProjectResponse,
          },
        },
      },
      409: {
        description: 'Agent already exists',
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
    const { tenantId, projectId } = c.req.valid('param');
    const agentData = c.req.valid('json');

    const validatedAgentData = AgentWithinContextOfProjectSchema.parse(agentData);

    const createdAgent = await createFullAgentServerSide(db)(
      { tenantId, projectId },
      validatedAgentData
    );

    // Start workflows for any scheduled triggers created with the agent
    try {
      const triggers = await listScheduledTriggers(db)({
        scopes: { tenantId, projectId, agentId: createdAgent.id },
      });
      for (const trigger of triggers) {
        try {
          await onTriggerCreated(trigger);
        } catch (err) {
          logger.error(
            { err, scheduledTriggerId: trigger.id },
            'Failed to start workflow for scheduled trigger during agent creation'
          );
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to reconcile scheduled trigger workflows after agent creation');
    }

    return c.json({ data: createdAgent }, 201);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{agentId}',
    permission: requireProjectPermission('view'),
    summary: 'Get Full Agent',
    operationId: 'get-full-agent',
    tags: ['Agents'],
    description: 'Retrieve a complete agent definition with all agents, tools, and relationships',
    request: {
      params: TenantProjectAgentParamsSchema,
    },
    responses: {
      200: {
        description: 'Full agent found',
        content: {
          'application/json': {
            schema: AgentWithinContextOfProjectResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');

    try {
      const agent: FullAgentDefinition | null = await getFullAgent(
        db,
        logger
      )({
        scopes: { tenantId, projectId, agentId },
      });

      if (!agent) {
        throw createApiError({
          code: 'not_found',
          message: 'Agent not found',
        });
      }

      return c.json({ data: agent });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw createApiError({
          code: 'not_found',
          message: 'Agent not found',
        });
      }

      throw createApiError({
        code: 'internal_server_error',
        message: error instanceof Error ? error.message : 'Failed to retrieve agent',
      });
    }
  }
);

// Update/upsert full agent
app.openapi(
  createProtectedRoute({
    method: 'put',
    path: '/{agentId}',
    permission: requireProjectPermission('edit'),
    summary: 'Update Full Agent',
    operationId: 'update-full-agent',
    tags: ['Agents'],
    description:
      'Update or create a complete agent with all agents, tools, and relationships from JSON definition',
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AgentWithinContextOfProjectSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Full agent updated successfully',
        content: {
          'application/json': {
            schema: AgentWithinContextOfProjectResponse,
          },
        },
      },
      201: {
        description: 'Full agent created successfully',
        content: {
          'application/json': {
            schema: AgentWithinContextOfProjectResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const agentData = c.req.valid('json');

    try {
      const validatedAgentData = AgentWithinContextOfProjectSchema.parse(agentData);

      if (agentId !== validatedAgentData.id) {
        throw createApiError({
          code: 'bad_request',
          message: `Agent ID mismatch: expected ${agentId}, got ${validatedAgentData.id}`,
        });
      }

      const existingAgent: FullAgentDefinition | null = await getFullAgent(
        db,
        logger
      )({
        scopes: { tenantId, projectId, agentId },
      });
      const isCreate = !existingAgent;

      // Capture existing scheduled triggers before update for workflow reconciliation
      let existingScheduledTriggers: ScheduledTrigger[] = [];
      if (!isCreate) {
        try {
          existingScheduledTriggers = await listScheduledTriggers(db)({
            scopes: { tenantId, projectId, agentId },
          });
        } catch (err) {
          logger.error({ err }, 'Failed to list existing scheduled triggers before update');
        }
      }

      // Update/create the full agent using server-side data layer operations
      const updatedAgent: FullAgentDefinition = isCreate
        ? await createFullAgentServerSide(db)({ tenantId, projectId }, validatedAgentData)
        : await updateFullAgentServerSide(db)({ tenantId, projectId }, validatedAgentData);

      // Reconcile scheduled trigger workflows
      try {
        const newScheduledTriggers = await listScheduledTriggers(db)({
          scopes: { tenantId, projectId, agentId },
        });
        const existingTriggerMap = new Map(existingScheduledTriggers.map((t) => [t.id, t]));
        const newTriggerMap = new Map(newScheduledTriggers.map((t) => [t.id, t]));

        // Handle created and updated triggers
        for (const trigger of newScheduledTriggers) {
          const existing = existingTriggerMap.get(trigger.id);
          try {
            if (!existing) {
              await onTriggerCreated(trigger);
            } else {
              const scheduleChanged =
                existing.cronExpression !== trigger.cronExpression ||
                String(existing.runAt) !== String(trigger.runAt);
              const previousEnabled = existing.enabled;
              if (scheduleChanged || previousEnabled !== trigger.enabled) {
                await onTriggerUpdated({ trigger, previousEnabled, scheduleChanged });
              }
            }
          } catch (err) {
            logger.error(
              { err, scheduledTriggerId: trigger.id },
              'Failed to reconcile scheduled trigger workflow'
            );
          }
        }

        // Handle deleted triggers
        for (const existing of existingScheduledTriggers) {
          if (!newTriggerMap.has(existing.id)) {
            try {
              await onTriggerDeleted(existing);
            } catch (err) {
              logger.error(
                { err, scheduledTriggerId: existing.id },
                'Failed to stop workflow for deleted scheduled trigger'
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err }, 'Failed to reconcile scheduled trigger workflows after update');
      }

      return c.json({ data: updatedAgent }, isCreate ? 201 : 200);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw createApiError({
          code: 'bad_request',
          message: 'Invalid agent definition',
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
        message: error instanceof Error ? error.message : 'Failed to update agent',
      });
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{agentId}',
    permission: requireProjectPermission('edit'),
    summary: 'Delete Full Agent',
    operationId: 'delete-full-agent',
    tags: ['Agents'],
    description:
      'Delete a complete agent and cascade to all related entities (relationships, not other agents/tools)',
    request: {
      params: TenantProjectAgentParamsSchema,
    },
    responses: {
      204: {
        description: 'Agent deleted successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');

    try {
      const deleted = await deleteFullAgent(
        db,
        logger
      )({
        scopes: { tenantId, projectId, agentId },
      });

      if (!deleted) {
        throw createApiError({
          code: 'not_found',
          message: 'Agent not found',
        });
      }

      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw createApiError({
          code: 'not_found',
          message: 'Agent not found',
        });
      }

      throw createApiError({
        code: 'internal_server_error',
        message: error instanceof Error ? error.message : 'Failed to delete agent',
      });
    }
  }
);

export default app;
