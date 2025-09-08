import { getLogger } from '../logger';
import dbClient from './db/dbClient';

import {
  type McpServerConfig,
  type McpSSEConfig,
  type McpStreamableHttpConfig,
  type ToolUpdate,
  type MCPToolConfig,
  type McpServerCapabilities,
  type McpTool,
  type McpToolDefinition,
  type McpToolStatus,
  McpClient,
  CredentialStuffer,
  getCredentialReference,
  updateTool,
  dbResultToMcpTool,
  listTools,
  getToolById,
  detectAuthenticationRequired,
  ContextResolver,
  type CredentialStoreRegistry,
} from '@inkeep/agents-core';

/**
 * Extract input schema from MCP tool definition, handling multiple formats
 * Different MCP servers may use different schema structures:
 * - inputSchema (direct) - e.g., Notion MCP
 * - parameters.properties - e.g., some other MCP servers
 * - parameters (direct) - alternative format
 * - schema - another possible location
 */
function extractInputSchema(toolDef: any): any {
  // Try different possible locations for the input schema
  if (toolDef.inputSchema) {
    return toolDef.inputSchema;
  }

  if (toolDef.parameters?.properties) {
    return toolDef.parameters.properties;
  }

  if (toolDef.parameters && typeof toolDef.parameters === 'object') {
    return toolDef.parameters;
  }

  if (toolDef.schema) {
    return toolDef.schema;
  }

  // If none found, return empty object
  return {};
}

const logger = getLogger('tools');

// Helper function to convert McpTool to MCPToolConfig format for CredentialStuffer
const convertToMCPToolConfig = (tool: McpTool): MCPToolConfig => {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.name, // Use name as description fallback
    serverUrl: tool.config.mcp.server.url,
    mcpType: tool.config.mcp.server.url.includes('api.nango.dev') ? 'nango' : 'generic',
    transport: tool.config.mcp.transport,
    headers: tool.headers,
  };
};

// Health checking and monitoring
export const updateToolHealth = async ({
  tenantId,
  projectId,
  toolId,
  status,
  error,
}: {
  tenantId: string;
  projectId: string;
  toolId: string;
  status: McpToolStatus;
  error?: string;
}) => {
  const now = new Date().toISOString();
  const updateData: Partial<ToolUpdate> = {
    status,
    lastHealthCheck: now,
    updatedAt: now,
  };

  if (error !== undefined) {
    updateData.lastError = error;
  }

  const tool = await updateTool(dbClient)({
    scopes: { tenantId, projectId },
    toolId,
    data: updateData,
  });

  return tool;
};

