import type { Part, ResolvedRef } from '@inkeep/agents-core';
import { defineHook, getWorkflowMetadata } from 'workflow';
import {
  callLlmStep,
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
};

/**
 * Hook for tool approval: external systems resume this to approve/deny a tool call.
 * Token format: `tool-approval:${conversationId}:${workflowRunId}:${toolCallId}`
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
      });

      if (llmResult.type === 'transfer') {
        currentSubAgentId = llmResult.targetSubAgentId;
        continue;
      }

      if (llmResult.type === 'tool_calls') {
        for (const toolCall of llmResult.toolCalls) {
          const continuationNs = `r${approvalRound + 1}`;
          await markWorkflowSuspendedStep({
            tenantId: payload.tenantId,
            projectId: payload.projectId,
            workflowRunId,
            continuationStreamNamespace: continuationNs,
          });

          const token = `tool-approval:${payload.conversationId}:${workflowRunId}:${toolCall.toolCallId}`;
          const hook = toolApprovalHook.create({ token });
          const approvalResult = await hook;
          approvalRound++;

          await markWorkflowResumingStep({
            tenantId: payload.tenantId,
            projectId: payload.projectId,
            workflowRunId,
          });

          await executeToolStep({
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
          });
        }
        continue;
      }

      break;
    }

    await markWorkflowCompleteStep({
      tenantId: payload.tenantId,
      projectId: payload.projectId,
      workflowRunId,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markWorkflowFailedStep({
      tenantId: payload.tenantId,
      projectId: payload.projectId,
      workflowRunId,
      error: message,
    });
    throw error;
  }
}

export const agentExecutionWorkflow = Object.assign(_agentExecutionWorkflow, {
  workflowId:
    'workflow//./src/domains/run/workflow/functions/agentExecution//_agentExecutionWorkflow',
});
