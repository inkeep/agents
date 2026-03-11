import type { Part, ResolvedRef } from '@inkeep/agents-core';
import { defineHook, getWorkflowMetadata } from 'workflow';
import {
  markWorkflowCompleteStep,
  markWorkflowFailedStep,
  markWorkflowRunningStep,
  runAgentExecutionStep,
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
};

/**
 * Hook for tool approval: external systems resume this to approve/deny a tool call.
 * Token format: `tool-approval:${conversationId}:${toolCallId}`
 */
export const toolApprovalHook = defineHook<
  { approved: boolean; reason?: string },
  { approved: boolean; reason?: string }
>();

async function _agentExecutionWorkflow(payload: AgentExecutionPayload) {
  'use workflow';

  const { workflowRunId } = getWorkflowMetadata();

  await markWorkflowRunningStep({ payload, workflowRunId });

  try {
    const result = await runAgentExecutionStep({ payload });

    if (!result.success) {
      await markWorkflowFailedStep({
        tenantId: payload.tenantId,
        projectId: payload.projectId,
        workflowRunId,
        error: result.error ?? 'Agent execution failed',
      });
      return { success: false, error: result.error };
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
