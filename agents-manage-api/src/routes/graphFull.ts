import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  AgentWithinContextOfProjectSchema,
  commonGetErrorResponses,
  createApiError,
  createFullGraphServerSide,
  deleteFullAgent,
  ErrorResponseSchema,
  type FullGraphDefinition,
  getFullGraph,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateFullGraphServerSide,
} from '@inkeep/agents-core';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

const logger = getLogger('graphFull');

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
      description: 'Graph identifier',
      example: 'graph_789',
    }),
  })
  .openapi('AgentIdParams');

// Create full graph from JSON
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Full Graph',
    operationId: 'create-full-graph',
    tags: ['Full Graph'],
    description:
      'Create a complete agent graph with all agents, tools, and relationships from JSON definition',
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
        description: 'Full graph created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentWithinContextOfProjectSchema),
          },
        },
      },
      409: {
        description: 'Graph already exists',
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
    const graphData = c.req.valid('json');

    // Validate the graph data
    const validatedGraphData = AgentWithinContextOfProjectSchema.parse(graphData);

    // Create the full graph using the server-side data layer operations
    const createdGraph = await createFullGraphServerSide(dbClient, logger)(
      { tenantId, projectId },
      validatedGraphData
    );

    return c.json({ data: createdGraph }, 201);
  }
);

// Get full graph by ID
app.openapi(
  createRoute({
    method: 'get',
    path: '/{agentId}',
    summary: 'Get Full Graph',
    operationId: 'get-full-graph',
    tags: ['Full Graph'],
    description:
      'Retrieve a complete agent graph definition with all agents, tools, and relationships',
    request: {
      params: AgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Full graph found',
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
      const graph: FullGraphDefinition | null = await getFullGraph(
        dbClient,
        logger
      )({
        scopes: { tenantId, projectId, agentId },
      });

      if (!graph) {
        throw createApiError({
          code: 'not_found',
          message: 'Graph not found',
        });
      }

      return c.json({ data: graph });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw createApiError({
          code: 'not_found',
          message: 'Graph not found',
        });
      }

      throw createApiError({
        code: 'internal_server_error',
        message: error instanceof Error ? error.message : 'Failed to retrieve graph',
      });
    }
  }
);

// Update/upsert full graph
app.openapi(
  createRoute({
    method: 'put',
    path: '/{agentId}',
    summary: 'Update Full Graph',
    operationId: 'update-full-graph',
    tags: ['Full Graph'],
    description:
      'Update or create a complete agent graph with all agents, tools, and relationships from JSON definition',
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
        description: 'Full graph updated successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentWithinContextOfProjectSchema),
          },
        },
      },
      201: {
        description: 'Full graph created successfully',
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
    const graphData = c.req.valid('json');

    try {
      // Validate the graph data
      const validatedGraphData = AgentWithinContextOfProjectSchema.parse(graphData);

      // Validate that the URL graphId matches the data.id
      if (agentId !== validatedGraphData.id) {
        throw createApiError({
          code: 'bad_request',
          message: `Graph ID mismatch: expected ${agentId}, got ${validatedGraphData.id}`,
        });
      }

      // Check if the graph exists first to determine status code
      const existingGraph: FullGraphDefinition | null = await getFullGraph(
        dbClient,
        logger
      )({
        scopes: { tenantId, projectId, agentId },
      });
      const isCreate = !existingGraph;

      // Update/create the full graph using server-side data layer operations
      const updatedGraph: FullGraphDefinition = isCreate
        ? await createFullGraphServerSide(dbClient, logger)(
            { tenantId, projectId },
            validatedGraphData
          )
        : await updateFullGraphServerSide(dbClient, logger)(
            { tenantId, projectId },
            validatedGraphData
          );

      return c.json({ data: updatedGraph }, isCreate ? 201 : 200);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw createApiError({
          code: 'bad_request',
          message: 'Invalid graph definition',
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
        message: error instanceof Error ? error.message : 'Failed to update graph',
      });
    }
  }
);

// Delete full Agent
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
        description: 'Graph deleted successfully',
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
          message: 'Graph not found',
        });
      }

      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw createApiError({
          code: 'not_found',
          message: 'Graph not found',
        });
      }

      throw createApiError({
        code: 'internal_server_error',
        message: error instanceof Error ? error.message : 'Failed to delete graph',
      });
    }
  }
);

export default app;
