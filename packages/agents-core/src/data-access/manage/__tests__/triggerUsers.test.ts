import { describe, expect, it } from 'vitest';
import { testManageDbClient } from '../../../__tests__/setup';
import { agents } from '../../../db/manage/manage-schema';
import { createTestProject } from '../../../db/manage/test-manage-client';
import {
  createTrigger,
  createTriggerUser,
  createTriggerWithUsers,
  getTriggerById,
  getTriggerUserCount,
  getTriggerUsers,
  getTriggerUsersBatch,
  getWebhookTriggerIdsWithUser,
  removeUserFromProjectTriggerUsers,
  setTriggerUsers,
} from '../triggers';

const tenantId = 'tenant-trigger-users';
const projectId = 'project-1';
const otherProjectId = 'project-2';
const agentId = 'agent-1';

async function insertAgent(currentProjectId = projectId, currentAgentId = agentId) {
  await createTestProject(testManageDbClient, tenantId, currentProjectId);
  await testManageDbClient
    .insert(agents)
    .values({
      tenantId,
      projectId: currentProjectId,
      id: currentAgentId,
      name: `Agent ${currentAgentId}`,
    })
    .onConflictDoNothing();
}

async function insertTrigger(
  id: string,
  currentProjectId = projectId,
  currentAgentId = agentId,
  enabled = true
) {
  await insertAgent(currentProjectId, currentAgentId);
  return createTrigger(testManageDbClient)({
    id,
    tenantId,
    projectId: currentProjectId,
    agentId: currentAgentId,
    name: `Trigger ${id}`,
    enabled,
    description: null,
    inputSchema: null,
    outputTransform: null,
    messageTemplate: null,
    authentication: null,
    signingSecretCredentialReferenceId: null,
    signatureVerification: null,
    runAsUserId: null,
    dispatchDelayMs: null,
    createdBy: null,
  });
}

