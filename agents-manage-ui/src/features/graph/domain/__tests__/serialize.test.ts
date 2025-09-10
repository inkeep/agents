import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { AgentNodeData } from "@/components/graph/configuration/node-types";
import { NodeType } from "@/components/graph/configuration/node-types";
import { serializeGraphData } from "../serialize";

describe("serializeGraphData", () => {
	describe("models object processing", () => {
		it("should set models to undefined when models object has only empty values", () => {
			const nodes: Node<AgentNodeData>[] = [
				{
					id: "agent1",
					type: NodeType.Agent,
					position: { x: 0, y: 0 },
					data: {
						id: "agent1",
						name: "Test Agent",
						prompt: "Test instructions",
						models: {
							base: undefined,
							structuredOutput: undefined,
							summarizer: undefined,
						},
					},
				},
			];
			const edges: Edge[] = [];

			const result = serializeGraphData(nodes, edges);

			expect((result.agents.agent1 as any).models).toBeUndefined();
		});

		it("should set models to undefined when models object has only whitespace values", () => {
			const nodes: Node<AgentNodeData>[] = [
				{
					id: "agent1",
					type: NodeType.Agent,
					position: { x: 0, y: 0 },
					data: {
						id: "agent1",
						name: "Test Agent",
						prompt: "Test instructions",
						models: {
							base: undefined,
							structuredOutput: undefined,
							summarizer: undefined,
						},
					},
				},
			];
			const edges: Edge[] = [];

			const result = serializeGraphData(nodes, edges);

			expect((result.agents.agent1 as any).models).toBeUndefined();
		});

		it("should include models object when model field has a value", () => {
			const nodes: Node<AgentNodeData>[] = [
				{
					id: "agent1",
					type: NodeType.Agent,
					position: { x: 0, y: 0 },
					data: {
						id: "agent1",
						name: "Test Agent",
						prompt: "Test instructions",
						models: {
							base: { model: "gpt-4" },
							structuredOutput: undefined,
							summarizer: undefined,
						},
					},
				},
			];
			const edges: Edge[] = [];

			const result = serializeGraphData(nodes, edges);

			expect((result.agents.agent1 as any).models).toEqual({
				base: { model: "gpt-4" },
				structuredOutput: undefined,
				summarizer: undefined,
			});
		});

		it("should include models object when structuredOutput has a value", () => {
			const nodes: Node<AgentNodeData>[] = [
				{
					id: "agent1",
					type: NodeType.Agent,
					position: { x: 0, y: 0 },
					data: {
						id: "agent1",
						name: "Test Agent",
						prompt: "Test instructions",
						models: {
							base: undefined,
							structuredOutput: { model: "gpt-4o-2024-08-06" },
							summarizer: undefined,
						},
					},
				},
			];
			const edges: Edge[] = [];

			const result = serializeGraphData(nodes, edges);

			expect((result.agents.agent1 as any).models).toEqual({
				base: undefined,
				structuredOutput: { model: "gpt-4o-2024-08-06" },
				summarizer: undefined,
			});
		});

		it("should include models object when summarizer has a value", () => {
			const nodes: Node<AgentNodeData>[] = [
				{
					id: "agent1",
					type: NodeType.Agent,
					position: { x: 0, y: 0 },
					data: {
						id: "agent1",
						name: "Test Agent",
						prompt: "Test instructions",
						models: {
							base: undefined,
							structuredOutput: undefined,
							summarizer: { model: "gpt-3.5-turbo" },
						},
					},
				},
			];
			const edges: Edge[] = [];

			const result = serializeGraphData(nodes, edges);

			expect((result.agents.agent1 as any).models).toEqual({
				base: undefined,
				structuredOutput: undefined,
				summarizer: { model: "gpt-3.5-turbo" },
			});
		});

		it("should include all fields when they have values", () => {
			const nodes: Node<AgentNodeData>[] = [
				{
					id: "agent1",
					type: NodeType.Agent,
					position: { x: 0, y: 0 },
					data: {
						id: "agent1",
						name: "Test Agent",
						prompt: "Test instructions",
						models: {
							base: { model: "gpt-4" },
							structuredOutput: { model: "gpt-4o-2024-08-06" },
							summarizer: { model: "gpt-3.5-turbo" },
						},
					},
				},
			];
			const edges: Edge[] = [];

			const result = serializeGraphData(nodes, edges);

			expect((result.agents.agent1 as any).models).toEqual({
				base: { model: "gpt-4" },
				structuredOutput: { model: "gpt-4o-2024-08-06" },
				summarizer: { model: "gpt-3.5-turbo" },
			});
		});

		it("should set models to undefined when no models data is provided", () => {
			const nodes: Node<AgentNodeData>[] = [
				{
					id: "agent1",
					type: NodeType.Agent,
					position: { x: 0, y: 0 },
					data: {
						id: "agent1",
						name: "Test Agent",
						prompt: "Test instructions",
						// no models property
					},
				},
			];
			const edges: Edge[] = [];

			const result = serializeGraphData(nodes, edges);

			expect((result.agents.agent1 as any).models).toBeUndefined();
		});
	});
});
