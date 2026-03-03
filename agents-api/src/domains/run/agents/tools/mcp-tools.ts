import { parseEmbeddedJson, unwrapError } from '@inkeep/agents-core';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { type ToolSet, tool } from 'ai';
import { getLogger } from '../../../../logger';
import { agentSessionManager } from '../../session/AgentSession';
import type { AgentRunContext } from '../agent-types';
import { isValidTool } from '../agent-types';
import { enhanceToolResultWithStructureHints } from '../generation/tool-result';
import { toolSessionManager } from '../services/ToolSessionManager';
import { parseAndCheckApproval } from './tool-approval';
import { getRelationshipIdForTool } from './tool-utils';
import { wrapToolWithStreaming } from './tool-wrapper';

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
  const { mcpManager } = ctx;
  const toolSets = mcpManager
    ? (await Promise.all(mcpTools.map((tool) => mcpManager.getToolSet(tool)))) || []
    : [];

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
          const parsed = await parseAndCheckApproval(
            ctx,
            toolName,
            toolCallId,
            args,
            providerMetadata,
            needsApproval
          );
          if (parsed.denied) {
            return parsed.result;
          }
          const finalArgs = parsed.args;

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
