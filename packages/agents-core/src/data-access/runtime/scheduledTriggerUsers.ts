import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { scheduledTriggers, scheduledTriggerUsers } from '../../db/runtime/runtime-schema';

export const getScheduledTriggerUsers =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; scheduledTriggerId: string }) => {
    const rows = await db
      .select()
      .from(scheduledTriggerUsers)
      .where(
        and(
          eq(scheduledTriggerUsers.tenantId, params.tenantId),
          eq(scheduledTriggerUsers.scheduledTriggerId, params.scheduledTriggerId)
        )
      )
      .orderBy(asc(scheduledTriggerUsers.createdAt));

    return rows;
  };

export const createScheduledTriggerUser =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; scheduledTriggerId: string; userId: string }) => {
    const result = await db
      .insert(scheduledTriggerUsers)
      .values({
        tenantId: params.tenantId,
        scheduledTriggerId: params.scheduledTriggerId,
        userId: params.userId,
      })
      .onConflictDoNothing()
      .returning();

    return result[0];
  };

export const deleteScheduledTriggerUser =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; scheduledTriggerId: string; userId: string }) => {
    await db
      .delete(scheduledTriggerUsers)
      .where(
        and(
          eq(scheduledTriggerUsers.tenantId, params.tenantId),
          eq(scheduledTriggerUsers.scheduledTriggerId, params.scheduledTriggerId),
          eq(scheduledTriggerUsers.userId, params.userId)
        )
      );
  };

export const setScheduledTriggerUsers =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; scheduledTriggerId: string; userIds: string[] }) => {
    await db.transaction(async (tx) => {
      await tx
        .delete(scheduledTriggerUsers)
        .where(
          and(
            eq(scheduledTriggerUsers.tenantId, params.tenantId),
            eq(scheduledTriggerUsers.scheduledTriggerId, params.scheduledTriggerId)
          )
        );

      if (params.userIds.length > 0) {
        await tx.insert(scheduledTriggerUsers).values(
          params.userIds.map((userId) => ({
            tenantId: params.tenantId,
            scheduledTriggerId: params.scheduledTriggerId,
            userId,
          }))
        );
      }
    });
  };

export const getScheduledTriggerUserCount =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; scheduledTriggerId: string }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(scheduledTriggerUsers)
      .where(
        and(
          eq(scheduledTriggerUsers.tenantId, params.tenantId),
          eq(scheduledTriggerUsers.scheduledTriggerId, params.scheduledTriggerId)
        )
      );

    return result[0]?.count ?? 0;
  };

export const getTriggerIdsWithUser =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; projectId: string; userId: string }) => {
    return db
      .select({ id: scheduledTriggers.id })
      .from(scheduledTriggers)
      .innerJoin(
        scheduledTriggerUsers,
        and(
          eq(scheduledTriggerUsers.tenantId, scheduledTriggers.tenantId),
          eq(scheduledTriggerUsers.scheduledTriggerId, scheduledTriggers.id)
        )
      )
      .where(
        and(
          eq(scheduledTriggers.tenantId, params.tenantId),
          eq(scheduledTriggers.projectId, params.projectId),
          eq(scheduledTriggerUsers.userId, params.userId)
        )
      );
  };

export const removeUserFromProjectScheduledTriggers =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; projectId: string; userId: string }) => {
    await db.transaction(async (tx) => {
      const triggerIdsWithUser = await getTriggerIdsWithUser(tx)(params);

      if (triggerIdsWithUser.length === 0) return;

      const triggerIds = triggerIdsWithUser.map((t) => t.id);

      await tx
        .delete(scheduledTriggerUsers)
        .where(
          and(
            eq(scheduledTriggerUsers.tenantId, params.tenantId),
            inArray(scheduledTriggerUsers.scheduledTriggerId, triggerIds),
            eq(scheduledTriggerUsers.userId, params.userId)
          )
        );

      const triggersWithRemainingUsers = await tx
        .select({ triggerId: scheduledTriggerUsers.scheduledTriggerId })
        .from(scheduledTriggerUsers)
        .where(
          and(
            eq(scheduledTriggerUsers.tenantId, params.tenantId),
            inArray(scheduledTriggerUsers.scheduledTriggerId, triggerIds)
          )
        )
        .groupBy(scheduledTriggerUsers.scheduledTriggerId);

      const triggerIdsWithRemainingUsers = new Set(
        triggersWithRemainingUsers.map((r) => r.triggerId)
      );
      const emptyTriggerIds = triggerIds.filter((id) => !triggerIdsWithRemainingUsers.has(id));

      if (emptyTriggerIds.length > 0) {
        await tx
          .update(scheduledTriggers)
          .set({ enabled: false, updatedAt: new Date().toISOString() })
          .where(
            and(
              eq(scheduledTriggers.tenantId, params.tenantId),
              inArray(scheduledTriggers.id, emptyTriggerIds),
              eq(scheduledTriggers.enabled, true)
            )
          );
      }
    });
  };

export const getScheduledTriggerUsersBatch =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    scheduledTriggerIds: string[];
  }): Promise<Map<string, string[]>> => {
    if (params.scheduledTriggerIds.length === 0) return new Map();

    const rows = await db
      .select()
      .from(scheduledTriggerUsers)
      .where(
        and(
          eq(scheduledTriggerUsers.tenantId, params.tenantId),
          inArray(scheduledTriggerUsers.scheduledTriggerId, params.scheduledTriggerIds)
        )
      )
      .orderBy(asc(scheduledTriggerUsers.createdAt));

    const result = new Map<string, string[]>();
    for (const id of params.scheduledTriggerIds) {
      result.set(id, []);
    }
    for (const row of rows) {
      const users = result.get(row.scheduledTriggerId);
      if (users) {
        users.push(row.userId);
      }
    }

    return result;
  };
