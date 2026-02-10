import {
  type CredentialReferenceApiInsert,
  CredentialReferenceApiInsertSchema,
  type MCPToolConfig,
  MCPToolConfigSchema,
  type SignatureVerificationConfig,
  SignatureVerificationConfigSchema,
  type TriggerApiInsert,
} from '@inkeep/agents-core';
import { validateJMESPath, validateRegex } from '@inkeep/agents-core/utils/signature-validation';
import { Agent } from './agent';
import { ArtifactComponent } from './artifact-component';
import type {
  AgentMcpConfig,
  ArtifactComponentConfig,
  DataComponentConfig,
  MCPServerConfig,
  StatusComponentConfig,
} from './builders';
import { DataComponent } from './data-component';
import { FunctionTool } from './function-tool';
import type { ProjectConfig } from './project';
import { Project } from './project';
import { StatusComponent } from './status-component';
import { SubAgent } from './subAgent';
import { Tool } from './tool';
import { Trigger, type TriggerConfig } from './trigger';
import type { AgentConfig, FunctionToolConfig, SubAgentConfig } from './types';
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
 * Projects are the top-level organizational unit that contains Agents, Sub Agents, and shared configurations.
 * They provide model inheritance and execution limits that cascade down to Agents and Sub Agents.
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
 *     base: { model: 'gpt-4.1' },
 *     summarizer: { model: 'gpt-4.1-nano' }
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
 * @returns A new SubAgent instance
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
 *   name: 'GitHub Token',
 *   type: 'bearer',
 *   value: process.env.GITHUB_TOKEN
 * });
 * ```
 */

export function credential(config: CredentialReferenceApiInsert): CredentialReferenceApiInsert {
  try {
    return CredentialReferenceApiInsertSchema.parse(config);
  } catch (error) {
    if (error instanceof Error) {
      const credId = config.id || 'unknown';
      throw new Error(`Invalid credential '${credId}': ${error.message}`);
    }
    throw error;
  }
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
 *     name: 'API Key',
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
  const configWithId = {
    ...config,
    id: config.id || generateIdFromName(config.name),
  };
  const validatedConfig = MCPToolConfigSchema.parse(configWithId);
  return new Tool(validatedConfig);
}

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
  const configWithId = {
    ...config,
    id: config.id || generateIdFromName(config.name),
  };
  return new DataComponent(configWithId);
}

/**
 * Creates a status component for structured status updates.
 *
 * Status components define the structure of status updates
 * that agents can generate during long-running operations.
 *
 * @param config - Status component configuration
 * @returns A StatusComponent instance
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const toolCallStatus = statusComponent({
 *   type: 'tool_call_summary',
 *   description: 'Summary of a tool execution',
 *   detailsSchema: z.object({
 *     tool_name: z.string(),
 *     summary: z.string(),
 *     status: z.enum(['success', 'error', 'in_progress'])
 *   })
 * });
 * ```
 */

export function statusComponent(config: StatusComponentConfig): StatusComponent {
  return new StatusComponent(config);
}

/**
 * (deprecated in favor of mcpTool.with()) Creates an agent MCP configuration.
 *
 * Agent MCP configurations are used to configure the MCP server for an agent.
 *
 * @param config - Agent MCP configuration
 * @returns An AgentMcpConfig instance
 */
export function agentMcp(config: AgentMcpConfig): AgentMcpConfig {
  return {
    server: config.server,
    selectedTools: config.selectedTools,
    headers: config.headers,
  };
}

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

