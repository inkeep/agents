import {
	type CredentialReferenceApiInsert,
	CredentialReferenceApiInsertSchema,
	type MCPToolConfig,
	MCPToolConfigSchema,
	type MCPTransportType,
} from "@inkeep/agents-core";
import { z } from "zod";
import { Agent } from "./agent";
import { ArtifactComponent } from "./artifact-component";
import { DataComponent } from "./data-component";
import { Tool } from "./tool";
import type { AgentConfig, TransferConfig } from "./types";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Function signature for tool execution
 * @template TParams - Type of input parameters
 * @template TResult - Type of return value
 */
export type ToolExecuteFunction<TParams = unknown, TResult = unknown> = (
	params: TParams,
) => Promise<TResult>;

/**
 * Function signature for transfer conditions
 */
export type TransferConditionFunction = (context: unknown) => boolean;

/**
 * Configuration for MCP server builders
 */
export interface MCPServerConfig {
	// Basic configuration
	name: string;
	description: string;

	// Remote server configuration
	serverUrl: string;

	// Optional configuration
	id?: string;
	parameters?: Record<string, z.ZodJSONSchema>;
	credential?: CredentialReferenceApiInsert;
	tenantId?: string;
	transport?: keyof typeof MCPTransportType;
	activeTools?: string[];
	headers?: Record<string, string>;
	imageUrl?: string;
}

/**
 * Configuration for component builders
 */
export interface ComponentConfig {
	name: string;
	description: string;
	tenantId?: string;
	projectId?: string;
}

export interface ArtifactComponentConfig extends ComponentConfig {
	summaryProps: Record<string, unknown>;
	fullProps: Record<string, unknown>;
}

export interface DataComponentConfig extends ComponentConfig {
	props: Record<string, unknown>;
}

// ============================================================================
// Schemas
// ============================================================================

/**
 * Schema for transfer configuration (excluding function properties)
 */
export const TransferConfigSchema = z.object({
	agent: z.instanceof(Agent),
	description: z.string().optional(),
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generates a kebab-case ID from a name string
 * @param name - The name to convert
 * @returns A kebab-case ID
 */
function generateIdFromName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Validates that a value is a function
 * @param value - The value to check
 * @param name - The name of the parameter (for error messages)
 * @throws {Error} If the value is not a function
 */
function validateFunction(value: unknown, name: string): void {
	if (typeof value !== "function") {
		throw new Error(`${name} must be a function`);
	}
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
			"Agent ID is required. Agents must have stable IDs for consistency across deployments.",
		);
	}
	return new Agent(config);
}

// ============================================================================
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
		throw new Error("MCP server requires a serverUrl");
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
	const validatedConfig = MCPToolConfigSchema.parse(config);
	return new Tool(validatedConfig);
}

export type AgentMcpConfig = {
	server: Tool;
	selectedTools: string[];
};

export function agentMcp(config: AgentMcpConfig): AgentMcpConfig {
	return {
		server: config.server,
		selectedTools: config.selectedTools,
	};
}

// ============================================================================
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
}

// ============================================================================
// Transfer Builders
// ============================================================================

/**
 * Creates a transfer configuration for agent handoffs.
 *
 * Transfers allow one agent to hand off control to another agent
 * based on optional conditions.
 *
 * @param targetAgent - The agent to transfer to
 * @param description - Optional description of when/why to transfer
 * @param condition - Optional function to determine if transfer should occur
 * @returns A validated transfer configuration
 *
 * @example
 * ```typescript
 * // Simple transfer
 * const handoff = transfer(supportAgent, 'Transfer to support');
 *
 * // Conditional transfer
 * const conditionalHandoff = transfer(
 *   specialistAgent,
 *   'Transfer to specialist for complex issues',
 *   (context) => context.complexity > 0.8
 * );
 * ```
 */
export function transfer(
	targetAgent: Agent,
	description?: string,
	condition?: TransferConditionFunction,
): TransferConfig {
	// Validate function if provided
	if (condition !== undefined) {
		validateFunction(condition, "condition");
	}

	const config: TransferConfig = {
		agent: targetAgent,
		description: description || `Hand off to ${targetAgent.getName()}`,
		condition,
	};

	// Validate non-function properties
	TransferConfigSchema.parse({
		agent: config.agent,
		description: config.description,
	});

	return config;
}

/**
 * Creates an agent relation configuration.
 *
 * Relations define how agents can interact with each other.
 * Transfer relations allow handoffs, while delegate relations
 * allow temporary task delegation.
 *
 * @param targetAgent - The ID of the target agent
 * @param relationType - The type of relation (transfer or delegate)
 * @returns An agent relation configuration
 *
 * @example
 * ```typescript
 * const transferRelation = agentRelation('support-agent', 'transfer');
 * const delegateRelation = agentRelation('specialist-agent', 'delegate');
 * ```
 */
export function agentRelation(
	targetAgent: string,
	relationType: "transfer" | "delegate" = "transfer",
) {
	return {
		targetAgent,
		relationType,
	};
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
export function artifactComponent(
	config: ArtifactComponentConfig,
): ArtifactComponent {
	return new ArtifactComponent({
		...config,
		tenantId: config.tenantId || "default",
		projectId: config.projectId || "default",
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
		tenantId: config.tenantId || "default",
		projectId: config.projectId || "default",
	});
}
