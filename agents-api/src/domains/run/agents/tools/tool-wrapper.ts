import { createMessage, generateId, parseEmbeddedJson, unwrapError } from '@inkeep/agents-core';
import { trace } from '@opentelemetry/api';
import type { ToolSet } from 'ai';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { agentSessionManager, type ToolCallData } from '../../session/AgentSession';
import { generateToolId } from '../../utils/agent-operations';
import { isToolResultDenied } from '../../utils/tool-result';
import type { AgentRunContext, AiSdkToolDefinition, ToolType } from '../agent-types';
import { buildToolResultForConversationHistory } from '../generation/tool-result-for-conversation-history';
import { buildToolResultForModelInput } from '../generation/tool-result-for-model-input';
import { getRelationshipIdForTool } from './tool-utils';

const logger = getLogger('Agent');

function chunkString(s: string, size = 16): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

export function sanitizeToolsForAISDK(tools: Record<string, any>): Record<string, any> {
  const sanitizedTools: Record<string, any> = {};

  for (const [originalKey, toolDef] of Object.entries(tools)) {
    let sanitizedKey = originalKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    sanitizedKey = sanitizedKey.replace(/_+/g, '_');
    sanitizedKey = sanitizedKey.replace(/^_+|_+$/g, '');

    if (!sanitizedKey || sanitizedKey.length === 0) {
      sanitizedKey = 'unnamed_tool';
    }

    if (sanitizedKey.length > 100) {
      sanitizedKey = sanitizedKey.substring(0, 100);
    }

    const originalId = (toolDef as { id?: string }).id || originalKey;
    let sanitizedId = originalId.replace(/[^a-zA-Z0-9_.-]/g, '_');
    sanitizedId = sanitizedId.replace(/_+/g, '_');
    sanitizedId = sanitizedId.replace(/^_+|_+$/g, '');

    if (sanitizedId.length > 128) {
      sanitizedId = sanitizedId.substring(0, 128);
    }

    const sanitizedTool = {
      ...toolDef,
      id: sanitizedId,
    };

    sanitizedTools[sanitizedKey] = sanitizedTool;
  }

  return sanitizedTools;
}

