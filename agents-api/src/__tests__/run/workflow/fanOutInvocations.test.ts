import {
  createScheduledTriggerInvocation,
  generateId,
  getScheduledTriggerInvocationByIdempotencyKey,
  listPendingScheduledTriggerInvocations,
} from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import runDbClient from '../../../data/db/runDbClient';

describe('Fan-out invocation creation', () => {
  const createFanOutInvocations = async (params: {
    tenantId: string;
    projectId: string;
    agentId: string;
    scheduledTriggerId: string;
    scheduledFor: string;
    payload: Record<string, unknown> | null;
    userIds: string[];
    idempotencyKeyPrefix: string;
  }) => {
    let created = 0;
    let skipped = 0;

    for (const userId of params.userIds) {
      const idempotencyKey = `${params.idempotencyKeyPrefix}_${userId}`;

      const existing = await getScheduledTriggerInvocationByIdempotencyKey(runDbClient)({
        idempotencyKey,
      });

      if (existing) {
        skipped++;
        continue;
      }

      await createScheduledTriggerInvocation(runDbClient)({
        id: generateId(),
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: params.agentId,
        scheduledTriggerId: params.scheduledTriggerId,
        status: 'pending',
        scheduledFor: params.scheduledFor,
        resolvedPayload: params.payload,
        idempotencyKey,
        attemptNumber: 1,
        recipientUserId: userId,
      });

      created++;
    }

    return { created, skipped };
  };

  it('should create one invocation per userId in the audience', async () => {
    const tenantId = `fanout-create-${generateId(6)}`;
    const projectId = 'default-project';
    const agentId = `agent-${generateId(6)}`;
    const triggerId = `trigger-${generateId(6)}`;
    const scheduledFor = '2025-06-01T09:00:00Z';
    const userIds = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];

    const result = await createFanOutInvocations({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId: triggerId,
      scheduledFor,
      payload: { report: 'daily' },
      userIds,
      idempotencyKeyPrefix: `sched_${triggerId}_${scheduledFor}`,
    });

    expect(result.created).toBe(5);
    expect(result.skipped).toBe(0);

    const pending = await listPendingScheduledTriggerInvocations(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: triggerId,
      limit: 100,
    });

    expect(pending).toHaveLength(5);

    const recipientIds = pending.map((inv) => inv.recipientUserId).sort();
    expect(recipientIds).toEqual(['user-1', 'user-2', 'user-3', 'user-4', 'user-5']);

    for (const inv of pending) {
      expect(inv.status).toBe('pending');
      expect(inv.scheduledFor).toContain('2025-06-01');
      expect(inv.resolvedPayload).toEqual({ report: 'daily' });
      expect(inv.attemptNumber).toBe(1);
    }
  });

  it('should use idempotency keys that include userId', async () => {
    const tenantId = `fanout-idemp-${generateId(6)}`;
    const projectId = 'default-project';
    const agentId = `agent-${generateId(6)}`;
    const triggerId = `trigger-${generateId(6)}`;
    const scheduledFor = '2025-07-01T09:00:00Z';
    const prefix = `sched_${triggerId}_${scheduledFor}`;

    await createFanOutInvocations({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId: triggerId,
      scheduledFor,
      payload: null,
      userIds: ['user-a', 'user-b'],
      idempotencyKeyPrefix: prefix,
    });

    const invA = await getScheduledTriggerInvocationByIdempotencyKey(runDbClient)({
      idempotencyKey: `${prefix}_user-a`,
    });
    const invB = await getScheduledTriggerInvocationByIdempotencyKey(runDbClient)({
      idempotencyKey: `${prefix}_user-b`,
    });

    expect(invA).toBeDefined();
    expect(invA?.recipientUserId).toBe('user-a');
    expect(invB).toBeDefined();
    expect(invB?.recipientUserId).toBe('user-b');
  });

  it('should skip already-existing invocations (idempotency)', async () => {
    const tenantId = `fanout-skip-${generateId(6)}`;
    const projectId = 'default-project';
    const agentId = `agent-${generateId(6)}`;
    const triggerId = `trigger-${generateId(6)}`;
    const scheduledFor = '2025-08-01T09:00:00Z';
    const prefix = `sched_${triggerId}_${scheduledFor}`;

    const first = await createFanOutInvocations({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId: triggerId,
      scheduledFor,
      payload: null,
      userIds: ['user-x', 'user-y', 'user-z'],
      idempotencyKeyPrefix: prefix,
    });

    expect(first.created).toBe(3);
    expect(first.skipped).toBe(0);

    const second = await createFanOutInvocations({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId: triggerId,
      scheduledFor,
      payload: null,
      userIds: ['user-x', 'user-y', 'user-z'],
      idempotencyKeyPrefix: prefix,
    });

    expect(second.created).toBe(0);
    expect(second.skipped).toBe(3);

    const pending = await listPendingScheduledTriggerInvocations(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: triggerId,
      limit: 100,
    });

    expect(pending).toHaveLength(3);
  });

  it('should create single invocation when no audience (regression)', async () => {
    const tenantId = `fanout-single-${generateId(6)}`;
    const projectId = 'default-project';
    const agentId = `agent-${generateId(6)}`;
    const triggerId = `trigger-${generateId(6)}`;
    const scheduledFor = '2025-09-01T09:00:00Z';
    const idempotencyKey = `sched_${triggerId}_${scheduledFor}`;

    const existing = await getScheduledTriggerInvocationByIdempotencyKey(runDbClient)({
      idempotencyKey,
    });
    expect(existing).toBeUndefined();

    const invocation = await createScheduledTriggerInvocation(runDbClient)({
      id: generateId(),
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId: triggerId,
      status: 'pending',
      scheduledFor,
      resolvedPayload: null,
      idempotencyKey,
      attemptNumber: 1,
    });

    expect(invocation.recipientUserId).toBeNull();
    expect(invocation.status).toBe('pending');

    const pending = await listPendingScheduledTriggerInvocations(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: triggerId,
      limit: 100,
    });

    expect(pending).toHaveLength(1);
    expect(pending[0].recipientUserId).toBeNull();
  });
});
