import { and, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { messageFeedback } from '../../db/runtime/runtime-schema';
import type { ProjectScopeConfig } from '../../types/index';
import { projectScopedWhere } from '../manage/scope-helpers';

export const upsertMessageFeedback =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    data: {
      id: string;
      conversationId: string;
      messageId: string;
      type: 'positive' | 'negative';
      reasons?: Array<{ label: string; details: string }> | null;
      userId?: string | null;
    };
  }) => {
    const { scopes, data } = params;
    const now = new Date().toISOString();

    const [result] = await db
      .insert(messageFeedback)
      .values({
        id: data.id,
        tenantId: scopes.tenantId,
        projectId: scopes.projectId,
        conversationId: data.conversationId,
        messageId: data.messageId,
        type: data.type,
        reasons: data.reasons ?? null,
        userId: data.userId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [messageFeedback.tenantId, messageFeedback.projectId, messageFeedback.messageId],
        set: {
          type: data.type,
          reasons: data.reasons ?? null,
          userId: data.userId ?? null,
          updatedAt: now,
        },
      })
      .returning();

    return result;
  };

export const getMessageFeedback =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; messageId: string }) => {
    const results = await db
      .select()
      .from(messageFeedback)
      .where(
        and(
          projectScopedWhere(messageFeedback, params.scopes),
          eq(messageFeedback.messageId, params.messageId)
        )
      )
      .limit(1);

    return results[0] ?? null;
  };

export const getConversationFeedback =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; conversationId: string }) => {
    return db
      .select()
      .from(messageFeedback)
      .where(
        and(
          projectScopedWhere(messageFeedback, params.scopes),
          eq(messageFeedback.conversationId, params.conversationId)
        )
      );
  };

export const deleteMessageFeedback =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; messageId: string }) => {
    const [deleted] = await db
      .delete(messageFeedback)
      .where(
        and(
          projectScopedWhere(messageFeedback, params.scopes),
          eq(messageFeedback.messageId, params.messageId)
        )
      )
      .returning();

    return deleted;
  };
