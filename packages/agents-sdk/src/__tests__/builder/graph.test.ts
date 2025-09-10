import { beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "../../agent";
import { ExternalAgent } from "../../externalAgent";
import { AgentGraph } from "../../graph";
import { Tool } from "../../tool";
import type { GenerateOptions, GraphConfig, MessageInput } from "../../types";

// Mock dependencies
vi.mock("@inkeep/agents-core", async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		getLogger: vi.fn().mockReturnValue({
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		}),
	};
});

// Mock the graphFullClient
vi.mock("../../graphFullClient.js", () => ({
	updateFullGraphViaAPI: vi.fn().mockResolvedValue({
		id: "test-graph",
		name: "Test Graph",
		agents: {
			"default-agent": {
				id: "default-agent",
				name: "Default Agent",
				prompt: "You are a helpful default agent",
				tools: [],
			},
		},
		tools: {},
		dataComponents: {},
		defaultAgentId: "default-agent",
	}),
	createFullGraphViaAPI: vi.fn().mockResolvedValue({
		id: "test-graph",
		name: "Test Graph",
		agents: {
			"default-agent": {
				id: "default-agent",
				name: "Default Agent",
				prompt: "You are a helpful default agent",
				tools: [],
			},
		},
		tools: {},
		dataComponents: {},
		defaultAgentId: "default-agent",
	}),
	getFullGraphViaAPI: vi.fn().mockResolvedValue({
		id: "test-graph",
		name: "Test Graph",
		agents: {
			"default-agent": {
				id: "default-agent",
				name: "Default Agent",
				prompt: "You are a helpful default agent",
				tools: [],
			},
		},
		tools: {},
		dataComponents: {},
		defaultAgentId: "default-agent",
	}),
}));

vi.mock("../../data/graphFull.js", () => ({
	createFullGraphServerSide: vi.fn().mockResolvedValue({
		id: "test-graph",
		name: "Test Graph",
		agents: {
			"default-agent": {
				id: "default-agent",
				name: "Default Agent",
				prompt: "You are a helpful default agent",
				tools: [],
			},
		},
		tools: {},
		dataComponents: {},
		defaultAgentId: "default-agent",
	}),
	updateFullGraphServerSide: vi.fn().mockResolvedValue({
		id: "test-graph",
		name: "Test Graph",
		agents: {
			"default-agent": {
				id: "default-agent",
				name: "Default Agent",
				prompt: "You are a helpful default agent",
				tools: [],
			},
		},
		tools: {},
		dataComponents: {},
		defaultAgentId: "default-agent",
	}),
	getFullGraphServerSide: vi.fn().mockResolvedValue({
		id: "test-graph",
		name: "Test Graph",
		agents: {
			"default-agent": {
				id: "default-agent",
				name: "Default Agent",
				prompt: "You are a helpful default agent",
				tools: [],
			},
		},
		tools: {},
		dataComponents: {},
		defaultAgentId: "default-agent",
	}),
}));

vi.mock("../../logger.js", () => ({
	getLogger: vi.fn().mockReturnValue({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	}),
}));

// Mock @inkeep/agents-core for project model and stopWhen inheritance
vi.mock("@inkeep/agents-core", async () => {
	const actual = await vi.importActual("@inkeep/agents-core");
	return {
		...actual,
		getProject: vi.fn().mockReturnValue(() =>
			Promise.resolve({
				models: {
					base: { model: "gpt-4o" },
					structuredOutput: { model: "gpt-4o-mini" },
					summarizer: { model: "gpt-3.5-turbo" },
				},
				stopWhen: {
					transferCountIs: 15,
					stepCountIs: 25,
				},
			}),
		),
	};
});

// Mock the agent's generate method
const mockGenerate = vi.fn().mockResolvedValue({
	text: "Test response",
	formattedContent: {
		parts: [{ kind: "text", text: "Test response" }],
	},
});

