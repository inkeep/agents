import {
  generateId,
  getStaleWorkflowExecutions,
  updateWorkflowExecutionStatus,
  workflowExecutions,
} from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import runDbClient from '../../../data/db/runDbClient';
import { createTestTenantId } from '../../utils/testTenant';

describe('getStaleWorkflowExecutions', () => {
  const tenantId = createTestTenantId('workflow-cleanup');
  const projectId = 'test-project';

  async function createExecution(overrides: {
    status?: string;
    updatedAt?: string;
    metadata?: Record<string, unknown>;
  }) {
    const id = generateId();
    const now = new Date().toISOString();

    const [created] = await runDbClient
      .insert(workflowExecutions)
      .values({
        id,
        tenantId,
        projectId,
        agentId: 'test-agent',
        conversationId: `conv-${id}`,
        requestId: `req-${id}`,
        status: overrides.status ?? 'suspended',
        metadata: overrides.metadata ?? null,
        createdAt: now,
        updatedAt: overrides.updatedAt ?? now,
      })
      .returning();

    return created;
  }

  it('should return suspended workflows older than staleBefore', async () => {
    const oldTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentTime = new Date().toISOString();

    const staleExecution = await createExecution({
      status: 'suspended',
      updatedAt: oldTime,
    });
    await createExecution({
      status: 'suspended',
      updatedAt: recentTime,
    });

    const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const result = await getStaleWorkflowExecutions(runDbClient)({
      staleBefore,
    });

    const ids = result.map((r) => r.id);
    expect(ids).toContain(staleExecution.id);
  });

  it('should not return non-suspended workflows', async () => {
    const oldTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const runningExecution = await createExecution({
      status: 'running',
      updatedAt: oldTime,
    });
    const completedExecution = await createExecution({
      status: 'completed',
      updatedAt: oldTime,
    });
    const failedExecution = await createExecution({
      status: 'failed',
      updatedAt: oldTime,
    });

    const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const result = await getStaleWorkflowExecutions(runDbClient)({
      staleBefore,
    });

    const ids = result.map((r) => r.id);
    expect(ids).not.toContain(runningExecution.id);
    expect(ids).not.toContain(completedExecution.id);
    expect(ids).not.toContain(failedExecution.id);
  });

  it('should respect the limit parameter', async () => {
    const oldTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    await createExecution({ status: 'suspended', updatedAt: oldTime });
    await createExecution({ status: 'suspended', updatedAt: oldTime });
    await createExecution({ status: 'suspended', updatedAt: oldTime });

    const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const result = await getStaleWorkflowExecutions(runDbClient)({
      staleBefore,
      limit: 1,
    });

    expect(result.length).toBe(1);
  });

  it('should order results by updatedAt ascending (oldest first)', async () => {
    const oldest = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const middle = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const newest = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

    await createExecution({ status: 'suspended', updatedAt: middle });
    await createExecution({ status: 'suspended', updatedAt: oldest });
    await createExecution({ status: 'suspended', updatedAt: newest });

    const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const result = await getStaleWorkflowExecutions(runDbClient)({
      staleBefore,
    });

    for (let i = 1; i < result.length; i++) {
      expect(new Date(result[i].updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(result[i - 1].updatedAt).getTime()
      );
    }
  });

  it('should return empty array when no stale workflows exist', async () => {
    const staleBefore = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const result = await getStaleWorkflowExecutions(runDbClient)({
      staleBefore,
      limit: 1,
    });

    expect(Array.isArray(result)).toBe(true);
  });
});

describe('updateWorkflowExecutionStatus for cleanup', () => {
  const tenantId = createTestTenantId('workflow-status-update');
  const projectId = 'test-project';

  it('should update a suspended workflow to failed with timeout metadata', async () => {
    const id = generateId();
    const now = new Date().toISOString();

    await runDbClient.insert(workflowExecutions).values({
      id,
      tenantId,
      projectId,
      agentId: 'test-agent',
      conversationId: `conv-${id}`,
      requestId: `req-${id}`,
      status: 'suspended',
      metadata: { pendingToolCallId: 'tool-1' },
      createdAt: now,
      updatedAt: now,
    });

    const timedOutAt = new Date().toISOString();
    const updated = await updateWorkflowExecutionStatus(runDbClient)({
      tenantId,
      projectId,
      id,
      status: 'failed',
      metadata: {
        pendingToolCallId: 'tool-1',
        failureReason: 'approval_timeout',
        timedOutAt,
      },
    });

    expect(updated).not.toBeNull();
    expect(updated?.status).toBe('failed');
    expect((updated?.metadata as Record<string, unknown>)?.failureReason).toBe('approval_timeout');
    expect((updated?.metadata as Record<string, unknown>)?.timedOutAt).toBe(timedOutAt);
    expect((updated?.metadata as Record<string, unknown>)?.pendingToolCallId).toBe('tool-1');
  });
});
