import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { messages } from '../db/schema';
import type {
  MessageInsert,
  MessageUpdate,
  MessageVisibility,
  PaginationConfig,
  ProjectScopeConfig,
} from '../types/index';

export const getMessageById =
  (db: DatabaseClient) => async (params: { scopes: ProjectScopeConfig; messageId: string }) => {
    return db.query.messages.findFirst({
      where: and(
        eq(messages.tenantId, params.scopes.tenantId),
        eq(messages.projectId, params.scopes.projectId),
        eq(messages.id, params.messageId)
      ),
    });
  };

export const listMessages =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; pagination: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const query = db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, params.scopes.tenantId),
          eq(messages.projectId, params.scopes.projectId)
        )
      )
      .limit(limit)
      .offset(offset)
      .orderBy(desc(messages.createdAt));

    return await query;
  };

export const getMessagesByConversation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    pagination: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const query = db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, params.scopes.tenantId),
          eq(messages.projectId, params.scopes.projectId),
          eq(messages.conversationId, params.conversationId)
        )
      )
      .limit(limit)
      .offset(offset)
      .orderBy(desc(messages.createdAt));

    return await query;
  };

export const getMessagesByTask =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; taskId: string; pagination: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const query = db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, params.scopes.tenantId),
          eq(messages.projectId, params.scopes.projectId),
          eq(messages.taskId, params.taskId)
        )
      )
      .limit(limit)
      .offset(offset)
      .orderBy(asc(messages.createdAt));

    return await query;
  };

export const getVisibleMessages =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    visibility?: MessageVisibility[];
    pagination: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const visibilityFilter = params.visibility || ['user-facing'];

    const query = db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, params.scopes.tenantId),
          eq(messages.projectId, params.scopes.projectId),
          eq(messages.conversationId, params.conversationId),
          inArray(messages.visibility, visibilityFilter)
        )
      )
      .limit(limit)
      .offset(offset)
      .orderBy(asc(messages.createdAt));

    return await query;
  };

export const createMessage = (db: DatabaseClient) => async (params: MessageInsert) => {
  const now = new Date().toISOString();

  const [created] = await db
    .insert(messages)
    .values({
      ...params,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
};

export const updateMessage =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; messageId: string; data: MessageUpdate }) => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(messages)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(
          eq(messages.tenantId, params.scopes.tenantId),
          eq(messages.projectId, params.scopes.projectId),
          eq(messages.id, params.messageId)
        )
      )
      .returning();

    return updated;
  };

export const deleteMessage =
  (db: DatabaseClient) => async (params: { scopes: ProjectScopeConfig; messageId: string }) => {
    const [deleted] = await db
      .delete(messages)
      .where(
        and(
          eq(messages.tenantId, params.scopes.tenantId),
          eq(messages.projectId, params.scopes.projectId),
          eq(messages.id, params.messageId)
        )
      )
      .returning();

    return deleted;
  };

export const countMessagesByConversation =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; conversationId: string }) => {
    const result = await db
      .select({ count: count() })
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, params.scopes.tenantId),
          eq(messages.projectId, params.scopes.projectId),
          eq(messages.conversationId, params.conversationId)
        )
      );

    const total = result[0]?.count || 0;
    return typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
  };
