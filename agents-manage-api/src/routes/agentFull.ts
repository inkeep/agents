import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  AgentWithinContextOfProjectSchema,
  commonGetErrorResponses,
  createApiError,
  createFullAgentServerSide,
  deleteFullAgent,
  ErrorResponseSchema,
  type FullAgentDefinition,
  getFullAgent,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateFullAgentServerSide,
} from '@inkeep/agents-core';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

const logger = getLogger('agentFull');

const app = new OpenAPIHono();

// Schema for path parameters with agentId
const AgentIdParamsSchema = z
  .object({
    tenantId: z.string().openapi({
      description: 'Tenant identifier',
      example: 'tenant_123',
    }),
    projectId: z.string().openapi({
      description: 'Project identifier',
      example: 'project_456',
    }),
    agentId: z.string().openapi({
      description: 'Agent identifier',
      example: 'agent_789',
    }),
  })
  .openapi('AgentIdParams');

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Full Agent',
    operationId: 'create-full-agent',
    tags: ['Full Agent'],
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
            schema: SingleResponseSchema(AgentWithinContextOfProjectSchema),
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
    const { tenantId, projectId } = c.req.valid('param');
    const agentData = c.req.valid('json');

    const validatedAgentData = AgentWithinContextOfProjectSchema.parse(agentData);

    const createdAgent = await createFullAgentServerSide(dbClient, logger)(
      { tenantId, projectId },
      validatedAgentData
    );

    return c.json({ data: createdAgent }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{agentId}',
    summary: 'Get Full Agent',
    operationId: 'get-full-agent',
    tags: ['Full Agent'],
    description: 'Retrieve a complete agent definition with all agents, tools, and relationships',
    request: {
      params: AgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Full agent found',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentWithinContextOfProjectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');

    try {
      const agent: FullAgentDefinition | null = await getFullAgent(
        dbClient,
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
  createRoute({
    method: 'put',
    path: '/{agentId}',
    summary: 'Update Full Agent',
    operationId: 'update-full-agent',
    tags: ['Full Agent'],
    description:
      'Update or create a complete agent with all agents, tools, and relationships from JSON definition',
    request: {
      params: AgentIdParamsSchema,
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
            schema: SingleResponseSchema(AgentWithinContextOfProjectSchema),
          },
        },
      },
      201: {
        description: 'Full agent created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentWithinContextOfProjectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const agentData = c.req.valid('json');

    try {
      logger.info({}, 'test agent data');
      const validatedAgentData = AgentWithinContextOfProjectSchema.parse(agentData);

      if (agentId !== validatedAgentData.id) {
        throw createApiError({
          code: 'bad_request',
          message: `Agent ID mismatch: expected ${agentId}, got ${validatedAgentData.id}`,
        });
      }

      const existingAgent: FullAgentDefinition | null = await getFullAgent(
        dbClient,
        logger
      )({
        scopes: { tenantId, projectId, agentId },
      });
      const isCreate = !existingAgent;

      // Update/create the full agent using server-side data layer operations
      const updatedAgent: FullAgentDefinition = isCreate
        ? await createFullAgentServerSide(dbClient, logger)(
            { tenantId, projectId },
            validatedAgentData
          )
        : await updateFullAgentServerSide(dbClient, logger)(
            { tenantId, projectId },
            validatedAgentData
          );

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
  createRoute({
    method: 'delete',
    path: '/{agentId}',
    summary: 'Delete Full Agent',
    operationId: 'delete-full-agent',
    tags: ['Full Agent'],
    description:
      'Delete a complete agent and cascade to all related entities (relationships, not other agents/tools)',
    request: {
      params: AgentIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Agent deleted successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');

    try {
      const deleted = await deleteFullAgent(
        dbClient,
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
