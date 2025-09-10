import { getLogger } from "@inkeep/agents-core";
import type {
	AgentInterface,
	GenerateOptions,
	GraphInterface,
	Message,
	MessageInput,
	RunResult,
	StreamResponse,
	ToolCall,
} from "./types";
import { MaxTurnsExceededError } from "./types";

const logger = getLogger("runner");

export class Runner {
	/**
	 * Run a graph until completion, handling transfers and tool calls
	 * Similar to OpenAI's Runner.run() pattern
	 * NOTE: This now requires a graph instead of an agent
	 */
	static async run(
		graph: GraphInterface,
		messages: MessageInput,
		options?: GenerateOptions,
	): Promise<RunResult> {
		const maxTurns = options?.maxTurns || 10;
		let turnCount = 0;
		const messageHistory = Runner.normalizeToMessageHistory(messages);
		const allToolCalls: ToolCall[] = [];
		const _allTransfers: Array<{ from: string; to: string; reason?: string }> =
			[];

		logger.info(
			{
				graphId: graph.getId(),
				defaultAgent: graph.getDefaultAgent()?.getName(),
				maxTurns,
				initialMessageCount: messageHistory.length,
			},
			"Starting graph run",
		);

		while (turnCount < maxTurns) {
			logger.debug(
				{
					graphId: graph.getId(),
					turnCount,
					messageHistoryLength: messageHistory.length,
				},
				"Starting turn",
			);

			// Use graph.generate to handle agent orchestration
			const response = await graph.generate(messageHistory, options);
			turnCount++;

			// Since graph.generate returns a string (the final response),
			// we need to treat this as a completed generation
			logger.info(
				{
					graphId: graph.getId(),
					turnCount,
					responseLength: response.length,
				},
				"Graph generation completed",
			);

			// Return the result wrapped in RunResult format
			return {
				finalOutput: response,
				agent: graph.getDefaultAgent() || ({} as AgentInterface),
				turnCount,
				usage: { inputTokens: 0, outputTokens: 0 },
				metadata: {
					toolCalls: allToolCalls,
					transfers: [], // Graph handles transfers internally
				},
			};
		}

		// Max turns exceeded
		logger.error(
			{
				graphId: graph.getId(),
				maxTurns,
				finalTurnCount: turnCount,
			},
			"Maximum turns exceeded",
		);

		throw new MaxTurnsExceededError(maxTurns);
	}

	/**
	 * Stream a graph's response
	 */
	static async stream(
		graph: GraphInterface,
		messages: MessageInput,
		options?: GenerateOptions,
	): Promise<StreamResponse> {
		logger.info(
			{
				graphId: graph.getId(),
				defaultAgent: graph.getDefaultAgent()?.getName(),
			},
			"Starting graph stream",
		);

		// Delegate to graph's stream method
		return graph.stream(messages, options);
	}

	/**
	 * Execute multiple graphs in parallel and return the first successful result
	 */
	static async raceGraphs(
		graphs: GraphInterface[],
		messages: MessageInput,
		options?: GenerateOptions,
	): Promise<RunResult> {
		if (graphs.length === 0) {
			throw new Error("No graphs provided for race");
		}

		logger.info(
			{
				graphCount: graphs.length,
				graphIds: graphs.map((g) => g.getId()),
			},
			"Starting graph race",
		);

		const promises = graphs.map(async (graph, index) => {
			try {
				const result = await Runner.run(graph, messages, options);
				return { ...result, raceIndex: index };
			} catch (error) {
				logger.error(
					{
						graphId: graph.getId(),
						error: error instanceof Error ? error.message : "Unknown error",
					},
					"Graph failed in race",
				);
				throw error;
			}
		});

		const result = await Promise.race(promises);

		logger.info(
			{
				winningGraphId: (result as any).graphId || "unknown",
				raceIndex: (result as any).raceIndex,
			},
			"Graph race completed",
		);

		return result;
	}

	// Private helper methods
	private static normalizeToMessageHistory(messages: MessageInput): Message[] {
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

	/**
	 * Validate graph configuration before running
	 */
	static validateGraph(graph: GraphInterface): {
		valid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		if (!graph.getId()) {
			errors.push("Graph ID is required");
		}

		const defaultAgent = graph.getDefaultAgent();
		if (!defaultAgent) {
			errors.push("Default agent is required");
		} else {
			if (!defaultAgent.getName()) {
				errors.push("Default agent name is required");
			}
			if (!defaultAgent.getInstructions()) {
				errors.push("Default agent instructions are required");
			}
		}

		// Validate all agents in the graph
		const agents = graph.getAgents();
		if (agents.length === 0) {
			errors.push("Graph must contain at least one agent");
		}

		for (const agent of agents) {
			if (!agent.getName()) {
				errors.push(`Agent missing name`);
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Get execution statistics for a graph
	 */
	static async getExecutionStats(
		graph: GraphInterface,
		messages: MessageInput,
		options?: GenerateOptions,
	): Promise<{
		estimatedTurns: number;
		estimatedTokens: number;
		agentCount: number;
		defaultAgent: string | undefined;
	}> {
		const agents = graph.getAgents();
		const defaultAgent = graph.getDefaultAgent();
		const messageCount = Array.isArray(messages) ? messages.length : 1;

		return {
			estimatedTurns: Math.min(
				Math.max(messageCount, 1),
				options?.maxTurns || 10,
			),
			estimatedTokens: messageCount * 100, // Rough estimate
			agentCount: agents.length,
			defaultAgent: defaultAgent?.getName(),
		};
	}
}

// Export convenience functions that match OpenAI's pattern
export const run = Runner.run.bind(Runner);
export const stream = Runner.stream.bind(Runner);
export const raceGraphs = Runner.raceGraphs.bind(Runner);
