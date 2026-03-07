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

function buildApprovalTool(
  toolName: string,
  description: string,
  inputSchema: z.ZodObject<any>,
  executionId: string,
  approvalHook: typeof toolApprovalHook,
  executeFn: (args: any) => Promise<unknown>
): ToolSet[string] {
  return tool({
    description: `${description} (requires approval)`,
    inputSchema,
    execute: async (args) => {
      const token = `approval-${executionId}-${toolName}-${Date.now()}`;
      const hook = approvalHook.create({ token });
      const approval = await hook;
      if (!approval.approved) {
        return { denied: true, reason: approval.reason || 'User denied the tool call' };
      }
      return executeFn(args);
    },
  }) as ToolSet[string];
}

const COORDS_DB: Record<string, { lat: number; lon: number }> = {
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
  'san francisco': { lat: 37.7749, lon: -122.4194 },
  seoul: { lat: 37.5665, lon: 126.978 },
  beijing: { lat: 39.9042, lon: 116.4074 },
};

function extractTransferFromResult(result: {
  steps: Array<Record<string, unknown>>;
}): { targetSubAgentId: string; fromSubAgentId: string } | null {
  for (const step of result.steps) {
    const toolResults = step.toolResults as Array<{ result?: unknown }> | undefined;
    for (const tr of toolResults ?? []) {
      const r = tr.result as Record<string, unknown> | undefined;
      if (r && r.type === 'transfer' && typeof r.targetSubAgentId === 'string') {
        return {
          targetSubAgentId: r.targetSubAgentId,
          fromSubAgentId: (r.fromSubAgentId as string) ?? '',
        };
      }
    }
  }
  return null;
}

function extractDelegateFromResult(
  result: { steps: Array<Record<string, unknown>> },
  delegateToolNames: Set<string>
): { toolCallId: string; toolName: string; targetId: string; message: string } | null {
  for (const step of result.steps) {
    const toolResults = step.toolResults as
      | Array<{
          toolCallId: string;
          toolName: string;
          result?: unknown;
        }>
      | undefined;
    for (const tr of toolResults ?? []) {
      if (delegateToolNames.has(tr.toolName)) {
        const r = tr.result as Record<string, unknown> | undefined;
        if (r && r.__delegate === true) {
          return {
            toolCallId: tr.toolCallId,
            toolName: tr.toolName,
            targetId: r.targetSubAgentId as string,
            message: r.message as string,
          };
        }
      }
    }
  }
  return null;
}

function buildDelegateTools(delegateRelations: SubAgentRelationInfo[]): ToolSet {
  const tools: Record<string, ToolSet[string]> = {};
  for (const relation of delegateRelations) {
    const toolName = `delegate_to_${relation.id}`.replace(/[^a-zA-Z0-9_]/g, '_');
    tools[toolName] = tool({
      description: `Delegate a task to ${relation.name}. ${relation.description || ''}. Send a message describing what you need.`,
      inputSchema: z.object({
        message: z.string().describe('The task or question to delegate'),
      }),
      execute: async ({ message }) => ({
        __delegate: true,
        targetSubAgentId: relation.id,
        message,
      }),
    }) as ToolSet[string];
  }
  return tools;
}

function getDelegateToolNames(delegateRelations: SubAgentRelationInfo[]): Set<string> {
  return new Set(
    delegateRelations.map((r) => `delegate_to_${r.id}`.replace(/[^a-zA-Z0-9_]/g, '_'))
  );
}

function buildSubAgentTools(
  subAgentId: string,
  executionId: string,
  approvalHook: typeof toolApprovalHook
): ToolSet {
  if (subAgentId === 'get-coordinates-agent') {
    return {
      get_coordinates: buildApprovalTool(
        'get_coordinates',
        'Get geographical coordinates (latitude, longitude) for a location',
        z.object({ location: z.string().describe('The city or location to get coordinates for') }),
        executionId,
        approvalHook,
        async ({ location }: { location: string }) => {
          const key = location.toLowerCase().replace(/[^a-z ]/g, '');
          const match = Object.entries(COORDS_DB).find(([k]) => key.includes(k));
          if (match) return { location, latitude: match[1].lat, longitude: match[1].lon };
          return { location, latitude: 0, longitude: 0, note: 'Not found' };
        }
      ),
    };
  }
  return {};
}

