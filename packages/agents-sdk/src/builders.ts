import {
  type CredentialReferenceApiInsert,
  CredentialReferenceApiInsertSchema,
  type MCPToolConfig,
  MCPToolConfigSchema,
} from '@inkeep/agents-core';
import { z } from 'zod';
import { Agent } from './agent';
import { ArtifactComponent } from './artifact-component';
import { DataComponent } from './data-component';
import { Tool } from './tool';
import type { AgentConfig, TransferConfig } from './types';

/**
 * Creates a new agent with stable ID enforcement.
 *
 * @param config - Agent configuration including required stable ID
 * @returns A new Agent instance
 * @throws Error if config.id is not provided (stable IDs are required)
 *
 * @example
 * ```typescript
 * const myAgent = agent({
 *   id: 'customer-support-agent',
 *   name: 'Customer Support',
 *   prompt: 'Help customers with their questions'
 * });
 * ```
 */
export function agent(config: AgentConfig): Agent {
  return new Agent(config);
}

export function credential(config: CredentialReferenceApiInsert) {
  return CredentialReferenceApiInsertSchema.parse(config);
}

// Separate schema for non-function properties
export const ToolConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.any()).optional(),
  schema: z.unknown().optional(),
});

// Keep the old schema name for backward compatibility, but make it clear it's partial
export const ToolSchema = ToolConfigSchema.extend({
  execute: z.any(), // Function - validated separately at runtime
});

/**
 * Creates a tool with automatic ID generation (unlike agents which require explicit IDs).
 *
 * Tools automatically generate IDs from their name, whereas agents require stable IDs
 * to be explicitly provided for consistency across deployments.
 *
 * @param config - Tool configuration with auto-generated ID
 * @returns A Tool instance with auto-generated ID based on name
 *
 * @example
 * ```typescript
 * const searchTool = tool({
 *   name: 'Search Database',
 *   description: 'Search the product database',
 *   execute: async (params) => { ... }
 * });
 * // ID will be auto-generated as 'search-database'
 * ```
 */
export function tool(config: {
  name: string;
  description: string;
  execute: (params: any) => Promise<any>;
  parameters?: Record<string, any>;
  schema?: z.ZodJSONSchema;
}) {
  // Validate function separately with clear error message
  if (typeof config.execute !== 'function') {
    throw new Error('execute must be a function');
  }

  // Validate non-function properties with schema
  const { execute, ...configWithoutFunction } = config;
  const validatedConfig = ToolConfigSchema.parse(configWithoutFunction);

  // Combine validated config with function
  const fullConfig = { ...validatedConfig, execute };

  // Return function tool format
  const computedId = fullConfig.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return {
    id: computedId,
    name: fullConfig.name,
    description: fullConfig.description,
    execute: fullConfig.execute,
    parameters: fullConfig.parameters,
    schema: fullConfig.schema,
    type: 'function' as const,
  };
}

