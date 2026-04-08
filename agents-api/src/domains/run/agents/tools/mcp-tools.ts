import { z } from '@hono/zod-openapi';
import { parseEmbeddedJson, SESSION_EVENT_ERROR, unwrapError } from '@inkeep/agents-core';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { type ToolSet, tool } from 'ai';
import { getLogger } from '../../../../logger';
import { agentSessionManager } from '../../session/AgentSession';
import type { AgentRunContext } from '../agent-types';
import { isValidTool } from '../agent-types';
import { enhanceToolResultWithStructureHints } from '../generation/tool-result';
import type { McpToolSet } from '../services/AgentMcpManager';
import { toolSessionManager } from '../services/ToolSessionManager';
import { makeBaseInputSchema, makeRefAwareJsonSchema } from './ref-aware-schema';
import { parseAndCheckApproval } from './tool-approval';
import { getRelationshipIdForTool } from './tool-utils';
import { wrapToolWithStreaming } from './tool-wrapper';

const logger = getLogger('Agent');

function buildRefAwareInputSchema(inputSchema: unknown): {
  refAwareInputSchema: ReturnType<typeof z.fromJSONSchema>;
  baseInputSchema: ReturnType<typeof z.fromJSONSchema> | undefined;
} {
  try {
    const rawJson = z.toJSONSchema(inputSchema as z.ZodType) as Record<string, unknown>;
    const baseInputSchema = makeBaseInputSchema(rawJson);
    const refAwareInputSchema = z.fromJSONSchema(makeRefAwareJsonSchema(rawJson));
    return { refAwareInputSchema, baseInputSchema };
  } catch {
    return {
      refAwareInputSchema: inputSchema as ReturnType<typeof z.fromJSONSchema>,
      baseInputSchema: undefined,
    };
  }
}

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
  const toolSets: McpToolSet[] = [];
  if (mcpManager) {
    const results = await Promise.allSettled(mcpTools.map((tool) => mcpManager.getToolSet(tool)));
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        toolSets.push(result.value);
      } else {
        logger.warn(
          {
            toolName: mcpTools[i].name,
            toolId: mcpTools[i].id,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          },
          'MCP tool failed to load — skipping this tool and continuing with others'
        );
      }
    }
  }

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

      const { refAwareInputSchema, baseInputSchema } = buildRefAwareInputSchema(
        originalTool.inputSchema
      );

      const baseTool = tool({
        description: originalTool.description,
        inputSchema: refAwareInputSchema,
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
          if (parsed.pendingApproval) {
            return null;
          }
          const finalArgs = parsed.args;

          logger.debug({ toolName, toolCallId }, 'MCP Tool Called');

          try {
            const rawResult = await originalTool.execute(finalArgs, { toolCallId });

            const result = rawResult as Record<string, unknown>;
            if (result.isError) {
              const errorMessage =
                (result.content as Array<{ text?: string }>)?.[0]?.text ||
                'MCP tool returned an error';
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
                agentSessionManager.recordEvent(
                  streamRequestId,
                  SESSION_EVENT_ERROR,
                  ctx.config.id,
                  {
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
                  }
                );
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
      const sessionWrappedTool = baseInputSchema
        ? Object.assign(baseTool, { baseInputSchema })
        : baseTool;

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
