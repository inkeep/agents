import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { events } from '../../db/runtime/runtime-schema';
import type { EventInsert, PaginationConfig, ProjectScopeConfig } from '../../types/index';
import { projectScopedWhere } from '../manage/scope-helpers';

export const createEvent = (db: AgentsRunDatabaseClient) => async (params: EventInsert) => {
  const now = new Date().toISOString();

  const [inserted] = await db
    .insert(events)
    .values({
      ...params,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [events.tenantId, events.projectId, events.id],
    })
    .returning();

  if (inserted) {
    return { row: inserted, conflict: false as const };
  }

  const [existing] = await db
    .select()
    .from(events)
    .where(
      and(
        projectScopedWhere(events, { tenantId: params.tenantId, projectId: params.projectId }),
        eq(events.id, params.id)
      )
    )
    .limit(1);

  if (!existing) {
    throw new Error(
      `createEvent: insert returned no row and no existing row found for id=${params.id}`
    );
  }

  return { row: existing, conflict: true as const };
};

export const getEventById =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; eventId: string }) => {
    const [result] = await db
      .select()
      .from(events)
      .where(and(projectScopedWhere(events, params.scopes), eq(events.id, params.eventId)))
      .limit(1);

    return result;
  };

export const listEventsByConversationId =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 100, 100);
    const offset = (page - 1) * limit;

    return db
      .select()
      .from(events)
      .where(
        and(
          projectScopedWhere(events, params.scopes),
          eq(events.conversationId, params.conversationId)
        )
      )
      .orderBy(desc(events.createdAt))
      .limit(limit)
      .offset(offset);
  };

export const deleteEventsByConversationIds =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; conversationIds: string[] }): Promise<number> => {
    if (params.conversationIds.length === 0) {
      return 0;
    }

    const deleted = await db
      .delete(events)
      .where(
        and(
          projectScopedWhere(events, params.scopes),
          inArray(events.conversationId, params.conversationIds)
        )
      )
      .returning();

    return deleted.length;
  };
