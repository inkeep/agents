import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SimulatedUser {
  generateResponse(trajectory: ChatMessage[]): Promise<ChatMessage>;
}

export interface MultiTurnApp {
  (message: ChatMessage, context: { threadId: string }): Promise<ChatMessage>;
}

export interface SimulationResult {
  trajectory: ChatMessage[];
  conversationId: string;
  metadata: {
    turns: number;
    stoppedReason: 'max_turns' | 'stopping_condition' | 'error';
    error?: string;
  };
}

export interface SimulationOptions {
  maxTurns?: number;
  stoppingCondition?: (trajectory: ChatMessage[]) => boolean;
  conversationId?: string;
}

export interface SimulatedUserOptions {
  system: string;
  model?: string;
  fixedResponses?: ChatMessage[];
  temperature?: number;
}

export function createLLMSimulatedUser(options: SimulatedUserOptions): SimulatedUser {
  const { system, model = 'claude-3-5-sonnet-20241022', fixedResponses = [], temperature = 0.7 } = options;

  let turnCount = 0;

  return {
    async generateResponse(trajectory: ChatMessage[]): Promise<ChatMessage> {
      if (turnCount < fixedResponses.length) {
        const response = fixedResponses[turnCount];
        turnCount++;
        return response;
      }

      turnCount++;

      const conversationContext = trajectory
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join('\n\n');

      const prompt = `${system}

CONVERSATION SO FAR:
${conversationContext || '(No conversation yet)'}

Generate the next message from the user. Respond ONLY with the user's message content, no formatting or role labels.`;

      let aiModel: any;
      if (model.startsWith('claude')) {
        aiModel = anthropic(model);
      } else if (model.startsWith('gpt')) {
        aiModel = openai(model);
      } else {
        aiModel = anthropic(model);
      }

      const result = await generateText({
        model: aiModel,
        prompt,
        temperature,
      });

      return {
        role: 'user',
        content: result.text,
      };
    },
  };
}

export async function runMultiturnSimulation(
  app: MultiTurnApp,
  user: SimulatedUser,
  options: SimulationOptions = {}
): Promise<SimulationResult> {
  const {
    maxTurns = 5,
    stoppingCondition,
    conversationId = `sim-${Date.now()}`,
  } = options;

  const trajectory: ChatMessage[] = [];
  let stoppedReason: SimulationResult['metadata']['stoppedReason'] = 'max_turns';
  let error: string | undefined;

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      const userMessage = await user.generateResponse(trajectory);
      trajectory.push(userMessage);

      console.log(`\n[Turn ${turn + 1}] USER: ${userMessage.content.substring(0, 100)}${userMessage.content.length > 100 ? '...' : ''}`);

      const assistantMessage = await app(userMessage, { threadId: conversationId });
      trajectory.push(assistantMessage);

      console.log(`[Turn ${turn + 1}] ASSISTANT: ${assistantMessage.content.substring(0, 100)}${assistantMessage.content.length > 100 ? '...' : ''}`);

      if (stoppingCondition && stoppingCondition(trajectory)) {
        stoppedReason = 'stopping_condition';
        break;
      }
    }
  } catch (err) {
    stoppedReason = 'error';
    error = err instanceof Error ? err.message : String(err);
    console.error(`\nSimulation error: ${error}`);
  }

  return {
    trajectory,
    conversationId,
    metadata: {
      turns: Math.ceil(trajectory.length / 2),
      stoppedReason,
      error,
    },
  };
}

