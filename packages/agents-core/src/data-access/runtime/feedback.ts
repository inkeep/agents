import { and, count, desc, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { feedback } from '../../db/runtime/runtime-schema';
import type {
  FeedbackInsert,
  FeedbackUpdate,
  PaginationConfig,
  ProjectScopeConfig,
} from '../../types/index';

export const getFeedbackById =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; feedbackId: string }) => {
    return db.query.feedback.findFirst({
      where: and(
        eq(feedback.tenantId, params.scopes.tenantId),
        eq(feedback.projectId, params.scopes.projectId),
        eq(feedback.id, params.feedbackId)
      ),
    });
  };

export const listFeedbackByConversation =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    messageId?: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const conditions = [
      eq(feedback.tenantId, params.scopes.tenantId),
      eq(feedback.projectId, params.scopes.projectId),
      eq(feedback.conversationId, params.conversationId),
    ];

    if (params.messageId) {
      conditions.push(eq(feedback.messageId, params.messageId));
    }

    const whereClause = and(...conditions);

    const [items, total] = await Promise.all([
      db
        .select()
        .from(feedback)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(feedback.createdAt)),
      db.select({ count: count() }).from(feedback).where(whereClause),
    ]);

    return {
      feedback: items,
      total:
        typeof total[0]?.count === 'string'
          ? Number.parseInt(total[0].count, 10)
          : (total[0]?.count ?? 0),
    };
  };

export const createFeedback = (db: AgentsRunDatabaseClient) => async (params: FeedbackInsert) => {
  const now = new Date().toISOString();

  const [created] = await db
    .insert(feedback)
    .values({
      ...params,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
};

export const updateFeedback =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; feedbackId: string; data: FeedbackUpdate }) => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(feedback)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(
          eq(feedback.tenantId, params.scopes.tenantId),
          eq(feedback.projectId, params.scopes.projectId),
          eq(feedback.id, params.feedbackId)
        )
      )
      .returning();

    return updated;
  };

export const deleteFeedback =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; feedbackId: string }) => {
    const [deleted] = await db
      .delete(feedback)
      .where(
        and(
          eq(feedback.tenantId, params.scopes.tenantId),
          eq(feedback.projectId, params.scopes.projectId),
          eq(feedback.id, params.feedbackId)
        )
      )
      .returning();

    return deleted;
  };