describe('manage triggerUsers DAL', () => {
  it('creates, lists, counts, and batches trigger users', async () => {
    await insertTrigger('trigger-1');
    await insertTrigger('trigger-2');

    await createTriggerUser(testManageDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId: 'trigger-1',
      userId: 'user-2',
    });
    await createTriggerUser(testManageDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId: 'trigger-1',
      userId: 'user-1',
    });
    await createTriggerUser(testManageDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId: 'trigger-2',
      userId: 'user-3',
    });

    expect(
      (
        await getTriggerUsers(testManageDbClient)({
          scopes: { tenantId, projectId, agentId },
          triggerId: 'trigger-1',
        })
      ).map((row) => row.userId)
    ).toEqual(['user-2', 'user-1']);

    expect(
      await getTriggerUserCount(testManageDbClient)({
        scopes: { tenantId, projectId, agentId },
        triggerId: 'trigger-1',
      })
    ).toBe(2);

    const batch = await getTriggerUsersBatch(testManageDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerIds: ['trigger-1', 'trigger-2', 'trigger-3'],
    });

    expect(batch.get('trigger-1')).toEqual(['user-2', 'user-1']);
    expect(batch.get('trigger-2')).toEqual(['user-3']);
    expect(batch.get('trigger-3')).toEqual([]);
  });

  it('creates a trigger and associated users in one helper', async () => {
    await insertAgent();

    const trigger = await createTriggerWithUsers(testManageDbClient)({
      trigger: {
        id: 'trigger-with-users',
        tenantId,
        projectId,
        agentId,
        name: 'Trigger with users',
        enabled: true,
        description: null,
        inputSchema: null,
        outputTransform: null,
        messageTemplate: null,
        authentication: null,
        signingSecretCredentialReferenceId: null,
        signatureVerification: null,
        runAsUserId: null,
        dispatchDelayMs: null,
        createdBy: null,
      },
      userIds: ['user-1', 'user-2'],
    });

    expect(trigger.id).toBe('trigger-with-users');
    expect(
      (
        await getTriggerUsers(testManageDbClient)({
          scopes: { tenantId, projectId, agentId },
          triggerId: trigger.id,
        })
      ).map((row) => row.userId)
    ).toEqual(['user-1', 'user-2']);
  });

  it('replaces trigger users atomically', async () => {
    await insertTrigger('trigger-1');

    await createTriggerUser(testManageDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId: 'trigger-1',
      userId: 'user-1',
    });
    await createTriggerUser(testManageDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId: 'trigger-1',
      userId: 'user-2',
    });

    await setTriggerUsers(testManageDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId: 'trigger-1',
      userIds: ['user-3'],
    });

    expect(
      (
        await getTriggerUsers(testManageDbClient)({
          scopes: { tenantId, projectId, agentId },
          triggerId: 'trigger-1',
        })
      ).map((row) => row.userId)
    ).toEqual(['user-3']);
  });

  it('returns trigger ids for a user only within the requested project', async () => {
    await insertTrigger('trigger-1', projectId, agentId);
    await insertTrigger('trigger-2', otherProjectId, agentId);

    await createTriggerUser(testManageDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId: 'trigger-1',
      userId: 'user-1',
    });
    await createTriggerUser(testManageDbClient)({
      scopes: { tenantId, projectId: otherProjectId, agentId },
      triggerId: 'trigger-2',
      userId: 'user-1',
    });

    const triggerIds = await getWebhookTriggerIdsWithUser(testManageDbClient)({
      tenantId,
      projectId,
      userId: 'user-1',
    });

    expect(triggerIds).toEqual([{ agentId, id: 'trigger-1' }]);
  });

  it('removes a user from project triggers and disables only emptied triggers', async () => {
    await insertTrigger('trigger-empty', projectId, agentId);
    await insertTrigger('trigger-still-has-users', projectId, agentId);
    await insertTrigger('trigger-other-project', otherProjectId, agentId);

    await createTriggerUser(testManageDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId: 'trigger-empty',
      userId: 'user-1',
    });
    await createTriggerUser(testManageDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId: 'trigger-still-has-users',
      userId: 'user-1',
    });
    await createTriggerUser(testManageDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId: 'trigger-still-has-users',
      userId: 'user-2',
    });
    await createTriggerUser(testManageDbClient)({
      scopes: { tenantId, projectId: otherProjectId, agentId },
      triggerId: 'trigger-other-project',
      userId: 'user-1',
    });

    await removeUserFromProjectTriggerUsers(testManageDbClient)({
      tenantId,
      projectId,
      userId: 'user-1',
    });

    expect(
      await getTriggerUsers(testManageDbClient)({
        scopes: { tenantId, projectId, agentId },
        triggerId: 'trigger-empty',
      })
    ).toEqual([]);
    expect(
      (
        await getTriggerUsers(testManageDbClient)({
          scopes: { tenantId, projectId, agentId },
          triggerId: 'trigger-still-has-users',
        })
      ).map((row) => row.userId)
    ).toEqual(['user-2']);
    expect(
      (
        await getTriggerUsers(testManageDbClient)({
          scopes: { tenantId, projectId: otherProjectId, agentId },
          triggerId: 'trigger-other-project',
        })
      ).map((row) => row.userId)
    ).toEqual(['user-1']);

    const emptiedTrigger = await getTriggerById(testManageDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId: 'trigger-empty',
    });
    const remainingTrigger = await getTriggerById(testManageDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId: 'trigger-still-has-users',
    });
    const otherProjectTrigger = await getTriggerById(testManageDbClient)({
      scopes: { tenantId, projectId: otherProjectId, agentId },
      triggerId: 'trigger-other-project',
    });

    expect(emptiedTrigger?.enabled).toBe(false);
    expect(remainingTrigger?.enabled).toBe(true);
    expect(otherProjectTrigger?.enabled).toBe(true);
  });
});
