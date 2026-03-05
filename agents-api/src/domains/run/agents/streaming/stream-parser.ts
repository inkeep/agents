import { IncrementalStreamParser } from '../../stream/IncrementalStreamParser';
import { getModelContextWindow } from '../../utils/model-context-utils';
import type { AgentRunContext } from '../agent-types';
import { getPrimaryModel } from '../generation/model-config';
import { toolSessionManager } from '../services/ToolSessionManager';

export function setupStreamParser(
  ctx: AgentRunContext,
  sessionId: string,
  contextId: string
): IncrementalStreamParser {
  const streamHelper = ctx.streamHelper;
  if (!streamHelper) {
    throw new Error('Stream helper is unexpectedly undefined in streaming context');
  }
  const session = toolSessionManager.getSession(sessionId);

  const modelContextInfo = getModelContextWindow(getPrimaryModel(ctx.config));

  const artifactParserOptions = {
    sessionId,
    taskId: session?.taskId,
    projectId: session?.projectId,
    artifactComponents: ctx.artifactComponents,
    streamRequestId: ctx.streamRequestId ?? '',
    subAgentId: ctx.config.id,
    contextWindowSize: modelContextInfo.contextWindow ?? undefined,
  };
  const parser = new IncrementalStreamParser(
    streamHelper,
    ctx.executionContext,
    contextId,
    artifactParserOptions
  );
  return parser;
}