describe("AgentGraph", () => {
	let defaultAgent: Agent;
	let supportAgent: Agent;
	let externalAgent: ExternalAgent;
	let testTool: Tool;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock successful API responses
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ result: "Mocked response" }),
			text: () => Promise.resolve('{"result": "Mocked response"}'),
			status: 200,
			statusText: "OK",
		} as Response);

		// Create test tool
		testTool = new Tool({
			name: "Test Tool",
			description: "A test tool for graph testing",
			type: "mcp",
			command: ["test-command"],
			serverUrl: "http://localhost:3000",
			tenantId: "test-tenant",
		});

		// Create test agents
		defaultAgent = new Agent({
			id: "default-agent",
			name: "Default Agent",
			prompt: "You are a helpful default agent",
			tenantId: "test-tenant",
			tools: () => [testTool],
		});

		supportAgent = new Agent({
			id: "support-agent",
			name: "Support Agent",
			prompt: "You provide customer support",
			tenantId: "test-tenant",
		});

		externalAgent = new ExternalAgent({
			id: "external-1",
			name: "External Agent",
			description: "External service agent",
			baseUrl: "https://external.example.com",
		});

		// Mock the generate method for all agents
		defaultAgent.generate = mockGenerate;
		supportAgent.generate = mockGenerate;

		// Add relationships
		defaultAgent.addTransfer(supportAgent);
		defaultAgent.addDelegate(externalAgent);
	});

	describe("Constructor", () => {
		it("should initialize with basic config", () => {
			const config: GraphConfig = {
				id: "test-graph",
				name: "Test Graph",
				description: "A test graph",
				defaultAgent,
				tenantId: "test-tenant",
			};

			const graph = new AgentGraph(config);

			expect(graph.getId()).toBe("test-graph");
			expect(graph.getName()).toBe("Test Graph");
			expect(graph.getDescription()).toBe("A test graph");
			expect(graph.getTenantId()).toBe("test-tenant");
		});

		it("should initialize with agents array", () => {
			const config: GraphConfig = {
				id: "test-graph",
				name: "Test Graph",
				defaultAgent,
				agents: () => [supportAgent, externalAgent],
				tenantId: "test-tenant",
			};

			const graph = new AgentGraph(config);
			const agents = graph.getAgents();

			expect(agents).toHaveLength(3); // defaultAgent + 2 additional
			expect(agents.some((a) => a.getName() === "Default Agent")).toBe(true);
			expect(agents.some((a) => a.getName() === "Support Agent")).toBe(true);
			expect(agents.some((a) => a.getName() === "External Agent")).toBe(true);
		});

		it("should initialize with agents object", () => {
			const config: GraphConfig = {
				id: "test-graph",
				name: "Test Graph",
				defaultAgent,
				agents: () => [supportAgent, externalAgent],
				tenantId: "test-tenant",
			};

			const graph = new AgentGraph(config);
			const agents = graph.getAgents();

			expect(agents).toHaveLength(3);
		});

		it("should handle missing optional parameters", () => {
			const config: GraphConfig = {
				id: "minimal-graph",
				defaultAgent,
			};

			const graph = new AgentGraph(config);

			expect(graph.getId()).toBe("minimal-graph");
			expect(graph.getName()).toBe("minimal-graph");
			expect(graph.getTenantId()).toBe("default");
			expect(graph.getDescription()).toBeUndefined();
		});
	});

	describe("Agent Management", () => {
		let graph: AgentGraph;

		beforeEach(() => {
			graph = new AgentGraph({
				id: "test-graph",
				name: "Test Graph",
				defaultAgent,
				tenantId: "test-tenant",
			});
		});

		it("should add agents", () => {
			graph.addAgent(supportAgent);
			const agents = graph.getAgents();

			expect(agents).toHaveLength(2);
			expect(agents.some((a) => a.getName() === "Support Agent")).toBe(true);
		});

		it("should get agent by id", () => {
			graph.addAgent(supportAgent);
			const agent = graph.getAgent("support-agent");

			expect(agent).toBeDefined();
			expect(agent?.getName()).toBe("Support Agent");
		});

		it("should return undefined for non-existent agent", () => {
			const agent = graph.getAgent("non-existent-agent");
			expect(agent).toBeUndefined();
		});

		it("should get default agent", () => {
			const agent = graph.getDefaultAgent();
			expect(agent).toBe(defaultAgent);
		});

		it("should set default agent", () => {
			graph.setDefaultAgent(supportAgent);
			const agent = graph.getDefaultAgent();
			expect(agent).toBe(supportAgent);
		});
	});

	describe("Graph Operations", () => {
		let graph: AgentGraph;

		beforeEach(() => {
			graph = new AgentGraph({
				id: "test-graph",
				name: "Test Graph",
				defaultAgent,
				agents: () => [supportAgent],
				tenantId: "test-tenant",
			});
		});

		it("should initialize graph and create database entities", async () => {
			await graph.init();

			const { updateFullGraphViaAPI } = await import(
				"../../graphFullClient.js"
			);
			expect(updateFullGraphViaAPI).toHaveBeenCalledWith(
				"test-tenant", // tenantId
				"default", // projectId
				"http://localhost:3002", // apiUrl
				"test-graph", // graphId
				expect.objectContaining({
					id: "test-graph",
					name: "Test Graph",
					agents: expect.objectContaining({
						"default-agent": expect.objectContaining({
							id: "default-agent",
							name: "Default Agent",
						}),
						"support-agent": expect.objectContaining({
							id: "support-agent",
							name: "Support Agent",
						}),
					}),
					tools: expect.any(Object),
				}),
			);
		});

		it("should handle initialization errors gracefully", async () => {
			const { updateFullGraphViaAPI } = await import(
				"../../graphFullClient.js"
			);
			vi.mocked(updateFullGraphViaAPI).mockRejectedValueOnce(
				new Error("DB error"),
			);

			const errorGraph = new AgentGraph({
				id: "error-graph",
				name: "Error Graph",
				defaultAgent,
				agents: () => [defaultAgent],
				tenantId: "test-tenant",
			});

			await expect(errorGraph.init()).rejects.toThrow("DB error");
		});

		it("should not reinitialize if already initialized", async () => {
			await graph.init();
			await graph.init(); // Second call

			const { updateFullGraphViaAPI } = await import(
				"../../graphFullClient.js"
			);
			expect(updateFullGraphViaAPI).toHaveBeenCalledTimes(1);
		});
	});

	describe("Message Generation", () => {
		let graph: AgentGraph;

		beforeEach(async () => {
			graph = new AgentGraph({
				id: "test-graph",
				name: "Test Graph",
				defaultAgent,
				tenantId: "test-tenant",
			});
			await graph.init();
		});

		it("should generate message using default agent", async () => {
			const messageInput: MessageInput = {
				text: "Hello, how can you help?",
			};

			const result = await graph.generate(messageInput);

			// Expect fetch to be called for the graph execution API
			expect(fetch).toHaveBeenCalledWith(
				expect.stringContaining("/v1/chat/completions"),
				expect.objectContaining({
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
					},
				}),
			);
			expect(result).toBe("Mocked response");
		});

		it("should generate message with specific agent", async () => {
			graph.addAgent(supportAgent);

			const messageInput: MessageInput = {
				text: "I need support",
				agentName: "Support Agent",
			};

			const result = await graph.generate(messageInput);

			// Expect fetch to be called for the graph execution API
			expect(fetch).toHaveBeenCalledWith(
				expect.stringContaining("/v1/chat/completions"),
				expect.objectContaining({
					method: "POST",
				}),
			);
			expect(result).toBe("Mocked response");
		});

		it("should throw error if specified agent not found", async () => {
			// Mock fetch to return an error response for this test
			vi.mocked(fetch).mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: "Not Found",
			} as Response);

			const messageInput: MessageInput = {
				text: "Hello",
				agentName: "Non-existent Agent",
			};

			await expect(graph.generate(messageInput)).rejects.toThrow(
				"HTTP 404: Not Found",
			);
		});

		it("should throw error if no default agent and no agent specified", async () => {
			const graphWithoutDefault = new AgentGraph({
				id: "test-graph",
				name: "Test Graph",
				tenantId: "test-tenant",
			});
			await graphWithoutDefault.init();

			const messageInput: MessageInput = {
				text: "Hello",
			};

			await expect(graphWithoutDefault.generate(messageInput)).rejects.toThrow(
				"No default agent configured for this graph",
			);
		});

		it("should pass generate options correctly", async () => {
			const messageInput: MessageInput = {
				text: "Hello",
			};

			const options: GenerateOptions = {
				contextId: "custom-context",
				metadata: { custom: "data" },
			};

			const result = await graph.generate(messageInput, options);

			// Expect fetch to be called for the graph execution API
			expect(fetch).toHaveBeenCalledWith(
				expect.stringContaining("/v1/chat/completions"),
				expect.objectContaining({
					method: "POST",
				}),
			);
			expect(result).toBe("Mocked response");
		});
	});

	describe("Streaming", () => {
		let graph: AgentGraph;

		beforeEach(async () => {
			graph = new AgentGraph({
				id: "test-graph",
				name: "Test Graph",
				defaultAgent,
				tenantId: "test-tenant",
			});
			await graph.init();
		});

		it("should handle streaming generation", async () => {
			const messageInput: MessageInput = {
				text: "Stream this message",
			};

			const result = await graph.generateStream(messageInput);

			// Should return a StreamResponse with textStream
			expect(result).toHaveProperty("textStream");
			expect(result.textStream).toBeDefined();

			// Test streaming - consume the async generator
			const chunks = [];
			for await (const chunk of result.textStream) {
				chunks.push(chunk);
			}
			expect(chunks.length).toBeGreaterThan(0);

			// Verify at least one fetch call was made
			expect(fetch).toHaveBeenCalled();
		});

		it("should handle streaming errors", async () => {
			// Mock fetch to return an error response for this test
			vi.mocked(fetch).mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			} as Response);

			const messageInput: MessageInput = {
				text: "Stream this",
			};

			const result = await graph.generateStream(messageInput);

			// The StreamResponse is created successfully, but the error occurs when consuming the stream
			expect(result).toHaveProperty("textStream");

			// Error should be thrown when trying to consume the async generator
			const iterator = result.textStream[Symbol.asyncIterator]();
			await expect(iterator.next()).rejects.toThrow(
				"HTTP 500: Internal Server Error",
			);
		});
	});

	describe("Full Graph Definition", () => {
		it("should convert to full graph definition correctly", async () => {
			const graph = new AgentGraph({
				id: "test-graph",
				name: "Test Graph",
				description: "Test description",
				defaultAgent,
				agents: () => [supportAgent, externalAgent],
				tenantId: "test-tenant",
			});

			await graph.init();

			const { updateFullGraphViaAPI } = await import(
				"../../graphFullClient.js"
			);
			const createCall = vi.mocked(updateFullGraphViaAPI).mock.calls[0][4]; // 5th argument contains the graph data (tenantId, projectId, apiUrl, graphId, graphData)

			expect(createCall).toMatchObject({
				id: "test-graph",
				name: "Test Graph",
				description: "Test description",
				agents: {
					"default-agent": {
						id: "default-agent",
						name: "Default Agent",
						type: "internal",
						canTransferTo: ["support-agent"],
						canDelegateTo: ["external-1"],
					},
					"support-agent": {
						id: "support-agent",
						name: "Support Agent",
						type: "internal",
					},
				},
				tools: expect.any(Object),
			});
		});
	});

	describe("Error Handling", () => {
		it("should handle agent generation errors", async () => {
			// Mock fetch to return an error response for graph execution
			vi.mocked(fetch).mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Generation failed",
			} as Response); // Graph execution call

			const graph = new AgentGraph({
				id: "test-graph",
				defaultAgent,
				tenantId: "test-tenant",
			});
			await graph.init();

			const messageInput: MessageInput = {
				text: "This will fail",
			};

			await expect(graph.generate(messageInput)).rejects.toThrow(
				"HTTP 500: Generation failed",
			);
		});
	});

	describe("Project-Level Model Inheritance", () => {
		let graph: AgentGraph;
		let agent1: Agent;
		let agent2: Agent;

		beforeEach(async () => {
			vi.clearAllMocks();

			// Reset the @inkeep/core mock to default behavior
			const { getProject } = await import("@inkeep/agents-core");
			vi.mocked(getProject).mockReturnValue(() =>
				Promise.resolve({
					models: {
						base: { model: "gpt-4o" },
						structuredOutput: { model: "gpt-4o-mini" },
						summarizer: { model: "gpt-3.5-turbo" },
					},
					stopWhen: {
						transferCountIs: 15,
						stepCountIs: 25,
					},
				}),
			);

			agent1 = new Agent({
				id: "agent1",
				name: "Agent 1",
				prompt: "Test agent 1",
				tenantId: "test-tenant",
			});

			agent2 = new Agent({
				id: "agent2",
				name: "Agent 2",
				prompt: "Test agent 2",
				tenantId: "test-tenant",
			});

			graph = new AgentGraph({
				id: "test-graph",
				name: "Test Graph",
				defaultAgent: agent1,
				agents: [agent2],
				tenantId: "test-tenant",
				projectId: "test-project",
			});

			// Mock successful API responses for graph operations
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ result: "Mocked response" }),
				text: () => Promise.resolve('{"result": "Mocked response"}'),
				status: 200,
				statusText: "OK",
			} as Response);
		});

		it("should inherit project-level model defaults when graph has no models", async () => {
			// Graph has no models configured - should inherit from project
			expect(graph.getModels()).toBeUndefined();

			await graph.init();

			// Should have inherited project models
			const inheritedModels = graph.getModels();
			expect(inheritedModels).toEqual({
				base: { model: "gpt-4o" },
				structuredOutput: { model: "gpt-4o-mini" },
				summarizer: { model: "gpt-3.5-turbo" },
			});

			// Verify database client was called for project lookup
			const { getProject } = await import("@inkeep/agents-core");
			expect(getProject).toHaveBeenCalled();
		});

		it("should not override existing graph models but inherit missing ones", async () => {
			const graphModels = {
				base: { model: "claude-3-sonnet" },
				structuredOutput: { model: "claude-3-haiku" },
			};

			graph.setModels(graphModels);
			expect(graph.getModels()).toEqual(graphModels);

			await graph.init();

			// Should keep existing graph models and inherit missing summarizer from project
			const expectedModels = {
				base: { model: "claude-3-sonnet" }, // kept from graph
				structuredOutput: { model: "claude-3-haiku" }, // kept from graph
				summarizer: { model: "gpt-3.5-turbo" }, // inherited from project
			};
			expect(graph.getModels()).toEqual(expectedModels);

			// Project database lookup is called for both model and stopWhen inheritance
			const { getProject } = await import("@inkeep/agents-core");
			expect(getProject).toHaveBeenCalled();
		});

		it("should propagate graph models to agents without models", async () => {
			const graphModels = {
				base: { model: "gpt-4o" },
				structuredOutput: { model: "gpt-4o-mini" },
			};

			graph.setModels(graphModels);

			// Agents start with no models
			expect(agent1.getModels()).toBeUndefined();
			expect(agent2.getModels()).toBeUndefined();

			await graph.init();

			// Agents should inherit graph models
			expect(agent1.getModels()).toEqual(graphModels);
			expect(agent2.getModels()).toEqual(graphModels);
		});

		it("should not override agent models when they are already configured", async () => {
			const graphModels = {
				base: { model: "gpt-4o" },
				structuredOutput: { model: "gpt-4o-mini" },
				summarizer: { model: "gpt-3.5-turbo" },
			};

			const agent1Models = {
				base: { model: "claude-3-opus" },
				summarizer: { model: "claude-3-haiku" },
			};

			graph.setModels(graphModels);
			agent1.setModels(agent1Models);

			await graph.init();

			// Agent1 should keep its existing models and inherit missing structuredOutput from graph
			const expectedAgent1Models = {
				base: { model: "claude-3-opus" }, // kept from agent
				summarizer: { model: "claude-3-haiku" }, // kept from agent
				structuredOutput: { model: "gpt-4o-mini" }, // inherited from graph
			};
			expect(agent1.getModels()).toEqual(expectedAgent1Models);

			// Agent2 should inherit all models from graph
			expect(agent2.getModels()).toEqual(graphModels);
		});

		it("should support partial model inheritance from graph to agents", async () => {
			const graphModels = {
				base: { model: "gpt-4o" },
				structuredOutput: { model: "gpt-4o-mini" },
				summarizer: { model: "gpt-3.5-turbo" },
			};

			// Agent1 has partial models (missing base)
			const agent1PartialModels = {
				structuredOutput: { model: "claude-3-haiku" },
				summarizer: { model: "claude-3-sonnet" },
				// no base - should inherit from graph
			};

			graph.setModels(graphModels);
			agent1.setModels(agent1PartialModels);

			await graph.init();

			// Agent1 should inherit missing base from graph, keep existing models
			const expectedAgent1Models = {
				base: { model: "gpt-4o" }, // inherited from graph
				structuredOutput: { model: "claude-3-haiku" }, // kept from agent
				summarizer: { model: "claude-3-sonnet" }, // kept from agent
			};
			expect(agent1.getModels()).toEqual(expectedAgent1Models);

			// Agent2 should inherit all models from graph (no agent models)
			expect(agent2.getModels()).toEqual(graphModels);
		});

		it("should handle project database errors gracefully", async () => {
			// Mock project database to throw error
			const { getProject } = await import("@inkeep/agents-core");
			vi.mocked(getProject).mockReturnValueOnce(() =>
				Promise.reject(new Error("Database error")),
			);

			// Graph has no models - will try to inherit from project
			expect(graph.getModels()).toBeUndefined();

			await graph.init();

			// Should remain undefined after failed project fetch
			expect(graph.getModels()).toBeUndefined();

			// Agents should also remain undefined
			expect(agent1.getModels()).toBeUndefined();
			expect(agent2.getModels()).toBeUndefined();
		});

		it("should handle project with no models configured", async () => {
			// Mock project database to return project without models
			const { getProject } = await import("@inkeep/agents-core");
			vi.mocked(getProject).mockReturnValueOnce(() =>
				Promise.resolve({
					name: "Test Project",
					// no models field
				}),
			);

			expect(graph.getModels()).toBeUndefined();

			await graph.init();

			// Should remain undefined when project has no models
			expect(graph.getModels()).toBeUndefined();
			expect(agent1.getModels()).toBeUndefined();
			expect(agent2.getModels()).toBeUndefined();
		});

		it("should support partial model inheritance when graph has some but not all model types", async () => {
			// Set partial graph models (missing summarizer)
			const partialGraphModels = {
				base: { model: "claude-3-sonnet" },
				structuredOutput: { model: "claude-3-haiku" },
				// no summarizer - should inherit from project
			};

			graph.setModels(partialGraphModels);

			await graph.init();

			// Should inherit missing summarizer from project, keep existing models
			const finalModels = graph.getModels();
			expect(finalModels).toEqual({
				base: { model: "claude-3-sonnet" }, // kept from graph
				structuredOutput: { model: "claude-3-haiku" }, // kept from graph
				summarizer: { model: "gpt-3.5-turbo" }, // inherited from project
			});
		});

		it("should work with full inheritance chain: project -> graph -> agent", async () => {
			// Set up inheritance chain
			const projectModels = {
				base: { model: "gpt-4o" },
				structuredOutput: { model: "gpt-4o-mini" },
				summarizer: { model: "gpt-3.5-turbo" },
			};

			// The default mock already returns project models, so no additional setup needed

			// Graph starts with no models - will inherit from project
			expect(graph.getModels()).toBeUndefined();

			await graph.init();

			// Verify full inheritance chain
			expect(graph.getModels()).toEqual(projectModels);
			expect(agent1.getModels()).toEqual(projectModels);
			expect(agent2.getModels()).toEqual(projectModels);
		});

		it("should support complex partial inheritance across entire chain", async () => {
			// Project has all three model types
			const _projectModels = {
				base: { model: "gpt-4o" },
				structuredOutput: { model: "gpt-4o-mini" },
				summarizer: { model: "gpt-3.5-turbo" },
			};

			// Graph has partial models (missing summarizer)
			const graphPartialModels = {
				base: { model: "claude-3-opus" }, // overrides project
				structuredOutput: { model: "claude-3-sonnet" }, // overrides project
				// no summarizer - should inherit from project
			};

			// Agent1 has partial models (missing base)
			const agent1PartialModels = {
				structuredOutput: { model: "claude-3-haiku" }, // overrides graph
				// no base or summarizer - should inherit from graph/project
			};

			// The default mock already returns project models
			graph.setModels(graphPartialModels);
			agent1.setModels(agent1PartialModels);

			await graph.init();

			// Verify complex inheritance:
			// Graph should inherit missing summarizer from project
			const expectedGraphModels = {
				base: { model: "claude-3-opus" }, // explicit in graph
				structuredOutput: { model: "claude-3-sonnet" }, // explicit in graph
				summarizer: { model: "gpt-3.5-turbo" }, // inherited from project
			};
			expect(graph.getModels()).toEqual(expectedGraphModels);

			// Agent1 should inherit missing models from graph
			const expectedAgent1Models = {
				base: { model: "claude-3-opus" }, // inherited from graph
				structuredOutput: { model: "claude-3-haiku" }, // explicit in agent
				summarizer: { model: "gpt-3.5-turbo" }, // inherited from graph (which got it from project)
			};
			expect(agent1.getModels()).toEqual(expectedAgent1Models);

			// Agent2 should inherit all models from graph
			expect(agent2.getModels()).toEqual(expectedGraphModels);
		});

		it("should apply inheritance to agents added via addAgent() after graph construction", async () => {
			// Create graph with models
			const graphModels = {
				base: { model: "claude-3-opus" },
				structuredOutput: { model: "claude-3-sonnet" },
			};

			const graph = new AgentGraph({
				id: "test-graph-add-agent",
				name: "Test Graph Add Agent",
				defaultAgent: agent1,
				models: graphModels,
				tenantId: "test-tenant",
				projectId: "test-project",
			});

			// Create a new agent after graph construction
			const newAgent = new Agent({
				id: "new-agent",
				name: "New Agent",
				prompt: "New agent added later",
				tenantId: "test-tenant",
			});

			// Agent should have no models initially
			expect(newAgent.getModels()).toBeUndefined();

			// Add agent to graph using addAgent()
			graph.addAgent(newAgent);

			// Agent should immediately inherit graph models
			expect(newAgent.getModels()).toEqual(graphModels);
		});
	});

	describe("Project-Level StopWhen Inheritance", () => {
		let graph: AgentGraph;
		let agent1: Agent;
		let agent2: Agent;

		beforeEach(async () => {
			vi.clearAllMocks();

			// Reset the @inkeep/core mock to default behavior with stopWhen
			const { getProject } = await import("@inkeep/agents-core");
			vi.mocked(getProject).mockReturnValue(() =>
				Promise.resolve({
					models: {
						base: { model: "gpt-4o" },
						structuredOutput: { model: "gpt-4o-mini" },
						summarizer: { model: "gpt-3.5-turbo" },
					},
					stopWhen: {
						transferCountIs: 15,
						stepCountIs: 25,
					},
				}),
			);

			agent1 = new Agent({
				id: "agent1",
				name: "Agent 1",
				prompt: "Test agent 1",
				tenantId: "test-tenant",
			});

			agent2 = new Agent({
				id: "agent2",
				name: "Agent 2",
				prompt: "Test agent 2",
				tenantId: "test-tenant",
			});

			graph = new AgentGraph({
				id: "test-graph",
				name: "Test Graph",
				defaultAgent: agent1,
				agents: [agent2],
				tenantId: "test-tenant",
				projectId: "test-project",
			});

			// Mock successful API responses for graph operations
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ result: "Mocked response" }),
				text: () => Promise.resolve('{"result": "Mocked response"}'),
				status: 200,
				statusText: "OK",
			} as Response);
		});

		it("should inherit project-level transferCountIs when graph has no stopWhen configured", async () => {
			// Graph starts with default stopWhen (transferCountIs: 10, no stepCountIs)
			const initialStopWhen = graph.getStopWhen();
			expect(initialStopWhen.transferCountIs).toBe(10); // default value

			await graph.init();

			// Should have inherited project transferCountIs (15) since it wasn't explicitly set
			const inheritedStopWhen = graph.getStopWhen();
			expect(inheritedStopWhen.transferCountIs).toBe(15);

			// Verify database client was called for project lookup
			const { getProject } = await import("@inkeep/agents-core");
			expect(getProject).toHaveBeenCalled();
		});

		it("should inherit project-level stepCountIs for agents when not configured", async () => {
			// Agents start with no stopWhen configured
			expect(agent1.config.stopWhen).toBeUndefined();
			expect(agent2.config.stopWhen).toBeUndefined();

			await graph.init();

			// Agents should inherit project stepCountIs (25)
			expect(agent1.config.stopWhen?.stepCountIs).toBe(25);
			expect(agent2.config.stopWhen?.stepCountIs).toBe(25);
		});

		it("should not override existing graph stopWhen configuration", async () => {
			// Set explicit graph stopWhen
			const graphConfig = {
				id: "test-graph-explicit",
				name: "Test Graph Explicit",
				defaultAgent: agent1,
				agents: [agent2],
				tenantId: "test-tenant",
				projectId: "test-project",
				stopWhen: {
					transferCountIs: 20, // explicit value
				},
			};

			const explicitGraph = new AgentGraph(graphConfig);

			// Should keep explicit value
			expect(explicitGraph.getStopWhen().transferCountIs).toBe(20);

			await explicitGraph.init();

			// Should not inherit from project - keep explicit value
			expect(explicitGraph.getStopWhen().transferCountIs).toBe(20);

			// But agents should still inherit stepCountIs from project
			const agents = explicitGraph.getAgents();
			const internalAgents = agents.filter((a) =>
				explicitGraph.isInternalAgent(a),
			);
			for (const agent of internalAgents) {
				expect((agent as any).config.stopWhen?.stepCountIs).toBe(25);
			}
		});

		it("should not override existing agent stopWhen configuration", async () => {
			// Set explicit agent stopWhen
			agent1.config.stopWhen = {
				stepCountIs: 30, // explicit value
			};

			await graph.init();

			// Agent1 should keep its explicit value
			expect(agent1.config.stopWhen.stepCountIs).toBe(30);

			// Agent2 should inherit project value
			expect(agent2.config.stopWhen?.stepCountIs).toBe(25);
		});

		it("should handle project with no stopWhen configured", async () => {
			// Create fresh graph and agents for this test
			const testAgent1 = new Agent({
				id: "test-agent1",
				name: "Test Agent 1",
				prompt: "Test agent 1",
				tenantId: "test-tenant",
			});

			const testAgent2 = new Agent({
				id: "test-agent2",
				name: "Test Agent 2",
				prompt: "Test agent 2",
				tenantId: "test-tenant",
			});

			const testGraph = new AgentGraph({
				id: "test-graph-no-stopwhen",
				name: "Test Graph No StopWhen",
				defaultAgent: testAgent1,
				agents: [testAgent2],
				tenantId: "test-tenant",
				projectId: "test-project",
			});

			const initialStopWhen = testGraph.getStopWhen();
			expect(initialStopWhen.transferCountIs).toBe(10); // default value

			// Clear and set specific mock for this test (after beforeEach)
			// Need to handle both model and stopWhen calls
			const { getProject } = await import("@inkeep/agents-core");
			vi.mocked(getProject).mockClear();
			vi.mocked(getProject).mockImplementation(
				() => () =>
					Promise.resolve({
						name: "Test Project",
						models: {
							base: { model: "gpt-4o" },
						},
						// no stopWhen field
					}),
			);

			await testGraph.init();

			// Should keep default when project has no stopWhen
			expect(testGraph.getStopWhen().transferCountIs).toBe(10);

			// Agents should have no stepCountIs configured
			expect(testAgent1.config.stopWhen?.stepCountIs).toBeUndefined();
			expect(testAgent2.config.stopWhen?.stepCountIs).toBeUndefined();
		});

		it("should handle project database errors gracefully for stopWhen", async () => {
			// Create fresh graph and agents for this test
			const testAgent1 = new Agent({
				id: "test-agent1-error",
				name: "Test Agent 1 Error",
				prompt: "Test agent 1",
				tenantId: "test-tenant",
			});

			const testAgent2 = new Agent({
				id: "test-agent2-error",
				name: "Test Agent 2 Error",
				prompt: "Test agent 2",
				tenantId: "test-tenant",
			});

			const testGraph = new AgentGraph({
				id: "test-graph-error",
				name: "Test Graph Error",
				defaultAgent: testAgent1,
				agents: [testAgent2],
				tenantId: "test-tenant",
				projectId: "test-project",
			});

			const initialStopWhen = testGraph.getStopWhen();
			expect(initialStopWhen.transferCountIs).toBe(10); // default value

			// Clear and set specific mock for this test (after beforeEach)
			// Need to handle both model and stopWhen calls
			const { getProject } = await import("@inkeep/agents-core");
			vi.mocked(getProject).mockClear();
			vi.mocked(getProject).mockImplementation(
				() => () => Promise.reject(new Error("Database error")),
			);

			await testGraph.init();

			// Should keep default when project fetch fails
			expect(testGraph.getStopWhen().transferCountIs).toBe(10);

			// Agents should have no stepCountIs configured
			expect(testAgent1.config.stopWhen?.stepCountIs).toBeUndefined();
			expect(testAgent2.config.stopWhen?.stepCountIs).toBeUndefined();
		});

		it("should support partial stopWhen inheritance", async () => {
			// Create fresh graph and agents for this test
			const testAgent1 = new Agent({
				id: "test-agent1-partial",
				name: "Test Agent 1 Partial",
				prompt: "Test agent 1",
				tenantId: "test-tenant",
			});

			const testAgent2 = new Agent({
				id: "test-agent2-partial",
				name: "Test Agent 2 Partial",
				prompt: "Test agent 2",
				tenantId: "test-tenant",
			});

			const testGraph = new AgentGraph({
				id: "test-graph-partial",
				name: "Test Graph Partial",
				defaultAgent: testAgent1,
				agents: [testAgent2],
				tenantId: "test-tenant",
				projectId: "test-project",
			});

			// Clear and set specific mock for this test (after beforeEach)
			// Need to handle both model and stopWhen calls
			const { getProject } = await import("@inkeep/agents-core");
			vi.mocked(getProject).mockClear();
			vi.mocked(getProject).mockImplementation(
				() => () =>
					Promise.resolve({
						models: {
							base: { model: "gpt-4o" },
						},
						stopWhen: {
							transferCountIs: 12,
							// no stepCountIs
						},
					}),
			);

			await testGraph.init();

			// Should inherit transferCountIs but not stepCountIs
			expect(testGraph.getStopWhen().transferCountIs).toBe(12);

			// Agents should not have stepCountIs since project doesn't define it
			expect(testAgent1.config.stopWhen?.stepCountIs).toBeUndefined();
			expect(testAgent2.config.stopWhen?.stepCountIs).toBeUndefined();
		});

		it("should work with full stopWhen inheritance chain: project -> graph -> agents", async () => {
			// Set up inheritance chain
			const _projectStopWhen = {
				transferCountIs: 15,
				stepCountIs: 25,
			};

			// The default mock already returns project stopWhen, so no additional setup needed

			// Graph starts with default stopWhen - will inherit transferCountIs from project
			const initialGraphStopWhen = graph.getStopWhen();
			expect(initialGraphStopWhen.transferCountIs).toBe(10); // default

			await graph.init();

			// Verify full inheritance chain
			const finalGraphStopWhen = graph.getStopWhen();
			expect(finalGraphStopWhen.transferCountIs).toBe(15); // inherited from project

			// Both agents should inherit stepCountIs from project
			expect(agent1.config.stopWhen?.stepCountIs).toBe(25);
			expect(agent2.config.stopWhen?.stepCountIs).toBe(25);
		});

		it("should initialize agent stopWhen objects when inheriting", async () => {
			// Agents start with no stopWhen
			expect(agent1.config.stopWhen).toBeUndefined();
			expect(agent2.config.stopWhen).toBeUndefined();

			await graph.init();

			// Agents should have stopWhen objects initialized even if they only inherit stepCountIs
			expect(agent1.config.stopWhen).toBeDefined();
			expect(agent2.config.stopWhen).toBeDefined();
			expect(agent1.config.stopWhen?.stepCountIs).toBe(25);
			expect(agent2.config.stopWhen?.stepCountIs).toBe(25);
		});

		it("should handle mixed inheritance scenarios", async () => {
			// Set graph with partial stopWhen and agent with partial stopWhen
			const mixedGraph = new AgentGraph({
				id: "mixed-graph",
				name: "Mixed Graph",
				defaultAgent: agent1,
				agents: [agent2],
				tenantId: "test-tenant",
				projectId: "test-project",
				stopWhen: {
					transferCountIs: 18, // graph explicit
					// no stepCountIs - will be inherited from project
				},
			});

			// Agent1 has partial stopWhen
			agent1.config.stopWhen = {
				stepCountIs: 35, // agent explicit
			};

			await mixedGraph.init();

			// Graph should keep explicit transferCountIs
			expect(mixedGraph.getStopWhen().transferCountIs).toBe(18);

			// Agent1 should keep explicit stepCountIs
			expect(agent1.config.stopWhen.stepCountIs).toBe(35);

			// Agent2 should inherit stepCountIs from project
			expect(agent2.config.stopWhen?.stepCountIs).toBe(25);
		});
	});

	describe("Referential Getter Syntax", () => {
		it("should support getter functions for agents and credentials", async () => {
			const testAgent = new Agent({
				id: "test-agent",
				name: "Test Agent",
				prompt: "Test instructions",
				tenantId: "test-tenant",
			});

			const credentialRef = {
				id: "test-cred",
				type: "memory" as const,
				credentialStoreId: "memory-default",
				retrievalParams: {
					key: "TEST_KEY",
				},
			};

			// Using getter functions instead of arrays
			const graph = new AgentGraph({
				id: "getter-test-graph",
				name: "Getter Test Graph",
				description: "Test using getter syntax",
				defaultAgent: testAgent,
				agents: () => [testAgent],
				credentials: () => [credentialRef],
				tenantId: "test-tenant",
			});

			expect(graph.getAgents()).toContain(testAgent);
			expect(graph.getId()).toBe("getter-test-graph");
		});

		it("should support getter functions for agent tools", () => {
			const tool1 = { id: "tool1", name: "Tool 1" };
			const tool2 = { id: "tool2", name: "Tool 2" };

			const agent = new Agent({
				id: "test-agent",
				name: "Test Agent",
				prompt: "Test instructions",
				tools: () => [tool1, tool2],
				tenantId: "test-tenant",
			});

			const tools = agent.getTools();
			expect(tools).toHaveProperty("tool1");
			expect(tools).toHaveProperty("tool2");
			expect(tools.tool1).toBe(tool1);
			expect(tools.tool2).toBe(tool2);
		});

		it("should support getter functions for dataComponents and artifactComponents", () => {
			const dataComponent = {
				id: "data1",
				name: "Data Component 1",
				description: "Test data component",
				props: { key: "value" },
			};

			const artifactComponent = {
				id: "artifact1",
				name: "Artifact Component 1",
				description: "Test artifact component",
				summaryProps: { summary: "test" },
				fullProps: { full: "test" },
			};

			const agent = new Agent({
				id: "test-agent",
				name: "Test Agent",
				prompt: "Test instructions",
				dataComponents: () => [dataComponent],
				artifactComponents: () => [artifactComponent],
				tenantId: "test-tenant",
			});

			expect(agent.getDataComponents()).toEqual([dataComponent]);
			expect(agent.getArtifactComponents()).toEqual([artifactComponent]);
		});
	});
});
