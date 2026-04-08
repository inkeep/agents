import { SESSION_EVENT_AGENT_REASONING, TRANSFER_TOOL_PREFIX } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import type { MidGenerationCompressor } from '../../compression/MidGenerationCompressor';
import { agentSessionManager } from '../../session/AgentSession';
import { tracer } from '../../utils/tracer';
import type { AgentRunContext } from '../agent-types';
import { getMaxGenerationSteps } from './model-config';

const logger = getLogger('Agent');

export async function handlePrepareStepCompression(
  stepMessages: any[],
  steps: Array<{ usage: { inputTokens?: number; outputTokens?: number } }>,
  compressor: MidGenerationCompressor | null,
  originalMessageCount: number
): Promise<{ messages?: any[] }> {
  if (!compressor) {
    return {};
  }

  try {
    const originalMessages = stepMessages.slice(0, originalMessageCount);
    const generatedMessages = stepMessages.slice(
      compressor.effectiveBaseline(originalMessageCount)
    );

    let compressionNeeded: boolean;
    let totalTokens: number;

    const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;
    const actualInputTokens = lastStep?.usage.inputTokens;
    const actualOutputTokens = lastStep?.usage.outputTokens;
    const hasReliableUsage = actualInputTokens != null && actualInputTokens > 0;

    let usageSource: 'actual_sdk_usage' | 'estimated';

    if (hasReliableUsage) {
      // Use actual token counts from the last completed step
      // Next step's context ≈ last step's input + last step's output (assistant response appended)
      totalTokens = actualInputTokens + (actualOutputTokens ?? 0);
      compressionNeeded = compressor.isCompressionNeededFromActualUsage(totalTokens);
      usageSource = 'actual_sdk_usage';
    } else {
      // No reliable usage data — fall back to estimate-based check
      logger.warn(
        {
          stepCount: steps.length,
          actualInputTokens,
          actualOutputTokens,
        },
        'No reliable token usage from AI SDK, falling back to estimate-based compression check'
      );
      const allMessages = [...originalMessages, ...generatedMessages];
      compressionNeeded = compressor.isCompressionNeeded(allMessages);
      totalTokens = compressor.calculateContextSize(allMessages);
      usageSource = 'estimated';
    }

    if (compressionNeeded) {
      const state = compressor.getState();
      const hardLimit = compressor.getHardLimit();
      const { safetyBuffer } = state.config;
      const triggerAt = hardLimit - safetyBuffer;

      logger.info(
        {
          compressorState: state,
          contextBreakdown: {
            totalTokens,
            hardLimit,
            safetyBuffer,
            triggerAt,
            remaining: hardLimit - totalTokens,
            source: usageSource,
          },
        },
        'Triggering layered mid-generation compression'
      );

      if (generatedMessages.length > 0) {
        const compressionCycle = compressor.getCompressionCycleCount();
        let compressionResult: Awaited<ReturnType<typeof compressor.safeCompress>>;
        try {
          compressionResult = await compressor.safeCompress(generatedMessages, totalTokens);
        } catch (error) {
          logger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              messageCount: generatedMessages.length,
              totalTokens,
            },
            'Mid-generation compression failed, continuing without compression'
          );
          return {};
        }

        // Record baseline only after compression succeeds so a failure doesn't corrupt the next cycle
        compressor.markCompressed(stepMessages.length);

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

        const summaryData = {
          high_level: compressionResult.summary.high_level,
          user_intent: compressionResult.summary.user_intent,
          decisions: compressionResult.summary.decisions,
          open_questions: compressionResult.summary.open_questions,
          next_steps: compressionResult.summary.next_steps,
          related_artifacts: compressionResult.summary.related_artifacts,
        };

        if (summaryData.related_artifacts && summaryData.related_artifacts.length > 0) {
          summaryData.related_artifacts = summaryData.related_artifacts.map((artifact: any) => ({
            ...artifact,
            artifact_reference: `<artifact:ref id="${artifact.id}" tool="${artifact.tool_call_id}" />`,
          }));
        }

        const forAgentSteps: string[] = summaryData.next_steps?.for_agent ?? [];
        const hasNewWork = forAgentSteps.some(
          (s: string) => !s.startsWith('STOP:') && !s.startsWith('DO NOT RE-CALL')
        );

        let stopInstruction: string;
        if (compressionCycle >= 1) {
          stopInstruction = `**STOP ALL TOOL CALLS.** Context has been compressed ${compressionCycle + 1} times — you are in a loop. Respond immediately with what you have found.`;
        } else if (!hasNewWork || forAgentSteps.length === 0) {
          stopInstruction = `**RESPOND NOW.** The next steps above indicate all relevant tool calls have already been made. Use the findings above to answer immediately.`;
        } else {
          stopInstruction = `**Complete only the specific new actions listed in next_steps.for_agent above, then respond.** Skip any items marked STOP or DO NOT RE-CALL — those results already exist as artifacts. Do not make any other tool calls.`;
        }

        const summaryMessage = JSON.stringify(summaryData);
        finalMessages.push({
          role: 'user',
          content: `Your research has been compressed due to context limits. Here is everything you have discovered so far: ${summaryMessage}

${stopInstruction} When referencing artifacts, use <artifact:ref id="artifact_id" tool="tool_call_id" /> tags with the exact IDs above.`,
        });

        logger.info(
          {
            originalTotal: stepMessages.length,
            compressed: finalMessages.length,
            originalKept: originalMessages.length,
            generatedCompressed: generatedMessages.length,
            injectedSummary: {
              highLevel: compressionResult.summary.high_level,
              nextStepsForAgent: compressionResult.summary.next_steps?.for_agent,
              relatedArtifacts: compressionResult.summary.related_artifacts?.map((a: any) => ({
                id: a.id,
                name: a.name,
                keyFindings: a.key_findings,
              })),
            },
          },
          'AI compression completed successfully'
        );

        return { messages: finalMessages };
      }
    }

    return {};
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        messageCount: stepMessages.length,
        originalMessageCount,
      },
      'Compression callback failed, continuing with original messages'
    );
    return {};
  }
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