// MCP Server Configuration Schema
export const McpServerConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string(),
  tenantId: z.string().optional(),

  // Deployment configuration
  deployment: z.enum(['local', 'remote']).optional(),

  // For local MCP servers
  port: z.number().optional(),

  // For remote MCP servers
  serverUrl: z.string().optional(),
  credential: CredentialReferenceApiInsertSchema.optional(),

  // Additional configuration
  parameters: z.record(z.string(), z.any()).optional(),
  transport: z.enum(['ipc', 'http', 'sse']).optional(),
  activeTools: z.array(z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

/**
 * Creates an MCP (Model Context Protocol) server for tool functionality.
 *
 * This unified builder replaces tool(), mcpTool(), ipcTool(), and hostedTool().
 * All tools are MCP servers - either local (with execute function) or remote (with URL).
 *
 * @param config - MCP server configuration
 * @returns An MCP server instance that can be used as a tool in agents
 *
 * @example
 * ```typescript
 * // Local MCP server with execute function (auto-wrapped via IPC)
 * const searchServer = mcpServer({
 *   name: 'search',
 *   description: 'Search the database',
 *   execute: async (params) => {
 *     // Implementation
 *     return results;
 *   }
 * });
 *
 * // Remote MCP server
 * const apiServer = mcpServer({
 *   name: 'external_api',
 *   description: 'External API service',
 *   serverUrl: 'https://api.example.com/mcp'
 * });
 * ```
 */
export function mcpServer(config: {
  // Basic configuration
  name: string;
  description: string;

  // Deployment configuration
  deployment?: 'local' | 'remote';

  // For local MCP servers
  execute?: (params: any) => Promise<any>;
  port?: number; // Optional fixed port, otherwise dynamically allocated

  // For remote MCP servers
  serverUrl?: string;

  // Additional configuration
  id?: string;
  parameters?: Record<string, z.ZodJSONSchema>;
  credential?: CredentialReferenceApiInsert;
  tenantId?: string;
  transport?: 'ipc' | 'http' | 'sse';
  activeTools?: string[];
  headers?: Record<string, string>;
}): Tool {
  // Auto-detect deployment type
  const deployment = config.deployment || (config.execute ? 'local' : 'remote');

  // Generate ID if not provided
  const id =
    config.id ||
    config.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  if (deployment === 'local') {
    // Local MCP server with execute function
    if (!config.execute) {
      throw new Error('Local MCP server requires an execute function');
    }

    throw new Error(
      'Local MCP servers are no longer supported. Please use remote MCP servers instead.'
    );
  } else {
    // Remote MCP server
    if (!config.serverUrl) {
      throw new Error('Remote MCP server requires a serverUrl');
    }

    // Use Tool class for remote MCP servers
    return new Tool({
      id,
      name: config.name,
      description: config.description,
      serverUrl: config.serverUrl,
      tenantId: config.tenantId,
      credential: config.credential as any,
      activeTools: config.activeTools,
      headers: config.headers,
    });
  }
}

export function mcpTool(config: MCPToolConfig): Tool {
  const validatedConfig = MCPToolConfigSchema.parse(config);
  return new Tool(validatedConfig as any);
}

// Separate schema for non-function transfer properties
export const TransferConfigSchema = z.object({
  agent: z.instanceof(Agent),
  description: z.string().optional(),
});

// Full schema for backward compatibility (but functions validated separately)
export const TransferSchema = TransferConfigSchema.extend({
  condition: z.any().optional(), // Function - validated separately at runtime when present
});

export function transfer(
  targetAgent: Agent,
  description?: string,
  condition?: (context: unknown) => boolean
): TransferConfig {
  // Validate function if provided
  if (condition !== undefined && typeof condition !== 'function') {
    throw new Error('condition must be a function when provided');
  }

  const config = {
    agent: targetAgent,
    description: description || `Hand off to ${targetAgent.getName()}`,
    condition,
  };

  // Validate the configuration (functions are validated separately above)
  return TransferSchema.parse(config);
}

export function agentRelation(
  targetAgent: string,
  relationType: 'transfer' | 'delegate' = 'transfer'
) {
  return {
    targetAgent,
    relationType,
  };
}

/**
 * Creates an artifact component with automatic ID generation.
 *
 * @param config - Artifact component configuration
 * @returns An ArtifactComponent instance with auto-generated ID
 *
 * @example
 * ```typescript
 * const productCard = artifactComponent({
 *   name: 'Product Card',
 *   description: 'Display product information',
 *   summaryProps: { title: 'Product', price: '$0' },
 *   fullProps: { title: 'Product', price: '$0', description: '...' }
 * });
 * ```
 */
export function artifactComponent(config: {
  name: string;
  description: string;
  summaryProps: Record<string, any>;
  fullProps: Record<string, any>;
  tenantId?: string;
  projectId?: string;
}): ArtifactComponent {
  return new ArtifactComponent({
    ...config,
    tenantId: config.tenantId || 'default',
    projectId: config.projectId || 'default',
  });
}

/**
 * Creates a data component with automatic ID generation.
 *
 * @param config - Data component configuration
 * @returns A DataComponent instance with auto-generated ID
 *
 * @example
 * ```typescript
 * const userProfile = dataComponent({
 *   name: 'User Profile',
 *   description: 'User profile data',
 *   props: { userId: '123', name: 'John Doe' }
 * });
 * ```
 */
export function dataComponent(config: {
  name: string;
  description: string;
  props: Record<string, any>;
  tenantId?: string;
  projectId?: string;
}): DataComponent {
  return new DataComponent({
    ...config,
    tenantId: config.tenantId || 'default',
    projectId: config.projectId || 'default',
  });
}
