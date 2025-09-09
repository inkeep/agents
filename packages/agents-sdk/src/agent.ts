import {
	type ArtifactComponentApiInsert,
	// getDataComponentsForAgent,
	// getArtifactComponentsForAgent,
	type DataComponentApiInsert,
	getLogger,
} from "@inkeep/agents-core";
import { ArtifactComponent } from "./artifact-component";
import { DataComponent } from "./data-component";
import type {
	AgentConfig,
	AgentInterface,
	AgentResponse,
	AllAgentInterface,
	GenerateOptions,
	Message,
	MessageInput,
	ToolCall,
} from "./types";

const logger = getLogger("agent");

// Helper function to resolve getter functions
function resolveGetter<T>(value: T | (() => T) | undefined): T | undefined {
	if (typeof value === "function") {
		return (value as () => T)();
	}
	return value as T | undefined;
}

export class Agent implements AgentInterface {
	public config: AgentConfig;
	public readonly type = "internal" as const;
	private baseURL: string;
	private tenantId: string;
	private projectId: string;
	private initialized = false;
	constructor(config: AgentConfig) {
		this.config = { ...config, type: "internal" };
		this.baseURL = process.env.INKEEP_API_URL || "http://localhost:3002";
		this.tenantId = config.tenantId || "default";
		this.projectId = config.projectId || "default";

		logger.info(
			{
				tenantId: this.tenantId,
				agentId: this.config.id,
				agentName: config.name,
			},
			"Agent constructor initialized",
		);
	}

	// Return the configured ID
	getId(): string {
		return this.config.id;
	}

	// Agent introspection methods
	getName(): string {
		return this.config.name;
	}

	getInstructions(): string {
		return this.config.prompt;
	}

	getTools(): Record<string, unknown> {
		const tools = resolveGetter(this.config.tools);
		if (!tools) {
			return {};
		}
		// Tools must be an array from the getter function
		if (!Array.isArray(tools)) {
			throw new Error("tools getter must return an array");
		}
		// Convert array to record using tool id or name as key
		const toolRecord: Record<string, unknown> = {};
		for (const tool of tools) {
			if (tool && typeof tool === "object") {
				const id =
					(tool as any).id || (tool as any).getId?.() || (tool as any).name;
				if (id) {
					toolRecord[id] = tool;
				}
			}
		}
		return toolRecord;
	}

	getModels(): typeof this.config.models {
		return this.config.models;
	}

	setModels(models: typeof this.config.models): void {
		this.config.models = models;
	}

	getTransfers(): AgentInterface[] {
		return typeof this.config.canTransferTo === "function"
			? this.config.canTransferTo()
			: [];
	}

	getDelegates(): AllAgentInterface[] {
		return typeof this.config.canDelegateTo === "function"
			? this.config.canDelegateTo()
			: [];
	}

	getDataComponents(): DataComponentApiInsert[] {
		return resolveGetter(this.config.dataComponents) || [];
	}

	getArtifactComponents(): ArtifactComponentApiInsert[] {
		return resolveGetter(this.config.artifactComponents) || [];
	}

	addTool(name: string, tool: unknown): void {
		// Tools must now be a getter function returning an array
		const existingTools = this.config.tools ? this.config.tools() : [];
		this.config.tools = () => [...existingTools, tool];
	}

	addTransfer(...agents: AgentInterface[]): void {
		if (typeof this.config.canTransferTo === "function") {
			// If already a function, we need to combine the results
			const existingTransfers = this.config.canTransferTo;
			this.config.canTransferTo = () => [...existingTransfers(), ...agents];
		} else {
			// Convert to function-based transfers
			this.config.canTransferTo = () => agents;
		}
	}

	addDelegate(...agents: AllAgentInterface[]): void {
		if (typeof this.config.canDelegateTo === "function") {
			const existingDelegates = this.config.canDelegateTo;
			this.config.canDelegateTo = () => [...existingDelegates(), ...agents];
		} else {
			this.config.canDelegateTo = () => agents;
		}
	}

