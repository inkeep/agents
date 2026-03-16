import { eq, sql } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { schedulerState } from '../../db/runtime/runtime-schema';

export type SchedulerStateRow = typeof schedulerState.$inferSelect;

const SINGLETON_ID = 'singleton';

export const getSchedulerState =
  (db: AgentsRunDatabaseClient) => async (): Promise<SchedulerStateRow | undefined> => {
    const row = await db.query.schedulerState.findFirst({
      where: eq(schedulerState.id, SINGLETON_ID),
    });
    return row;
  };

export const upsertSchedulerState =
  (db: AgentsRunDatabaseClient) =>
  async (params: { currentRunId: string }): Promise<SchedulerStateRow> => {
    const [row] = await db
      .insert(schedulerState)
      .values({
        id: SINGLETON_ID,
        currentRunId: params.currentRunId,
      })
      .onConflictDoUpdate({
        target: schedulerState.id,
        set: {
          currentRunId: params.currentRunId,
          updatedAt: sql`now()`.mapWith(String),
        },
      })
      .returning();
    return row;
  };

export const clearSchedulerState = (db: AgentsRunDatabaseClient) => async (): Promise<void> => {
  await db
    .update(schedulerState)
    .set({
      currentRunId: null,
      updatedAt: sql`now()`.mapWith(String),
    })
    .where(eq(schedulerState.id, SINGLETON_ID));
};
