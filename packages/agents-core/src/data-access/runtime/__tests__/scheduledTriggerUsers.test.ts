import { describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../../__tests__/setup';
import * as authSchema from '../../../auth/auth-schema';
import { scheduledTriggerUsers as scheduledTriggerUsersTable } from '../../../db/runtime/runtime-schema';
import { createScheduledTrigger, getScheduledTriggerById } from '../scheduledTriggers';
import {
  createScheduledTriggerUser,
  deleteScheduledTriggerUser,
  getScheduledTriggerUserCount,
  getScheduledTriggerUsers,
  getScheduledTriggerUsersBatch,
  getTriggerIdsWithUser,
  removeUserFromProjectScheduledTriggers,
  setScheduledTriggerUsers,
} from '../scheduledTriggerUsers';

const tenantId = 'tenant-scheduled-trigger-users';
const projectId = 'project-1';
const otherProjectId = 'project-2';
const agentId = 'agent-1';

async function insertOrganization(id: string) {
  await testRunDbClient.insert(authSchema.organization).values({
    id,
    name: `Org ${id}`,
    slug: `slug-${id}`,
    createdAt: new Date(),
  });
}

async function insertUser(id: string) {
  await testRunDbClient.insert(authSchema.user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function insertTrigger(id: string, currentProjectId = projectId, enabled = true) {
  return createScheduledTrigger(testRunDbClient)({
    id,
    tenantId,
    projectId: currentProjectId,
    agentId,
    name: `Trigger ${id}`,
    enabled,
  });
}

describe('scheduledTriggerUsers DAL', () => {
  it('creates, lists, counts, and deletes scheduled trigger users', async () => {
    await insertOrganization(tenantId);
    await insertUser('user-1');
    await insertTrigger('trigger-1');

    const created = await createScheduledTriggerUser(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-1',
      userId: 'user-1',
    });

    expect(created?.userId).toBe('user-1');
    expect(
      await getScheduledTriggerUsers(testRunDbClient)({
        tenantId,
        scheduledTriggerId: 'trigger-1',
      })
    ).toHaveLength(1);
    expect(
      await getScheduledTriggerUserCount(testRunDbClient)({
        tenantId,
        scheduledTriggerId: 'trigger-1',
      })
    ).toBe(1);

    const duplicate = await createScheduledTriggerUser(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-1',
      userId: 'user-1',
    });

    expect(duplicate).toBeUndefined();

    await deleteScheduledTriggerUser(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-1',
      userId: 'user-1',
    });

    expect(
      await getScheduledTriggerUsers(testRunDbClient)({
        tenantId,
        scheduledTriggerId: 'trigger-1',
      })
    ).toEqual([]);
    expect(
      await getScheduledTriggerUserCount(testRunDbClient)({
        tenantId,
        scheduledTriggerId: 'trigger-1',
      })
    ).toBe(0);
  });

  it('replaces users atomically with setScheduledTriggerUsers', async () => {
    await insertOrganization(tenantId);
    await insertUser('user-1');
    await insertUser('user-2');
    await insertUser('user-3');
    await insertTrigger('trigger-1');

    await createScheduledTriggerUser(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-1',
      userId: 'user-1',
    });
    await createScheduledTriggerUser(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-1',
      userId: 'user-2',
    });

    await setScheduledTriggerUsers(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-1',
      userIds: ['user-3'],
    });

    const users = await getScheduledTriggerUsers(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-1',
    });

    expect(users.map((row) => row.userId)).toEqual(['user-3']);
  });

  it('rolls back setScheduledTriggerUsers when a replacement user is invalid', async () => {
    await insertOrganization(tenantId);
    await insertUser('user-1');
    await insertUser('user-2');
    await insertTrigger('trigger-1');

    await createScheduledTriggerUser(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-1',
      userId: 'user-1',
    });
    await createScheduledTriggerUser(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-1',
      userId: 'user-2',
    });

    await expect(
      setScheduledTriggerUsers(testRunDbClient)({
        tenantId,
        scheduledTriggerId: 'trigger-1',
        userIds: ['user-2', 'missing-user'],
      })
    ).rejects.toThrow();

    const users = await getScheduledTriggerUsers(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-1',
    });

    expect(users.map((row) => row.userId)).toEqual(['user-1', 'user-2']);
  });

  it('returns trigger ids for a user only within the requested project', async () => {
    await insertOrganization(tenantId);
    await insertUser('user-1');
    await insertTrigger('trigger-1', projectId);
    await insertTrigger('trigger-2', otherProjectId);

    await createScheduledTriggerUser(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-1',
      userId: 'user-1',
    });
    await createScheduledTriggerUser(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-2',
      userId: 'user-1',
    });

    const triggerIds = await getTriggerIdsWithUser(testRunDbClient)({
      tenantId,
      projectId,
      userId: 'user-1',
    });

    expect(triggerIds).toEqual([{ id: 'trigger-1' }]);
  });

  it('removes a user from project triggers and disables only emptied triggers', async () => {
    await insertOrganization(tenantId);
    await insertUser('user-1');
    await insertUser('user-2');
    await insertTrigger('trigger-empty', projectId);
    await insertTrigger('trigger-still-has-users', projectId);
    await insertTrigger('trigger-other-project', otherProjectId);

    await createScheduledTriggerUser(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-empty',
      userId: 'user-1',
    });
    await createScheduledTriggerUser(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-still-has-users',
      userId: 'user-1',
    });
    await createScheduledTriggerUser(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-still-has-users',
      userId: 'user-2',
    });
    await createScheduledTriggerUser(testRunDbClient)({
      tenantId,
      scheduledTriggerId: 'trigger-other-project',
      userId: 'user-1',
    });

    await removeUserFromProjectScheduledTriggers(testRunDbClient)({
      tenantId,
      projectId,
      userId: 'user-1',
    });

    expect(
      await getScheduledTriggerUsers(testRunDbClient)({
        tenantId,
        scheduledTriggerId: 'trigger-empty',
      })
    ).toEqual([]);
    expect(
      await getScheduledTriggerUsers(testRunDbClient)({
        tenantId,
        scheduledTriggerId: 'trigger-still-has-users',
      })
    ).toHaveLength(1);
    expect(
      await getScheduledTriggerUsers(testRunDbClient)({
        tenantId,
        scheduledTriggerId: 'trigger-other-project',
      })
    ).toHaveLength(1);

    const emptiedTrigger = await getScheduledTriggerById(testRunDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: 'trigger-empty',
    });
    const remainingTrigger = await getScheduledTriggerById(testRunDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: 'trigger-still-has-users',
    });
    const otherProjectTrigger = await getScheduledTriggerById(testRunDbClient)({
      scopes: { tenantId, projectId: otherProjectId, agentId },
      scheduledTriggerId: 'trigger-other-project',
    });

    expect(emptiedTrigger?.enabled).toBe(false);
    expect(remainingTrigger?.enabled).toBe(true);
    expect(otherProjectTrigger?.enabled).toBe(true);
  });

  it('returns batched users in created order and includes empty trigger ids', async () => {
    await insertOrganization(tenantId);
    await insertUser('user-1');
    await insertUser('user-2');
    await insertTrigger('trigger-1');
    await insertTrigger('trigger-2');
    await insertTrigger('trigger-3');

    await testRunDbClient.insert(scheduledTriggerUsersTable).values([
      {
        tenantId,
        scheduledTriggerId: 'trigger-1',
        userId: 'user-2',
        createdAt: '2026-01-01T00:00:02.000Z',
      },
      {
        tenantId,
        scheduledTriggerId: 'trigger-1',
        userId: 'user-1',
        createdAt: '2026-01-01T00:00:01.000Z',
      },
      {
        tenantId,
        scheduledTriggerId: 'trigger-2',
        userId: 'user-2',
        createdAt: '2026-01-01T00:00:03.000Z',
      },
    ]);

    const result = await getScheduledTriggerUsersBatch(testRunDbClient)({
      tenantId,
      scheduledTriggerIds: ['trigger-1', 'trigger-2', 'trigger-3'],
    });

    expect(result.get('trigger-1')).toEqual(['user-1', 'user-2']);
    expect(result.get('trigger-2')).toEqual(['user-2']);
    expect(result.get('trigger-3')).toEqual([]);
  });
});