	// Public method to ensure agent exists in backend (with upsert behavior)
	async init(): Promise<void> {
		if (this.initialized) return;

		try {
			// Always attempt to upsert the agent
			await this.upsertAgent();

			// Load existing data components from database and merge with config
			await this.loadDataComponents();

			// Load existing artifact components from database and merge with config
			await this.loadArtifactComponents();

			// Setup tools and relations
			await this.saveToolsAndRelations();

			await this.saveDataComponents();

			await this.saveArtifactComponents();

			logger.info(
				{
					agentId: this.getId(),
				},
				"Agent initialized successfully",
			);

			this.initialized = true;
		} catch (error) {
			logger.error(
				{
					agentId: this.getId(),
					error: error instanceof Error ? error.message : "Unknown error",
				},
				"Failed to initialize agent",
			);
			throw error;
		}
	}

	// Private method to upsert agent (create or update)
	private async upsertAgent(): Promise<void> {
		const agentData = {
			id: this.getId(),
			name: this.config.name,
			description: this.config.description || "",
			prompt: this.config.prompt,
			conversationHistoryConfig: this.config.conversationHistoryConfig,
			models: this.config.models,
			stopWhen: this.config.stopWhen,
		};

		// First try to update (in case agent exists)
		const updateResponse = await fetch(
			`${this.baseURL}/tenants/${this.tenantId}/crud/agents/${this.getId()}`,
			{
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(agentData),
			},
		);

		if (updateResponse.ok) {
			logger.info(
				{
					agentId: this.getId(),
				},
				"Agent updated successfully",
			);
			return;
		}

		// If update failed with 404, agent doesn't exist - create it
		if (updateResponse.status === 404) {
			logger.info(
				{
					agentId: this.getId(),
				},
				"Agent not found, creating new agent",
			);

			const createResponse = await fetch(
				`${this.baseURL}/tenants/${this.tenantId}/crud/agents`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(agentData),
				},
			);

			if (!createResponse.ok) {
				const errorText = await createResponse
					.text()
					.catch(() => "Unknown error");
				throw new Error(
					`Failed to create agent: ${createResponse.status} ${createResponse.statusText} - ${errorText}`,
				);
			}

			logger.info(
				{
					agentId: this.getId(),
				},
				"Agent created successfully",
			);
			return;
		}

