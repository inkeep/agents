import { type ModelMessage, type ToolSet, tool, type UIMessageChunk } from 'ai';
import { getWorkflowMetadata, getWritable } from 'workflow';
import { z } from 'zod';
import {
  type AgentConfigResult,
  loadAgentConfigStep,
  loadConversationHistoryStep,
  logStep,
  persistAgentResponseStep,
  type SubAgentRelationInfo,
  updateExecutionStatusStep,
} from '../steps/agentExecutionSteps';

export type AgentExecutionPayload = {
  executionId: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  conversationId: string;
  userMessage: string;
  messageParts: Array<{ kind: string; text?: string; data?: unknown; metadata?: unknown }>;
  requestId: string;
};

const MAX_TRANSFERS = 10;

function buildTransferTools(
  transferRelations: SubAgentRelationInfo[],
  currentSubAgentId: string
): ToolSet {
  const tools: Record<string, ToolSet[string]> = {};
  for (const relation of transferRelations) {
    const toolName = `transfer_to_${relation.id}`.replace(/[^a-zA-Z0-9_]/g, '_');
    tools[toolName] = tool({
      description: `Transfer the conversation to ${relation.name}. ${relation.description || ''}`,
      inputSchema: z.object({}),
      execute: async () => ({
        type: 'transfer' as const,
        targetSubAgentId: relation.id,
        fromSubAgentId: currentSubAgentId,
      }),
    }) as ToolSet[string];
  }
  return tools;
}

function buildDelegateTools(
  delegateRelations: SubAgentRelationInfo[],
  currentSubAgentId: string,
  context: { tenantId: string; projectId: string; agentId: string }
): ToolSet {
  const tools: Record<string, ToolSet[string]> = {};
  for (const relation of delegateRelations) {
    const toolName = `delegate_to_${relation.id}`.replace(/[^a-zA-Z0-9_]/g, '_');
    tools[toolName] = tool({
      description: `Delegate a task to ${relation.name}. ${relation.description || ''}. Send a message describing what you need, and the result will be returned. This tool requires approval before execution.`,
      inputSchema: z.object({
        message: z.string().describe('The task or question to delegate'),
      }),
      execute: async ({ message }) => {
        const { executeDelegationStep } = await import('../steps/agentExecutionSteps');
        const delegationResult = await executeDelegationStep({
          tenantId: context.tenantId,
          projectId: context.projectId,
          agentId: context.agentId,
          targetSubAgentId: relation.id,
          message,
        });
        return delegationResult.result;
      },
    }) as ToolSet[string];
  }
  return tools;
}

function extractTransferFromResult(result: {
  steps: Array<Record<string, unknown>>;
}): { targetSubAgentId: string; fromSubAgentId: string } | null {
  const lastStep = result.steps.at(-1);
  if (!lastStep) return null;

  const toolCalls = lastStep.toolCalls as Array<{ toolName: string }> | undefined;
  if (!toolCalls) return null;

  const hasTransfer = toolCalls.some((tc) => tc.toolName.startsWith('transfer_to_'));
  if (!hasTransfer) return null;

  const toolResults = lastStep.toolResults as Array<{ result?: unknown }> | undefined;
  for (const tr of toolResults ?? []) {
    const r = tr.result as Record<string, unknown> | undefined;
    if (r && r.type === 'transfer' && typeof r.targetSubAgentId === 'string') {
      return {
        targetSubAgentId: r.targetSubAgentId,
        fromSubAgentId: (r.fromSubAgentId as string) ?? '',
      };
    }
  }

  return null;
}

