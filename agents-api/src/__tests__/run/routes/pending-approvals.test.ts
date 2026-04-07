import {
  createConversation,
  createWorkflowExecution,
  updateWorkflowExecutionStatus,
} from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import runDbClient from '../../../data/db/runDbClient';
import { makeRequest } from '../../utils/testRequest';

const TENANT_ID = 'test-tenant';
const PROJECT_ID = 'default';

async function seedConversation(id: string) {
  return createConversation(runDbClient)({
    id,
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
    agentId: 'test-agent',
    activeSubAgentId: 'sub-agent-1',
    ref: { type: 'branch', name: 'main', hash: 'abc123' },
  });
}

async function seedWorkflowExecution(
  id: string,
  conversationId: string,
  status: 'running' | 'suspended' | 'completed' | 'failed' = 'running',
  metadata?: Record<string, unknown>
) {
  const execution = await createWorkflowExecution(runDbClient)({
    id,
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
    agentId: 'test-agent',
    conversationId,
    requestId: `req-${id}`,
    status: 'running',
  });

  if (status !== 'running' || metadata) {
    await updateWorkflowExecutionStatus(runDbClient)({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      id,
      status,
      metadata,
    });
  }

  return execution;
}

describe('GET /run/v1/conversations/:conversationId/pending-approvals', () => {
  it('should return hasPending: false when conversation has no workflow execution', async () => {
    const convId = `conv-no-wf-${crypto.randomUUID()}`;
    await seedConversation(convId);

    const res = await makeRequest(`/run/v1/conversations/${convId}/pending-approvals`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasPending).toBe(false);
    expect(body.approval).toBeUndefined();
  });

  it('should return hasPending: false when workflow is running (not suspended)', async () => {
    const convId = `conv-running-${crypto.randomUUID()}`;
    const wfId = `wf-running-${crypto.randomUUID()}`;
    await seedConversation(convId);
    await seedWorkflowExecution(wfId, convId, 'running');

    const res = await makeRequest(`/run/v1/conversations/${convId}/pending-approvals`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasPending).toBe(false);
  });

  it('should return hasPending: false when workflow is completed', async () => {
    const convId = `conv-completed-${crypto.randomUUID()}`;
    const wfId = `wf-completed-${crypto.randomUUID()}`;
    await seedConversation(convId);
    await seedWorkflowExecution(wfId, convId, 'completed');

    const res = await makeRequest(`/run/v1/conversations/${convId}/pending-approvals`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasPending).toBe(false);
  });

  it('should return hasPending: false when suspended but no pendingToolApproval in metadata', async () => {
    const convId = `conv-suspended-no-approval-${crypto.randomUUID()}`;
    const wfId = `wf-suspended-no-approval-${crypto.randomUUID()}`;
    await seedConversation(convId);
    await seedWorkflowExecution(wfId, convId, 'suspended', {
      continuationStreamNamespace: 'r1',
    });

    const res = await makeRequest(`/run/v1/conversations/${convId}/pending-approvals`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasPending).toBe(false);
  });

  it('should return pending approval details when workflow is suspended with pendingToolApproval', async () => {
    const convId = `conv-pending-${crypto.randomUUID()}`;
    const wfId = `wf-pending-${crypto.randomUUID()}`;
    await seedConversation(convId);
    await seedWorkflowExecution(wfId, convId, 'suspended', {
      continuationStreamNamespace: 'r1',
      pendingToolApproval: {
        toolCallId: 'call-123',
        toolName: 'search_docs',
        args: { query: 'test' },
        isDelegated: false,
      },
    });

    const res = await makeRequest(`/run/v1/conversations/${convId}/pending-approvals`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasPending).toBe(true);
    expect(body.approval).toBeDefined();
    expect(body.approval.toolCallId).toBe('call-123');
    expect(body.approval.toolName).toBe('search_docs');
    expect(body.approval.args).toEqual({ query: 'test' });
    expect(body.approval.isDelegated).toBe(false);
    expect(body.approval.workflowRunId).toBe(wfId);
    expect(body.approval.suspendedAt).toBeDefined();
  });

  it('should return pending approval for delegated approval', async () => {
    const convId = `conv-delegated-${crypto.randomUUID()}`;
    const wfId = `wf-delegated-${crypto.randomUUID()}`;
    await seedConversation(convId);
    await seedWorkflowExecution(wfId, convId, 'suspended', {
      continuationStreamNamespace: 'r1',
      pendingToolApproval: {
        toolCallId: 'delegated-call-456',
        toolName: 'execute_code',
        args: { code: 'console.log("hello")' },
        isDelegated: true,
      },
    });

    const res = await makeRequest(`/run/v1/conversations/${convId}/pending-approvals`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasPending).toBe(true);
    expect(body.approval.toolCallId).toBe('delegated-call-456');
    expect(body.approval.toolName).toBe('execute_code');
    expect(body.approval.isDelegated).toBe(true);
  });

  it('should return 404 when conversation does not exist', async () => {
    const res = await makeRequest('/run/v1/conversations/nonexistent-conv/pending-approvals');

    expect(res.status).toBe(404);
  });
});
