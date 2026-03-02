import { z } from '@hono/zod-openapi';
import { getFunctionToolsForSubAgent, parseEmbeddedJson, withRef } from '@inkeep/agents-core';
import type { Span } from '@opentelemetry/api';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { type ToolSet, tool } from 'ai';
import manageDbPool from '../../../../data/db/manageDbPool';
import { getLogger } from '../../../../logger';
import {
  FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT,
  FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT,
} from '../../constants/execution-limits';
import { pendingToolApprovalManager } from '../../session/PendingToolApprovalManager';
import { toolApprovalUiBus } from '../../session/ToolApprovalUiBus';
import type { SandboxConfig } from '../../types/executionContext';
import { createDeniedToolResult } from '../../utils/tool-result';
import { tracer } from '../../utils/tracer';
import type { AgentRunContext } from '../agent-types';
import { enhanceToolResultWithStructureHints } from '../generation/tool-result';
import { toolSessionManager } from '../services/ToolSessionManager';
import { wrapToolWithStreaming } from './tool-wrapper';

const logger = getLogger('Agent');

export async function getFunctionTools(
  ctx: AgentRunContext,
  sessionId?: string,
  streamRequestId?: string
): Promise<ToolSet> {
  const functionTools: ToolSet = {};
  const project = ctx.executionContext.project;
  try {
    const functionToolsForAgent = await withRef(
      manageDbPool,
      ctx.executionContext.resolvedRef,
      async (db) => {
        return await getFunctionToolsForSubAgent(db)({
          scopes: {
            tenantId: ctx.config.tenantId,
            projectId: ctx.config.projectId,
            agentId: ctx.config.agentId,
          },
          subAgentId: ctx.config.id,
        });
      }
    );

    const functionToolsData = functionToolsForAgent.data ?? [];

    if (functionToolsData.length === 0) {
      return functionTools;
    }

    ctx.functionToolRelationshipIdByName = new Map(
      (functionToolsData as Array<{ name: string; relationshipId?: string }>).flatMap((t) => {
        return t.relationshipId ? ([[t.name, t.relationshipId]] as Array<[string, string]>) : [];
      })
    );

    const { SandboxExecutorFactory } = await import('../../tools/SandboxExecutorFactory');
    const sandboxExecutor = sessionId
      ? SandboxExecutorFactory.getForSession(sessionId)
      : new SandboxExecutorFactory();

    for (const functionToolDef of functionToolsData) {
      const functionId = functionToolDef.functionId;
      if (!functionId) {
        logger.warn(
          { functionToolId: functionToolDef.id },
          'Function tool missing functionId reference'
        );
        continue;
      }

      const functionData = project.functions?.[functionId];
      if (!functionData) {
        logger.warn(
          { functionId, functionToolId: functionToolDef.id },
          'Function not found in functions table'
        );
        continue;
      }

      const zodSchema = functionData.inputSchema
        ? z.fromJSONSchema(functionData.inputSchema)
        : z.string();
      const toolPolicies = functionToolDef.toolPolicies;
      const needsApproval =
        !!toolPolicies?.['*']?.needsApproval ||
        !!toolPolicies?.[functionToolDef.name]?.needsApproval;

      const aiTool = tool({
        description: functionToolDef.description || functionToolDef.name,
        inputSchema: zodSchema,
        execute: async (args, { toolCallId, providerMetadata }: any) => {
          let processedArgs: typeof args;
          try {
            processedArgs = parseEmbeddedJson(args);

            if (JSON.stringify(args) !== JSON.stringify(processedArgs)) {
              logger.warn(
                { toolName: functionToolDef.name, toolCallId },
                'Fixed stringified JSON parameters (indicates schema ambiguity)'
              );
            }
          } catch (error) {
            logger.warn(
              { toolName: functionToolDef.name, toolCallId, error: (error as Error).message },
              'Failed to parse embedded JSON, using original args'
            );
            processedArgs = args;
          }

          const finalArgs = processedArgs;

          if (needsApproval) {
            logger.info(
              { toolName: functionToolDef.name, toolCallId, args: finalArgs },
              'Function tool requires approval - waiting for user response'
            );

            const currentSpan = trace.getActiveSpan();
            if (currentSpan) {
              currentSpan.addEvent('tool.approval.requested', {
                'tool.name': functionToolDef.name,
                'tool.callId': toolCallId,
                'subAgent.id': ctx.config.id,
              });
            }

            tracer.startActiveSpan(
              'tool.approval_requested',
              {
                attributes: {
                  'tool.name': functionToolDef.name,
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
                toolName: functionToolDef.name,
                input: finalArgs as Record<string, unknown>,
              });
            } else if (ctx.isDelegatedAgent) {
              const currentStreamRequestId = ctx.streamRequestId ?? '';
              if (currentStreamRequestId) {
                await toolApprovalUiBus.publish(currentStreamRequestId, {
                  type: 'approval-needed',
                  toolCallId,
                  toolName: functionToolDef.name,
                  input: finalArgs,
                  providerMetadata,
                  approvalId: `aitxt-${toolCallId}`,
                });
              }
            }

            const approvalResult = await pendingToolApprovalManager.waitForApproval(
              toolCallId,
              functionToolDef.name,
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
                    'tool.name': functionToolDef.name,
                    'tool.callId': toolCallId,
                    'subAgent.id': ctx.config.id,
                    'subAgent.name': ctx.config.name,
                  },
                },
                (denialSpan: Span) => {
                  logger.info(
                    { toolName: functionToolDef.name, toolCallId, reason: approvalResult.reason },
                    'Function tool execution denied by user'
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
                  'tool.name': functionToolDef.name,
                  'tool.callId': toolCallId,
                  'subAgent.id': ctx.config.id,
                  'subAgent.name': ctx.config.name,
                },
              },
              (approvedSpan: Span) => {
                logger.info(
                  { toolName: functionToolDef.name, toolCallId },
                  'Function tool approved, continuing with execution'
                );
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

          logger.debug(
            { toolName: functionToolDef.name, toolCallId, args: finalArgs },
            'Function Tool Called'
          );

          try {
            const defaultSandboxConfig: SandboxConfig = {
              provider: 'native',
              runtime: 'node22',
              timeout: FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT,
              vcpus: FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT,
            };

            const result = await sandboxExecutor.executeFunctionTool(
              functionToolDef.id,
              finalArgs as Record<string, unknown>,
              {
                description: functionToolDef.description || functionToolDef.name,
                inputSchema: functionData.inputSchema || {},
                executeCode: functionData.executeCode,
                dependencies: functionData.dependencies || {},
                sandboxConfig: ctx.config.sandboxConfig || defaultSandboxConfig,
              }
            );

            toolSessionManager.recordToolResult(sessionId || '', {
              toolCallId,
              toolName: functionToolDef.name,
              args: finalArgs,
              result,
              timestamp: Date.now(),
            });

            const r = result as { type?: string; value?: string } | null | undefined;
            const resultForEnhancement =
              r?.type === 'text' && typeof r?.value === 'string' ? { text: r.value } : result;

            return enhanceToolResultWithStructureHints(ctx, resultForEnhancement, toolCallId);
          } catch (error) {
            logger.error(
              {
                toolName: functionToolDef.name,
                toolCallId,
                error: error instanceof Error ? error.message : String(error),
              },
              'Function tool execution failed'
            );
            throw error;
          }
        },
      });

      functionTools[functionToolDef.name] = wrapToolWithStreaming(
        ctx,
        functionToolDef.name,
        aiTool,
        streamRequestId || '',
        'tool',
        { needsApproval }
      );
    }
  } catch (error) {
    logger.error({ error }, 'Failed to load function tools from database');
  }

  return functionTools;
}
