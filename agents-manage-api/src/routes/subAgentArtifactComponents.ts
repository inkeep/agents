import { createRoute } from '@hono/zod-openapi';
import {
  ArtifactComponentArrayResponse,
  associateArtifactComponentWithAgent,
  ComponentAssociationListResponse,
  commonGetErrorResponses,
  createApiError,
  ErrorResponseSchema,
  ExistsResponseSchema,
  getAgentsUsingArtifactComponent,
  getArtifactComponentById,
  getArtifactComponentsForAgent,
  getSubAgentById,
  isArtifactComponentAssociatedWithAgent,
  RemovedResponseSchema,
  removeArtifactComponentFromAgent,
  SubAgentArtifactComponentApiInsertSchema,
  SubAgentArtifactComponentResponse,
  TenantProjectAgentParamsSchema,
  TenantProjectAgentSubAgentParamsSchema,
} from '@inkeep/agents-core';
import { z } from 'zod';
import { createAppWithDb } from '../utils/apps';

const app = createAppWithDb();

app.openapi(
  createRoute({
    method: 'get',
    path: '/agent/{subAgentId}',
    summary: 'Get Artifact Components for Agent',
    operationId: 'get-artifact-components-for-agent',
    tags: ['Agent Artifact Component Relations'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema,
    },
    responses: {
      200: {
        description: 'Artifact components retrieved successfully',
        content: {
          'application/json': {
            schema: ArtifactComponentArrayResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId } = c.req.valid('param');

    const artifactComponents = await getArtifactComponentsForAgent(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
    });

    return c.json({
      data: artifactComponents,
    });
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/component/{artifactComponentId}/agents',
    summary: 'Get Agents Using Artifact Component',
    operationId: 'get-agents-using-artifact-component',
    tags: ['Agent Artifact Component Relations'],
    request: {
      params: TenantProjectAgentParamsSchema.extend({
        artifactComponentId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Agents retrieved successfully',
        content: {
          'application/json': {
            schema: ComponentAssociationListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, artifactComponentId } = c.req.valid('param');

    const agents = await getAgentsUsingArtifactComponent(db)({
      scopes: { tenantId, projectId },
      artifactComponentId,
    });

    return c.json({ data: agents });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Associate Artifact Component with Agent',
    operationId: 'associate-artifact-component-with-agent',
    tags: ['Agent Artifact Component Relations'],
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentArtifactComponentApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Agent artifact component association created successfully',
        content: {
          'application/json': {
            schema: SubAgentArtifactComponentResponse,
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
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const { subAgentId, artifactComponentId } = c.req.valid('json');

    const agent = await getSubAgentById(db)({
      scopes: { tenantId, projectId, agentId },
      subAgentId,
    });
    const artifactComponent = await getArtifactComponentById(db)({
      scopes: { tenantId, projectId },
      id: artifactComponentId,
    });

    if (!agent) {
      throw createApiError({
        code: 'not_found',
        message: `Agent with id '${subAgentId}' not found`,
      });
    }

    if (!artifactComponent) {
      throw createApiError({
        code: 'not_found',
        message: `Artifact component with id '${artifactComponentId}' not found`,
      });
    }

    const exists = await isArtifactComponentAssociatedWithAgent(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      artifactComponentId,
    });

    if (exists) {
      throw createApiError({
        code: 'conflict',
        message: 'Agent artifact component association already exists',
      });
    }

    const association = await associateArtifactComponentWithAgent(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      artifactComponentId,
    });

    return c.json({ data: association }, 201);
  }
);

// Remove agent artifact component association
app.openapi(
  createRoute({
    method: 'delete',
    path: '/agent/{subAgentId}/component/{artifactComponentId}',
    summary: 'Remove Artifact Component from Agent',
    operationId: 'remove-artifact-component-from-agent',
    tags: ['Agent Artifact Component Relations'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema.extend({
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
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId, artifactComponentId } = c.req.valid('param');

    const removed = await removeArtifactComponentFromAgent(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
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

app.openapi(
  createRoute({
    method: 'get',
    path: '/agent/{subAgentId}/component/{artifactComponentId}/exists',
    summary: 'Check if Artifact Component is Associated with Agent',
    operationId: 'check-artifact-component-agent-association',
    tags: ['Agent Artifact Component Relations'],
    request: {
      params: TenantProjectAgentSubAgentParamsSchema.extend({
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
    const db = c.get('db');
    const { tenantId, projectId, agentId, subAgentId, artifactComponentId } = c.req.valid('param');

    const exists = await isArtifactComponentAssociatedWithAgent(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
      artifactComponentId,
    });

    return c.json({ exists });
  }
);

export default app;
