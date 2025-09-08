import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { CredentialStoreRegistry, AgentFrameworkServerConfig } from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { commonGetErrorResponses, createApiError } from '@inkeep/agents-core';
import { getLogger } from '../logger.js';
import {
  type McpTool,
  type McpToolStatus,
  ErrorResponseSchema,
  IdParamsSchema,
  ListResponseSchema,
  PaginationQueryParamsSchema,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  ToolStatusSchema,
  createTool,
  dbResultToMcpTool,
  deleteTool,
  getToolById,
  listTools,
  listToolsByStatus,
  updateTool,
  ToolApiInsertSchema,
  ToolApiUpdateSchema,
  McpToolSchema,
} from '@inkeep/agents-core';
import {
  checkAllToolsHealth,
  checkToolHealth,
  syncToolDefinitions,
  updateToolHealth,
} from '../data/tools.js';
import { oauthService } from '../utils/oauth-service.js';
import dbClient from '../data/db/dbClient.js';

type AppVariables = {
  serverConfig: AgentFrameworkServerConfig;
  credentialStores: CredentialStoreRegistry;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

// List tools
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Tools',
    operationId: 'list-tools',
    tags: ['CRUD Tools'],
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema.extend({
        status: ToolStatusSchema.optional(),
      }),
    },
    responses: {
      200: {
        description: 'List of tools retrieved successfully',
        content: {
          'application/json': {
            schema: ListResponseSchema(McpToolSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { page, limit, status } = c.req.valid('query');

    let result: {
      data: McpTool[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    };

    // Filter by status if provided
    if (status) {
      const tools = await listToolsByStatus(dbClient)({ scopes: { tenantId, projectId }, status });
      result = {
        data: tools.map((tool) => dbResultToMcpTool(tool)),
        pagination: {
          page: 1,
          limit: tools.length,
          total: tools.length,
          pages: 1,
        },
      };
    } else {
      // Use paginated results from crud operations
      const dbResult = await listTools(dbClient)({
        scopes: { tenantId, projectId },
        pagination: { page, limit },
      });
      result = {
        data: dbResult.data.map((tool) => dbResultToMcpTool(tool)),
        pagination: dbResult.pagination,
      };
    }

    return c.json(result);
  }
);

// Get tool by ID
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Tool',
    operationId: 'get-tool',
    tags: ['CRUD Tools'],
    request: {
      params: TenantProjectParamsSchema.extend(IdParamsSchema.shape),
    },
    responses: {
      200: {
        description: 'Tool found',
        content: {
          'application/json': {
            schema: SingleResponseSchema(McpToolSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const tool = await getToolById(dbClient)({ scopes: { tenantId, projectId }, toolId: id });

    if (!tool) {
      throw createApiError({
        code: 'not_found',
        message: 'Tool not found',
      });
    }

    return c.json({
      data: dbResultToMcpTool(tool),
    });
  }
);

// Create tool
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Tool',
    operationId: 'create-tool',
    tags: ['CRUD Tools'],
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
            schema: SingleResponseSchema(McpToolSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    getLogger().info({ body }, 'body');

    const id = body.id || nanoid();

    const tool = await createTool(dbClient)({
      tenantId,
      projectId,
      id,
      name: body.name,
      config: body.config,
      credentialReferenceId: body.credentialReferenceId,
      imageUrl: body.imageUrl,
      headers: body.headers,
    });

    return c.json(
      {
        data: dbResultToMcpTool(tool),
      },
      201
    );
  }
);

// Update tool
app.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    summary: 'Update Tool',
    operationId: 'update-tool',
    tags: ['CRUD Tools'],
    request: {
      params: TenantProjectParamsSchema.extend(IdParamsSchema.shape),
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
            schema: SingleResponseSchema(McpToolSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    // Check if there are any fields to update
    if (Object.keys(body).length === 0) {
      throw createApiError({
        code: 'bad_request',
        message: 'No fields to update',
      });
    }

    const updatedTool = await updateTool(dbClient)({
      scopes: { tenantId, projectId },
      toolId: id,
      data: {
        name: body.name,
        config: body.config,
        credentialReferenceId: body.credentialReferenceId,
        imageUrl: body.imageUrl,
        headers: body.headers,
      },
    });

    if (!updatedTool) {
      throw createApiError({
        code: 'not_found',
        message: 'Tool not found',
      });
    }

    return c.json({
      data: dbResultToMcpTool(updatedTool),
    });
  }
);

// Delete tool
app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Tool',
    operationId: 'delete-tool',
    tags: ['CRUD Tools'],
    request: {
      params: TenantProjectParamsSchema.extend(IdParamsSchema.shape),
    },
    responses: {
      204: {
        description: 'Tool deleted successfully',
      },
      404: {
        description: 'Tool not found',
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
    const deleted = await deleteTool(dbClient)({ scopes: { tenantId, projectId }, toolId: id });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Tool not found',
      });
    }

    return c.body(null, 204);
  }
);

// Health check single tool
app.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/health-check',
    summary: 'Check Tool Health',
    operationId: 'check-tool-health',
    tags: ['CRUD Tools'],
    request: {
      params: TenantProjectParamsSchema.extend(IdParamsSchema.shape),
    },
    responses: {
      200: {
        description: 'Tool health check completed',
        content: {
          'application/json': {
            schema: SingleResponseSchema(
              z.object({
                tool: McpToolSchema,
                healthCheck: z.object({
                  status: ToolStatusSchema,
                  error: z.string().optional(),
                }),
              })
            ),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const tool = await getToolById(dbClient)({ scopes: { tenantId, projectId }, toolId: id });

    if (!tool) {
      throw createApiError({
        code: 'not_found',
        message: 'Tool not found',
      });
    }

    const credentialStores = c.get('credentialStores');
    const healthResult = await checkToolHealth(dbResultToMcpTool(tool), credentialStores);

    const updatedTool = await updateToolHealth({
      tenantId,
      projectId,
      toolId: id,
      status: healthResult.status,
      error: healthResult.error,
    });

    return c.json({
      data: {
        tool: dbResultToMcpTool(updatedTool),
        healthCheck: healthResult,
      },
    });
  }
);

// Health check all tools for tenant
app.openapi(
  createRoute({
    method: 'post',
    path: '/health-check-all',
    summary: 'Check All Tools Health',
    operationId: 'check-all-tools-health',
    tags: ['CRUD Tools'],
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'All tools health check completed',
        content: {
          'application/json': {
            schema: SingleResponseSchema(
              z.object({
                total: z.number(),
                successful: z.number(),
                failed: z.number(),
                results: z.array(
                  z.object({
                    index: z.number(),
                    status: z.enum(['fulfilled', 'rejected']),
                    data: z.string().optional(),
                    error: z.string().optional(),
                  })
                ),
              })
            ),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const credentialStores = c.get('credentialStores');
    const results = await checkAllToolsHealth(tenantId, projectId, credentialStores);

    const summary = {
      total: results.length,
      successful: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
      results: results.map((result, index) => {
        const baseResult = {
          index,
          status: result.status,
        };

        if (result.status === 'fulfilled') {
          return {
            ...baseResult,
            data: `Tool ${index} health check completed`,
          };
        }

        return {
          ...baseResult,
          error: result.reason?.message || 'Unknown error',
        };
      }),
    };

    return c.json({ data: summary });
  }
);

// Sync tool definitions from MCP server
app.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/sync',
    summary: 'Sync Tool Definitions',
    operationId: 'sync-tool-definitions',
    tags: ['CRUD Tools'],
    request: {
      params: TenantProjectParamsSchema.extend(IdParamsSchema.shape),
    },
    responses: {
      200: {
        description: 'Tool definitions synchronized successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(McpToolSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');

    // Check if tool exists first
    const tool = await getToolById(dbClient)({ scopes: { tenantId, projectId }, toolId: id });
    if (!tool) {
      throw createApiError({
        code: 'not_found',
        message: 'Tool not found',
      });
    }

    const credentialStores = c.get('credentialStores');
    const updatedTool = await syncToolDefinitions({ tenantId, projectId, toolId: id, credentialStoreRegistry: credentialStores });

    return c.json({
      data: dbResultToMcpTool(updatedTool),
      message: 'Tool definitions synchronized successfully',
    });
  }
);

// Get available tools from MCP server (without storing)
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/available-tools',
    summary: 'Get Available Tools',
    operationId: 'get-available-tools',
    tags: ['CRUD Tools'],
    request: {
      params: TenantProjectParamsSchema.extend(IdParamsSchema.shape),
    },
    responses: {
      200: {
        description: 'Available tools retrieved successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(
              z.object({
                availableTools: z.array(
                  z.object({
                    name: z.string(),
                    description: z.string().optional(),
                    inputSchema: z.record(z.string(), z.unknown()).optional(),
                  })
                ),
                lastSync: z.string().optional(),
                status: ToolStatusSchema,
              })
            ),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const tool = await getToolById(dbClient)({ scopes: { tenantId, projectId }, toolId: id });

    if (!tool) {
      throw createApiError({
        code: 'not_found',
        message: 'Tool not found',
      });
    }

    return c.json({
      data: {
        availableTools: tool.availableTools || [],
        lastSync: tool.lastToolsSync || undefined,
        status: tool.status as McpToolStatus,
      },
    });
  }
);

// Enable/disable tool
app.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}/status',
    summary: 'Update Tool Status',
    operationId: 'update-tool-status',
    tags: ['CRUD Tools'],
    request: {
      params: TenantProjectParamsSchema.extend(IdParamsSchema.shape),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              status: ToolStatusSchema,
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Tool status updated successfully',
        content: {
          'application/json': {
            schema: SingleResponseSchema(McpToolSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const { status } = c.req.valid('json');

    const updatedTool = await updateToolHealth({
      tenantId,
      projectId,
      toolId: id,
      status: status,
    });

    return c.json({
      data: dbResultToMcpTool(updatedTool),
      message: `Tool status updated to ${status}`,
    });
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/oauth-login',
    summary: 'Initiate OAuth login for MCP tool',
    description: 'Detects OAuth requirements and redirects to authorization server',
    operationId: 'initiate-oauth-login',
    tags: ['Tools'],
    request: {
      params: TenantProjectParamsSchema.merge(IdParamsSchema),
    },
    responses: {
      302: {
        description: 'Redirect to OAuth authorization server',
      },
      400: {
        description: 'OAuth not supported or configuration error',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      404: {
        description: 'Tool not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      500: {
        description: 'Internal server error',
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
    const logger = getLogger('oauth-login');

    try {
      // 1. Get the tool
      const tool = await getToolById(dbClient)({ scopes: { tenantId, projectId }, toolId: id });

      if (!tool) {
        throw createApiError({
          code: 'not_found',
          message: 'Tool not found',
        });
      }

      const mcpTool = dbResultToMcpTool(tool);

      // 2. Initiate OAuth flow using centralized service
      const { redirectUrl } = await oauthService.initiateOAuthFlow({
        tool: mcpTool,
        tenantId,
        projectId,
        toolId: id,
      });

      // 4. Immediate redirect
      return c.redirect(redirectUrl, 302);
    } catch (error) {
      logger.error({ toolId: id, error }, 'OAuth login failed');

      if (error && typeof error === 'object' && 'code' in error) {
        const apiError = error as any;
        return c.json({ error: apiError.message }, apiError.code === 'not_found' ? 404 : 400);
      }

      return c.json(
        {
          error: 'Failed to initiate OAuth login',
        },
        500
      );
    }
  }
);

export default app;
