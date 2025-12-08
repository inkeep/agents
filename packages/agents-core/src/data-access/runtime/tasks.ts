import { and, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { tasks } from '../../db/runtime/runtime-schema';
import type { TaskInsert, TaskSelect } from '../../types/index';

export const createTask = (db: AgentsRunDatabaseClient) => async (params: TaskInsert) => {
  const now = new Date().toISOString();

  const [created] = await db
    .insert(tasks)
    .values({
      ...params,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
};

export const getTask =
  (db: AgentsRunDatabaseClient) =>
  async (params: { id: string }): Promise<TaskSelect | null> => {
    const { id } = params;
    const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);

    return result[0];
  };

export const updateTask =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    taskId: string;
    data: {
      status?: string;
      metadata?: any;
    };
  }) => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(tasks)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(and(eq(tasks.id, params.taskId)))
      .returning();

    return updated;
  };

export const listTaskIdsByContextId =
  (db: AgentsRunDatabaseClient) => async (params: { contextId: string }) => {
    const { contextId } = params;
    const result = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.contextId, contextId));

    return result.map((r: { id: string }) => r.id);
  };
