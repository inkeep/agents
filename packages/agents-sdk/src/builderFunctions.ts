import {
  type CredentialReferenceApiInsert,
  CredentialReferenceApiInsertSchema,
  type MCPToolConfig,
  MCPToolConfigSchema,
} from '@inkeep/agents-core';
import { SubAgent } from './subAgent';
import { ArtifactComponent } from './artifact-component';
import type {
  AgentMcpConfig,
  ArtifactComponentConfig,
  DataComponentConfig,
  MCPServerConfig,
} from './builders';
import { DataComponent } from './data-component';
import { FunctionTool } from './function-tool';
import { Agent } from './agent';
import type { ProjectConfig } from './project';
import { Project } from './project';
import { Tool } from './tool';
import type { FunctionToolConfig, AgentConfig, SubAgentConfig } from './types';
import { generateIdFromName } from './utils/generateIdFromName';

/**
 * Helper function to create agent - OpenAI style
 */

export function agent(config: AgentConfig): Agent {
  return new Agent(config);
}

/**
 * Helper function to create projects - OpenAI style
 *
 * Projects are the top-level organizational unit that contains agent, agents, and shared configurations.
 * They provide model inheritance and execution limits that cascade down to agent and agents.
 *
 * @param config - Project configuration
 * @returns A new Project instance
 *
 * @example
 * ```typescript
 * const customerSupport = project({
 *   id: 'customer-support-project',
 *   name: 'Customer Support System',
 *   description: 'Multi-agent customer support system',
 *   models: {
 *     base: { model: 'gpt-4.1-mini' },
 *     structuredOutput: { model: 'gpt-4.1' }
 *   },
 *   stopWhen: {
 *     transferCountIs: 10,
 *     stepCountIs: 50
 *   },
 *   agent: () => [
 *     agent({
 *       id: 'support-agent',
 *       name: 'Support Agent',
 *       // ... agent config
 *     })
 *   ]
 * });
 * ```
 */
export function project(config: ProjectConfig): Project {
  return new Project(config);
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

export function subAgent(config: SubAgentConfig): SubAgent {
  if (!config.id) {
    throw new Error(
      'Sub-Agent ID is required. Sub-Agents must have stable IDs for consistency across deployments.'
    );
  }
  return new SubAgent(config);
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
    credential: config.credential,
    activeTools: config.activeTools,
    headers: config.headers,
    imageUrl: config.imageUrl,
    transport: config.transport
      ? { type: config.transport as 'streamable_http' | 'sse' }
      : undefined,
  });
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
 *   props: {
 *     type: 'object',
 *     properties: {
 *       title: { type: 'string', inPreview: true },
 *       price: { type: 'string', inPreview: true },
 *       description: { type: 'string' },
 *       image: { type: 'string' }
 *     }
 *   }
 * });
 * ```
 */

export function artifactComponent(config: ArtifactComponentConfig): ArtifactComponent {
  // Generate ID if not provided
  const configWithId = {
    ...config,
    id: config.id || generateIdFromName(config.name),
  };
  return new ArtifactComponent(configWithId);
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
  // Generate ID if not provided
  const configWithId = {
    ...config,
    id: config.id || generateIdFromName(config.name),
  };
  return new DataComponent(configWithId);
}

export function agentMcp(config: AgentMcpConfig): AgentMcpConfig {
  return {
    server: config.server,
    selectedTools: config.selectedTools,
    headers: config.headers,
  };
}

// ============================================================================
// Function Tool Builders
// ============================================================================
/**
 * Creates a function tool that executes user-defined code in a sandboxed environment.
 *
 * Function tools allow users to define custom logic that runs securely in isolated
 * environments. Dependencies are installed automatically in the sandbox.
 *
 * @param config - Function tool configuration
 * @returns A FunctionTool instance
 *
 * @example
 * ```typescript
 * const calculatorTool = functionTool({
 *   name: 'calculator',
 *   description: 'Performs basic math operations',
 *   inputSchema: {
 *     type: 'object',
 *     properties: {
 *       operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
 *       a: { type: 'number' },
 *       b: { type: 'number' }
 *     },
 *     required: ['operation', 'a', 'b']
 *   },
 *   dependencies: {
 *     'lodash': '^4.17.21'
 *   },
 *   execute: async (params) => {
 *     const { operation, a, b } = params;
 *     switch (operation) {
 *       case 'add': return { result: a + b };
 *       case 'subtract': return { result: a - b };
 *       case 'multiply': return { result: a * b };
 *       case 'divide': return { result: a / b };
 *       default: throw new Error(`Unknown operation: ${operation}`);
 *     }
 *   }
 * });
 * ```
 */
export function functionTool(config: FunctionToolConfig): FunctionTool {
  return new FunctionTool(config);
}
