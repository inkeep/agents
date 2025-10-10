import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createSubAgent,
  deleteSubAgent,
  ErrorResponseSchema,
  getSubAgentById,
  ListResponseSchema,
  listSubAgentsPaginated,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  SubAgentApiInsertSchema,
  SubAgentApiSelectSchema,
  SubAgentApiUpdateSchema,
  TenantProjectAgentIdParamsSchema,
  TenantProjectAgentParamsSchema,
  updateSubAgent,
} from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List SubAgents',
    operationId: 'list-subagents',
    tags: ['SubAgent'],
    request: {
      params: TenantProjectAgentParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of subAgents retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(SubAgentApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);

    const result = await listSubAgentsPaginated(dbClient)({
      scopes: { tenantId, projectId, agentId },
      pagination: { page, limit },
    });
    // Add type field to all subAgents in the response
    const dataWithType = {
      ...result,
      data: result.data.map((subAgent) => ({
        ...subAgent,
        type: 'internal' as const,
      })),
    };

    return c.json(dataWithType);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get SubAgent',
    operationId: 'get-subagent-by-id',
    tags: ['SubAgent'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'SubAgent found',
        content: {
          'application/json': {
            schema: SingleResponseSchema(SubAgentApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const subAgent = await getSubAgentById(dbClient)({
      scopes: { tenantId, projectId, agentId },
      subAgentId: id,
    });

    if (!subAgent) {
      throw createApiError({
        code: 'not_found',
        message: 'SubAgent not found',
      });
    }

    // Add type field to the sub-agent response
    const subAgentWithType = {
      ...subAgent,
      type: 'internal' as const,
    };

    return c.json({ data: subAgentWithType });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create SubAgent',
    operationId: 'create-subagent',
    tags: ['SubAgent'],
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'SubAgent created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(SubAgentApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const body = c.req.valid('json');
    const subAgentId = body.id ? String(body.id) : nanoid();
    const subAgent = await createSubAgent(dbClient)({
      ...body,
      id: subAgentId,
      tenantId,
      projectId,
      agentId,
    });

    // Add type field to the sub-agent response
    const subAgentWithType = {
      ...subAgent,
      type: 'internal' as const,
    };

    return c.json({ data: subAgentWithType }, 201);
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update SubAgent',
    operationId: 'update-subagent',
    tags: ['SubAgent'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'SubAgent updated successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(SubAgentApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const updatedSubAgent = await updateSubAgent(dbClient)({
      scopes: { tenantId, projectId, agentId },
      subAgentId: id,
      data: body,
    });

    if (!updatedSubAgent) {
      throw createApiError({
        code: 'not_found',
        message: 'SubAgent not found',
      });
    }

    // Add type field to the sub-agent response
    const subAgentWithType = {
      ...updatedSubAgent,
      type: 'internal' as const,
    };

    return c.json({ data: subAgentWithType });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete SubAgent',
    operationId: 'delete-subagent',
    tags: ['SubAgent'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      204: {
        description: 'SubAgent deleted successfully',
      },
      404: {
        description: 'SubAgent not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');

    const deleted = await deleteSubAgent(dbClient)({
      scopes: { tenantId, projectId, agentId },
      subAgentId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'SubAgent not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
