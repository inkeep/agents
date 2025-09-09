import * as graphFullModule from "@inkeep/agents-core";
import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";
import { agent, agentGraph, tool } from "../../index";
import { createTestTenantId } from "../utils/testTenant";

// Mock @inkeep/agents-core
vi.mock("@inkeep/agents-core", async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		getLogger: () => ({
			info: vi.fn(),
			debug: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
		}),
	};
});

// Mock the graphFullClient
vi.mock("../../graphFullClient.js", () => ({
	updateFullGraphViaAPI: vi.fn().mockResolvedValue({
		id: "test-graph",
		name: "Test Graph",
		agents: {
			"test-agent": {
				id: "test-agent",
				name: "Test Agent",
				prompt: "Test instructions",
				tools: [],
			},
			"component-agent": {
				id: "component-agent",
				name: "Component Agent",
				prompt: "You are a component-enabled agent.",
				tools: [],
			},
			standalone: {
				id: "standalone",
				name: "Standalone Agent",
				prompt: "You work alone.",
				tools: [],
				canTransferTo: [],
				canDelegateTo: [],
			},
			"error-agent": {
				id: "error-agent",
				name: "Error Agent",
				prompt: "You will cause an error.",
				tools: [],
			},
		},
		tools: {},
		dataComponents: {},
		artifactComponents: {},
		defaultAgentId: "test-agent",
	}),
	createFullGraphViaAPI: vi.fn().mockResolvedValue({
		id: "test-graph",
		name: "Test Graph",
		agents: {
			"test-agent": {
				id: "test-agent",
				name: "Test Agent",
				prompt: "Test instructions",
				tools: [],
			},
		},
		tools: {},
		dataComponents: {},
		artifactComponents: {},
		defaultAgentId: "test-agent",
	}),
	getFullGraphViaAPI: vi.fn().mockResolvedValue(null),
}));

