import {
  type CredentialReferenceApiInsert,
  CredentialReferenceApiInsertSchema,
  type MCPToolConfig,
  MCPToolConfigSchema,
} from '@inkeep/agents-core';
import { Agent } from './agent';
import { ArtifactComponent } from './artifact-component';
import type {
  AgentMcpConfig,
  ArtifactComponentConfig,
  DataComponentConfig,
  MCPServerConfig,
} from './builders';
import { DataComponent } from './data-component';
import { AgentGraph } from './graph';
import { Tool } from './tool';
import type { AgentConfig, GraphConfig } from './types';
import { generateIdFromName } from './utils/generateIdFromName';

/**
 * Helper function to create graphs - OpenAI style
 */

export function agentGraph(config: GraphConfig): AgentGraph {
  return new AgentGraph(config);
}

// ============================================================================
// Agent Builders
// ============================================================================
/**
 * Creates a new agent with stable ID enforcement.
 *
 * Agents require explicit stable IDs to ensure consistency across deployments.
 * This is different from tools which auto-generate IDs from their names.
 *
 * @param config - Agent configuration including required stable ID
 * @returns A new Agent instance
 * @throws {Error} If config.id is not provided
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
  if (!config.id) {
    throw new Error(
      'Agent ID is required. Agents must have stable IDs for consistency across deployments.'
    );
  }
  return new Agent(config);
} // ============================================================================
// Credential Builders
// ============================================================================
/**
 * Creates a credential reference for authentication.
 *
 * Credentials are used to authenticate with external services.
 * They should be stored securely and referenced by ID.
 *
 * @param config - Credential configuration
 * @returns A validated credential reference
 *
 * @example
 * ```typescript
 * const apiCredential = credential({
 *   id: 'github-token',
 *   type: 'bearer',
 *   value: process.env.GITHUB_TOKEN
 * });
 * ```
 */

export function credential(config: CredentialReferenceApiInsert) {
  return CredentialReferenceApiInsertSchema.parse(config);
} // ============================================================================
// Tool Builders
// ============================================================================
/**
 * Creates an MCP (Model Context Protocol) server for tool functionality.
 *
 * MCP servers provide tool functionality through a standardized protocol.
 * They can be remote services accessed via HTTP/WebSocket.
 *
 * @param config - MCP server configuration
 * @returns A Tool instance configured as an MCP server
 * @throws {Error} If serverUrl is not provided
 *
 * @example
 * ```typescript
 * // Remote MCP server
 * const apiServer = mcpServer({
 *   name: 'external_api',
 *   description: 'External API service',
 *   serverUrl: 'https://api.example.com/mcp'
 * });
 *
 * // With authentication
 * const secureServer = mcpServer({
 *   name: 'secure_api',
 *   description: 'Secure API service',
 *   serverUrl: 'https://secure.example.com/mcp',
 *   credential: credential({
 *     id: 'api-key',
 *     type: 'bearer',
 *     value: process.env.API_KEY
 *   })
 * });
 * ```
 */

export function mcpServer(config: MCPServerConfig): Tool {
  if (!config.serverUrl) {
    throw new Error('MCP server requires a serverUrl');
  }

  // Generate ID if not provided
  const id = config.id || generateIdFromName(config.name);

  // Create Tool instance for MCP server
  return new Tool({
    id,
    name: config.name,
    description: config.description,
    serverUrl: config.serverUrl,
    tenantId: config.tenantId,
    credential: config.credential,
    activeTools: config.activeTools,
    headers: config.headers,
    imageUrl: config.imageUrl,
    transport: config.transport ? { type: config.transport } : undefined,
  } as MCPToolConfig);
}
/**
 * Creates an MCP tool from a raw configuration object.
 *
 * This is a low-level builder for advanced use cases where you need
 * full control over the MCPToolConfig. For most cases, use `mcpServer()`.
 *
 * @param config - Complete MCP tool configuration
 * @returns A Tool instance
 *
 * @example
 * ```typescript
 * const customTool = mcpTool({
 *   id: 'custom-tool',
 *   name: 'Custom Tool',
 *   serverUrl: 'https://example.com/mcp',
 *   transport: { type: 'stdio' }
 * });
 * ```
 */

export function mcpTool(config: MCPToolConfig): Tool {
  // Generate ID if not provided
  const configWithId = {
    ...config,
    id: config.id || generateIdFromName(config.name),
  };
  const validatedConfig = MCPToolConfigSchema.parse(configWithId);
  return new Tool(validatedConfig);
}

// ============================================================================
// Component Builders
// ============================================================================
/**
 * Creates an artifact component with automatic ID generation.
 *
 * Artifact components represent structured UI components that can
 * be rendered with different levels of detail (summary vs full).
 *
 * @param config - Artifact component configuration
 * @returns An ArtifactComponent instance
 *
 * @example
 * ```typescript
 * const productCard = artifactComponent({
 *   name: 'Product Card',
 *   description: 'Display product information',
 *   summaryProps: {
 *     title: 'Product',
 *     price: '$0'
 *   },
 *   fullProps: {
 *     title: 'Product',
 *     price: '$0',
 *     description: 'Product description',
 *     image: 'product.jpg'
 *   }
 * });
 * ```
 */

export function artifactComponent(config: ArtifactComponentConfig): ArtifactComponent {
  return new ArtifactComponent({
    ...config,
    tenantId: config.tenantId || 'default',
    projectId: config.projectId || 'default',
  });
}
/**
 * Creates a data component with automatic ID generation.
 *
 * Data components represent structured data that can be
 * passed between agents or used in processing.
 *
 * @param config - Data component configuration
 * @returns A DataComponent instance
 *
 * @example
 * ```typescript
 * const userProfile = dataComponent({
 *   name: 'User Profile',
 *   description: 'User profile data',
 *   props: {
 *     userId: '123',
 *     name: 'John Doe',
 *     email: 'john@example.com'
 *   }
 * });
 * ```
 */

export function dataComponent(config: DataComponentConfig): DataComponent {
  return new DataComponent({
    ...config,
    tenantId: config.tenantId || 'default',
    projectId: config.projectId || 'default',
  });
}

export function agentMcp(config: AgentMcpConfig): AgentMcpConfig {
  return {
    server: config.server,
    selectedTools: config.selectedTools,
  };
}
