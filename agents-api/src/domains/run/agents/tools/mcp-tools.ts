import { parseEmbeddedJson, unwrapError } from '@inkeep/agents-core';
import type { Span } from '@opentelemetry/api';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { type ToolSet, tool } from 'ai';
import { getLogger } from '../../../../logger';
import { agentSessionManager } from '../../session/AgentSession';
import { pendingToolApprovalManager } from '../../session/PendingToolApprovalManager';
import { toolApprovalUiBus } from '../../session/ToolApprovalUiBus';
import { createDeniedToolResult } from '../../utils/tool-result';
import { tracer } from '../../utils/tracer';
import type { AgentRunContext } from '../agent-types';
import { isValidTool } from '../agent-types';
import { enhanceToolResultWithStructureHints } from '../generation/tool-result';
import { toolSessionManager } from '../services/ToolSessionManager';
import { getRelationshipIdForTool, wrapToolWithStreaming } from './tool-wrapper';

const logger = getLogger('Agent');

export async function getMcpTools(
  ctx: AgentRunContext,
  sessionId?: string,
  streamRequestId?: string
): Promise<{ tools: ToolSet; toolSets: any[] }> {
  const mcpTools =
    ctx.config.tools?.filter((tool) => {
      return tool.config?.type === 'mcp';
    }) || [];
  const toolSets =
    (await Promise.all(mcpTools.map((tool) => ctx.mcpManager.getToolSet(tool)))) || [];

  if (!sessionId) {
    const wrappedTools: ToolSet = {};
    for (const toolSet of toolSets) {
      for (const [toolName, toolDef] of Object.entries(toolSet.tools)) {
        const needsApproval = toolSet.toolPolicies?.[toolName]?.needsApproval || false;

        const enhancedTool = {
          ...(toolDef || {}),
          needsApproval,
        };

        wrappedTools[toolName] = wrapToolWithStreaming(
          ctx,
          toolName,
          enhancedTool,
          streamRequestId,
          'mcp',
          {
            needsApproval,
            mcpServerId: toolSet.mcpServerId,
            mcpServerName: toolSet.mcpServerName,
          }
        );
      }
    }
    return { tools: wrappedTools, toolSets };
  }

  const wrappedTools: ToolSet = {};
  for (const toolResult of toolSets) {
    for (const [toolName, originalTool] of Object.entries(toolResult.tools)) {
      if (!isValidTool(originalTool)) {
        logger.error({ toolName }, 'Invalid MCP tool structure - missing required properties');
        continue;
      }

      const needsApproval = toolResult.toolPolicies?.[toolName]?.needsApproval || false;

      logger.debug(
        {
          toolName,
          toolPolicies: toolResult.toolPolicies,
          needsApproval,
          policyForThisTool: toolResult.toolPolicies?.[toolName],
        },
        'Tool approval check'
      );

      const sessionWrappedTool = tool({
        description: originalTool.description,
        inputSchema: originalTool.inputSchema,
        execute: async (args, { toolCallId, providerMetadata }: any) => {
          let processedArgs: typeof args;
          try {
            processedArgs = parseEmbeddedJson(args);

            if (JSON.stringify(args) !== JSON.stringify(processedArgs)) {
              logger.warn(
                { toolName, toolCallId },
                'Fixed stringified JSON parameters (indicates schema ambiguity)'
              );
            }
          } catch (error) {
            logger.warn(
              { toolName, toolCallId, error: (error as Error).message },
              'Failed to parse embedded JSON, using original args'
            );
            processedArgs = args;
          }

          const finalArgs = processedArgs;

          if (needsApproval) {
            logger.info(
              { toolName, toolCallId, args: finalArgs },
              'Tool requires approval - waiting for user response'
            );

            const currentSpan = trace.getActiveSpan();
            if (currentSpan) {
              currentSpan.addEvent('tool.approval.requested', {
                'tool.name': toolName,
                'tool.callId': toolCallId,
                'subAgent.id': ctx.config.id,
              });
            }

            tracer.startActiveSpan(
              'tool.approval_requested',
              {
                attributes: {
                  'tool.name': toolName,
                  'tool.callId': toolCallId,
                  'subAgent.id': ctx.config.id,
                  'subAgent.name': ctx.config.name,
                },
              },
              (requestSpan: Span) => {
                requestSpan.setStatus({ code: SpanStatusCode.OK });
                requestSpan.end();
              }
            );

            const streamHelper = ctx.isDelegatedAgent ? undefined : ctx.streamHelper;
            if (streamHelper) {
              await streamHelper.writeToolApprovalRequest({
                approvalId: `aitxt-${toolCallId}`,
                toolCallId,
                toolName,
                input: finalArgs as Record<string, unknown>,
              });
            } else if (ctx.isDelegatedAgent) {
              const currentStreamRequestId = ctx.streamRequestId ?? '';
              if (currentStreamRequestId) {
                await toolApprovalUiBus.publish(currentStreamRequestId, {
                  type: 'approval-needed',
                  toolCallId,
                  toolName,
                  input: finalArgs,
                  providerMetadata,
                  approvalId: `aitxt-${toolCallId}`,
                });
              }
            }

            const approvalResult = await pendingToolApprovalManager.waitForApproval(
              toolCallId,
              toolName,
              args,
              ctx.conversationId || 'unknown',
              ctx.config.id
            );

            if (!approvalResult.approved) {
              if (!streamHelper && ctx.isDelegatedAgent) {
                const currentStreamRequestId = ctx.streamRequestId ?? '';
                if (currentStreamRequestId) {
                  await toolApprovalUiBus.publish(currentStreamRequestId, {
                    type: 'approval-resolved',
                    toolCallId,
                    approved: false,
                    reason: approvalResult.reason,
                  });
                }
              }
              return tracer.startActiveSpan(
                'tool.approval_denied',
                {
                  attributes: {
                    'tool.name': toolName,
                    'tool.callId': toolCallId,
                    'subAgent.id': ctx.config.id,
                    'subAgent.name': ctx.config.name,
                    'tool.approval.reason': approvalResult.reason,
                  },
                },
                (denialSpan: Span) => {
                  logger.info(
                    { toolName, toolCallId, reason: approvalResult.reason },
                    'Tool execution denied by user'
                  );

                  denialSpan.setStatus({ code: SpanStatusCode.OK });
                  denialSpan.end();

                  return createDeniedToolResult(toolCallId, approvalResult.reason);
                }
              );
            }

            tracer.startActiveSpan(
              'tool.approval_approved',
              {
                attributes: {
                  'tool.name': toolName,
                  'tool.callId': toolCallId,
                  'subAgent.id': ctx.config.id,
                  'subAgent.name': ctx.config.name,
                },
              },
              (approvedSpan: Span) => {
                logger.info({ toolName, toolCallId }, 'Tool approved, continuing with execution');
                approvedSpan.setStatus({ code: SpanStatusCode.OK });
                approvedSpan.end();
              }
            );

            if (!streamHelper && ctx.isDelegatedAgent) {
              const currentStreamRequestId = ctx.streamRequestId ?? '';
              if (currentStreamRequestId) {
                await toolApprovalUiBus.publish(currentStreamRequestId, {
                  type: 'approval-resolved',
                  toolCallId,
                  approved: true,
                });
              }
            }
          }

          logger.debug({ toolName, toolCallId }, 'MCP Tool Called');

          try {
            const rawResult = await originalTool.execute(finalArgs, { toolCallId });

            if (rawResult && typeof rawResult === 'object' && rawResult.isError) {
              const errorMessage = rawResult.content?.[0]?.text || 'MCP tool returned an error';
              logger.error(
                { toolName, toolCallId, errorMessage, rawResult },
                'MCP tool returned error status'
              );

              toolSessionManager.recordToolResult(sessionId, {
                toolCallId,
                toolName,
                args: finalArgs,
                result: { error: errorMessage, failed: true },
                timestamp: Date.now(),
              });

              if (streamRequestId) {
                const relationshipId = getRelationshipIdForTool(ctx, toolName, 'mcp');
                agentSessionManager.recordEvent(streamRequestId, 'error', ctx.config.id, {
                  message: `MCP tool "${toolName}" failed: ${errorMessage}`,
                  code: 'mcp_tool_error',
                  severity: 'error',
                  context: {
                    toolName,
                    toolCallId,
                    errorMessage,
                    relationshipId,
                  },
                  relationshipId,
                });
              }

              const activeSpan = trace.getActiveSpan();
              if (activeSpan) {
                const error = new Error(
                  `Tool "${toolName}" failed: ${errorMessage}. This tool is currently unavailable. Please try a different approach or inform the user of the issue.`
                );
                activeSpan.recordException(error);
                activeSpan.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: `MCP tool returned error: ${errorMessage}`,
                });
              }

              throw new Error(
                `Tool "${toolName}" failed: ${errorMessage}. This tool is currently unavailable. Please try a different approach or inform the user of the issue.`
              );
            }

            const parsedResult = parseEmbeddedJson(rawResult);

            const enhancedResult = enhanceToolResultWithStructureHints(
              ctx,
              parsedResult,
              toolCallId
            );

            toolSessionManager.recordToolResult(sessionId, {
              toolCallId,
              toolName,
              args: finalArgs,
              result: parsedResult,
              timestamp: Date.now(),
            });

            return enhancedResult;
          } catch (error) {
            const rootCause = unwrapError(error);
            logger.error(
              { toolName, toolCallId, error: rootCause.message },
              'MCP tool execution failed'
            );
            throw rootCause;
          }
        },
      });

      wrappedTools[toolName] = wrapToolWithStreaming(
        ctx,
        toolName,
        sessionWrappedTool,
        streamRequestId,
        'mcp',
        {
          needsApproval,
          mcpServerId: toolResult.mcpServerId,
          mcpServerName: toolResult.mcpServerName,
        }
      );
    }
  }

  return { tools: wrappedTools, toolSets };
}
