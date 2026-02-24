import { and, eq, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { pendingToolAuthRequests } from '../../db/runtime/runtime-schema';

export type PendingToolAuthRequestInsert = typeof pendingToolAuthRequests.$inferInsert;
export type PendingToolAuthRequestSelect = typeof pendingToolAuthRequests.$inferSelect;

export const insertPendingToolAuth =
  (db: AgentsRunDatabaseClient) =>
  async (
    data: Omit<PendingToolAuthRequestInsert, 'id' | 'createdAt'>
  ): Promise<PendingToolAuthRequestSelect> => {
    const id = `pta_${nanoid(21)}`;

    const [result] = await db
      .insert(pendingToolAuthRequests)
      .values({ id, ...data })
      .returning();

    return result;
  };

export const findPendingToolAuthByUserAndTool =
  (db: AgentsRunDatabaseClient) =>
  async (userId: string, toolId: string): Promise<PendingToolAuthRequestSelect[]> => {
    return db
      .select()
      .from(pendingToolAuthRequests)
      .where(
        and(eq(pendingToolAuthRequests.userId, userId), eq(pendingToolAuthRequests.toolId, toolId))
      );
  };

export const deletePendingToolAuth =
  (db: AgentsRunDatabaseClient) =>
  async (id: string): Promise<void> => {
    await db.delete(pendingToolAuthRequests).where(eq(pendingToolAuthRequests.id, id));
  };

export const deleteExpiredPendingToolAuth =
  (db: AgentsRunDatabaseClient) =>
  async (olderThan: Date): Promise<void> => {
    await db
      .delete(pendingToolAuthRequests)
      .where(lt(pendingToolAuthRequests.createdAt, olderThan.toISOString()));
  };
