import { createMessage, generateId, parseEmbeddedJson, unwrapError } from '@inkeep/agents-core';
import { trace } from '@opentelemetry/api';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { agentSessionManager, type ToolCallData } from '../../session/AgentSession';
import { generateToolId } from '../../utils/agent-operations';
import { isToolResultDenied } from '../../utils/tool-result';
import type { AgentRunContext, ToolType } from '../agent-types';
import { formatToolResult } from '../generation/tool-result';

const logger = getLogger('Agent');

function chunkString(s: string, size = 16): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

export function getRelationshipIdForTool(
  ctx: AgentRunContext,
  toolName: string,
  toolType?: ToolType
): string | undefined {
  if (toolType === 'mcp') {
    const matchingTool = ctx.config.tools?.find((tool) => {
      if (tool.config?.type !== 'mcp') {
        return false;
      }

      if (tool.availableTools?.some((available) => available.name === toolName)) {
        return true;
      }

      if (tool.config.mcp.activeTools?.includes(toolName)) {
        return true;
      }

      return tool.name === toolName;
    });

    return matchingTool?.relationshipId;
  }

  if (toolType === 'tool') {
    return ctx.functionToolRelationshipIdByName.get(toolName);
  }

  if (toolType === 'delegation') {
    const relation = ctx.config.delegateRelations.find(
      (relation) =>
        `delegate_to_${relation.config.id.toLowerCase().replace(/\s+/g, '_')}` === toolName
    );

    return relation?.config.relationId;
  }
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

    const originalId = (toolDef as any).id || originalKey;
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
  toolDefinition: any,
  streamRequestId?: string,
  toolType?: ToolType,
  options?: { needsApproval?: boolean; mcpServerId?: string; mcpServerName?: string }
): any {
  if (!toolDefinition || typeof toolDefinition !== 'object' || !('execute' in toolDefinition)) {
    return toolDefinition;
  }
  const relationshipId = getRelationshipIdForTool(ctx, toolName, toolType);

  const originalExecute = toolDefinition.execute;
  return {
    ...toolDefinition,
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

      if (streamRequestId && streamHelper && !isInternalToolForUi) {
        const inputText = JSON.stringify(args ?? {});

        await streamHelper.writeToolInputStart({ toolCallId, toolName });

        for (const part of chunkString(inputText, 16)) {
          await streamHelper.writeToolInputDelta({ toolCallId, inputTextDelta: part });
        }

        await streamHelper.writeToolInputAvailable({
          toolCallId,
          toolName,
          input: args ?? {},
          providerMetadata: context?.providerMetadata,
        });
      }

      if (streamRequestId && !isInternalToolForUi) {
        const toolCallData: ToolCallData = {
          toolName,
          input: args,
          toolCallId,
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

        if (artifactParser && toolDefinition.parameters?.safeParse) {
          const resolvedChanged =
            JSON.stringify(parsedArgsForResolution) !== JSON.stringify(resolvedArgs);
          if (resolvedChanged) {
            const validation = toolDefinition.parameters.safeParse(resolvedArgs);
            if (!validation.success) {
              throw new Error(
                `Resolved tool args failed schema validation for '${toolName}': ${validation.error.message}`
              );
            }
          }
        }

        const result = await originalExecute(resolvedArgs, context);
        const duration = Date.now() - startTime;

        const toolResultConversationId = ctx.conversationId;

        if (streamRequestId && !isInternalToolForUi && toolResultConversationId) {
          try {
            const messageId = generateId();
            const messagePayload = {
              id: messageId,
              tenantId: ctx.config.tenantId,
              projectId: ctx.config.projectId,
              conversationId: toolResultConversationId,
              role: 'assistant',
              content: {
                text: formatToolResult(toolName, args, result, toolCallId),
              },
              visibility: 'internal',
              messageType: 'tool-result',
              fromSubAgentId: ctx.config.id,
              metadata: {
                a2a_metadata: {
                  toolName,
                  toolCallId,
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
              { error, toolName, toolCallId, conversationId: toolResultConversationId },
              'Failed to store tool result in conversation history'
            );
          }
        }

        if (streamRequestId && !isInternalToolForUi) {
          agentSessionManager.recordEvent(streamRequestId, 'tool_result', ctx.config.id, {
            toolName,
            output: result,
            toolCallId,
            duration,
            relationshipId,
            needsApproval,
            inDelegatedAgent: ctx.isDelegatedAgent,
          });
        }

        const isDeniedResult = isToolResultDenied(result);

        if (streamRequestId && streamHelper && !isInternalToolForUi) {
          if (isDeniedResult) {
            await streamHelper.writeToolOutputDenied({ toolCallId });
          } else {
            await streamHelper.writeToolOutputAvailable({ toolCallId, output: result });
          }
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
            toolCallId,
            duration,
            error: errorMessage,
            relationshipId,
            needsApproval,
            inDelegatedAgent: ctx.isDelegatedAgent,
          });
        }

        if (streamRequestId && streamHelper && !isInternalToolForUi) {
          await streamHelper.writeToolOutputError({ toolCallId, errorText: errorMessage });
        }

        throw rootCause;
      }
    },
  };
}
