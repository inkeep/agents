import {
  createWorkflowExecution,
  getFullProjectWithRelationIds,
  type Part,
  type ResolvedRef,
  updateWorkflowExecutionStatus,
  withRef,
} from '@inkeep/agents-core';
import manageDbPool from 'src/data/db/manageDbPool';
import runDbClient from 'src/data/db/runDbClient';
import { getWritable } from 'workflow';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import { ExecutionHandler } from '../../handlers/executionHandler';
import {
  WritableBackedHonoSSEStream,
  WritableBackedVercelWriter,
} from '../../stream/durable-stream-helper';
import { createSSEStreamHelper, createVercelStreamHelper } from '../../stream/stream-helpers';
import { registerStreamHelper, unregisterStreamHelper } from '../../stream/stream-registry';

const logger = getLogger('agentExecutionSteps');

export type AgentExecutionStepPayload = {
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
  approvedToolCalls?: Record<
    string,
    Array<{ approved: boolean; reason?: string; originalToolCallId?: string }>
  >;
};

export type RunAgentExecutionStepResult =
  | { type: 'completed'; success: boolean; error?: string }
  | { type: 'needs_approval'; toolCallId: string; toolName: string; args: unknown };

export async function markWorkflowRunningStep(params: {
  payload: AgentExecutionStepPayload;
  workflowRunId: string;
}): Promise<void> {
  'use step';
  const { payload, workflowRunId } = params;

  await createWorkflowExecution(runDbClient)({
    id: workflowRunId,
    tenantId: payload.tenantId,
    projectId: payload.projectId,
    agentId: payload.agentId,
    conversationId: payload.conversationId,
    requestId: payload.requestId,
    status: 'running',
  });

  logger.info(
    { workflowRunId, conversationId: payload.conversationId },
    'Workflow execution marked as running'
  );
}

export async function runAgentExecutionStep(params: {
  payload: AgentExecutionStepPayload;
  workflowRunId: string;
  streamNamespace?: string;
}): Promise<RunAgentExecutionStepResult> {
  'use step';

  const { payload, workflowRunId, streamNamespace } = params;
  const {
    tenantId,
    projectId,
    agentId,
    conversationId,
    userMessage,
    messageParts,
    requestId,
    resolvedRef,
    forwardedHeaders,
    approvedToolCalls,
  } = payload;

  const project = await withRef(manageDbPool, resolvedRef, (db) =>
    getFullProjectWithRelationIds(db)({ scopes: { tenantId, projectId } })
  );

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const agent = project.agents?.[agentId];
  if (!agent) {
    throw new Error(`Agent ${agentId} not found in project`);
  }

  const defaultSubAgentId = agent.defaultSubAgentId;
  if (!defaultSubAgentId) {
    throw new Error(`Agent ${agentId} has no default sub-agent configured`);
  }

  const executionContext = {
    tenantId,
    projectId,
    agentId,
    baseUrl: env.INKEEP_AGENTS_API_URL || 'http://localhost:3002',
    apiKey: env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET || '',
    apiKeyId: 'durable-execution',
    resolvedRef,
    project,
    metadata: {},
  };

  const timestamp = Math.floor(Date.now() / 1000);

  const writable = getWritable<Uint8Array>(streamNamespace ? { namespace: streamNamespace } : {});
  let closeable: { close(): Promise<void> };
  let sseHelper:
    | ReturnType<typeof createSSEStreamHelper>
    | ReturnType<typeof createVercelStreamHelper>;

  if (payload.outputFormat === 'vercel') {
    const vercelWriter = new WritableBackedVercelWriter(writable);
    closeable = vercelWriter;
    sseHelper = createVercelStreamHelper(vercelWriter);
  } else {
    const writableStream = new WritableBackedHonoSSEStream(writable);
    closeable = writableStream;
    sseHelper = createSSEStreamHelper(writableStream, requestId, timestamp);
  }

  registerStreamHelper(requestId, sseHelper);
  const handler = new ExecutionHandler();
  let result: Awaited<ReturnType<typeof handler.execute>>;
  try {
    result = await handler.execute({
      executionContext,
      conversationId,
      userMessage,
      messageParts: messageParts && messageParts.length > 0 ? messageParts : undefined,
      initialAgentId: defaultSubAgentId,
      requestId,
      sseHelper,
      emitOperations: false,
      forwardedHeaders,
      durableWorkflowRunId: workflowRunId,
      approvedToolCalls,
    });
  } finally {
    unregisterStreamHelper(requestId);
  }

  if (result.pendingApproval) {
    await sseHelper.complete();
    await closeable.close();
    return {
      type: 'needs_approval',
      toolCallId: result.pendingApproval.toolCallId,
      toolName: result.pendingApproval.toolName,
      args: result.pendingApproval.args,
    };
  }

  await sseHelper.complete();
  await closeable.close();

  return { type: 'completed', success: result.success, error: result.error };
}

export async function markWorkflowSuspendedStep(params: {
  tenantId: string;
  projectId: string;
  workflowRunId: string;
  continuationStreamNamespace: string;
}): Promise<void> {
  'use step';
  const { tenantId, projectId, workflowRunId, continuationStreamNamespace } = params;

  await updateWorkflowExecutionStatus(runDbClient)({
    tenantId,
    projectId,
    id: workflowRunId,
    status: 'suspended',
    metadata: { continuationStreamNamespace },
  });

  logger.info({ workflowRunId }, 'Workflow execution marked as suspended (awaiting tool approval)');
}

export async function markWorkflowResumingStep(params: {
  tenantId: string;
  projectId: string;
  workflowRunId: string;
}): Promise<void> {
  'use step';
  const { tenantId, projectId, workflowRunId } = params;

  await updateWorkflowExecutionStatus(runDbClient)({
    tenantId,
    projectId,
    id: workflowRunId,
    status: 'running',
  });

  logger.info({ workflowRunId }, 'Workflow execution marked as running (resuming after approval)');
}

export async function markWorkflowCompleteStep(params: {
  tenantId: string;
  projectId: string;
  workflowRunId: string;
}): Promise<void> {
  'use step';
  const { tenantId, projectId, workflowRunId } = params;

  await updateWorkflowExecutionStatus(runDbClient)({
    tenantId,
    projectId,
    id: workflowRunId,
    status: 'completed',
  });

  logger.info({ workflowRunId }, 'Workflow execution marked as completed');
}

export async function markWorkflowFailedStep(params: {
  tenantId: string;
  projectId: string;
  workflowRunId: string;
  error: string;
}): Promise<void> {
  'use step';
  const { tenantId, projectId, workflowRunId, error } = params;

  await updateWorkflowExecutionStatus(runDbClient)({
    tenantId,
    projectId,
    id: workflowRunId,
    status: 'failed',
    metadata: { error },
  });

  logger.info({ workflowRunId, error }, 'Workflow execution marked as failed');
}
