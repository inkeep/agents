import {
  createMessage,
  DELEGATE_TOOL_PREFIX,
  DURABLE_APPROVAL_ARTIFACT_TYPE,
  generateId,
  LOAD_SKILL_TOOL,
  parseEmbeddedJson,
  SAVE_TOOL_RESULT_TOOL,
  SESSION_EVENT_TOOL_CALL,
  SESSION_EVENT_TOOL_RESULT,
  TRANSFER_TOOL_PREFIX,
  unwrapError,
} from '@inkeep/agents-core';
import { trace } from '@opentelemetry/api';
import type { ToolSet } from 'ai';
import { z } from 'zod';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { agentSessionManager, type ToolCallData } from '../../session/AgentSession';
import { generateToolId } from '../../utils/agent-operations';
import { isToolResultDenied } from '../../utils/tool-result';
import type { AgentRunContext, AiSdkToolDefinition, ToolType } from '../agent-types';
import { buildToolResultForConversationHistory } from '../generation/tool-result-for-conversation-history';
import { buildToolResultForModelInput } from '../generation/tool-result-for-model-input';
import { getRelationshipIdForTool } from './tool-utils';

const DurableApprovalSchema = z.object({
  type: z.literal(DURABLE_APPROVAL_ARTIFACT_TYPE),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.unknown(),
});

type DurableApprovalData = z.infer<typeof DurableApprovalSchema>;

const logger = getLogger('Agent');

