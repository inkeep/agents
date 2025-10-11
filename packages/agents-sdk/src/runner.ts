import { getLogger } from '@inkeep/agents-core';
import type {
  GenerateOptions,
  AgentInterface,
  Message,
  MessageInput,
  RunResult,
  StreamResponse,
  SubAgentInterface,
  ToolCall,
} from './types';
import { MaxTurnsExceededError } from './types';

const logger = getLogger('runner');

export class Runner {
  /**
   * Run a agent until completion, handling transfers and tool calls
   * Similar to OpenAI's Runner.run() pattern
   * NOTE: This now requires a agent instead of an agent
   */
  static async run(
    agent: AgentInterface,
    messages: MessageInput,
    options?: GenerateOptions
  ): Promise<RunResult> {
    const maxTurns = options?.maxTurns || 10;
    let turnCount = 0;
    const messageHistory = Runner.normalizeToMessageHistory(messages);
    const allToolCalls: ToolCall[] = [];
    const _allTransfers: Array<{ from: string; to: string; reason?: string }> = [];

    logger.info(
      {
        agentId: agent.getId(),
        defaultSubAgent: agent.getDefaultSubAgent()?.getName(),
        maxTurns,
        initialMessageCount: messageHistory.length,
      },
      'Starting agent run'
    );

    while (turnCount < maxTurns) {
      logger.debug(
        {
          agentId: agent.getId(),
          turnCount,
          messageHistoryLength: messageHistory.length,
        },
        'Starting turn'
      );

      // Use agent.generate to handle agent orchestration
      const response = await agent.generate(messageHistory, options);
      turnCount++;

      // Since agent.generate returns a string (the final response),
      // we need to treat this as a completed generation
      logger.info(
        {
          agentId: agent.getId(),
          turnCount,
          responseLength: response.length,
        },
        'Agent generation completed'
      );

      // Return the result wrapped in RunResult format
      return {
        finalOutput: response,
        agent: agent.getDefaultSubAgent() || ({} as SubAgentInterface),
        turnCount,
        usage: { inputTokens: 0, outputTokens: 0 },
        metadata: {
          toolCalls: allToolCalls,
          transfers: [], // Agent handles transfers internally
        },
      };
    }

    // Max turns exceeded
    logger.error(
      {
        agentId: agent.getId(),
        maxTurns,
        finalTurnCount: turnCount,
      },
      'Maximum turns exceeded'
    );

    throw new MaxTurnsExceededError(maxTurns);
  }

  /**
   * Stream a agent's response
   */
  static async stream(
    agent: AgentInterface,
    messages: MessageInput,
    options?: GenerateOptions
  ): Promise<StreamResponse> {
    logger.info(
      {
        agentId: agent.getId(),
        defaultSubAgent: agent.getDefaultSubAgent()?.getName(),
      },
      'Starting agent stream'
    );

    // Delegate to agent's stream method
    return agent.stream(messages, options);
  }

  /**
   * Execute multiple agent in parallel and return the first successful result
   */
  static async raceGraphs(
    agent: AgentInterface[],
    messages: MessageInput,
    options?: GenerateOptions
  ): Promise<RunResult> {
    if (agent.length === 0) {
      throw new Error('No agent provided for race');
    }

    logger.info(
      {
        graphCount: agent.length,
        agentIds: agent.map((g) => g.getId()),
      },
      'Starting agent race'
    );

    const promises = agent.map(async (agent, index) => {
      try {
        const result = await Runner.run(agent, messages, options);
        return { ...result, raceIndex: index };
      } catch (error) {
        logger.error(
          {
            agentId: agent.getId(),
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Agent failed in race'
        );
        throw error;
      }
    });

    const result = await Promise.race(promises);

    logger.info(
      {
        winningAgentId: (result as any).agentId || 'unknown',
        raceIndex: (result as any).raceIndex,
      },
      'Agent race completed'
    );

    return result;
  }

  // Private helper methods
  private static normalizeToMessageHistory(messages: MessageInput): Message[] {
    if (typeof messages === 'string') {
      return [{ role: 'user', content: messages }];
    }
    if (Array.isArray(messages)) {
      return messages.map((msg) =>
        typeof msg === 'string' ? { role: 'user', content: msg } : msg
      );
    }
    return [messages];
  }

  /**
   * Validate agent configuration before running
   */
  static validateGraph(agent: AgentInterface): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!agent.getId()) {
      errors.push('Agent ID is required');
    }

    const defaultSubAgent = agent.getDefaultSubAgent();
    if (!defaultSubAgent) {
      errors.push('Default agent is required');
    } else {
      if (!defaultSubAgent.getName()) {
        errors.push('Default agent name is required');
      }
      if (!defaultSubAgent.getInstructions()) {
        errors.push('Default agent instructions are required');
      }
    }

    // Validate all agents in the agent
    const subAgents = agent.getSubAgents();
    if (subAgents.length === 0) {
      errors.push('Agent must contain at least one subagent');
    }

    for (const subAgent of subAgents) {
      if (!subAgent.getName()) {
        errors.push(`Agent missing name`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get execution statistics for a agent
   */
  static async getExecutionStats(
    agent: AgentInterface,
    messages: MessageInput,
    options?: GenerateOptions
  ): Promise<{
    estimatedTurns: number;
    estimatedTokens: number;
    subAgentCount: number;
    defaultSubAgent: string | undefined;
  }> {
    const subAgents = agent.getSubAgents();
    const defaultSubAgent = agent.getDefaultSubAgent();
    const messageCount = Array.isArray(messages) ? messages.length : 1;

    return {
      estimatedTurns: Math.min(Math.max(messageCount, 1), options?.maxTurns || 10),
      estimatedTokens: messageCount * 100, // Rough estimate
      subAgentCount: subAgents.length,
      defaultSubAgent: defaultSubAgent?.getName(),
    };
  }
}

// Export convenience functions that match OpenAI's pattern
export const run = Runner.run.bind(Runner);
export const stream = Runner.stream.bind(Runner);
export const raceGraphs = Runner.raceGraphs.bind(Runner);
