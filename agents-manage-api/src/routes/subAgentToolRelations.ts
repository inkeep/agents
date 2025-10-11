import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createAgentToolRelation,
  createApiError,
  deleteAgentToolRelation,
  ErrorResponseSchema,
  getAgentsForTool,
  getAgentToolRelationByAgent,
  getAgentToolRelationById,
  getAgentToolRelationByTool,
  ListResponseSchema,
  listAgentToolRelations,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  SubAgentToolRelationApiInsertSchema,
  SubAgentToolRelationApiSelectSchema,
  SubAgentToolRelationApiUpdateSchema,
  type SubAgentToolRelationSelect,
  TenantProjectAgentIdParamsSchema,
  TenantProjectAgentParamsSchema,
  updateAgentToolRelation,
} from '@inkeep/agents-core';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

// List subAgent tool relations
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List SubAgent Tool Relations',
    operationId: 'list-subagent-tool-relations',
    tags: ['SubAgent Tool Relations'],
    request: {
      params: TenantProjectAgentParamsSchema,
      query: PaginationQueryParamsSchema.extend({
        subAgentId: z.string().optional(),
        toolId: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: 'List of subAgent tool relations retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(SubAgentToolRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const { page, limit, subAgentId, toolId } = c.req.valid('query');

    let result: {
      data: SubAgentToolRelationSelect[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    };

    // Filter by subAgent if provided
    if (subAgentId) {
      const dbResult = await getAgentToolRelationByAgent(dbClient)({
        scopes: { tenantId, projectId, agentId, subAgentId },
        pagination: { page, limit },
      });
      result = {
        data: dbResult.data,
        pagination: dbResult.pagination,
      };
    }
    // Filter by tool if provided
    else if (toolId) {
      const dbResult = await getAgentToolRelationByTool(dbClient)({
        scopes: { tenantId, projectId, agentId },
        toolId,
        pagination: { page, limit },
      });
      result = {
        data: dbResult.data,
        pagination: dbResult.pagination,
      };
    }
    // Default: get all subAgent tool relations
    else {
      const dbResult = await listAgentToolRelations(dbClient)({
        scopes: { tenantId, projectId, agentId },
        pagination: { page, limit },
      });
      result = {
        data: dbResult.data,
        pagination: dbResult.pagination,
      };
    }

    return c.json(result);
  }
);

// Get subAgent tool relation by ID
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get SubAgent Tool Relation',
    operationId: 'get-subagent-tool-relation',
    tags: ['SubAgent Tool Relations'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'SubAgent tool relation found',
        content: {
          'application/json': {
            schema: SingleResponseSchema(SubAgentToolRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const agentToolRelation = await getAgentToolRelationById(dbClient)({
      scopes: { tenantId, projectId, agentId, subAgentId: id },
      relationId: id,
    });

    if (!agentToolRelation) {
      throw createApiError({
        code: 'not_found',
        message: 'SubAgent tool relation not found',
      });
    }

    return c.json({ data: agentToolRelation });
  }
);

// Get subAgents for a specific tool (with subAgent details)
app.openapi(
  createRoute({
    method: 'get',
    path: '/tool/{toolId}/sub-agents',
    summary: 'Get SubAgents for Tool',
    operationId: 'get-subagents-for-tool',
    tags: ['SubAgent Tool Relations'],
    request: {
      params: TenantProjectAgentParamsSchema.extend({
        toolId: z.string(),
      }),
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'SubAgents for tool retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(SubAgentToolRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, toolId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    const dbResult = await getAgentsForTool(dbClient)({
      scopes: { tenantId, projectId, agentId },
      toolId,
      pagination: { page, limit },
    });

    return c.json(dbResult);
  }
);

// Create subAgent tool relation
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create SubAgent Tool Relation',
    operationId: 'create-subagent-tool-relation',
    tags: ['SubAgent Tool Relations'],
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentToolRelationApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'SubAgent tool relation created successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(SubAgentToolRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const body = c.req.valid('json');

    // Check if relation already exists (prevent duplicates)
    const existingRelations = await listAgentToolRelations(dbClient)({
      scopes: { tenantId, projectId, agentId },
      pagination: { limit: 1000 },
    });
    const isDuplicate = existingRelations.data.some((relation) => {
      const typedRelation = relation as SubAgentToolRelationSelect;
      return typedRelation.subAgentId === body.subAgentId && typedRelation.toolId === body.toolId;
    });

    if (isDuplicate) {
      throw createApiError({
        code: 'unprocessable_entity',
        message: 'SubAgent tool relation already exists',
      });
    }

    try {
      const agentToolRelation = await createAgentToolRelation(dbClient)({
        scopes: { tenantId, projectId, agentId },
        data: body,
      });
      return c.json({ data: agentToolRelation }, 201);
    } catch (error) {
      // Handle foreign key constraint violations
      if (
        error instanceof Error &&
        (error.message.includes('FOREIGN KEY constraint failed') ||
          error.message.includes('foreign key constraint') ||
          error.message.includes('SQLITE_CONSTRAINT_FOREIGNKEY') ||
          (error as any).code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
          (error as any)?.cause?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY')
      ) {
        throw createApiError({
          code: 'bad_request',
          message: 'Invalid subAgent ID or tool ID - referenced entity does not exist',
        });
      }
      throw error;
    }
  }
);

// Update subAgent tool relation
app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update SubAgent Tool Relation',
    operationId: 'update-subagent-tool-relation',
    tags: ['SubAgent Tool Relations'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SubAgentToolRelationApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'SubAgent tool relation updated successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(SubAgentToolRelationApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    console.log('id', id);
    const body = await c.req.valid('json');

    // Check if there are any fields to update
    if (Object.keys(body).length === 0) {
      throw createApiError({
        code: 'bad_request',
        message: 'No fields to update',
      });
    }

    const updatedAgentToolRelation = await updateAgentToolRelation(dbClient)({
      scopes: { tenantId, projectId, agentId },
      relationId: id,
      data: body,
    });

    if (!updatedAgentToolRelation) {
      throw createApiError({
        code: 'not_found',
        message: 'SubAgent tool relation not found',
      });
    }

    return c.json({ data: updatedAgentToolRelation });
  }
);

// Delete subAgent tool relation
app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete SubAgent Tool Relation',
    operationId: 'delete-subagent-tool-relation',
    tags: ['SubAgent Tool Relations'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      204: {
        description: 'SubAgent tool relation deleted successfully',
      },
      404: {
        description: 'SubAgent tool relation not found',
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
    const deleted = await deleteAgentToolRelation(dbClient)({
      scopes: { tenantId, projectId, agentId },
      relationId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'SubAgent tool relation not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
