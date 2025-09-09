import { describe, expect, it } from "vitest";
import { Agent } from "../../agent";
import { createTestTenantId } from "../utils/testTenant";

describe("Agent with DataComponents Integration", () => {
	const tenantId = createTestTenantId("agent-datacomponents");

	it("should handle agents with data components configuration", () => {
		const agentConfig = {
			id: "test-agent-with-datacomponents",
			name: "TestAgentWithDataComponents",
			tenantId,
			description: "An agent that has data components",
			prompt: "You are a helpful agent with UI components.",
			dataComponents: [
				{
					id: "orders-list-1",
					tenantId,
					name: "OrdersList",
					description: "Display a list of user orders",
					props: {
						type: "object",
						properties: {
							orders: {
								type: "array",
								items: { type: "string" },
								description: "Order items to display",
							},
						},
						required: ["orders"],
					},
				},
				{
					id: "sales-button-1",
					tenantId,
					name: "SalesButton",
					description: "Button to contact sales team",
					props: {
						type: "object",
						properties: {
							label: {
								type: "string",
								description: "Button label text",
							},
						},
						required: ["label"],
					},
				},
			],
		};

		const agent = new Agent(agentConfig);

		expect(agent.getName()).toBe("TestAgentWithDataComponents");
		expect(agent.config.description).toBe("An agent that has data components");
		expect(agent.getInstructions()).toBe(
			"You are a helpful agent with UI components.",
		);
		expect(agent.getId()).toBe("test-agent-with-datacomponents");
		expect(agent.config.dataComponents).toHaveLength(2);
		expect(agent.config.dataComponents?.[0].name).toBe("OrdersList");
		expect(agent.config.dataComponents?.[1].name).toBe("SalesButton");
	});

	it("should handle agents without data components", () => {
		const agentConfig = {
			id: "simple-agent",
			name: "SimpleAgent",
			tenantId,
			description: "A simple agent without data components",
			prompt: "You are a simple helpful agent.",
		};

		const agent = new Agent(agentConfig);

		expect(agent.getName()).toBe("SimpleAgent");
		expect(agent.config.dataComponents).toBeUndefined();
	});

	it("should handle agents with empty data components array", () => {
		const agentConfig = {
			id: "empty-datacomponents-agent",
			name: "EmptyDataComponentsAgent",
			tenantId,
			description: "Agent with empty data components",
			prompt: "You are a helpful agent.",
			dataComponents: [],
		};

		const agent = new Agent(agentConfig);

		expect(agent.getName()).toBe("EmptyDataComponentsAgent");
		expect(agent.config.dataComponents).toEqual([]);
	});
});
