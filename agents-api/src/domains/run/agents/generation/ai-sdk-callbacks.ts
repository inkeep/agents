import { SESSION_EVENT_AGENT_REASONING, TRANSFER_TOOL_PREFIX } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import type { MidGenerationCompressor } from '../../compression/MidGenerationCompressor';
import { agentSessionManager } from '../../session/AgentSession';
import { tracer } from '../../utils/tracer';
import type { AgentRunContext } from '../agent-types';
import { getMaxGenerationSteps } from './model-config';

const logger = getLogger('Agent');

export async function handlePrepareStepCompression(
  _stepMessages: any[],
  _steps: Array<{ usage: { inputTokens?: number; outputTokens?: number } }>,
  _compressor: MidGenerationCompressor | null,
  _originalMessageCount: number
): Promise<{ messages?: any[] }> {
  return {};
}

export async function handleStopWhenConditions(
  ctx: AgentRunContext,
  steps: any[]
): Promise<boolean> {
  if (ctx.pendingDurableApproval) {
    return true;
  }

  const last = steps.at(-1);
  if (last && 'text' in last && last.text) {
    try {
      await agentSessionManager.recordEvent(
        ctx.streamRequestId ?? '',
        SESSION_EVENT_AGENT_REASONING,
        ctx.config.id,
        {
          parts: [{ type: 'text', content: last.text }],
        }
      );
    } catch (error) {
      logger.debug({ error }, 'Failed to track agent reasoning');
    }
  }

  if (last?.content && last.content.length > 0) {
    const lastContent = last.content[last.content.length - 1];
    if (lastContent.type === 'tool-error') {
      const error = lastContent.error;
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'connection_refused'
      ) {
        return true;
      }
    }
  }

  if (steps.length >= 1) {
    const currentStep = steps[steps.length - 1];
    if (currentStep && 'toolCalls' in currentStep && currentStep.toolCalls) {
      const hasTransferTool = currentStep.toolCalls.some((tc: any) =>
        tc.toolName.startsWith(TRANSFER_TOOL_PREFIX)
      );

      if (hasTransferTool) {
        return true;
      }
    }
  }

  const maxSteps = getMaxGenerationSteps(ctx.config);
  if (steps.length >= maxSteps) {
    logger.warn(
      {
        subAgentId: ctx.config.id,
        stepsCompleted: steps.length,
        maxSteps,
        conversationId: ctx.conversationId,
      },
      'Sub-agent reached maximum generation steps limit'
    );

    tracer.startActiveSpan(
      'agent.max_steps_reached',
      {
        attributes: {
          'agent.max_steps_reached': true,
          'agent.steps_completed': steps.length,
          'agent.max_steps': maxSteps,
          'agent.id': ctx.config.agentId,
          'subAgent.id': ctx.config.id,
        },
      },
      (span) => {
        span.addEvent('max_generation_steps_reached', {
          message: `Sub-agent "${ctx.config.id}" reached maximum generation steps (${steps.length}/${maxSteps})`,
        });
        span.end();
      }
    );

    return true;
  }

  return false;
}