describe("Graph Builder Refactor - Integration Tests", () => {
	it.skip("should use the new graph endpoint for initialization", async () => {
		const tenantId = createTestTenantId("graph-refactor");

		// Spy on the createFullGraphServerSide function to verify it's being called
		const createFullGraphSpy = vi.spyOn(
			graphFullModule,
			"createFullGraphServerSide",
		);

		// Create test agents with tools
		const testTool = tool({
			name: "test_tool",
			description: "A test tool",
			execute: async () => {
				return "test result";
			},
		});

		const agent1 = agent({
			id: "agent1",
			tenantId,
			name: "Agent 1",
			description: "First test agent",
			prompt: "You are agent 1.",
			tools: () => [testTool],
		});

		const agent2 = agent({
			id: "agent2",
			tenantId,
			name: "Agent 2",
			description: "Second test agent",
		});

		// Set up bidirectional transfer
		agent1.addTransfer(agent2);

		// Create the graph
		const graphId = `test-graph-${nanoid()}`;
		const graph = agentGraph({
			tenantId,
			id: graphId,
			name: "Test Graph",
			description: "A test graph for refactor validation",
			defaultAgent: agent1,
			agents: {
				agent1,
				agent2,
			},
		});

		// Initialize the graph
		await graph.init();

		// Verify that createFullGraphServerSide was called
		expect(createFullGraphSpy).toHaveBeenCalledTimes(1);

		// Verify the structure of the call
		const [calledTenantId, calledGraphData] = createFullGraphSpy.mock.calls[0];
		expect(calledTenantId).toBe(tenantId);
		expect(calledGraphData).toMatchObject({
			id: graphId,
			name: graphId,
			description: `Agent graph ${graphId}`,
			defaultAgentId: "agent-1", // Agent IDs are converted to kebab-case
			agents: expect.objectContaining({
				"agent-1": expect.objectContaining({
					id: "agent-1",
					name: "Agent 1",
					description: "First test agent",
					canDelegateTo: [],
					tools: expect.arrayContaining([
						expect.objectContaining({
							id: "test_tool",
							name: "test_tool",
						}),
					]),
				}),
				"agent-2": expect.objectContaining({
					id: "agent-2",
					name: "Agent 2",
					description: "Second test agent",
					canDelegateTo: [],
					tools: [],
				}),
			}),
		});

		// Cleanup spy
		createFullGraphSpy.mockRestore();
	});

	it.skip("should handle component mode correctly", async () => {
		const tenantId = createTestTenantId("graph-component-mode");

		// Import and spy on the updateFullGraphViaAPI function
		const { updateFullGraphViaAPI } = await import(
			"../../data/graphFullClient.js"
		);
		const updateSpy = vi.mocked(updateFullGraphViaAPI);
		updateSpy.mockClear(); // Clear previous calls

		const agent1 = agent({
			id: "component-agent",
			tenantId,
			name: "Component Agent",
			description: "Agent with component mode",
			prompt: "You are a component-enabled agent.",
		});

		const graphId = `component-graph-${nanoid()}`;
		const graph = agentGraph({
			tenantId,
			id: graphId,
			name: "Component Graph",
			description: "A graph with component mode enabled",
			componentMode: true, // Enable component mode
			defaultAgent: agent1,
			agents: () => [agent1],
		});

		await graph.init();

		// Verify that updateFullGraphViaAPI was called
		expect(updateSpy).toHaveBeenCalled();

		// Verify that the agent instructions are preserved (component mode is deprecated)
		const calledGraphData = updateSpy.mock.calls[0][4]; // 5th argument is graphData (tenantId, projectId, apiUrl, graphId, graphData)
		const agentInstructions = calledGraphData.agents["component-agent"].prompt;

		// Instructions should be preserved as originally specified
		expect(agentInstructions).toBe("You are a component-enabled agent.");

		updateSpy.mockClear();
	});

	it.skip("should handle graphs with no relationships", async () => {
		const tenantId = createTestTenantId("graph-no-relations");

		const { updateFullGraphViaAPI } = await import(
			"../../data/graphFullClient.js"
		);
		const updateSpy = vi.mocked(updateFullGraphViaAPI);
		updateSpy.mockClear(); // Clear previous calls

		const standaloneAgent = agent({
			id: "standalone",
			tenantId,
			name: "Standalone Agent",
			description: "An agent with no relationships",
			prompt: "You work alone.",
		});

		const graphId = `standalone-graph-${nanoid()}`;
		const graph = agentGraph({
			tenantId,
			id: graphId,
			name: "Standalone Graph",
			defaultAgent: standaloneAgent,
			agents: () => [standaloneAgent],
		});

		await graph.init();

		expect(updateSpy).toHaveBeenCalled();

		const calledGraphData = updateSpy.mock.calls[0][4]; // 5th argument is graphData

		// The Agent.getId() method now returns the config.id directly
		// Agent was created with id: 'standalone'
		expect(calledGraphData.agents["standalone"]).toMatchObject({
			id: "standalone",
			canTransferTo: [],
			canDelegateTo: [],
			tools: [],
		});

		updateSpy.mockClear();
	});

	it("should preserve the legacy initialization method", async () => {
		const tenantId = createTestTenantId("graph-legacy");

		const agent1 = agent({
			id: "legacy-agent",
			tenantId,
			name: "Legacy Agent",
			description: "Agent for legacy test",
			prompt: "You are a legacy agent.",
		});

		const graphId = `legacy-graph-${nanoid()}`;
		const graph = agentGraph({
			tenantId,
			id: graphId,
			name: "Legacy Graph",
			defaultAgent: agent1,
			agents: () => [agent1],
		});

		// Verify that the initLegacy method exists and can be called
		expect(typeof (graph as any).initLegacy).toBe("function");

		// We won't actually call it to avoid side effects, but verify it exists
		// This ensures backward compatibility is maintained
	});

	it.skip("should handle errors in graph initialization gracefully", async () => {
		const tenantId = createTestTenantId("graph-error");

		// Mock updateFullGraphViaAPI to throw an error
		const { updateFullGraphViaAPI } = await import(
			"../../data/graphFullClient.js"
		);
		const updateSpy = vi.mocked(updateFullGraphViaAPI);
		updateSpy.mockClear(); // Clear previous calls
		updateSpy.mockRejectedValueOnce(new Error("Graph creation failed"));

		const agent1 = agent({
			id: "error-agent",
			tenantId,
			name: "Error Agent",
			description: "Agent that will cause error",
			prompt: "You will cause an error.",
		});

		const graphId = `error-graph-${nanoid()}`;
		const graph = agentGraph({
			tenantId,
			id: graphId,
			name: "Error Graph",
			defaultAgent: agent1,
			agents: () => [agent1],
		});

		// Expect initialization to throw the error
		await expect(graph.init()).rejects.toThrow("Graph creation failed");

		// Verify that updateFullGraphViaAPI was called despite the error
		expect(updateSpy).toHaveBeenCalledTimes(1);

		updateSpy.mockClear();
	});
});
