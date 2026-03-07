import { DurableAgent } from '@workflow/ai/agent';
import { anthropic } from '@workflow/ai/anthropic';
import { type ModelMessage, type ToolSet, tool, type UIMessageChunk } from 'ai';
import { defineHook, getWorkflowMetadata, getWritable } from 'workflow';
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

const toolApprovalHook = defineHook<{ approved: boolean; reason?: string }>();
export { toolApprovalHook };

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
  context: { tenantId: string; projectId: string; agentId: string }
): ToolSet {
  const tools: Record<string, ToolSet[string]> = {};
  for (const relation of delegateRelations) {
    const toolName = `delegate_to_${relation.id}`.replace(/[^a-zA-Z0-9_]/g, '_');
    tools[toolName] = tool({
      description: `Delegate a task to ${relation.name}. ${relation.description || ''}. Send a message describing what you need, and the result will be returned.`,
      inputSchema: z.object({
        message: z.string().describe('The task or question to delegate'),
      }),
      execute: async ({ message }) => {
        const { executeDelegationStep } = await import('../steps/agentExecutionSteps');
        const result = await executeDelegationStep({
          tenantId: context.tenantId,
          projectId: context.projectId,
          agentId: context.agentId,
          targetSubAgentId: relation.id,
          message,
        });
        return result.result;
      },
    }) as ToolSet[string];
  }
  return tools;
}

function buildApprovalTools(
  executionId: string,
  approvalHook: typeof toolApprovalHook
): ToolSet {
  return {
    get_coordinates: tool({
      description: 'Get geographical coordinates (latitude, longitude) for a location. This tool requires human approval before execution.',
      inputSchema: z.object({
        location: z.string().describe('The city or location to get coordinates for'),
      }),
      execute: async ({ location }) => {
        const token = `approval-${executionId}-get_coordinates-${Date.now()}`;
        const hook = approvalHook.create({ token });
        const approval = await hook;

        if (!approval.approved) {
          return { denied: true, reason: approval.reason || 'User denied the tool call' };
        }

        const coords: Record<string, { lat: number; lon: number }> = {
          tokyo: { lat: 35.6762, lon: 139.6503 },
          paris: { lat: 48.8566, lon: 2.3522 },
          london: { lat: 51.5074, lon: -0.1278 },
          berlin: { lat: 52.52, lon: 13.405 },
          rome: { lat: 41.9028, lon: 12.4964 },
          moscow: { lat: 55.7558, lon: 37.6173 },
          vienna: { lat: 48.2082, lon: 16.3738 },
          sydney: { lat: -33.8688, lon: 151.2093 },
          cairo: { lat: 30.0444, lon: 31.2357 },
          dubai: { lat: 25.2048, lon: 55.2708 },
          miami: { lat: 25.7617, lon: -80.1918 },
          nyc: { lat: 40.7128, lon: -74.006 },
        };
        const key = location.toLowerCase().replace(/[^a-z]/g, '');
        const match = Object.entries(coords).find(([k]) => key.includes(k));
        if (match) {
          return { location, latitude: match[1].lat, longitude: match[1].lon };
        }
        return { location, latitude: 0, longitude: 0, note: 'Location not found in database' };
      },
    }) as ToolSet[string],
  };
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
        { tenantId, projectId, agentId }
      );
      const approvalTools = buildApprovalTools(executionId, toolApprovalHook);
      const allTools = { ...transferTools, ...delegateTools, ...approvalTools };

      const agent = new DurableAgent({
        model: anthropic(modelName),
        system: currentConfig.systemPrompt,
        tools: allTools,
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
      if (responseText) {
        await persistAgentResponseStep({
          tenantId,
          projectId,
          conversationId,
          responseText,
          subAgentId: currentSubAgentId,
        });
      }
    } catch (persistErr) {
      await logStep('Failed to persist response', {
        executionId,
        error: persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
    }

    try {
      await updateExecutionStatusStep({ executionId, status: 'completed' });
    } catch (statusErr) {
      await logStep('Failed to update status', {
        executionId,
        error: statusErr instanceof Error ? statusErr.message : String(statusErr),
      });
    }

    return { success: true, response: responseText || 'Execution completed' };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? `${error.message} | ${error.stack?.split('\n').slice(0, 3).join(' ')}`
        : String(error);

    try {
      await updateExecutionStatusStep({ executionId, status: 'failed' });
    } catch (_e) {}

    try {
      await logStep('Durable agent execution threw an error', {
        executionId,
        conversationId,
        error: errorMessage,
      });
    } catch (_e) {}

    return { success: false, error: errorMessage };
  }
}

export const agentExecutionWorkflow = Object.assign(_agentExecutionWorkflow, {
  workflowId:
    'workflow//./src/domains/run/workflow/functions/agentExecution//_agentExecutionWorkflow',
});
