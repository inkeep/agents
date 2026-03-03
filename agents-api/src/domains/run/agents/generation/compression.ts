import { getLogger } from '../../../../logger';
import { MidGenerationCompressor } from '../../compression/MidGenerationCompressor';
import { agentSessionManager } from '../../session/AgentSession';
import { getCompressionConfigForModel } from '../../utils/model-context-utils';
import { tracer } from '../../utils/tracer';
import type { AgentRunContext } from '../agent-types';
import { getMaxGenerationSteps, getSummarizerModel } from './model-config';

const logger = getLogger('Agent');

export function setupCompression(
  ctx: AgentRunContext,
  messages: any[],
  sessionId: string,
  contextId: string,
  primaryModelSettings: any
): { originalMessageCount: number; compressor: MidGenerationCompressor | null } {
  const originalMessageCount = messages.length;
  const compressionConfigResult = getCompressionConfigForModel(primaryModelSettings);
  const compressionConfig = {
    hardLimit: compressionConfigResult.hardLimit,
    safetyBuffer: compressionConfigResult.safetyBuffer,
    enabled: compressionConfigResult.enabled,
  };
  const compressor = compressionConfig.enabled
    ? new MidGenerationCompressor(
        sessionId,
        contextId,
        ctx.config.tenantId,
        ctx.config.projectId,
        compressionConfig,
        getSummarizerModel(ctx.config),
        primaryModelSettings
      )
    : null;

  ctx.currentCompressor = compressor;

  return { originalMessageCount, compressor };
}

export async function handlePrepareStepCompression(
  stepMessages: any[],
  compressor: MidGenerationCompressor | null,
  originalMessageCount: number,
  fullContextSize?: number
): Promise<{ messages?: any[] }> {
  if (!compressor) {
    return {};
  }

  const compressionNeeded = compressor.isCompressionNeeded(stepMessages);

  if (compressionNeeded) {
    logger.info(
      {
        compressorState: compressor.getState(),
      },
      'Triggering layered mid-generation compression'
    );

    const originalMessages = stepMessages.slice(0, originalMessageCount);
    const generatedMessages = stepMessages.slice(originalMessageCount);

    if (generatedMessages.length > 0) {
      const compressionResult = await compressor.safeCompress(generatedMessages, fullContextSize);

      if (Array.isArray(compressionResult.summary)) {
        const compressedMessages = compressionResult.summary;
        logger.info(
          {
            originalTotal: stepMessages.length,
            compressed: originalMessages.length + compressedMessages.length,
            originalKept: originalMessages.length,
            generatedCompressed: compressedMessages.length,
          },
          'Simple compression fallback applied'
        );
        return { messages: [...originalMessages, ...compressedMessages] };
      }

      const finalMessages = [...originalMessages];

      if (
        compressionResult.summary.text_messages &&
        compressionResult.summary.text_messages.length > 0
      ) {
        finalMessages.push(...compressionResult.summary.text_messages);
      }

      const summaryData = {
        high_level: compressionResult.summary?.high_level,
        user_intent: compressionResult.summary?.user_intent,
        decisions: compressionResult.summary?.decisions,
        open_questions: compressionResult.summary?.open_questions,
        next_steps: compressionResult.summary?.next_steps,
        related_artifacts: compressionResult.summary?.related_artifacts,
      };

      if (summaryData.related_artifacts && summaryData.related_artifacts.length > 0) {
        summaryData.related_artifacts = summaryData.related_artifacts.map((artifact: any) => ({
          ...artifact,
          artifact_reference: `<artifact:ref id="${artifact.id}" tool="${artifact.tool_call_id}" />`,
        }));
      }

      const summaryMessage = JSON.stringify(summaryData);
      finalMessages.push({
        role: 'user',
        content: `Based on your research, here's what you've discovered: ${summaryMessage}

**IMPORTANT**: If you have enough information from this compressed research to answer my original question, please provide your answer now. Only continue with additional tool calls if you need critical missing information that wasn't captured in the research above. When referencing any artifacts from the compressed research, you MUST use <artifact:ref id="artifact_id" tool="tool_call_id" /> tags with the exact IDs from the related_artifacts above.`,
      });

      logger.info(
        {
          originalTotal: stepMessages.length,
          compressed: finalMessages.length,
          originalKept: originalMessages.length,
          generatedCompressed: generatedMessages.length,
        },
        'AI compression completed successfully'
      );

      return { messages: finalMessages };
    }

    return {};
  }

  return {};
}

export async function handleStopWhenConditions(
  ctx: AgentRunContext,
  steps: any[]
): Promise<boolean> {
  const last = steps.at(-1);
  if (last && 'text' in last && last.text) {
    try {
      await agentSessionManager.recordEvent(
        ctx.streamRequestId ?? '',
        'agent_reasoning',
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
        tc.toolName.startsWith('transfer_to_')
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
        agentId: ctx.config.agentId,
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
