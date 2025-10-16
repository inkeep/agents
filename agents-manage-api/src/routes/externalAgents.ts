import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createExternalAgent,
  deleteExternalAgent,
  ErrorResponseSchema,
  ExternalAgentApiInsertSchema,
  ExternalAgentApiUpdateSchema,
  ExternalAgentListResponse,
  ExternalAgentResponse,
  generateId,
  getExternalAgent,
  listExternalAgentsPaginated,
  PaginationQueryParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateExternalAgent,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List External Agents',
    operationId: 'list-external-agents',
    tags: ['External Agents'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of external agents retrieved successfully',
        content: {
          'application/json': {
            schema: ExternalAgentListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    const result = await listExternalAgentsPaginated(dbClient)({
      scopes: { tenantId, projectId },
      pagination: { page, limit },
    });
    // Add type field to all external agents in the response
    const dataWithType = {
      ...result,
      data: result.data.map((agent) => ({
        ...agent,
        type: 'external' as const,
      })),
    };

    return c.json(dataWithType);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get External Agent',
    operationId: 'get-external-agent-by-id',
    tags: ['External Agents'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'External agent found',
        content: {
          'application/json': {
            schema: ExternalAgentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const externalAgent = await getExternalAgent(dbClient)({
      scopes: { tenantId, projectId },
      externalAgentId: id,
    });

    if (!externalAgent) {
      throw createApiError({
        code: 'not_found',
        message: 'External agent not found',
      });
    }

    // Add type field to the external agent response
    const agentWithType = {
      ...externalAgent,
      type: 'external' as const,
    };

    return c.json({ data: agentWithType });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create External Agent',
    operationId: 'create-external-agent',
    tags: ['External Agents'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ExternalAgentApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'External agent created successfully',
        content: {
          'application/json': {
            schema: ExternalAgentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    const externalAgentData = {
      tenantId,
      projectId,
      agentId,
      id: body.id ? String(body.id) : generateId(),
      name: body.name,
      description: body.description,
      baseUrl: body.baseUrl,
      credentialReferenceId: body.credentialReferenceId || undefined,
      headers: body.headers || undefined,
    };

    const externalAgent = await createExternalAgent(dbClient)(externalAgentData);

    // Add type field to the external agent response
    const agentWithType = {
      ...externalAgent,
      type: 'external' as const,
    };

    return c.json({ data: agentWithType }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update External Agent',
    operationId: 'update-external-agent',
    tags: ['External Agents'],
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ExternalAgentApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'External agent updated successfully',
        content: {
          'application/json': {
            schema: ExternalAgentResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const updatedExternalAgent = await updateExternalAgent(dbClient)({
      scopes: { tenantId, projectId },
      externalAgentId: id,
      data: body,
    });

    if (!updatedExternalAgent) {
      throw createApiError({
        code: 'not_found',
        message: 'External agent not found',
      });
    }

    // Add type field to the external agent response
    const agentWithType = {
      ...updatedExternalAgent,
      type: 'external' as const,
    };

    return c.json({ data: agentWithType });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete External Agent',
    operationId: 'delete-external-agent',
    tags: ['External Agents'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      204: {
        description: 'External agent deleted successfully',
      },
      404: {
        description: 'External agent not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');

    const deleted = await deleteExternalAgent(dbClient)({
      scopes: { tenantId, projectId },
      externalAgentId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'External agent not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
