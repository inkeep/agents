import { z } from '@hono/zod-openapi';
import { getFunctionToolsForSubAgent, withRef } from '@inkeep/agents-core';
import { type ToolSet, tool } from 'ai';
import manageDbPool from '../../../../data/db/manageDbPool';
import { getLogger } from '../../../../logger';
import {
  FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT,
  FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT,
} from '../../constants/execution-limits';
import type { SandboxConfig } from '../../types/executionContext';
import type { AgentRunContext } from '../agent-types';
import { enhanceToolResultWithStructureHints } from '../generation/tool-result';
import { toolSessionManager } from '../services/ToolSessionManager';
import { parseAndCheckApproval } from './tool-approval';
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
          const parsed = await parseAndCheckApproval(
            ctx,
            functionToolDef.name,
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
