import { and, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { tasks } from '../../db/runtime/runtime-schema';
import type { TaskInsert, TaskSelect } from '../../types/index';
import type { ProjectScopeConfig } from '../../types/utility';

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
  async (params: { id: string; scopes: ProjectScopeConfig }): Promise<TaskSelect | null> => {
    const result = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, params.scopes.tenantId),
          eq(tasks.projectId, params.scopes.projectId),
          eq(tasks.id, params.id)
        )
      )
      .limit(1);

    return result[0];
  };

export const updateTask =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    taskId: string;
    scopes: ProjectScopeConfig;
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
      .where(
        and(
          eq(tasks.tenantId, params.scopes.tenantId),
          eq(tasks.projectId, params.scopes.projectId),
          eq(tasks.id, params.taskId)
        )
      )
      .returning();

    return updated;
  };

export const listTaskIdsByContextId =
  (db: AgentsRunDatabaseClient) =>
  async (params: { contextId: string; scopes: ProjectScopeConfig }) => {
    const result = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, params.scopes.tenantId),
          eq(tasks.projectId, params.scopes.projectId),
          eq(tasks.contextId, params.contextId)
        )
      );

    return result.map((r: { id: string }) => r.id);
  };
