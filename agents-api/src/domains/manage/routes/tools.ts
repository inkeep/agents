import { OpenAPIHono } from '@hono/zod-openapi';
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
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { z } from 'zod';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import { oauthService } from '../../../utils/oauthService';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const logger = getLogger('tools');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

// Write operations require 'edit' permission on the project
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Tools',
    operationId: 'list-tools',
    tags: ['Tools'],
    permission: requireProjectPermission('view'),
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
  createProtectedRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Tool',
    operationId: 'get-tool',
    tags: ['Tools'],
    permission: requireProjectPermission('view'),
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
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Tool',
    operationId: 'create-tool',
    tags: ['Tools'],
    permission: requireProjectPermission('edit'),
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
  createProtectedRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Tool',
    operationId: 'update-tool',
    tags: ['Tools'],
    permission: requireProjectPermission('edit'),
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
  createProtectedRoute({
    method: 'get',
    path: '/{id}/user-credential',
    summary: 'Get User Credential for Tool',
    operationId: 'get-user-credential-for-tool',
    tags: ['Tools'],
    permission: requireProjectPermission('view'),
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
  createProtectedRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Tool',
    operationId: 'delete-tool',
    tags: ['Tools'],
    permission: requireProjectPermission('edit'),
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

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}/oauth/login',
    summary: 'Initiate OAuth login for MCP tool',
    description:
      'Detects OAuth requirements and redirects to the authorization server for the specified tool',
    operationId: 'initiate-tool-oauth-login',
    tags: ['Tools'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectIdParamsSchema,
      query: z.object({
        redirectAfter: z.string().url().optional(),
      }),
    },
    responses: {
      302: {
        description: 'Redirect to OAuth authorization server',
      },
      400: {
        description: 'OAuth not supported or configuration error',
        content: {
          'text/html': {
            schema: z.string(),
          },
        },
      },
      404: {
        description: 'Tool not found',
        content: {
          'text/html': {
            schema: z.string(),
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'text/html': {
            schema: z.string(),
          },
        },
      },
    },
  }),
  async (c) => {
    const { tenantId, projectId, id: toolId } = c.req.valid('param');
    const { redirectAfter } = c.req.valid('query');
    const userId = c.get('userId');
    const db = c.get('db');

    try {
      const tool = await getToolById(db)({ scopes: { tenantId, projectId }, toolId });

      if (!tool) {
        logger.error({ toolId, tenantId, projectId }, 'Tool not found for OAuth login');
        return c.text('Tool not found', 404);
      }

      const url = new URL(c.req.url);
      const baseUrl = `${url.protocol}//${url.host}`;
      const { redirectUrl } = await oauthService.initiateOAuthFlow({
        tenantId,
        projectId,
        toolId,
        mcpServerUrl: tool.config.mcp.server.url,
        baseUrl,
        redirectAfter,
        userId,
      });

      return c.redirect(redirectUrl, 302);
    } catch (error) {
      logger.error({ toolId, tenantId, projectId, error }, 'OAuth login failed');

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to initiate OAuth login';
      return c.text(`OAuth Error: ${errorMessage}`, 500);
    }
  }
);

export default app;
