import {
  createScheduledTriggerInvocation,
  generateId,
  listPendingScheduledTriggerInvocations,
} from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import runDbClient from '../../../data/db/runDbClient';

describe('Recipient user context wiring', () => {
  it('should resolve recipientUserId as effective runAsUserId when present', async () => {
    const tenantId = `ruc-override-${generateId(6)}`;
    const projectId = 'default-project';
    const agentId = `agent-${generateId(6)}`;
    const triggerId = `trigger-${generateId(6)}`;
    const triggerRunAsUserId = 'trigger-owner-user';

    const inv = await createScheduledTriggerInvocation(runDbClient)({
      id: generateId(),
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId: triggerId,
      status: 'pending',
      scheduledFor: '2025-06-01T09:00:00Z',
      resolvedPayload: null,
      idempotencyKey: `ruc-override-${triggerId}-user-1`,
      attemptNumber: 1,
      recipientUserId: 'recipient-user-1',
    });

    const effectiveRunAsUserId = inv.recipientUserId || triggerRunAsUserId;
    expect(effectiveRunAsUserId).toBe('recipient-user-1');
  });

  it('should fall back to trigger runAsUserId when recipientUserId is null', async () => {
    const tenantId = `ruc-fallback-${generateId(6)}`;
    const projectId = 'default-project';
    const agentId = `agent-${generateId(6)}`;
    const triggerId = `trigger-${generateId(6)}`;
    const triggerRunAsUserId = 'trigger-owner-user';

    const inv = await createScheduledTriggerInvocation(runDbClient)({
      id: generateId(),
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId: triggerId,
      status: 'pending',
      scheduledFor: '2025-06-01T09:00:00Z',
      resolvedPayload: null,
      idempotencyKey: `ruc-fallback-${triggerId}`,
      attemptNumber: 1,
    });

    expect(inv.recipientUserId).toBeNull();
    const effectiveRunAsUserId = inv.recipientUserId || triggerRunAsUserId;
    expect(effectiveRunAsUserId).toBe('trigger-owner-user');
  });

  it('should produce correct effective userId for mixed fan-out invocations', async () => {
    const tenantId = `ruc-mixed-${generateId(6)}`;
    const projectId = 'default-project';
    const agentId = `agent-${generateId(6)}`;
    const triggerId = `trigger-${generateId(6)}`;
    const triggerRunAsUserId = 'default-owner';

    const userIds = ['alice', 'bob', 'charlie'];
    for (const userId of userIds) {
      await createScheduledTriggerInvocation(runDbClient)({
        id: generateId(),
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId: triggerId,
        status: 'pending',
        scheduledFor: '2025-06-01T09:00:00Z',
        resolvedPayload: null,
        idempotencyKey: `ruc-mixed-${triggerId}-${userId}`,
        attemptNumber: 1,
        recipientUserId: userId,
      });
    }

    const pending = await listPendingScheduledTriggerInvocations(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: triggerId,
      limit: 100,
    });

    expect(pending).toHaveLength(3);

    for (const inv of pending) {
      const effectiveRunAsUserId = inv.recipientUserId || triggerRunAsUserId;
      expect(effectiveRunAsUserId).toBe(inv.recipientUserId);
      expect(userIds).toContain(effectiveRunAsUserId);
    }
  });
});