export function wrapToolWithStreaming(
  ctx: AgentRunContext,
  toolName: string,
  toolDefinition: ToolSet[string],
  streamRequestId?: string,
  toolType?: ToolType,
  options?: { needsApproval?: boolean; mcpServerId?: string; mcpServerName?: string }
): ToolSet[string] {
  if (
    !toolDefinition ||
    typeof toolDefinition !== 'object' ||
    typeof toolDefinition.execute !== 'function'
  ) {
    return toolDefinition;
  }
  const relationshipId = getRelationshipIdForTool(ctx, toolName, toolType);

  const originalExecute = toolDefinition.execute;
  return {
    ...toolDefinition,
    toModelOutput: ({ output }: { output: unknown }) => buildToolResultForModelInput(output),
    execute: async (args: any, context?: any) => {
      const startTime = Date.now();
      const toolCallId = context?.toolCallId || generateToolId();
      const streamHelper = ctx.isDelegatedAgent ? undefined : ctx.streamHelper;

      const activeSpan = trace.getActiveSpan();
      if (activeSpan) {
        const attributes: Record<string, any> = {
          'conversation.id': ctx.conversationId,
          'tool.purpose': toolDefinition.description || 'No description provided',
          'ai.toolType': toolType || 'unknown',
          'subAgent.name': ctx.config.name || 'unknown',
          'subAgent.id': ctx.config.id || 'unknown',
          'agent.id': ctx.config.agentId || 'unknown',
        };

        if (options?.mcpServerId) {
          attributes['ai.toolCall.mcpServerId'] = options.mcpServerId;
        }
        if (options?.mcpServerName) {
          attributes['ai.toolCall.mcpServerName'] = options.mcpServerName;
        }

        activeSpan.setAttributes(attributes);
      }

      const isInternalTool =
        toolName.includes('save_tool_result') || toolName.startsWith('transfer_to_');
      const isInternalToolForUi = isInternalTool || toolName.startsWith('delegate_to_');

      const needsApproval = options?.needsApproval || false;

      const preApprovedEntry = ctx.durableWorkflowRunId
        ? ctx.approvedToolCalls?.[toolName]
        : undefined;
      const effectiveToolCallId = preApprovedEntry?.originalToolCallId ?? toolCallId;
      const isPreApproved = !!preApprovedEntry;

      if (streamRequestId && streamHelper && !isInternalToolForUi && !isPreApproved) {
        const inputText = JSON.stringify(args ?? {});

        await streamHelper.writeToolInputStart({ toolCallId: effectiveToolCallId, toolName });

        for (const part of chunkString(inputText, 16)) {
          await streamHelper.writeToolInputDelta({
            toolCallId: effectiveToolCallId,
            inputTextDelta: part,
          });
        }

        await streamHelper.writeToolInputAvailable({
          toolCallId: effectiveToolCallId,
          toolName,
          input: args ?? {},
          providerMetadata: context?.providerMetadata,
        });
      }

      if (streamRequestId && !isInternalToolForUi) {
        const toolCallData: ToolCallData = {
          toolName,
          input: args,
          toolCallId: effectiveToolCallId,
          relationshipId,
          inDelegatedAgent: ctx.isDelegatedAgent,
        };

        if (needsApproval) {
          toolCallData.needsApproval = true;
          toolCallData.conversationId = ctx.conversationId;
        }

        await agentSessionManager.recordEvent(
          streamRequestId,
          'tool_call',
          ctx.config.id,
          toolCallData
        );
      }

      try {
        const artifactParser = streamRequestId
          ? agentSessionManager.getArtifactParser(streamRequestId)
          : null;
        const parsedArgsForResolution = artifactParser ? parseEmbeddedJson(args) : args;
        const resolvedArgs = artifactParser
          ? await artifactParser.resolveArgs(parsedArgsForResolution)
          : args;

        const parameters = (toolDefinition as AiSdkToolDefinition).parameters;
        if (artifactParser && parameters?.safeParse) {
          const resolvedChanged =
            JSON.stringify(parsedArgsForResolution) !== JSON.stringify(resolvedArgs);
          if (resolvedChanged) {
            const validation = parameters.safeParse(resolvedArgs);
            if (!validation.success) {
              throw new Error(
                `Resolved tool args failed schema validation for '${toolName}': ${validation.error.message}`
              );
            }
          }
        }

        const result = await originalExecute(resolvedArgs, context);
        const duration = Date.now() - startTime;

        if (ctx.pendingDurableApproval) {
          return result;
        }

        const toolResultConversationId = ctx.conversationId;

        if (streamRequestId && !isInternalToolForUi && toolResultConversationId) {
          try {
            const messageId = generateId();
            const messageContent = await buildToolResultForConversationHistory(
              ctx,
              toolName,
              args,
              result,
              effectiveToolCallId,
              toolResultConversationId,
              messageId
            );
            const messagePayload = {
              id: messageId,
              tenantId: ctx.config.tenantId,
              projectId: ctx.config.projectId,
              conversationId: toolResultConversationId,
              role: 'assistant',
              content: messageContent,
              visibility: 'internal',
              messageType: 'tool-result',
              fromSubAgentId: ctx.config.id,
              metadata: {
                a2a_metadata: {
                  toolName,
                  toolCallId: effectiveToolCallId,
                  toolArgs: args,
                  toolOutput: result,
                  timestamp: Date.now(),
                  delegationId: ctx.delegationId,
                  isDelegated: ctx.isDelegatedAgent,
                },
              },
            };

            await createMessage(runDbClient)(messagePayload);
          } catch (error) {
            logger.warn(
              {
                error,
                toolName,
                toolCallId: effectiveToolCallId,
                conversationId: toolResultConversationId,
              },
              'Failed to store tool result in conversation history'
            );
          }
        }

        if (streamRequestId && !isInternalToolForUi) {
          agentSessionManager.recordEvent(streamRequestId, 'tool_result', ctx.config.id, {
            toolName,
            output: result,
            toolCallId: effectiveToolCallId,
            duration,
            relationshipId,
            needsApproval,
            inDelegatedAgent: ctx.isDelegatedAgent,
          });
        }

        const isDeniedResult = isToolResultDenied(result);

        if (streamRequestId && streamHelper && !isInternalToolForUi) {
          if (isDeniedResult) {
            await streamHelper.writeToolOutputDenied({ toolCallId: effectiveToolCallId });
          } else {
            await streamHelper.writeToolOutputAvailable({
              toolCallId: effectiveToolCallId,
              output: result,
            });
          }
        }

        if (isDeniedResult) {
          return result.reason ?? 'Tool call was denied by the user.';
        }

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        const rootCause = unwrapError(error);
        const errorMessage = rootCause.message;

        if (streamRequestId && !isInternalToolForUi) {
          agentSessionManager.recordEvent(streamRequestId, 'tool_result', ctx.config.id, {
            toolName,
            output: null,
            toolCallId: effectiveToolCallId,
            duration,
            error: errorMessage,
            relationshipId,
            needsApproval,
            inDelegatedAgent: ctx.isDelegatedAgent,
          });
        }

        if (streamRequestId && streamHelper && !isInternalToolForUi) {
          await streamHelper.writeToolOutputError({
            toolCallId: effectiveToolCallId,
            errorText: errorMessage,
          });
        }

        throw rootCause;
      }
    },
  };
}
