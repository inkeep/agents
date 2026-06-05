import type { Part, ResolvedRef } from '@inkeep/agents-core';
import { defineHook, getWorkflowMetadata } from 'workflow';
import {
  callLlmStep,
  type DenialRedirect,
  executeToolStep,
  initializeTaskStep,
  markWorkflowCompleteStep,
  markWorkflowFailedStep,
  markWorkflowResumingStep,
  markWorkflowRunningStep,
  markWorkflowSuspendedStep,
} from '../steps/agentExecutionSteps';

export type AgentExecutionPayload = {
  tenantId: string;
  projectId: string;
  agentId: string;
  conversationId: string;
  userMessage: string;
  messageParts?: Part[];
  requestId: string;
  resolvedRef: ResolvedRef;
  forwardedHeaders?: Record<string, string>;
  outputFormat?: 'sse' | 'vercel';
  emitOperations?: boolean;
  /** User ID for user-scoped credential lookups (from authenticated user session) */
  userId?: string;
};

/**
 * Hook for tool approval: external systems resume this to approve/deny a tool call.
 * Token format: `${TOOL_APPROVAL_HOOK_PREFIX}${conversationId}:${workflowRunId}:${toolCallId}`
 */
export const toolApprovalHook = defineHook<
  { approved: boolean; reason?: string },
  { approved: boolean; reason?: string }
>();

async function _agentExecutionWorkflow(payload: AgentExecutionPayload) {
  'use workflow';

  const { workflowRunId } = getWorkflowMetadata();

  await markWorkflowRunningStep({ payload, workflowRunId });

  const { taskId, defaultSubAgentId, maxTransfers } = await initializeTaskStep({ payload });

  let currentSubAgentId = defaultSubAgentId;
  let iterations = 0;
  let approvalRound = 0;
  let isPostApproval = false;
  const denialRedirects: DenialRedirect[] = [];

  try {
    while (iterations < maxTransfers) {
      iterations++;
      const streamNamespace = approvalRound === 0 ? undefined : `r${approvalRound}`;

      const llmResult = await callLlmStep({
        payload,
        currentSubAgentId,
        isFirstMessage: iterations === 1,
        workflowRunId,
        streamNamespace,
        taskId,
        isPostApproval,
        denialRedirects: denialRedirects.length > 0 ? denialRedirects : undefined,
      });

      if (llmResult.type === 'transfer') {
        currentSubAgentId = llmResult.targetSubAgentId;
        isPostApproval = false;
        continue;
      }

      if (llmResult.type === 'tool_calls') {
        for (const toolCall of llmResult.toolCalls) {
          const continuationNs = `r${approvalRound + 1}`;
          const hookToolCallId = llmResult.delegatedApproval?.toolCallId ?? toolCall.toolCallId;
          await markWorkflowSuspendedStep({
            tenantId: payload.tenantId,
            projectId: payload.projectId,
            workflowRunId,
            continuationStreamNamespace: continuationNs,
            pendingToolApproval: {
              toolCallId: hookToolCallId,
              toolName: toolCall.toolName,
              args: toolCall.args,
              isDelegated: !!llmResult.delegatedApproval,
            },
          });

          const token = `tool-approval:${payload.conversationId}:${workflowRunId}:${hookToolCallId}`;

          console.info('[agentExecution] Creating tool approval hook', {
            hookToolCallId,
            parentToolCallId: toolCall.toolCallId,
            isDelegated: !!llmResult.delegatedApproval,
            workflowRunId,
          });

          // The hook suspends the workflow until an external system resumes it.
          // Unlike the in-process PendingToolApprovalManager (10-min timeout), durable
          // hooks persist across restarts. Stale suspended workflows should be cleaned
          // up by an external job that queries workflow_executions with status='suspended'.
          const hook = toolApprovalHook.create({ token });
          const approvalResult = await hook;
          approvalRound++;

          await markWorkflowResumingStep({
            tenantId: payload.tenantId,
            projectId: payload.projectId,
            workflowRunId,
          });

          const toolResult = await executeToolStep({
            payload,
            currentSubAgentId,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            args: toolCall.args,
            workflowRunId,
            streamNamespace: `r${approvalRound}`,
            taskId,
            preApproved: approvalResult.approved,
            approvalReason: approvalResult.reason,
            ...(llmResult.delegatedApproval
              ? {
                  delegatedApproval: llmResult.delegatedApproval,
                  delegatedApprovalDecision: {
                    approved: approvalResult.approved,
                    reason: approvalResult.reason,
                  },
                }
              : {}),
          });

          if (toolResult.type === 'completed' && toolResult.denial) {
            denialRedirects.push(toolResult.denial);
          }
        }
        isPostApproval = true;
        continue;
      }

      break;
    }

    await markWorkflowCompleteStep({
      tenantId: payload.tenantId,
      projectId: payload.projectId,
      workflowRunId,
      conversationId: payload.conversationId,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markWorkflowFailedStep({
      tenantId: payload.tenantId,
      projectId: payload.projectId,
      workflowRunId,
      conversationId: payload.conversationId,
      error: message,
    });
    throw error;
  }
}

export const agentExecutionWorkflow = Object.assign(_agentExecutionWorkflow, {
  workflowId:
    'workflow//./src/domains/run/workflow/functions/agentExecution//_agentExecutionWorkflow',
});
