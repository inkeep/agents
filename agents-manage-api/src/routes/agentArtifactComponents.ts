import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  AgentArtifactComponentApiInsertSchema,
  AgentArtifactComponentApiSelectSchema,
  ArtifactComponentApiSelectSchema,
  associateArtifactComponentWithAgent,
  commonGetErrorResponses,
  createApiError,
  ErrorResponseSchema,
  ExistsResponseSchema,
  getAgentById,
  getAgentsUsingArtifactComponent,
  getArtifactComponentById,
  getArtifactComponentsForAgent,
  isArtifactComponentAssociatedWithAgent,
  RemovedResponseSchema,
  removeArtifactComponentFromAgent,
  SingleResponseSchema,
  TenantProjectGraphParamsSchema,
} from '@inkeep/agents-core';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

// List artifact components for a specific agent in a graph
app.openapi(
  createRoute({
    method: 'get',
    path: '/agent/:agentId',
    summary: 'Get Artifact Components for Agent',
    operationId: 'get-artifact-components-for-agent',
    tags: ['Agent Artifact Component Relations'],
    request: {
      params: TenantProjectGraphParamsSchema.extend({
        agentId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Artifact components retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(ArtifactComponentApiSelectSchema),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId, agentId } = c.req.valid('param');

    const artifactComponents = await getArtifactComponentsForAgent(dbClient)({
      scopes: { tenantId, projectId, graphId, agentId },
    });

    return c.json({
      data: artifactComponents,
    });
  }
);

// List agents using a specific artifact component
app.openapi(
  createRoute({
    method: 'get',
    path: '/component/:artifactComponentId/agents',
    summary: 'Get Agents Using Artifact Component',
    operationId: 'get-agents-using-artifact-component',
    tags: ['Agent Artifact Component Relations'],
    request: {
      params: TenantProjectGraphParamsSchema.extend({
        artifactComponentId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Agents retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(
                z.object({
                  agentId: z.string(),
                  createdAt: z.string(),
                })
              ),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, artifactComponentId } = c.req.valid('param');

    const agents = await getAgentsUsingArtifactComponent(dbClient)({
      scopes: { tenantId, projectId },
      artifactComponentId,
    });

    return c.json({ data: agents });
  }
);

// Create agent artifact component association
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Associate Artifact Component with Agent',
    operationId: 'associate-artifact-component-with-agent',
    tags: ['Agent Artifact Component Relations'],
    request: {
      params: TenantProjectGraphParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: AgentArtifactComponentApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Agent artifact component association created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(AgentArtifactComponentApiSelectSchema),
          },
        },
      },
      409: {
        description: 'Association already exists',
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
    const { tenantId, projectId, graphId } = c.req.valid('param');
    const { agentId, artifactComponentId } = c.req.valid('json');

    // Validate that both agent and artifact component exist before creating association
    const agent = await getAgentById(dbClient)({
      scopes: { tenantId, projectId, graphId },
      agentId,
    });
    const artifactComponent = await getArtifactComponentById(dbClient)({
      scopes: { tenantId, projectId },
      id: artifactComponentId,
    });

    if (!agent) {
      throw createApiError({
        code: 'not_found',
        message: `Agent with id '${agentId}' not found`,
      });
    }

    if (!artifactComponent) {
      throw createApiError({
        code: 'not_found',
        message: `Artifact component with id '${artifactComponentId}' not found`,
      });
    }

    // Check if association already exists
    const exists = await isArtifactComponentAssociatedWithAgent(dbClient)({
      scopes: { tenantId, projectId, graphId, agentId },
      artifactComponentId,
    });

    if (exists) {
      throw createApiError({
        code: 'conflict',
        message: 'Agent artifact component association already exists',
      });
    }

    const association = await associateArtifactComponentWithAgent(dbClient)({
      scopes: { tenantId, projectId, graphId, agentId },
      artifactComponentId,
    });

    return c.json({ data: association }, 201);
  }
);

// Remove agent artifact component association
app.openapi(
  createRoute({
    method: 'delete',
    path: '/agent/:agentId/component/:artifactComponentId',
    summary: 'Remove Artifact Component from Agent',
    operationId: 'remove-artifact-component-from-agent',
    tags: ['Agent Artifact Component Relations'],
    request: {
      params: TenantProjectGraphParamsSchema.extend({
        agentId: z.string(),
        artifactComponentId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Association removed successfully',
        content: {
          'application/json': {
            schema: RemovedResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId, agentId, artifactComponentId } = c.req.valid('param');

    const removed = await removeArtifactComponentFromAgent(dbClient)({
      scopes: { tenantId, projectId, graphId, agentId },
      artifactComponentId,
    });

    if (!removed) {
      throw createApiError({
        code: 'not_found',
        message: 'Agent artifact component association not found',
      });
    }

    return c.json({
      message: 'Association removed successfully',
      removed: true,
    });
  }
);

// Check if artifact component is associated with agent
app.openapi(
  createRoute({
    method: 'get',
    path: '/agent/:agentId/component/:artifactComponentId/exists',
    summary: 'Check if Artifact Component is Associated with Agent',
    operationId: 'check-artifact-component-agent-association',
    tags: ['Agent Artifact Component Relations'],
    request: {
      params: TenantProjectGraphParamsSchema.extend({
        agentId: z.string(),
        artifactComponentId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Association status retrieved successfully',
        content: {
          'application/json': {
            schema: ExistsResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, graphId, agentId, artifactComponentId } = c.req.valid('param');

    const exists = await isArtifactComponentAssociatedWithAgent(dbClient)({
      scopes: { tenantId, projectId, graphId, agentId },
      artifactComponentId,
    });

    return c.json({ exists });
  }
);

export default app;
