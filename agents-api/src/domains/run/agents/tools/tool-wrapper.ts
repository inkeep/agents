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
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import {
  detectOversizedArtifact,
  formatOversizedRetrievalReason,
} from '../../artifacts/artifact-utils';
import { SENTINEL_KEY } from '../../constants/artifact-syntax';
import { stripBinaryDataForObservability } from '../../services/blob-storage/artifact-binary-sanitizer';
import { agentSessionManager, type ToolCallData } from '../../session/AgentSession';
import { generateToolId } from '../../utils/agent-operations';
import { getModelContextWindow } from '../../utils/model-context-utils';
import { stripInternalFields } from '../../utils/select-filter';
import { isToolResultDenied } from '../../utils/tool-result';
import type { AgentRunContext, AiSdkToolDefinition, ToolType } from '../agent-types';
import { buildToolResultForConversationHistory } from '../generation/tool-result-for-conversation-history';
import { buildToolResultForModelInput } from '../generation/tool-result-for-model-input';
import { getRelationshipIdForTool } from './tool-utils';

interface DurableApprovalData {
  type: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
  delegatedApproval?: {
    toolCallId: string;
    toolName: string;
    args: unknown;
    subAgentId: string;
  };
}

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
  options?: {
    needsApproval?: boolean;
    mcpServerId?: string;
    mcpServerName?: string;
    skipArtifactCreation?: boolean;
  }
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
  let lastArgs: unknown;
  let lastToolCallId: string | undefined;

  return {
    ...toolDefinition,
    toModelOutput: ({ output }: { output: unknown }) => {
      const contextWindowSize =
        getModelContextWindow(ctx.currentModelSettings).contextWindow ?? 120000;
      const detection = detectOversizedArtifact(output, contextWindowSize, {
        toolCallId: lastToolCallId,
        toolName,
      });
      if (detection.isOversized) {
        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
          activeSpan.setAttributes({
            'tool.result.oversized_excluded': true,
            'artifact.original_tokens': detection.originalTokenSize,
            'artifact.context_window': contextWindowSize,
          });
        }
        // Round-trip serializes `unknown` tool args into JSONValue and strips non-JSON types.
        return {
          type: 'json' as const,
          value: JSON.parse(
            JSON.stringify({
              status: 'oversized',
              toolCallId: lastToolCallId,
              toolName,
              warning:
                '⚠️ Tool produced an oversized result that cannot be included in the conversation.',
              reason: formatOversizedRetrievalReason(
                detection.originalTokenSize,
                detection.contextWindowSize ?? contextWindowSize
              ),
              toolInfo: {
                toolName,
                toolArgs: lastArgs,
                structureInfo: detection.structureInfo ?? '',
              },
              recommendation:
                'Consider: 1) narrowing filters/queries on the next tool call, 2) asking the user to break down the request, 3) processing data differently.',
            })
          ),
        };
      }
      return buildToolResultForModelInput(output);
    },
    execute: async (args: any, context?: any) => {
      lastArgs = args;
      const startTime = Date.now();
      const toolCallId = context?.toolCallId || generateToolId();
      lastToolCallId = toolCallId;
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
      const hideToolFromUiStream =
        isInternalTool ||
        toolName.startsWith(DELEGATE_TOOL_PREFIX) ||
        toolName === LOAD_SKILL_TOOL ||
        toolName === 'get_reference_artifact';
      const hideToolFromTraceEvents =
        isInternalTool || toolName.startsWith(DELEGATE_TOOL_PREFIX) || toolName === LOAD_SKILL_TOOL;

      // In durable workflows, delegate_to_ tool results must be stored in
      // conversation history so the next callLlmStep sees the delegation outcome
      // and doesn't re-delegate in a loop.
      const isDurableDelegation =
        !!ctx.durableWorkflowRunId && toolName.startsWith(DELEGATE_TOOL_PREFIX);
      const hideToolFromConversationHistory = hideToolFromTraceEvents && !isDurableDelegation;

      const needsApproval = options?.needsApproval || false;

      const preApprovedEntry = ctx.durableWorkflowRunId
        ? ctx.approvedToolCalls?.[toolCallId]
        : undefined;
      const isPreApproved = !!preApprovedEntry;

      if (streamRequestId && streamHelper && !hideToolFromUiStream && !isPreApproved) {
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

      if (streamRequestId && !hideToolFromTraceEvents) {
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

        const aiToolDef = toolDefinition as AiSdkToolDefinition;
        const validationSchema = aiToolDef.baseInputSchema ?? aiToolDef.parameters;
        const resolvedChanged =
          JSON.stringify(parsedArgsForResolution) !== JSON.stringify(resolvedArgs);

        if (artifactParser && validationSchema?.safeParse && resolvedChanged) {
          const validation = validationSchema.safeParse(resolvedArgs);
          if (!validation.success) {
            const mismatchDetails =
              resolvedArgs && typeof resolvedArgs === 'object' && !Array.isArray(resolvedArgs)
                ? Object.entries(resolvedArgs as Record<string, unknown>)
                    .map(([key, val]) => {
                      const actualType =
                        val === null ? 'null' : Array.isArray(val) ? 'array' : typeof val;
                      return `"${key}" resolved to ${actualType}`;
                    })
                    .join(', ')
                : `resolved to ${Array.isArray(resolvedArgs) ? 'array' : typeof resolvedArgs}`;
            throw new Error(
              `Tool chaining ${SENTINEL_KEY.SELECT} resolved to the wrong type for '${toolName}'. ` +
                `${mismatchDetails}. ${validation.error.message}. ` +
                `Your ${SENTINEL_KEY.SELECT} expression likely returns an object or array where the tool expects a primitive (string/number/boolean). ` +
                `Drill deeper in your ${SENTINEL_KEY.SELECT} path — e.g. add ".text", ".name", or ".id" to extract the specific field. ` +
                `Check _structureHints.terminalPaths in the source tool result for leaf fields.`
            );
          }
        }

        const result = await originalExecute(resolvedArgs, context);
        const duration = Date.now() - startTime;

        if (ctx.durableWorkflowRunId && result && typeof result === 'object') {
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
            for (const artifact of artifacts) {
              const found = findApprovalRequired(
                artifact?.parts as Array<Record<string, unknown>> | undefined
              );
              if (found) return found;
            }
            return undefined;
          };

          const approvalDataRaw =
            findApprovalRequired(taskResult?.parts as Array<Record<string, unknown>> | undefined) ??
            findApprovalInArtifacts(
              taskResult?.artifacts as Array<Record<string, unknown>> | undefined
            );

          if (approvalDataRaw) {
            const approvalData = approvalDataRaw as unknown as DurableApprovalData;
            const delegatedToolCallId = approvalData.toolCallId;
            const delegatedToolName = approvalData.toolName;

            if (typeof delegatedToolCallId !== 'string' || !delegatedToolCallId) {
              logger.error(
                { approvalData, parentToolName: toolName },
                'Malformed durable-approval-required artifact: invalid toolCallId'
              );
              return result;
            }
            if (typeof delegatedToolName !== 'string' || !delegatedToolName) {
              logger.error(
                { approvalData, parentToolName: toolName },
                'Malformed durable-approval-required artifact: invalid toolName'
              );
              return result;
            }

            ctx.pendingDurableApproval = {
              toolCallId: toolCallId,
              toolName,
              args: resolvedArgs,
              delegatedApproval: {
                toolCallId: delegatedToolCallId,
                toolName: delegatedToolName,
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

        if (streamRequestId && !hideToolFromConversationHistory && toolResultConversationId) {
          try {
            const session = agentSessionManager.getSession(streamRequestId);
            const messageId = generateId();
            const taskId = session
              ? `task_${toolResultConversationId}-${session.messageId}`
              : `tool_result_${messageId}`;
            const messageContent = await buildToolResultForConversationHistory(
              ctx,
              toolName,
              args,
              result,
              toolCallId,
              toolResultConversationId,
              messageId,
              taskId,
              { skipArtifactCreation: options?.skipArtifactCreation }
            );
            await createMessage(runDbClient)({
              scopes: { tenantId: ctx.config.tenantId, projectId: ctx.config.projectId },
              data: {
                id: messageId,
                conversationId: toolResultConversationId,
                taskId,
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
                    toolOutput: stripBinaryDataForObservability(result),
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

        if (streamRequestId && !hideToolFromTraceEvents) {
          agentSessionManager.recordEvent(
            streamRequestId,
            SESSION_EVENT_TOOL_RESULT,
            ctx.config.id,
            {
              toolName,
              output: stripBinaryDataForObservability(stripInternalFields(result)),
              toolCallId: toolCallId,
              duration,
              relationshipId,
              needsApproval,
              inDelegatedAgent: ctx.isDelegatedAgent,
            }
          );
        }

        const isDeniedResult = isToolResultDenied(result);

        if (streamRequestId && streamHelper && !hideToolFromUiStream) {
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

        if (streamRequestId && !hideToolFromTraceEvents) {
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

        if (streamRequestId && streamHelper && !hideToolFromUiStream) {
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
