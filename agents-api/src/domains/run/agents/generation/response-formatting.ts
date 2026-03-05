import { ResponseFormatter } from '../../stream/ResponseFormatter';
import { getModelContextWindow } from '../../utils/model-context-utils';
import type { AgentRunContext, ResolvedGenerationResponse } from '../agent-types';
import { toolSessionManager } from '../services/ToolSessionManager';
import { getPrimaryModel } from './model-config';

export async function formatFinalResponse(
  ctx: AgentRunContext,
  response: ResolvedGenerationResponse,
  textResponse: string,
  sessionId: string,
  contextId: string
): Promise<ResolvedGenerationResponse> {
  let formattedContent = response.formattedContent || null;

  if (!formattedContent) {
    const session = toolSessionManager.getSession(sessionId);

    const modelContextInfo = getModelContextWindow(getPrimaryModel(ctx.config));

    const responseFormatter = new ResponseFormatter(ctx.executionContext, {
      sessionId,
      taskId: session?.taskId,
      projectId: session?.projectId,
      contextId,
      artifactComponents: ctx.artifactComponents,
      streamRequestId: ctx.streamRequestId ?? '',
      subAgentId: ctx.config.id,
      contextWindowSize: modelContextInfo.contextWindow ?? undefined,
    });

    if (response.object) {
      formattedContent = await responseFormatter.formatObjectResponse(response.object, contextId);
    } else if (textResponse) {
      formattedContent = await responseFormatter.formatResponse(textResponse, contextId);
    }
  }

  return {
    ...response,
    formattedContent,
  };
}
