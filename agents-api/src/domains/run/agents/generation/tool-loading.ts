import type { Span } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import type { ToolSet } from 'ai';
import { setSpanWithError, tracer } from '../../utils/tracer';
import type { ContextBreakdown } from '../../utils/token-estimator';
import type { AgentRunContext } from '../agent-types';
import { getDefaultTools } from '../tools/default-tools';
import { getFunctionTools } from '../tools/function-tools';
import { getMcpTools } from '../tools/mcp-tools';
import { getRelationTools } from '../tools/relation-tools';
import { sanitizeToolsForAISDK } from '../tools/tool-wrapper';
import { buildSystemPrompt } from './system-prompt';

export async function loadToolsAndPrompts(
  ctx: AgentRunContext,
  sessionId: string,
  streamRequestId: string | undefined,
  runtimeContext?: {
    contextId: string;
    metadata: {
      conversationId: string;
      threadId: string;
      taskId: string;
      streamRequestId: string;
      apiKey?: string;
    };
  }
): Promise<{ systemPrompt: string; sanitizedTools: ToolSet; contextBreakdown: ContextBreakdown }> {
  const [mcpToolsResult, systemPromptResult, functionTools, relationTools, defaultTools] =
    await tracer.startActiveSpan(
      'agent.load_tools',
      {
        attributes: {
          'subAgent.name': ctx.config.name,
          'session.id': sessionId || 'none',
        },
      },
      async (childSpan: Span) => {
        try {
          const result = await Promise.all([
            getMcpTools(ctx, sessionId, streamRequestId),
            buildSystemPrompt(ctx, runtimeContext, false),
            getFunctionTools(ctx, sessionId, streamRequestId),
            Promise.resolve(getRelationTools(ctx, runtimeContext, sessionId)),
            getDefaultTools(ctx, streamRequestId),
          ]);

          childSpan.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (err) {
          const errorObj = err instanceof Error ? err : new Error(String(err));
          setSpanWithError(childSpan, errorObj);
          throw err;
        } finally {
          childSpan.end();
        }
      }
    );

  const { tools: mcpTools } = mcpToolsResult;

  const systemPrompt = systemPromptResult.prompt;
  const contextBreakdown = systemPromptResult.breakdown;

  const allTools = {
    ...mcpTools,
    ...functionTools,
    ...relationTools,
    ...defaultTools,
  };

  const sanitizedTools = sanitizeToolsForAISDK(allTools);

  return { systemPrompt, sanitizedTools, contextBreakdown };
}
