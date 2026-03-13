import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { triggerSchedules } from '../../db/runtime/runtime-schema';

export type TriggerScheduleRow = typeof triggerSchedules.$inferSelect;
export type TriggerScheduleInsert = typeof triggerSchedules.$inferInsert;

export const upsertTriggerSchedule =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    projectId: string;
    agentId: string;
    scheduledTriggerId: string;
    cronExpression?: string | null;
    cronTimezone?: string | null;
    runAt?: string | null;
    enabled: boolean;
    nextRunAt?: string | null;
  }): Promise<TriggerScheduleRow> => {
    const [row] = await db
      .insert(triggerSchedules)
      .values({
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: params.agentId,
        scheduledTriggerId: params.scheduledTriggerId,
        cronExpression: params.cronExpression ?? null,
        cronTimezone: params.cronTimezone ?? 'UTC',
        runAt: params.runAt ?? null,
        enabled: params.enabled,
        nextRunAt: params.nextRunAt ?? null,
      })
      .onConflictDoUpdate({
        target: [triggerSchedules.tenantId, triggerSchedules.scheduledTriggerId],
        set: {
          projectId: params.projectId,
          agentId: params.agentId,
          cronExpression: params.cronExpression ?? null,
          cronTimezone: params.cronTimezone ?? 'UTC',
          runAt: params.runAt ?? null,
          enabled: params.enabled,
          nextRunAt: params.nextRunAt ?? null,
          claimedAt: null,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return row;
  };

export const deleteTriggerSchedule =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; scheduledTriggerId: string }): Promise<void> => {
    await db
      .delete(triggerSchedules)
      .where(
        and(
          eq(triggerSchedules.tenantId, params.tenantId),
          eq(triggerSchedules.scheduledTriggerId, params.scheduledTriggerId)
        )
      );
  };

export const updateTriggerScheduleEnabled =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    scheduledTriggerId: string;
    enabled: boolean;
  }): Promise<void> => {
    await db
      .update(triggerSchedules)
      .set({
        enabled: params.enabled,
        claimedAt: null,
        updatedAt: sql`now()`.mapWith(String),
      })
      .where(
        and(
          eq(triggerSchedules.tenantId, params.tenantId),
          eq(triggerSchedules.scheduledTriggerId, params.scheduledTriggerId)
        )
      );
  };

export const findDueTriggerSchedules =
  (db: AgentsRunDatabaseClient) =>
  async (params: { asOf: string }): Promise<TriggerScheduleRow[]> => {
    const rows = await db
      .select()
      .from(triggerSchedules)
      .where(
        and(
          eq(triggerSchedules.enabled, true),
          lte(triggerSchedules.nextRunAt, params.asOf),
          isNull(triggerSchedules.claimedAt),
        ),
      );
    return rows;
  };

export const claimTriggerSchedule =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    scheduledTriggerId: string;
    expectedClaimedAt: string | null;
  }): Promise<boolean> => {
    const claimCondition = params.expectedClaimedAt
      ? lte(triggerSchedules.claimedAt, params.expectedClaimedAt)
      : isNull(triggerSchedules.claimedAt);

    const rows = await db
      .update(triggerSchedules)
      .set({
        claimedAt: sql`now()`.mapWith(String),
      })
      .where(
        and(
          eq(triggerSchedules.tenantId, params.tenantId),
          eq(triggerSchedules.scheduledTriggerId, params.scheduledTriggerId),
          claimCondition
        )
      )
      .returning();
    return rows.length > 0;
  };

export const advanceTriggerSchedule =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    scheduledTriggerId: string;
    nextRunAt: string | null;
    enabled?: boolean;
  }): Promise<void> => {
    const set: Record<string, unknown> = {
      nextRunAt: params.nextRunAt,
      updatedAt: sql`now()`.mapWith(String),
    };
    if (params.enabled !== undefined) {
      set.enabled = params.enabled;
    }
    await db
      .update(triggerSchedules)
      .set(set)
      .where(
        and(
          eq(triggerSchedules.tenantId, params.tenantId),
          eq(triggerSchedules.scheduledTriggerId, params.scheduledTriggerId)
        )
      );
  };

export const rollbackTriggerSchedule =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    scheduledTriggerId: string;
    nextRunAt: string | null;
    enabled: boolean;
  }): Promise<void> => {
    await db
      .update(triggerSchedules)
      .set({
        nextRunAt: params.nextRunAt,
        enabled: params.enabled,
        claimedAt: null,
        updatedAt: sql`now()`.mapWith(String),
      })
      .where(
        and(
          eq(triggerSchedules.tenantId, params.tenantId),
          eq(triggerSchedules.scheduledTriggerId, params.scheduledTriggerId)
        )
      );
  };

export const releaseTriggerScheduleClaim =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; scheduledTriggerId: string }): Promise<void> => {
    await db
      .update(triggerSchedules)
      .set({
        claimedAt: null,
      })
      .where(
        and(
          eq(triggerSchedules.tenantId, params.tenantId),
          eq(triggerSchedules.scheduledTriggerId, params.scheduledTriggerId)
        )
      );
  };