function extractDurableApproval(
  result: unknown,
  parentToolName: string
): DurableApprovalData | undefined {
  if (!result || typeof result !== 'object') return undefined;

  const resultObj = result as Record<string, unknown>;
  const taskResult = resultObj?.result as Record<string, unknown> | undefined;
  if (!taskResult) return undefined;

  const candidates: unknown[] = [];

  // Search parts directly on the task result
  if (Array.isArray(taskResult.parts)) {
    for (const part of taskResult.parts) {
      if (part && typeof part === 'object' && (part as Record<string, unknown>).kind === 'data') {
        candidates.push((part as Record<string, unknown>).data);
      }
    }
  }

  // Search parts nested inside artifacts
  if (Array.isArray(taskResult.artifacts)) {
    for (const artifact of taskResult.artifacts) {
      if (artifact && typeof artifact === 'object' && Array.isArray((artifact as Record<string, unknown>).parts)) {
        for (const part of (artifact as Record<string, unknown>).parts as unknown[]) {
          if (part && typeof part === 'object' && (part as Record<string, unknown>).kind === 'data') {
            candidates.push((part as Record<string, unknown>).data);
          }
        }
      }
    }
  }

  for (const candidate of candidates) {
    const parsed = DurableApprovalSchema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data;
    }
    // Log when we find something that looks like an approval but doesn't validate
    if (
      candidate &&
      typeof candidate === 'object' &&
      (candidate as Record<string, unknown>).type === DURABLE_APPROVAL_ARTIFACT_TYPE
    ) {
      logger.error(
        {
          parentToolName,
          candidate,
          validationErrors: parsed.error.issues,
        },
        'Found durable-approval-required artifact but it failed schema validation'
      );
    }
  }

  return undefined;
}

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
        toolName.includes(SAVE_TOOL_RESULT_TOOL) || toolName.startsWith(TRANSFER_TOOL_PREFIX);
      const isInternalToolForUi =
        isInternalTool || toolName.startsWith(DELEGATE_TOOL_PREFIX) || toolName === LOAD_SKILL_TOOL;

      // In durable workflows, delegate_to_ tool results must be stored in
      // conversation history so the next callLlmStep sees the delegation outcome
      // and doesn't re-delegate in a loop.
      const isDurableDelegation =
        !!ctx.durableWorkflowRunId && toolName.startsWith(DELEGATE_TOOL_PREFIX);
      const skipHistoryStorage = isInternalToolForUi && !isDurableDelegation;

      const needsApproval = options?.needsApproval || false;

      const preApprovedEntry = ctx.durableWorkflowRunId
        ? ctx.approvedToolCalls?.[toolCallId]
        : undefined;
      const isPreApproved = !!preApprovedEntry;

      if (streamRequestId && streamHelper && !isInternalToolForUi && !isPreApproved) {
        const inputText = JSON.stringify(args ?? {});

        await streamHelper.writeToolInputStart({ toolCallId: toolCallId, toolName });

        for (const part of chunkString(inputText, 16)) {
          await streamHelper.writeToolInputDelta({
            toolCallId: toolCallId,
            inputTextDelta: part,
          });
        }

        await streamHelper.writeToolInputAvailable({
          toolCallId: toolCallId,
          toolName,
          input: args ?? {},
          providerMetadata: context?.providerMetadata,
        });
      }

      if (streamRequestId && !isInternalToolForUi) {
        const toolCallData: ToolCallData = {
          toolName,
          input: args,
          toolCallId: toolCallId,
          relationshipId,
          inDelegatedAgent: ctx.isDelegatedAgent,
        };

        if (needsApproval) {
          toolCallData.needsApproval = true;
          toolCallData.conversationId = ctx.conversationId;
        }

        await agentSessionManager.recordEvent(
          streamRequestId,
          SESSION_EVENT_TOOL_CALL,
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

        if (ctx.durableWorkflowRunId && result && typeof result === 'object') {
<<<<<<< HEAD
          const resultObj = result as Record<string, unknown>;
          const taskResult = resultObj?.result as Record<string, unknown> | undefined;

          const findApprovalRequired = (
            parts: Array<Record<string, unknown>> | undefined
          ): Record<string, unknown> | undefined => {
            if (!Array.isArray(parts)) return undefined;
            for (const part of parts) {
              if (part?.kind === 'data') {
                const data = part.data as Record<string, unknown> | undefined;
                if (data?.type === DURABLE_APPROVAL_ARTIFACT_TYPE) return data;
              }
            }
            return undefined;
          };

          const findApprovalInArtifacts = (
            artifacts: Array<Record<string, unknown>> | undefined
          ): Record<string, unknown> | undefined => {
            if (!Array.isArray(artifacts)) return undefined;
          const approvalData = extractDurableApproval(result, toolName);
          if (approvalData) {
            ctx.pendingDurableApproval = {
              toolCallId: toolCallId,
              toolName,
              args: resolvedArgs,
              delegatedApproval: {
                toolCallId: approvalData.toolCallId,
                toolName: approvalData.toolName,
                args: approvalData.args,
                subAgentId: toolName.replace(DELEGATE_TOOL_PREFIX, ''),
              },
            };
            return result;
          }
        }

        if (ctx.pendingDurableApproval) {
          return result;
        }

        const toolResultConversationId = ctx.conversationId;

        if (streamRequestId && !skipHistoryStorage && toolResultConversationId) {
          try {
            const messageId = generateId();
            const messageContent = await buildToolResultForConversationHistory(
              ctx,
              toolName,
              args,
              result,
              toolCallId,
              toolResultConversationId,
              messageId
            );
            await createMessage(runDbClient)({
              scopes: { tenantId: ctx.config.tenantId, projectId: ctx.config.projectId },
              data: {
                id: messageId,
                conversationId: toolResultConversationId,
                role: 'assistant',
                content: messageContent,
                visibility: 'internal',
                messageType: 'tool-result',
                fromSubAgentId: ctx.config.id,
                metadata: {
                  a2a_metadata: {
                    toolName,
                    toolCallId: toolCallId,
                    toolArgs: args,
                    toolOutput: result,
                    timestamp: Date.now(),
                    delegationId: ctx.delegationId,
                    isDelegated: ctx.isDelegatedAgent,
                  },
                },
              },
            });
          } catch (error) {
            logger.warn(
              {
                error,
                toolName,
                toolCallId: toolCallId,
                conversationId: toolResultConversationId,
              },
              'Failed to store tool result in conversation history'
            );
          }
        }

        if (streamRequestId && !isInternalToolForUi) {
          agentSessionManager.recordEvent(
            streamRequestId,
            SESSION_EVENT_TOOL_RESULT,
            ctx.config.id,
            {
              toolName,
              output: result,
              toolCallId: toolCallId,
              duration,
              relationshipId,
              needsApproval,
              inDelegatedAgent: ctx.isDelegatedAgent,
            }
          );
        }

        const isDeniedResult = isToolResultDenied(result);

        if (streamRequestId && streamHelper && !isInternalToolForUi) {
          if (isDeniedResult) {
            await streamHelper.writeToolOutputDenied({ toolCallId: toolCallId });
          } else {
            await streamHelper.writeToolOutputAvailable({
              toolCallId: toolCallId,
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
          agentSessionManager.recordEvent(
            streamRequestId,
            SESSION_EVENT_TOOL_RESULT,
            ctx.config.id,
            {
              toolName,
              output: null,
              toolCallId: toolCallId,
              duration,
              error: errorMessage,
              relationshipId,
              needsApproval,
              inDelegatedAgent: ctx.isDelegatedAgent,
            }
          );
        }

        if (streamRequestId && streamHelper && !isInternalToolForUi) {
          await streamHelper.writeToolOutputError({
            toolCallId: toolCallId,
            errorText: errorMessage,
          });
        }

        throw rootCause;
      }
    },
  };
}
