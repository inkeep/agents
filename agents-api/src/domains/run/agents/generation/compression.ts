import { getLogger } from '../../../../logger';
import { MidGenerationCompressor } from '../../compression/MidGenerationCompressor';
import { getCompressionConfigForModel } from '../../utils/model-context-utils';
import type { AgentRunContext } from '../agent-types';
import { getSummarizerModel } from './model-config';

const logger = getLogger('compression');

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
        ctx.config.agentId,
        compressionConfig,
        getSummarizerModel(ctx.config),
        primaryModelSettings
      )
    : null;

  ctx.currentCompressor = compressor;

  return { originalMessageCount, compressor };
}

export function buildCompressPrompt(
  compressor: MidGenerationCompressor
): (prompt: unknown[]) => Promise<unknown[]> {
  return async (prompt: unknown[]) => {
    const messages = prompt as any[];

    const compressionResult = await compressor.safeCompress(messages);
    compressor.markCompressed(messages.length);

    if (Array.isArray(compressionResult.summary)) {
      return compressionResult.summary;
    }

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

    const compressionCycle = compressor.getCompressionCycleCount();
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
    const systemMessages = messages.filter((m: any) => m.role === 'system');

    logger.info(
      {
        originalTotal: messages.length,
        compressed: systemMessages.length + 1,
      },
      'Middleware compression completed'
    );

    return [
      ...systemMessages,
      {
        role: 'user',
        content: `Your research has been compressed due to context limits. Here is everything you have discovered so far: ${summaryMessage}\n\n${stopInstruction} When referencing artifacts, use <artifact:ref id="artifact_id" tool="tool_call_id" /> tags with the exact IDs above.`,
      },
    ];
  };
}