async function _agentExecutionWorkflow(payload: AgentExecutionPayload) {
  'use workflow';

  const { executionId, tenantId, projectId, agentId, conversationId } = payload;
  const metadata = getWorkflowMetadata();

  await logStep('Starting durable agent execution', { executionId, agentId, conversationId });

  try {
    const initialConfig = await loadAgentConfigStep({
      tenantId,
      projectId,
      agentId,
      conversationId,
    });
    if (!initialConfig.success || !initialConfig.modelConfig) {
      await updateExecutionStatusStep({ executionId, status: 'failed' });
      return { success: false, error: initialConfig.error ?? 'Missing model config' };
    }

    const history = await loadConversationHistoryStep({ tenantId, projectId, conversationId });

    let currentConfig: AgentConfigResult = initialConfig;
    let currentSubAgentId = initialConfig.defaultSubAgentId ?? agentId;
    let responseText = '';
    let currentMessages: ModelMessage[] = history;
    const writable = getWritable<UIMessageChunk>();

    for (let iteration = 0; iteration < MAX_TRANSFERS; iteration++) {
      const modelName = (currentConfig.modelConfig?.model ?? '').replace(/^[^/]+\//, '');
      const delegateRelations = currentConfig.delegateRelations || [];
      const delegateToolNames = getDelegateToolNames(delegateRelations);

      const transferTools = buildTransferTools(
        currentConfig.transferRelations || [],
        currentSubAgentId
      );
      const delegateTools = buildDelegateTools(delegateRelations);
      const allTools = { ...transferTools, ...delegateTools };

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
        ...(delegateToolNames.size > 0
          ? {
              stopWhen: ({ steps }: { steps: Array<Record<string, unknown>> }) => {
                for (const step of steps) {
                  const trs = (step as any).toolResults as
                    | Array<{ toolName: string; result?: unknown }>
                    | undefined;
                  if (
                    trs?.some(
                      (tr) => delegateToolNames.has(tr.toolName) && (tr.result as any)?.__delegate
                    )
                  )
                    return true;
                }
                return false;
              },
            }
          : {}),
      });

      const transferData = extractTransferFromResult(
        result as { steps: Array<Record<string, unknown>> }
      );
      if (transferData) {
        const nextConfig = await loadAgentConfigStep({
          tenantId,
          projectId,
          agentId,
          conversationId,
          subAgentId: transferData.targetSubAgentId,
        });
        if (!nextConfig.success || !nextConfig.modelConfig) break;
        currentConfig = nextConfig;
        currentSubAgentId = transferData.targetSubAgentId;
        currentMessages = history;
        continue;
      }

      const delegateData = extractDelegateFromResult(
        result as { steps: Array<Record<string, unknown>> },
        delegateToolNames
      );

      if (delegateData) {
        const subConfig = await loadAgentConfigStep({
          tenantId,
          projectId,
          agentId,
          conversationId,
          subAgentId: delegateData.targetId,
        });

        if (subConfig.success && subConfig.modelConfig) {
          const subModelName = (subConfig.modelConfig.model ?? '').replace(/^[^/]+\//, '');
          const subTools = buildSubAgentTools(delegateData.targetId, executionId, toolApprovalHook);

          const toolInstructions =
            Object.keys(subTools).length > 0
              ? `\n\nIMPORTANT: You MUST use the available tools to complete the task. Do NOT answer from your own knowledge — always call the appropriate tool.`
              : '';

          const subAgent = new DurableAgent({
            model: anthropic(subModelName),
            system:
              (subConfig.systemPrompt || `You are ${delegateData.targetId}.`) + toolInstructions,
            ...(Object.keys(subTools).length > 0 ? { tools: subTools } : {}),
          });

          const hasSubTools = Object.keys(subTools).length > 0;
          const subResult = await subAgent.stream({
            messages: [{ role: 'user' as const, content: delegateData.message }],
            writable,
            maxSteps: 5,
            preventClose: true,
            ...(hasSubTools ? { toolChoice: 'required' as any } : {}),
          });

          const subResponseText = subResult.messages
            .filter((m) => m.role === 'assistant')
            .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
            .join('\n');

          currentMessages = [
            ...result.messages,
            {
              role: 'tool' as const,
              content: [
                {
                  type: 'tool-result' as const,
                  toolCallId: delegateData.toolCallId,
                  toolName: delegateData.toolName,
                  result: subResponseText,
                },
              ],
            },
          ];
          continue;
        }
      }

      responseText = result.messages
        .filter((m) => m.role === 'assistant')
        .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
        .join('\n');
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
    } catch (_e) {}

    try {
      await updateExecutionStatusStep({ executionId, status: 'completed' });
    } catch (_e) {}

    return { success: true, response: responseText || 'Execution completed' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    try {
      await updateExecutionStatusStep({ executionId, status: 'failed' });
    } catch (_e) {}
    try {
      await logStep('Workflow error', { executionId, error: errorMessage });
    } catch (_e) {}
    return { success: false, error: errorMessage };
  }
}

export const agentExecutionWorkflow = Object.assign(_agentExecutionWorkflow, {
  workflowId:
    'workflow//./src/domains/run/workflow/functions/agentExecution//_agentExecutionWorkflow',
});
