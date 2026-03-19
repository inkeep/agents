import {
  countRunningInvocationsForTrigger,
  createScheduledTriggerInvocation,
  generateId,
  listPendingScheduledTriggerInvocations,
  markScheduledTriggerInvocationCompleted,
  markScheduledTriggerInvocationRunning,
} from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import runDbClient from '../../../data/db/runDbClient';

describe('Concurrency control data access', () => {
  it('should count running invocations for a trigger', async () => {
    const tenantId = `cc-count-${generateId(6)}`;
    const projectId = 'default-project';
    const agentId = `agent-${generateId(6)}`;
    const triggerId = `trigger-${generateId(6)}`;
    const scopes = { tenantId, projectId, agentId };

    // Create 3 invocations
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const inv = await createScheduledTriggerInvocation(runDbClient)({
        id: generateId(),
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId: triggerId,
        status: 'pending',
        scheduledFor: '2025-06-01T09:00:00Z',
        resolvedPayload: null,
        idempotencyKey: `cc-count-${triggerId}-${i}`,
        attemptNumber: 1,
        recipientUserId: `user-${i}`,
      });
      ids.push(inv.id);
    }

    // Initially none running
    let runningCount = await countRunningInvocationsForTrigger(runDbClient)({
      scheduledTriggerId: triggerId,
    });
    expect(runningCount).toBe(0);

    // Mark first as running
    await markScheduledTriggerInvocationRunning(runDbClient)({
      scopes,
      scheduledTriggerId: triggerId,
      invocationId: ids[0],
    });

    runningCount = await countRunningInvocationsForTrigger(runDbClient)({
      scheduledTriggerId: triggerId,
    });
    expect(runningCount).toBe(1);

    // Mark second as running
    await markScheduledTriggerInvocationRunning(runDbClient)({
      scopes,
      scheduledTriggerId: triggerId,
      invocationId: ids[1],
    });

    runningCount = await countRunningInvocationsForTrigger(runDbClient)({
      scheduledTriggerId: triggerId,
    });
    expect(runningCount).toBe(2);

    // Complete the first - running count should decrease
    await markScheduledTriggerInvocationCompleted(runDbClient)({
      scopes,
      scheduledTriggerId: triggerId,
      invocationId: ids[0],
    });

    runningCount = await countRunningInvocationsForTrigger(runDbClient)({
      scheduledTriggerId: triggerId,
    });
    expect(runningCount).toBe(1);
  });

  it('should not count invocations from other triggers', async () => {
    const tenantId = `cc-isolate-${generateId(6)}`;
    const projectId = 'default-project';
    const agentId = `agent-${generateId(6)}`;
    const triggerId1 = `trigger-${generateId(6)}`;
    const triggerId2 = `trigger-${generateId(6)}`;
    const scopes = { tenantId, projectId, agentId };

    // Create invocations for two different triggers
    const inv1 = await createScheduledTriggerInvocation(runDbClient)({
      id: generateId(),
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId: triggerId1,
      status: 'pending',
      scheduledFor: '2025-06-01T09:00:00Z',
      resolvedPayload: null,
      idempotencyKey: `cc-isolate-${triggerId1}`,
      attemptNumber: 1,
    });

    const inv2 = await createScheduledTriggerInvocation(runDbClient)({
      id: generateId(),
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId: triggerId2,
      status: 'pending',
      scheduledFor: '2025-06-01T09:00:00Z',
      resolvedPayload: null,
      idempotencyKey: `cc-isolate-${triggerId2}`,
      attemptNumber: 1,
    });

    // Mark both as running
    await markScheduledTriggerInvocationRunning(runDbClient)({
      scopes,
      scheduledTriggerId: triggerId1,
      invocationId: inv1.id,
    });
    await markScheduledTriggerInvocationRunning(runDbClient)({
      scopes,
      scheduledTriggerId: triggerId2,
      invocationId: inv2.id,
    });

    // Each trigger should only count its own
    const count1 = await countRunningInvocationsForTrigger(runDbClient)({
      scheduledTriggerId: triggerId1,
    });
    const count2 = await countRunningInvocationsForTrigger(runDbClient)({
      scheduledTriggerId: triggerId2,
    });

    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });

  it('should list all pending invocations ordered by scheduledFor', async () => {
    const tenantId = `cc-list-${generateId(6)}`;
    const projectId = 'default-project';
    const agentId = `agent-${generateId(6)}`;
    const triggerId = `trigger-${generateId(6)}`;

    // Create invocations with different scheduledFor times
    const times = [
      '2025-06-01T12:00:00Z',
      '2025-06-01T09:00:00Z',
      '2025-06-01T11:00:00Z',
      '2025-06-01T10:00:00Z',
    ];

    for (let i = 0; i < times.length; i++) {
      await createScheduledTriggerInvocation(runDbClient)({
        id: generateId(),
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId: triggerId,
        status: 'pending',
        scheduledFor: times[i],
        resolvedPayload: null,
        idempotencyKey: `cc-list-${triggerId}-${i}`,
        attemptNumber: 1,
        recipientUserId: `user-${i}`,
      });
    }

    const pending = await listPendingScheduledTriggerInvocations(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: triggerId,
      limit: 100,
    });

    expect(pending).toHaveLength(4);
    // Should be ordered earliest first
    expect(pending[0].scheduledFor).toContain('09:00');
    expect(pending[1].scheduledFor).toContain('10:00');
    expect(pending[2].scheduledFor).toContain('11:00');
    expect(pending[3].scheduledFor).toContain('12:00');
  });

  it('should handle batch processing with default concurrency (serial)', async () => {
    const tenantId = `cc-serial-${generateId(6)}`;
    const projectId = 'default-project';
    const agentId = `agent-${generateId(6)}`;
    const triggerId = `trigger-${generateId(6)}`;
    const scopes = { tenantId, projectId, agentId };

    // Create 3 fan-out invocations
    const invocationIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const inv = await createScheduledTriggerInvocation(runDbClient)({
        id: generateId(),
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId: triggerId,
        status: 'pending',
        scheduledFor: '2025-06-01T09:00:00Z',
        resolvedPayload: null,
        idempotencyKey: `cc-serial-${triggerId}-user-${i}`,
        attemptNumber: 1,
        recipientUserId: `user-${i}`,
      });
      invocationIds.push(inv.id);
    }

    // With maxConcurrent=1 (default), only one should be running at a time
    // Mark first as running
    await markScheduledTriggerInvocationRunning(runDbClient)({
      scopes,
      scheduledTriggerId: triggerId,
      invocationId: invocationIds[0],
    });

    const runningWhileFirst = await countRunningInvocationsForTrigger(runDbClient)({
      scheduledTriggerId: triggerId,
    });
    expect(runningWhileFirst).toBe(1);

    // Verify remaining are still pending
    const pendingWhileFirst = await listPendingScheduledTriggerInvocations(runDbClient)({
      scopes,
      scheduledTriggerId: triggerId,
      limit: 100,
    });
    expect(pendingWhileFirst).toHaveLength(2);

    // Complete first, mark second as running
    await markScheduledTriggerInvocationCompleted(runDbClient)({
      scopes,
      scheduledTriggerId: triggerId,
      invocationId: invocationIds[0],
    });

    await markScheduledTriggerInvocationRunning(runDbClient)({
      scopes,
      scheduledTriggerId: triggerId,
      invocationId: invocationIds[1],
    });

    const runningAfterFirst = await countRunningInvocationsForTrigger(runDbClient)({
      scheduledTriggerId: triggerId,
    });
    expect(runningAfterFirst).toBe(1);
  });

  it('should support multiple concurrent running invocations', async () => {
    const tenantId = `cc-parallel-${generateId(6)}`;
    const projectId = 'default-project';
    const agentId = `agent-${generateId(6)}`;
    const triggerId = `trigger-${generateId(6)}`;
    const scopes = { tenantId, projectId, agentId };

    // Create 5 fan-out invocations
    const invocationIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const inv = await createScheduledTriggerInvocation(runDbClient)({
        id: generateId(),
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId: triggerId,
        status: 'pending',
        scheduledFor: '2025-06-01T09:00:00Z',
        resolvedPayload: null,
        idempotencyKey: `cc-parallel-${triggerId}-user-${i}`,
        attemptNumber: 1,
        recipientUserId: `user-${i}`,
      });
      invocationIds.push(inv.id);
    }

    // With maxConcurrent=3, mark 3 as running
    for (let i = 0; i < 3; i++) {
      await markScheduledTriggerInvocationRunning(runDbClient)({
        scopes,
        scheduledTriggerId: triggerId,
        invocationId: invocationIds[i],
      });
    }

    const runningCount = await countRunningInvocationsForTrigger(runDbClient)({
      scheduledTriggerId: triggerId,
    });
    expect(runningCount).toBe(3);

    // Still 2 pending
    const pendingCount = await listPendingScheduledTriggerInvocations(runDbClient)({
      scopes,
      scheduledTriggerId: triggerId,
      limit: 100,
    });
    expect(pendingCount).toHaveLength(2);
  });
});
