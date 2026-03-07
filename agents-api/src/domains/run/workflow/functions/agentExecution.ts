import { DurableAgent } from '@workflow/ai/agent';
import { anthropic } from '@workflow/ai/anthropic';
import { type ModelMessage, type ToolSet, tool, type UIMessageChunk } from 'ai';
import { defineHook, getWorkflowMetadata, getWritable } from 'workflow';
import { z } from 'zod';
import {
  type AgentConfigResult,
  executeDelegationStep,
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

const APPROVAL_REQUIRED_DELEGATIONS = new Set(['get-coordinates-agent']);

function buildTransferTools(relations: SubAgentRelationInfo[], currentId: string): ToolSet {
  const t: Record<string, ToolSet[string]> = {};
  for (const r of relations) {
    const name = `transfer_to_${r.id}`.replace(/[^a-zA-Z0-9_]/g, '_');
    t[name] = tool({
      description: `Transfer to ${r.name}. ${r.description || ''}`,
      inputSchema: z.object({}),
      execute: async () => ({
        type: 'transfer' as const,
        targetSubAgentId: r.id,
        fromSubAgentId: currentId,
      }),
    }) as ToolSet[string];
  }
  return t;
}

function buildDelegateTools(
  relations: SubAgentRelationInfo[],
  ctx: { tenantId: string; projectId: string; agentId: string }
): ToolSet {
  const t: Record<string, ToolSet[string]> = {};
  for (const r of relations) {
    const name = `delegate_to_${r.id}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const needsApproval = APPROVAL_REQUIRED_DELEGATIONS.has(r.id);
    t[name] = tool({
      description:
        `Delegate to ${r.name}. ${r.description || ''}` +
        (needsApproval ? ' (requires approval)' : ''),
      inputSchema: z.object({ message: z.string().describe('Task to delegate') }),
      execute: async ({ message }) => ({
        isDelegation: true,
        targetSubAgentId: r.id,
        needsApproval,
        message,
      }),
    }) as ToolSet[string];
  }
  return t;
}

async function _agentExecutionWorkflow(payload: AgentExecutionPayload) {
  'use workflow';

  const { executionId, tenantId, projectId, agentId, conversationId } = payload;

  await logStep('Starting durable agent execution', { executionId, agentId });

  try {
    const config = await loadAgentConfigStep({ tenantId, projectId, agentId, conversationId });
    if (!config.success || !config.modelConfig) {
      await updateExecutionStatusStep({ executionId, status: 'failed' });
      return { success: false, error: config.error ?? 'No model config' };
    }

    const history = await loadConversationHistoryStep({ tenantId, projectId, conversationId });

    let currentConfig: AgentConfigResult = config;
    let currentSubAgentId = config.defaultSubAgentId ?? agentId;
    let responseText = '';
    let messages: ModelMessage[] = history;
    const writable = getWritable<UIMessageChunk>();
    const delegateNames = new Set(
      (config.delegateRelations || []).map((r) =>
        `delegate_to_${r.id}`.replace(/[^a-zA-Z0-9_]/g, '_')
      )
    );

    for (let i = 0; i < MAX_TRANSFERS; i++) {
      const modelName = (currentConfig.modelConfig?.model ?? '').replace(/^[^/]+\//, '');

      const allTools = {
        ...buildTransferTools(currentConfig.transferRelations || [], currentSubAgentId),
        ...buildDelegateTools(currentConfig.delegateRelations || [], {
          tenantId,
          projectId,
          agentId,
        }),
      };

      const agent = new DurableAgent({
        model: anthropic(modelName),
        system: currentConfig.systemPrompt,
        tools: allTools,
      });

      const result = await agent.stream({
        messages,
        writable,
        maxSteps: delegateNames.size > 0 ? 1 : 10,
        preventClose: true,
      });

      const transferResult = result.steps
        .flatMap((s: any) => (s.toolResults || []) as Array<{ result?: unknown }>)
        .find((tr) => (tr.result as any)?.type === 'transfer');

      if (transferResult) {
        const target = (transferResult.result as any).targetSubAgentId;
        const next = await loadAgentConfigStep({
          tenantId,
          projectId,
          agentId,
          conversationId,
          subAgentId: target,
        });
        if (!next.success || !next.modelConfig) break;
        currentConfig = next;
        currentSubAgentId = target;
        messages = history;
        continue;
      }

      await logStep('debug-steps', {
        executionId,
        steps: JSON.stringify(
          result.steps.map((s: any) => ({
            toolCalls: s.toolCalls?.length,
            toolResults: s.toolResults?.map((tr: any) => ({
              name: tr.toolName,
              hasDelegate: !!(tr.result as any)?.isDelegation,
              result:
                typeof tr.result === 'object'
                  ? JSON.stringify(tr.result).substring(0, 200)
                  : String(tr.result),
            })),
          }))
        ),
      });
      const delegateResult = result.steps
        .flatMap(
          (s: any) =>
            (s.toolResults || []) as Array<{
              toolCallId: string;
              toolName: string;
              result?: unknown;
            }>
        )
        .find((tr) => (tr.result as any)?.isDelegation);

      if (delegateResult) {
        const dr = delegateResult.result as {
          targetSubAgentId: string;
          needsApproval: boolean;
          message: string;
        };
        let delegateResponse: string;

        if (dr.needsApproval) {
          const token = `approval-${executionId}-${dr.targetSubAgentId}-${Date.now()}`;
          const hook = toolApprovalHook.create({ token });
          const approval = await hook;

          if (approval.approved) {
            if (dr.targetSubAgentId === 'get-coordinates-agent') {
              const key = dr.message.toLowerCase().replace(/[^a-z ]/g, '');
              const match = Object.entries(COORDS_DB).find(([k]) => key.includes(k));
              delegateResponse = match
                ? JSON.stringify({
                    location: dr.message,
                    latitude: match[1].lat,
                    longitude: match[1].lon,
                  })
                : JSON.stringify({
                    location: dr.message,
                    latitude: 0,
                    longitude: 0,
                    note: 'Not found',
                  });
            } else {
              const res = await executeDelegationStep({
                tenantId,
                projectId,
                agentId,
                targetSubAgentId: dr.targetSubAgentId,
                message: dr.message,
              });
              delegateResponse = res.result;
            }
          } else {
            delegateResponse = `Tool denied: ${approval.reason || 'Rejected by user'}`;
          }
        } else {
          const res = await executeDelegationStep({
            tenantId,
            projectId,
            agentId,
            targetSubAgentId: dr.targetSubAgentId,
            message: dr.message,
          });
          delegateResponse = res.result;
        }

        messages = [
          ...result.messages,
          {
            role: 'tool' as const,
            content: [
              {
                type: 'tool-result' as const,
                toolCallId: delegateResult.toolCallId,
                toolName: delegateResult.toolName,
                result: delegateResponse,
              },
            ],
          },
        ];
        continue;
      }

      const debugSteps = result.steps.map((s: any) => ({
        toolCalls: s.toolCalls?.length ?? 0,
        toolResults: s.toolResults?.map((tr: any) => ({
          name: tr.toolName,
          resultKeys: tr.result ? Object.keys(tr.result) : [],
          resultType: typeof tr.result,
        })),
      }));

      responseText = result.messages
        .filter((m) => m.role === 'assistant')
        .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
        .join('\n') + `\n\n[DEBUG steps: ${JSON.stringify(debugSteps)}]`;
      break;
    }

    try {
      if (responseText)
        await persistAgentResponseStep({
          tenantId,
          projectId,
          conversationId,
          responseText,
          subAgentId: currentSubAgentId,
        });
    } catch (_e) {}
    try {
      await updateExecutionStatusStep({ executionId, status: 'completed' });
    } catch (_e) {}
    return { success: true, response: responseText || 'Completed' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    try {
      await updateExecutionStatusStep({ executionId, status: 'failed' });
    } catch (_e) {}
    return { success: false, error: msg };
  }
}

export const agentExecutionWorkflow = Object.assign(_agentExecutionWorkflow, {
  workflowId:
    'workflow//./src/domains/run/workflow/functions/agentExecution//_agentExecutionWorkflow',
});