		// Update failed for some other reason
		const errorText = await updateResponse.text().catch(() => "Unknown error");
		throw new Error(
			`Failed to update agent: ${updateResponse.status} ${updateResponse.statusText} - ${errorText}`,
		);
	}

	// Private implementation methods
	private normalizeMessages(messages: MessageInput): Message[] {
		if (typeof messages === "string") {
			return [{ role: "user", content: messages }];
		}
		if (Array.isArray(messages)) {
			return messages.map((msg) =>
				typeof msg === "string" ? { role: "user", content: msg } : msg,
			);
		}
		return [messages];
	}

	private async saveToolsAndRelations(): Promise<void> {
		logger.info(
			{
				transfers: this.getTransfers(),
				delegates: this.getDelegates(),
				tools: this.config.tools,
			},
			"transfers, delegates, and tools",
		);

		// Setup tools using your existing SDK
		if (this.config.tools) {
			logger.info({ tools: this.config.tools }, "tools and config");
			for (const [toolId, toolConfig] of Object.entries(this.config.tools)) {
				await this.createTool(toolId, toolConfig);
			}
		}

		// Note: Transfer and delegate relations are managed by the AgentGraph, not individual agents
	}

	private async saveDataComponents(): Promise<void> {
		logger.info(
			{ dataComponents: this.config.dataComponents },
			"dataComponents and config",
		);
		const components = resolveGetter(this.config.dataComponents);
		if (components) {
			for (const dataComponent of components) {
				await this.createDataComponent(dataComponent);
			}
		}
	}

	private async saveArtifactComponents(): Promise<void> {
		logger.info(
			{ artifactComponents: this.config.artifactComponents },
			"artifactComponents and config",
		);
		const components = resolveGetter(this.config.artifactComponents);
		if (components) {
			for (const artifactComponent of components) {
				await this.createArtifactComponent(artifactComponent);
			}
		}
	}

	private async loadDataComponents(): Promise<void> {
		try {
			// Import the getDataComponentsForAgent function

			// TODO: Load data components from database for this agent
			// This needs to be replaced with an HTTP API call
			const existingComponents: DataComponentApiInsert[] = [];
			// const existingComponents = await getDataComponentsForAgent(dbClient)({
			//   scopes: { tenantId: this.tenantId, projectId: this.projectId },
			//   agentId: this.getId(),
			// });

			// Convert database format to config format
			const dbDataComponents = existingComponents.map((component: any) => ({
				id: component.id,
				tenantId: component.tenantId || this.tenantId,
				projectId: component.projectId || this.projectId,
				name: component.name,
				description: component.description,
				props: component.props,
				createdAt: component.createdAt,
				updatedAt: component.updatedAt,
			}));

			// Merge with existing config data components (config takes precedence)
			const configComponents = resolveGetter(this.config.dataComponents) || [];
			const allComponents = [...dbDataComponents, ...configComponents];

			// Remove duplicates (config components override database ones with same id)
			const uniqueComponents = allComponents.reduce((acc, component) => {
				const existingIndex = acc.findIndex((c: any) => c.id === component.id);
				if (existingIndex >= 0) {
					// Replace with the later one (config takes precedence)
					acc[existingIndex] = component;
				} else {
					acc.push(component);
				}
				return acc;
			}, [] as DataComponentApiInsert[]);

			// Update the config with merged components
			this.config.dataComponents = uniqueComponents as any;

			logger.info(
				{
					agentId: this.getId(),
					dbComponentCount: dbDataComponents.length,
					configComponentCount: configComponents.length,
					totalComponentCount: uniqueComponents.length,
				},
				"Loaded and merged data components",
			);
		} catch (error) {
			logger.error(
				{
					agentId: this.getId(),
					error: error instanceof Error ? error.message : "Unknown error",
				},
				"Failed to load data components from database",
			);
			// Don't throw - continue with just config components
		}
	}

	private async loadArtifactComponents(): Promise<void> {
		try {
			// TODO: Load artifact components from database for this agent
			// This needs to be replaced with an HTTP API call
			const existingComponents: ArtifactComponentApiInsert[] = [];
			// const existingComponents = await getArtifactComponentsForAgent(dbClient)({
			//   scopes: { tenantId: this.tenantId, projectId: this.projectId },
			//   agentId: this.getId(),
			// });

			// Convert database format to config format
			const dbArtifactComponents = existingComponents.map((component: any) => ({
				id: component.id,
				tenantId: component.tenantId || this.tenantId,
				projectId: component.projectId || this.projectId,
				name: component.name,
				description: component.description,
				summaryProps: component.summaryProps,
				fullProps: component.fullProps,
				createdAt: component.createdAt,
				updatedAt: component.updatedAt,
			}));

			// Merge with existing config artifact components (config takes precedence)
			const configComponents =
				resolveGetter(this.config.artifactComponents) || [];
			const allComponents = [...dbArtifactComponents, ...configComponents];

			// Remove duplicates (config components override database ones with same id)
			const uniqueComponents = allComponents.reduce((acc, component) => {
				const existingIndex = acc.findIndex((c: any) => c.id === component.id);
				if (existingIndex >= 0) {
					// Replace with the later one (config takes precedence)
					acc[existingIndex] = component;
				} else {
					acc.push(component);
				}
				return acc;
			}, [] as ArtifactComponentApiInsert[]);

			// Update the config with merged components
			this.config.artifactComponents = uniqueComponents as any;

			logger.info(
				{
					agentId: this.getId(),
					dbComponentCount: dbArtifactComponents.length,
					configComponentCount: configComponents.length,
					totalComponentCount: uniqueComponents.length,
				},
				"Loaded and merged artifact components",
			);
		} catch (error) {
			logger.error(
				{
					agentId: this.getId(),
					error: error instanceof Error ? error.message : "Unknown error",
				},
				"Failed to load artifact components from database",
			);
			// Don't throw - continue with just config components
		}
	}

	private async createTool(toolId: string, toolConfig: any): Promise<void> {
		try {
			// Check if this is a function tool (has type: 'function')
			if (toolConfig.type === "function") {
				logger.info(
					{
						agentId: this.getId(),
						toolId,
						toolType: "function",
					},
					"Skipping function tool creation - will be handled at runtime",
				);
				return;
			}

			// Import tool classes to check instances
			const { Tool } = await import("./tool.js");

			let tool: any;

			// Check if this is already a tool instance
			if (toolConfig instanceof Tool) {
				logger.info(
					{
						agentId: this.getId(),
						toolId,
						toolType: "Tool",
					},
					"Initializing Tool instance",
				);
				tool = toolConfig;
				await tool.init();
			} else {
				// Legacy: create MCP tool from config
				logger.info(
					{
						agentId: this.getId(),
						toolId,
						toolType: "legacy-config",
					},
					"Creating Tool from config",
				);
				tool = new Tool({
					id: toolId,
					tenantId: this.tenantId,
					name: toolConfig.name || toolId,
					description: toolConfig.description || `MCP tool: ${toolId}`,
					serverUrl:
						toolConfig.config?.serverUrl ||
						toolConfig.serverUrl ||
						"http://localhost:3000",
					activeTools: toolConfig.config?.mcp?.activeTools,
					credential: toolConfig.credential,
				});
				await tool.init();
			}

			// Create the agent-tool relation with credential reference
			await this.createAgentToolRelation(tool.getId());

			logger.info(
				{
					agentId: this.getId(),
					toolId: tool.getId(),
				},
				"Tool created and linked to agent",
			);
		} catch (error) {
			logger.error(
				{
					agentId: this.getId(),
					toolId,
					error: error instanceof Error ? error.message : "Unknown error",
				},
				"Failed to create tool",
			);
		}
	}

	private async createDataComponent(
		dataComponent: DataComponentApiInsert,
	): Promise<void> {
		try {
			// Create a DataComponent instance from the config
			const dc = new DataComponent({
				tenantId: this.tenantId,
				projectId: this.projectId,
				name: dataComponent.name,
				description: dataComponent.description,
				props: dataComponent.props,
			});

			// Initialize the data component (this handles creation/update)
			await dc.init();

			// Create the agent-dataComponent association
			await this.createAgentDataComponentRelation(dc.getId());

			logger.info(
				{
					agentId: this.getId(),
					dataComponentId: dc.getId(),
				},
				"DataComponent created and linked to agent",
			);
		} catch (error) {
			logger.error(
				{
					agentId: this.getId(),
					dataComponentName: dataComponent.name,
					error: error instanceof Error ? error.message : "Unknown error",
				},
				"Failed to create data component",
			);
			// Re-throw the error so tests can catch it
			throw error;
		}
	}

	private async createArtifactComponent(
		artifactComponent: ArtifactComponentApiInsert,
	): Promise<void> {
		try {
			// Create an ArtifactComponent instance from the config
			const ac = new ArtifactComponent({
				tenantId: this.tenantId,
				projectId: this.projectId,
				name: artifactComponent.name,
				description: artifactComponent.description,
				summaryProps: artifactComponent.summaryProps,
				fullProps: artifactComponent.fullProps,
			});

			// Initialize the artifact component (this handles creation/update)
			await ac.init();

			// Create the agent-artifactComponent association
			await this.createAgentArtifactComponentRelation(ac.getId());

			logger.info(
				{
					agentId: this.getId(),
					artifactComponentId: ac.getId(),
				},
				"ArtifactComponent created and linked to agent",
			);
		} catch (error) {
			logger.error(
				{
					agentId: this.getId(),
					artifactComponentName: artifactComponent.name,
					error: error instanceof Error ? error.message : "Unknown error",
				},
				"Failed to create artifact component",
			);
			// Re-throw the error so tests can catch it
			throw error;
		}
	}

	private async createAgentDataComponentRelation(
		dataComponentId: string,
	): Promise<void> {
		const relationResponse = await fetch(
			`${this.baseURL}/tenants/${this.tenantId}/crud/agent-data-components`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					id: `${this.getId()}-dc-${dataComponentId}`,
					tenantId: this.tenantId,
					agentId: this.getId(),
					dataComponentId: dataComponentId,
				}),
			},
		);

		if (!relationResponse.ok) {
			throw new Error(
				`Failed to create agent-dataComponent relation: ${relationResponse.status} ${relationResponse.statusText}`,
			);
		}

		logger.info(
			{
				agentId: this.getId(),
				dataComponentId,
			},
			"Created agent-dataComponent relation",
		);
	}

	private async createAgentArtifactComponentRelation(
		artifactComponentId: string,
	): Promise<void> {
		const relationResponse = await fetch(
			`${this.baseURL}/tenants/${this.tenantId}/crud/agent-artifact-components`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					id: crypto.randomUUID(),
					tenantId: this.tenantId,
					agentId: this.getId(),
					artifactComponentId: artifactComponentId,
				}),
			},
		);

		if (!relationResponse.ok) {
			throw new Error(
				`Failed to create agent-artifactComponent relation: ${relationResponse.status} ${relationResponse.statusText}`,
			);
		}

		logger.info(
			{
				agentId: this.getId(),
				artifactComponentId,
			},
			"Created agent-artifactComponent relation",
		);
	}

	private async createAgentToolRelation(toolId: string): Promise<void> {
		const relationResponse = await fetch(
			`${this.baseURL}/tenants/${this.tenantId}/crud/agent-tool-relations`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					id: `${this.getId()}-tool-${toolId}`,
					tenantId: this.tenantId,
					agentId: this.getId(),
					toolId: toolId,
				}),
			},
		);

		if (!relationResponse.ok) {
			const errorBody = await relationResponse
				.text()
				.catch(() => "Unknown error");
			throw new Error(
				`Failed to create agent-tool relation: ${relationResponse.status} - ${errorBody}`,
			);
		}
	}

	/**
	 * Resolve context and apply templates to agent prompt
	 */

	private async executeGeneration(
		messages: Message[],
		options?: GenerateOptions,
		processedInstructions?: string,
	): Promise<AgentResponse> {
		// This is where you'd integrate with your actual agent execution logic
		// For now, we'll return a basic response structure

		const lastMessage = messages[messages.length - 1];
		const userInput = lastMessage?.content || "";
		const prompt = processedInstructions || this.config.prompt;

		// Log the prompt being used (helpful for debugging context application)
		logger.debug(
			{
				agentId: this.getId(),
				promptLength: prompt.length,
				hasProcessedInstructions: !!processedInstructions,
			},
			"Executing generation with prompt",
		);

		// Example: Check for transfer conditions
		const transferAgent = this.shouldTransfer(userInput);
		if (transferAgent) {
			return {
				text: `I'm handing this over to ${transferAgent.getName()} who can better assist you.`,
				toolCalls: [],
				transfer: {
					agent: transferAgent,
					description: `Transfer to ${transferAgent.getName()}`,
				},
				finishReason: "transfer",
				usage: { inputTokens: 0, outputTokens: 0 },
			};
		}

		// Example: Check for tool usage
		const toolCalls = this.identifyToolCalls(userInput);
		if (toolCalls.length > 0) {
			return {
				text: `I'll help you with that. Let me use the appropriate tools.`,
				toolCalls,
				finishReason: "tool_calls",
				usage: { inputTokens: 0, outputTokens: 0 },
			};
		}

		// Default response
		return {
			text: `Hello! I'm ${this.config.name}. ${userInput ? `You said: "${userInput}"` : "How can I help you today?"}`,
			toolCalls: [],
			finishReason: "completed",
			usage: { inputTokens: userInput.length, outputTokens: 50 },
		};
	}

	private async *createTextStream(
		messages: Message[],
		options?: GenerateOptions,
	): AsyncGenerator<string> {
		const response = await this.executeGeneration(messages, options);

		// Simulate streaming by yielding chunks
		const words = response.text.split(" ");
		for (const word of words) {
			yield `${word} `;
			// Add small delay to simulate real streaming
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}

	private shouldTransfer(input: string): AgentInterface | null {
		// Simple transfer logic - you can make this more sophisticated
		const transfers = this.getTransfers();

		for (const agent of transfers) {
			const agentName = agent.getName().toLowerCase();
			if (
				input.toLowerCase().includes(agentName) ||
				input.toLowerCase().includes("transfer") ||
				input.toLowerCase().includes("transfer")
			) {
				return agent;
			}
		}

		return null;
	}

	private identifyToolCalls(input: string): ToolCall[] {
		const tools = this.getTools();
		const toolCalls: ToolCall[] = [];

		// Simple tool identification logic
		for (const [toolName, toolConfig] of Object.entries(tools)) {
			if (input.toLowerCase().includes(toolName.toLowerCase())) {
				toolCalls.push({
					id: crypto.randomUUID(),
					type: "function",
					function: {
						name: toolName,
						arguments: JSON.stringify({ input }),
					},
				});
			}
		}

		return toolCalls;
	}
}

// Factory function for creating agents - similar to contextConfig() pattern
export function agent(config: AgentConfig): Agent {
	return new Agent(config);
}