// ============================================================================
// Trigger Builders
// ============================================================================
/**
 * Creates a webhook trigger for external service integration.
 *
 * Triggers allow external services to invoke agents via webhooks.
 * They support authentication via arbitrary header key-value pairs,
 * payload transformation, input validation, and signature verification.
 *
 * @param config - Trigger configuration
 * @returns A Trigger instance
 * @throws {Error} If signatureVerification config validation fails
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * // GitHub webhook trigger with signature verification
 * const githubWebhookSecret = credential({
 *   id: 'github-webhook-secret',
 *   name: 'GitHub Webhook Secret',
 *   type: 'bearer',
 *   value: process.env.GITHUB_WEBHOOK_SECRET
 * });
 *
 * const githubTrigger = trigger({
 *   name: 'GitHub Events',
 *   description: 'Handle GitHub webhook events',
 *   enabled: true,
 *   inputSchema: z.object({
 *     action: z.string(),
 *     repository: z.object({
 *       name: z.string(),
 *       url: z.string()
 *     })
 *   }),
 *   outputTransform: {
 *     jmespath: '{action: action, repo: repository.name, url: repository.url}'
 *   },
 *   messageTemplate: 'GitHub {{action}} on repository {{repo}}: {{url}}',
 *   authentication: {
 *     headers: [
 *       { name: 'X-GitHub-Token', value: process.env.GITHUB_TOKEN }
 *     ]
 *   },
 *   signingSecretCredentialReference: githubWebhookSecret,
 *   signatureVerification: {
 *     algorithm: 'sha256',
 *     encoding: 'hex',
 *     signature: {
 *       source: 'header',
 *       key: 'x-hub-signature-256',
 *       prefix: 'sha256='
 *     },
 *     signedComponents: [
 *       { source: 'body', required: true }
 *     ],
 *     componentJoin: {
 *       strategy: 'concatenate',
 *       separator: ''
 *     }
 *   }
 * });
 *
 * // Slack webhook trigger with complex signature
 * const slackTrigger = trigger({
 *   name: 'Slack Events',
 *   description: 'Handle Slack webhook events',
 *   messageTemplate: 'Slack event: {{type}}',
 *   signingSecretCredentialReference: slackSecret,
 *   signatureVerification: {
 *     algorithm: 'sha256',
 *     encoding: 'hex',
 *     signature: {
 *       source: 'header',
 *       key: 'x-slack-signature',
 *       prefix: 'v0='
 *     },
 *     signedComponents: [
 *       { source: 'literal', value: 'v0', required: true },
 *       { source: 'header', key: 'x-slack-request-timestamp', required: true },
 *       { source: 'body', required: true }
 *     ],
 *     componentJoin: {
 *       strategy: 'concatenate',
 *       separator: ':'
 *     }
 *   }
 * });
 *
 * // Simple webhook trigger with no signature verification
 * const simpleTrigger = trigger({
 *   name: 'Internal Webhook',
 *   description: 'Internal webhook with no signature',
 *   messageTemplate: 'New message: {{text}}'
 * });
 * ```
 */
export function trigger(config: Omit<TriggerApiInsert, 'id'> & { id?: string }): Trigger {
  // Validate signatureVerification config if present
  if (config.signatureVerification !== undefined && config.signatureVerification !== null) {
    const triggerName = config.name || 'unknown';

    try {
      SignatureVerificationConfigSchema.parse(config.signatureVerification);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Invalid signatureVerification config in trigger '${triggerName}': ${error.message}`
        );
      }
      throw error;
    }

    // Additional validation for regex and JMESPath patterns
    const sigConfig = config.signatureVerification as SignatureVerificationConfig;

    // Validate signature.regex if present
    if (sigConfig.signature.regex) {
      const result = validateRegex(sigConfig.signature.regex);
      if (!result.valid) {
        throw new Error(
          `Invalid signatureVerification config in trigger '${triggerName}': ${result.error}`
        );
      }
    }

    // Validate signature.key as JMESPath if source is 'body'
    if (sigConfig.signature.source === 'body' && sigConfig.signature.key) {
      const result = validateJMESPath(sigConfig.signature.key);
      if (!result.valid) {
        throw new Error(
          `Invalid signatureVerification config in trigger '${triggerName}': ${result.error}`
        );
      }
    }

    // Validate each signed component
    for (const component of sigConfig.signedComponents) {
      // Validate component.regex if present
      if (component.regex) {
        const result = validateRegex(component.regex);
        if (!result.valid) {
          throw new Error(
            `Invalid signatureVerification config in trigger '${triggerName}': ${result.error}`
          );
        }
      }

      // Validate component.key as JMESPath if source is 'body'
      if (component.source === 'body' && component.key) {
        const result = validateJMESPath(component.key);
        if (!result.valid) {
          throw new Error(
            `Invalid signatureVerification config in trigger '${triggerName}': ${result.error}`
          );
        }
      }
    }
  }

  // Cast is needed because TriggerApiInsert has broader inputSchema type from Drizzle
  return new Trigger(config as TriggerConfig);
}