export const checkToolHealth = async (
  tool: McpTool,
  credentialStoreRegistry?: CredentialStoreRegistry
): Promise<{
  status: McpToolStatus;
  error?: string;
  capabilities?: McpServerCapabilities;
}> => {
  try {
    const transportType = tool.config.mcp.transport?.type || 'streamable_http';
    const baseConfig = {
      url: tool.config.mcp.server.url,
    };

    const credentialReferenceId = tool.credentialReferenceId;
    let serverConfig: McpServerConfig;

    // Build server config with credentials if available
    if (credentialReferenceId) {
      // Get credential store configuration
      const credentialReference = await getCredentialReference(dbClient)({
        scopes: { tenantId: tool.tenantId, projectId: tool.projectId },
        id: credentialReferenceId,
      });

      if (!credentialReference) {
        throw new Error(`Credential store not found: ${credentialReferenceId}`);
      }

      const storeReference = {
        credentialStoreId: credentialReference.credentialStoreId,
        retrievalParams: credentialReference.retrievalParams || {},
      };

      // Use CredentialStuffer to build proper config with auth headers
      if (!credentialStoreRegistry) {
        throw new Error('CredentialStoreRegistry is required for authenticated tools');
      }
      const contextResolver = new ContextResolver(
        tool.tenantId,
        tool.projectId,
        dbClient,
        credentialStoreRegistry
      );
      const credentialStuffer = new CredentialStuffer(credentialStoreRegistry, contextResolver);
      serverConfig = await credentialStuffer.buildMcpServerConfig(
        { tenantId: tool.tenantId, projectId: tool.projectId },
        convertToMCPToolConfig(tool),
        storeReference
      );
    } else {
      if (transportType === 'sse') {
        serverConfig = {
          type: 'sse',
          url: baseConfig.url,
          activeTools: tool.config.mcp.activeTools,
          eventSourceInit: tool.config.mcp.transport?.eventSourceInit,
        } as McpSSEConfig;
      } else {
        serverConfig = {
          type: 'streamable_http',
          url: baseConfig.url,
          activeTools: tool.config.mcp.activeTools,
          requestInit: tool.config.mcp.transport?.requestInit,
          eventSourceInit: tool.config.mcp.transport?.eventSourceInit,
          reconnectionOptions: tool.config.mcp.transport?.reconnectionOptions,
          sessionId: tool.config.mcp.transport?.sessionId,
        } as McpStreamableHttpConfig;
      }
    }

    const client = new McpClient({
      name: tool.name,
      server: serverConfig,
    });

    await client.connect();

    // Try to list tools to verify connection
    await client.tools();

    await client.disconnect();

    return {
      status: 'healthy',
      capabilities: {
        tools: true,
        resources: false, // Could be enhanced to check actual capabilities
        prompts: false,
        logging: false,
      },
    };
  } catch (error) {
    logger.error({ toolId: tool.id, error }, 'Tool health check failed');

    // Check if error indicates authentication is required
    if (error instanceof Error && (await detectAuthenticationRequired(tool, error))) {
      return {
        status: 'needs_auth',
        error: 'Authentication required - OAuth login needed',
      };
    }

    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Tool discovery
export const discoverToolsFromServer = async (
  tool: McpTool,
  credentialStoreRegistry?: CredentialStoreRegistry
): Promise<McpToolDefinition[]> => {
  try {
    const credentialReferenceId = tool.credentialReferenceId;
    let serverConfig: McpServerConfig;

    // Build server config with credentials if available
    if (credentialReferenceId) {
      // Get credential store configuration
      const credentialReference = await getCredentialReference(dbClient)({
        scopes: { tenantId: tool.tenantId, projectId: tool.projectId },
        id: credentialReferenceId,
      });

      if (!credentialReference) {
        throw new Error(`Credential store not found: ${credentialReferenceId}`);
      }

      const storeReference = {
        credentialStoreId: credentialReference.credentialStoreId,
        retrievalParams: credentialReference.retrievalParams || {},
      };

      // Use CredentialStuffer to build proper config with auth headers
      if (!credentialStoreRegistry) {
        throw new Error('CredentialStoreRegistry is required for authenticated tools');
      }
      const contextResolver = new ContextResolver(
        tool.tenantId,
        tool.projectId,
        dbClient,
        credentialStoreRegistry
      );
      const credentialStuffer = new CredentialStuffer(credentialStoreRegistry, contextResolver);
      serverConfig = (await credentialStuffer.buildMcpServerConfig(
        { tenantId: tool.tenantId, projectId: tool.projectId },
        convertToMCPToolConfig(tool),
        storeReference
      )) as McpServerConfig;
    } else {
      // No credentials - build basic config
      const transportType = tool.config.mcp.transport?.type || 'streamable_http';
      if (transportType === 'sse') {
        serverConfig = {
          type: 'sse',
          url: tool.config.mcp.server.url,
          activeTools: tool.config.mcp.activeTools,
          eventSourceInit: tool.config.mcp.transport?.eventSourceInit,
        } as McpSSEConfig;
      } else {
        serverConfig = {
          type: 'streamable_http',
          url: tool.config.mcp.server.url,
          activeTools: tool.config.mcp.activeTools,
          requestInit: tool.config.mcp.transport?.requestInit,
          eventSourceInit: tool.config.mcp.transport?.eventSourceInit,
          reconnectionOptions: tool.config.mcp.transport?.reconnectionOptions,
          sessionId: tool.config.mcp.transport?.sessionId,
        } as McpStreamableHttpConfig;
      }
    }

    const client = new McpClient({
      name: tool.name,
      server: serverConfig,
    });

    await client.connect();

    // Get tools from the MCP client
    const serverTools = await client.tools();

    await client.disconnect();

    // Convert to our format
    const toolDefinitions: McpToolDefinition[] = Object.entries(serverTools).map(
      ([name, toolDef]) => ({
        name,
        description: (toolDef as any).description || '',
        inputSchema: extractInputSchema(toolDef as any),
      })
    );

    return toolDefinitions;
  } catch (error) {
    logger.error({ toolId: tool.id, error }, 'Tool discovery failed');
    throw error;
  }
};

export const syncToolDefinitions = async ({
  tenantId,
  projectId,
  toolId,
  credentialStoreRegistry,
}: {
  tenantId: string;
  projectId: string;
  toolId: string;
  credentialStoreRegistry?: CredentialStoreRegistry;
}) => {
  const tool = await getToolById(dbClient)({ scopes: { tenantId, projectId }, toolId });
  if (!tool) {
    throw new Error(`Tool ${toolId} not found`);
  }

  const mcpTool = dbResultToMcpTool(tool);

  try {
    const availableTools = await discoverToolsFromServer(mcpTool, credentialStoreRegistry);

    const updatedTool = await updateTool(dbClient)({
      scopes: { tenantId, projectId },
      toolId,
      data: {
        availableTools,
        lastToolsSync: new Date().toISOString(),
        status: 'healthy',
        updatedAt: new Date().toISOString(),
      },
    });

    return updatedTool;
  } catch (error) {
    const toolNeedsAuth =
      error instanceof Error && (await detectAuthenticationRequired(mcpTool, error));

    const now = new Date().toISOString();

    const updatedTool = await updateTool(dbClient)({
      scopes: { tenantId, projectId },
      toolId,
      data: {
        availableTools: [],
        lastToolsSync: new Date().toISOString(),
        status: toolNeedsAuth ? 'needs_auth' : 'unhealthy',
        lastError: toolNeedsAuth
          ? 'Authentication required - OAuth login needed'
          : error instanceof Error
            ? error.message
            : 'Tool sync failed',
        lastHealthCheck: now,
        updatedAt: now,
      },
    });
    return updatedTool;
  }
};

// Bulk health checking
export const checkAllToolsHealth = async (
  tenantId: string,
  projectId: string,
  credentialStoreRegistry?: CredentialStoreRegistry
) => {
  const toolsList = await listTools(dbClient)({ scopes: { tenantId, projectId } });

  const results = await Promise.allSettled(
    toolsList.data.map(async (tool) => {
      const healthResult = await checkToolHealth(dbResultToMcpTool(tool), credentialStoreRegistry);
      return await updateToolHealth({
        tenantId,
        projectId: tool.projectId,
        toolId: tool.id,
        status: healthResult.status,
        error: healthResult.error,
      });
    })
  );

  return results;
};
