import { beforeEach, describe, expect, it, vi } from "vitest";
import { agent, agentGraph } from "../../index";

describe("Graph Model Settings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should create graph with model settingsuration", () => {
		const testGraph = agentGraph({
			id: "test-graph",
			name: "Test Graph with Model Settings",
			models: {
				base: {
					model: "anthropic/claude-3-5-haiku-20241022",
					providerOptions: {
						anthropic: {
							temperature: 0.8,
							maxTokens: 2048,
						},
					},
				},
				structuredOutput: {
					model: "gpt-4o-mini",
				},
				summarizer: {
					model: "anthropic/claude-3-haiku-20240307",
				},
			},
			defaultAgent: agent({
				id: "test-agent",
				name: "Test Agent",
				prompt: "You are a test agent",
				description: "Test Agent",
			}),
		});

		expect(testGraph.getModels()).toEqual({
			base: {
				model: "anthropic/claude-3-5-haiku-20241022",
				providerOptions: {
					anthropic: {
						temperature: 0.8,
						maxTokens: 2048,
					},
				},
			},
			structuredOutput: {
				model: "gpt-4o-mini",
			},
			summarizer: {
				model: "anthropic/claude-3-haiku-20240307",
			},
		});
	});

	it("should propagate graph model settings to agents without their own config", () => {
		const agentWithoutConfig = agent({
			id: "agent-without-config",
			name: "Agent Without Config",
			prompt: "You are a test agent",
			description: "Test Agent",
		});

		const agentWithConfig = agent({
			id: "agent-with-config",
			name: "Agent With Config",
			prompt: "You are a test agent",
			models: {
				base: {
					model: "openai/gpt-4o",
					providerOptions: {
						openai: {
							temperature: 0.3,
						},
					},
				},
			},
			description: "Test Agent",
		});

		// Create graph with model settingsuration
		const testGraph = agentGraph({
			id: "test-graph",
			name: "Test Graph",
			models: {
				base: {
					model: "anthropic/claude-3-5-haiku-20241022",
					providerOptions: {
						anthropic: {
							temperature: 0.8,
						},
					},
				},
			},
			defaultAgent: agentWithoutConfig,
			agents: () => [agentWithoutConfig, agentWithConfig],
		});

		// Model Settings should be inherited during graph construction
		expect(agentWithoutConfig.config.models).toEqual({
			base: {
				model: "anthropic/claude-3-5-haiku-20241022",
				providerOptions: {
					anthropic: {
						temperature: 0.8,
					},
				},
			},
		});

		// Agent with config should keep its own configuration
		expect(agentWithConfig.config.models).toEqual({
			base: {
				model: "openai/gpt-4o",
				providerOptions: {
					openai: {
						temperature: 0.3,
					},
				},
			},
		});
	});

	it("should handle graph without model settingsuration", () => {
		const testGraph = agentGraph({
			id: "test-graph",
			name: "Test Graph Without Model Settings",
			defaultAgent: agent({
				id: "test-agent",
				name: "Test Agent",
				prompt: "You are a test agent",
				description: "Test Agent",
			}),
		});

		expect(testGraph.getModels()).toBeUndefined();
	});

	it("should include model settings in graph statistics and validation", () => {
		const testGraph = agentGraph({
			id: "test-graph",
			name: "Test Graph",
			models: {
				base: {
					model: "anthropic/claude-4-sonnet-20250514",
				},
			},
			defaultAgent: agent({
				id: "test-agent",
				name: "Test Agent",
				prompt: "You are a test agent",
				description: "Test Agent",
			}),
		});

		const stats = testGraph.getStats();
		expect(stats.graphId).toBe("test-graph");
		expect(stats.agentCount).toBe(1);

		const validation = testGraph.validate();
		expect(validation.valid).toBe(true);
		expect(validation.errors).toHaveLength(0);
	});

	it("should create graph with provider options in models", () => {
		const testGraph = agentGraph({
			id: "test-graph",
			name: "Test Graph",
			models: {
				base: {
					model: "gpt-4o",
					providerOptions: {
						anthropic: {
							temperature: 0.7,
							maxTokens: 4096,
						},
						openai: {
							temperature: 0.5,
							maxTokens: 2048,
						},
					},
				},
			},
			defaultAgent: agent({
				id: "test-agent",
				name: "Test Agent",
				prompt: "You are a test agent",
				description: "Test Agent",
			}),
		});

		expect(testGraph.getModels()).toEqual({
			base: {
				model: "gpt-4o",
				providerOptions: {
					anthropic: {
						temperature: 0.7,
						maxTokens: 4096,
					},
					openai: {
						temperature: 0.5,
						maxTokens: 2048,
					},
				},
			},
		});
	});

	it("should create graph with model settings without provider options", () => {
		const testGraph = agentGraph({
			id: "test-graph",
			name: "Test Graph",
			models: {
				base: {
					model: "anthropic/claude-3-5-sonnet-20241022",
				},
				structuredOutput: {
					model: "gpt-4o-mini",
				},
			},
			defaultAgent: agent({
				id: "test-agent",
				name: "Test Agent",
				prompt: "You are a test agent",
				description: "Test Agent",
			}),
		});

		expect(testGraph.getModels()).toEqual({
			base: {
				model: "anthropic/claude-3-5-sonnet-20241022",
			},
			structuredOutput: {
				model: "gpt-4o-mini",
			},
		});
	});

	it("should create graph with graph prompt", () => {
		const testGraph = agentGraph({
			id: "test-graph",
			name: "Test Graph with Prompt",
			graphPrompt:
				"This is a specialized AI assistant for customer support. Always be helpful and professional.",
			defaultAgent: agent({
				id: "test-agent",
				name: "Test Agent",
				prompt: "You are a test agent",
			}),
		});

		expect(testGraph.getGraphPrompt()).toBe(
			"This is a specialized AI assistant for customer support. Always be helpful and professional.",
		);
	});

	it("should return undefined for graph without prompt", () => {
		const testGraph = agentGraph({
			id: "test-graph",
			name: "Test Graph",
			defaultAgent: agent({
				id: "test-agent",
				name: "Test Agent",
				prompt: "You are a test agent",
			}),
		});

		expect(testGraph.getGraphPrompt()).toBeUndefined();
	});
});
