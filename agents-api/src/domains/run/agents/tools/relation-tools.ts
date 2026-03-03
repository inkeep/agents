import type { AgentRunContext } from '../agent-types';
import { createDelegateToAgentTool, createTransferToAgentTool } from '../relationTools';
import { wrapToolWithStreaming } from '../tools/tool-wrapper';

function createRelationToolName(prefix: string, targetId: string): string {
  return `${prefix}_to_${targetId.toLowerCase().replace(/\s+/g, '_')}`;
}

export function getRelationTools(
  ctx: AgentRunContext,
  runtimeContext?: {
    contextId: string;
    metadata: {
      conversationId: string;
      threadId: string;
      streamRequestId?: string;
      streamBaseUrl?: string;
      apiKey?: string;
      baseUrl?: string;
    };
  },
  sessionId?: string
): Record<string, any> {
  const { transferRelations = [], delegateRelations = [] } = ctx.config;
  return Object.fromEntries([
    ...transferRelations.map((agentConfig) => {
      const toolName = createRelationToolName('transfer', agentConfig.id);
      return [
        toolName,
        wrapToolWithStreaming(
          ctx,
          toolName,
          createTransferToAgentTool({
            transferConfig: agentConfig,
            callingAgentId: ctx.config.id,
            streamRequestId: runtimeContext?.metadata?.streamRequestId,
          }),
          runtimeContext?.metadata?.streamRequestId,
          'transfer'
        ),
      ];
    }),
    ...delegateRelations.map((relation) => {
      const toolName = createRelationToolName('delegate', relation.config.id);

      return [
        toolName,
        wrapToolWithStreaming(
          ctx,
          toolName,
          createDelegateToAgentTool({
            delegateConfig: relation,
            callingAgentId: ctx.config.id,
            executionContext: ctx.executionContext,
            contextId: runtimeContext?.contextId || 'default',
            metadata: runtimeContext?.metadata || {
              conversationId: runtimeContext?.contextId || 'default',
              threadId: runtimeContext?.contextId || 'default',
              streamRequestId: runtimeContext?.metadata?.streamRequestId,
              apiKey: runtimeContext?.metadata?.apiKey,
            },
            sessionId,
            credentialStoreRegistry: ctx.credentialStoreRegistry,
          }),
          runtimeContext?.metadata?.streamRequestId,
          'delegation'
        ),
      ];
    }),
  ]);
}