async function _agentExecutionWorkflow(payload: AgentExecutionPayload) {
  'use workflow';

  const { executionId, tenantId, projectId, agentId, conversationId } = payload;

  const metadata = getWorkflowMetadata();
  const runId = metadata.workflowRunId;

  await logStep('Starting durable agent execution workflow', {
    executionId,
    tenantId,
    projectId,
    agentId,
    conversationId,
    runId,
  });

  try {
    const initialConfig = await loadAgentConfigStep({
      tenantId,
      projectId,
      agentId,
      conversationId,
    });

    if (!initialConfig.success || !initialConfig.modelConfig) {
      await updateExecutionStatusStep({ executionId, status: 'failed' });
      await logStep('Agent config loading failed', {
        executionId,
        conversationId,
        error: initialConfig.error ?? 'Missing model configuration',
      });
      return { success: false, error: initialConfig.error ?? 'Missing model configuration' };
    }

    const history = await loadConversationHistoryStep({
      tenantId,
      projectId,
      conversationId,
    });

    const { DurableAgent } = await import('@workflow/ai/agent');
    const { anthropic } = await import('@workflow/ai/anthropic');

    let currentConfig: AgentConfigResult = initialConfig;
    let currentSubAgentId = initialConfig.defaultSubAgentId ?? agentId;
    let responseText = '';
    let currentMessages: ModelMessage[] = history;

    const writable = getWritable<UIMessageChunk>();

    for (let iteration = 0; iteration < MAX_TRANSFERS; iteration++) {
      const modelString = currentConfig.modelConfig?.model ?? '';
      const modelName = modelString.includes('/')
        ? modelString.split('/').slice(1).join('/')
        : modelString;

      const transferTools = buildTransferTools(
        currentConfig.transferRelations || [],
        currentSubAgentId
      );
      const delegateTools = buildDelegateTools(
        currentConfig.delegateRelations || [],
        currentSubAgentId,
        { tenantId, projectId, agentId }
      );
      const allTools = { ...transferTools, ...delegateTools };

      const hasTools = Object.keys(allTools).length > 0;

      const agent = new DurableAgent({
        model: anthropic(modelName),
        system: currentConfig.systemPrompt,
        ...(hasTools ? { tools: allTools } : {}),
      });

      const result = await agent.stream({
        messages: currentMessages,
        writable,
        maxSteps: 10,
        preventClose: true,
      });

      const transferData = extractTransferFromResult(
        result as { steps: Array<Record<string, unknown>> }
      );

      if (transferData) {
        await logStep('Transfer detected in durable workflow', {
          executionId,
          conversationId,
          fromSubAgentId: transferData.fromSubAgentId,
          targetSubAgentId: transferData.targetSubAgentId,
          iteration,
        });

        const nextConfig = await loadAgentConfigStep({
          tenantId,
          projectId,
          agentId,
          conversationId,
          subAgentId: transferData.targetSubAgentId,
        });

        if (!nextConfig.success || !nextConfig.modelConfig) {
          await logStep('Transfer target config loading failed', {
            executionId,
            conversationId,
            targetSubAgentId: transferData.targetSubAgentId,
            error: nextConfig.error ?? 'Missing model configuration',
          });
          break;
        }

        currentConfig = nextConfig;
        currentSubAgentId = transferData.targetSubAgentId;
        currentMessages = history;
        continue;
      }

      responseText = result.messages
        .filter((m) => m.role === 'assistant')
        .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
        .join('\n');

      await logStep('Durable agent execution completed', {
        executionId,
        conversationId,
        steps: result.steps.length,
        iteration,
        subAgentId: currentSubAgentId,
      });

      break;
    }

    try {
      const writer = writable.getWriter();
      await writer.close();
    } catch (_e) {}

    await persistAgentResponseStep({
      tenantId,
      projectId,
      conversationId,
      responseText,
      subAgentId: currentSubAgentId,
    });

    await updateExecutionStatusStep({ executionId, status: 'completed' });

    return { success: true, response: responseText };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      const writer = writable.getWriter();
      await writer.write({ type: 'error', errorText: errorMessage } as any);
      await writer.close();
      writer.releaseLock();
    } catch (_e) {}

    await updateExecutionStatusStep({ executionId, status: 'failed' });

    await logStep('Durable agent execution threw an error', {
      executionId,
      conversationId,
      error: errorMessage,
    });

    return { success: false, error: errorMessage };
  }
}

export const agentExecutionWorkflow = Object.assign(_agentExecutionWorkflow, {
  workflowId:
    'workflow//./src/domains/run/workflow/functions/agentExecution//_agentExecutionWorkflow',
});
