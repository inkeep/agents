import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  type AgentsManageDatabaseClient,
  CredentialReferenceApiSelectSchema,
  CredentialReferenceResponse,
  commonGetErrorResponses,
  createApiError,
  createTool,
  dbResultToMcpTool,
  dbResultToMcpToolSkeleton,
  deleteTool,
  generateId,
  getToolById,
  getUserScopedCredentialReference,
  listTools,
  type McpTool,
  McpToolListResponse,
  McpToolResponse,
  PaginationQueryParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  ToolApiInsertSchema,
  ToolApiUpdateSchema,
  ToolStatusSchema,
  updateTool,
} from '@inkeep/agents-core';
import { z } from 'zod';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const logger = getLogger('tools');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

// Write operations require 'edit' permission on the project
app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return requireProjectPermission<{ Variables: ManageAppVariables }>('edit')(c, next);
  }
  return next();
});

app.use('/:id', async (c, next) => {
  if (c.req.method === 'PUT') {
    return requireProjectPermission<{ Variables: ManageAppVariables }>('edit')(c, next);
  }
  if (c.req.method === 'DELETE') {
    return requireProjectPermission<{ Variables: ManageAppVariables }>('edit')(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List MCP Tools',
    operationId: 'list-tools',
    tags: ['Tools'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema.extend({
        status: ToolStatusSchema.optional(),
        skipDiscovery: z
          .enum(['true', 'false'])
          .optional()
          .transform((val) => val === 'true')
          .describe('Skip MCP server discovery for faster response. Status will be "unknown".'),
      }),
    },
    responses: {
      200: {
        description: 'List of tools retrieved successfully',
        content: {
          'application/json': {
            schema: McpToolListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const db: AgentsManageDatabaseClient = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const { page, limit, status, skipDiscovery } = c.req.valid('query');

    let result: {
      data: McpTool[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    };
    const credentialStores = c.get('credentialStores');
    const userId = c.get('userId');

    // Fast path: skip MCP discovery, return skeleton data
    if (skipDiscovery) {
      const dbResult = await listTools(db)({
        scopes: { tenantId, projectId },
        pagination: { page, limit },
      });

      result = {
        data: dbResult.data.map((tool) => dbResultToMcpToolSkeleton(tool)),
        pagination: dbResult.pagination,
      };

      return c.json(result);
    }

    // Filter by status if provided
    if (status) {
      const dbResult = await listTools(db)({
        scopes: { tenantId, projectId },
        pagination: { page, limit },
      });
      result = {
        data: (
          await Promise.all(
            dbResult.data.map(
              async (tool) => await dbResultToMcpTool(tool, db, credentialStores, undefined, userId)
            )
          )
        ).filter((tool: McpTool) => tool.status === status),
        pagination: dbResult.pagination,
      };
    } else {
      // Use paginated results from operations
      const dbResult = await listTools(db)({
        scopes: { tenantId, projectId },
        pagination: { page, limit },
      });
      result = {
        data: await Promise.all(
          dbResult.data.map(
            async (tool) => await dbResultToMcpTool(tool, db, credentialStores, undefined, userId)
          )
        ),
        pagination: dbResult.pagination,
      };
    }

    return c.json(result);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get MCP Tool',
    operationId: 'get-tool',
    tags: ['Tools'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Tool found',
        content: {
          'application/json': {
            schema: McpToolResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const tool = await getToolById(db)({ scopes: { tenantId, projectId }, toolId: id });
    if (!tool) {
      throw createApiError({
        code: 'not_found',
        message: 'Tool not found',
      });
    }

    const credentialStores = c.get('credentialStores');
    const userId = c.get('userId');

    return c.json({
      data: await dbResultToMcpTool(tool, db, credentialStores, undefined, userId),
    });
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create MCP Tool',
    operationId: 'create-tool',
    tags: ['Tools'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ToolApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Tool created successfully',
        content: {
          'application/json': {
            schema: McpToolResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');
    const credentialStores = c.get('credentialStores');
    const userId = c.get('userId');

    logger.info({ body }, 'body');

    const id = body.id || generateId();

    const tool = await createTool(db)({
      tenantId,
      projectId,
      id,
      name: body.name,
      config: body.config,
      credentialReferenceId: body.credentialReferenceId,
      credentialScope: body.credentialScope,
      imageUrl: body.imageUrl,
      headers: body.headers,
      isWorkApp: body.isWorkApp,
    });

    return c.json(
      {
        data: await dbResultToMcpTool(tool, db, credentialStores, undefined, userId),
      },
      201
    );
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update MCP Tool',
    operationId: 'update-tool',
    tags: ['Tools'],
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ToolApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Tool updated successfully',
        content: {
          'application/json': {
            schema: McpToolResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');
    const credentialStores = c.get('credentialStores');
    const userId = c.get('userId');

    if (Object.keys(body).length === 0) {
      throw createApiError({
        code: 'bad_request',
        message: 'No fields to update',
      });
    }

    const updatedTool = await updateTool(db)({
      scopes: { tenantId, projectId },
      toolId: id,
      data: {
        name: body.name,
        config: body.config,
        credentialReferenceId: body.credentialReferenceId,
        credentialScope: body.credentialScope,
        imageUrl: body.imageUrl,
        headers: body.headers,
        isWorkApp: body.isWorkApp,
      },
    });

    if (!updatedTool) {
      throw createApiError({
        code: 'not_found',
        message: 'Tool not found',
      });
    }

    return c.json({
      data: await dbResultToMcpTool(updatedTool, db, credentialStores, undefined, userId),
    });
  }
);

// Get user-scoped credential for a tool
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/user-credential',
    summary: 'Get User Credential for MCP Tool',
    operationId: 'get-user-credential-for-tool',
    tags: ['Tools'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'User credential retrieved successfully',
        content: {
          'application/json': {
            schema: CredentialReferenceResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id: toolId } = c.req.valid('param');
    const db = c.get('db');
    const userId = c.get('userId');

    if (!userId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'User ID required for user-scoped credential lookup',
      });
    }

    const credential = await getUserScopedCredentialReference(db)({
      scopes: { tenantId, projectId },
      toolId,
      userId,
    });

    if (!credential) {
      throw createApiError({
        code: 'not_found',
        message: 'User credential not found for this tool',
      });
    }

    const validatedCredential = CredentialReferenceApiSelectSchema.parse(credential);
    return c.json({ data: validatedCredential });
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete MCP Tool',
    operationId: 'delete-tool',
    tags: ['Tools'],
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Tool deleted successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const deleted = await deleteTool(db)({ scopes: { tenantId, projectId }, toolId: id });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Tool not found',
      });
    }

    return c.body(null, 204);
  }
);

export default app;
