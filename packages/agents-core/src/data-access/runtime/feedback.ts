import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { conversations, feedback } from '../../db/runtime/runtime-schema';
import type {
  FeedbackInsert,
  FeedbackUpdate,
  PaginationConfig,
  ProjectScopeConfig,
} from '../../types/index';
import { projectScopedWhere } from '../manage/scope-helpers';

export const getFeedbackById =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; feedbackId: string }) => {
    const [result] = await db
      .select({
        id: feedback.id,
        conversationId: feedback.conversationId,
        messageId: feedback.messageId,
        type: feedback.type,
        details: feedback.details,
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
      })
      .from(feedback)
      .where(and(projectScopedWhere(feedback, params.scopes), eq(feedback.id, params.feedbackId)))
      .limit(1);

    return result;
  };

export const listFeedbackByConversation =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    messageId?: string;
    pagination?: PaginationConfig;
  }) => {
    return listFeedback(db)({
      scopes: params.scopes,
      conversationId: params.conversationId,
      messageId: params.messageId,
      pagination: params.pagination,
    });
  };

export const listFeedback =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId?: string;
    messageId?: string;
    agentId?: string;
    type?: 'positive' | 'negative';
    startDate?: string;
    endDate?: string;
    pagination?: PaginationConfig;
  }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const conditions = [projectScopedWhere(feedback, params.scopes)];

    if (params.conversationId) {
      conditions.push(eq(feedback.conversationId, params.conversationId));
    }

    if (params.messageId) {
      conditions.push(eq(feedback.messageId, params.messageId));
    }

    if (params.type) {
      conditions.push(eq(feedback.type, params.type));
    }

    if (params.startDate) {
      conditions.push(gte(feedback.createdAt, `${params.startDate}T00:00:00.000Z`));
    }

    if (params.endDate) {
      conditions.push(lte(feedback.createdAt, `${params.endDate}T23:59:59.999Z`));
    }

    if (params.agentId) {
      conditions.push(eq(conversations.agentId, params.agentId));
    }

    const whereClause = and(...conditions);

    const conversationsJoin = [
      eq(feedback.tenantId, conversations.tenantId),
      eq(feedback.projectId, conversations.projectId),
      eq(feedback.conversationId, conversations.id),
    ] as const;

    const countQuery = db.select({ count: count() }).from(feedback);
    if (params.agentId) {
      countQuery.leftJoin(conversations, and(...conversationsJoin));
    }

    const [items, total] = await Promise.all([
      db
        .select({
          id: feedback.id,
          conversationId: feedback.conversationId,
          messageId: feedback.messageId,
          type: feedback.type,
          details: feedback.details,
          createdAt: feedback.createdAt,
          updatedAt: feedback.updatedAt,
          agentId: conversations.agentId,
        })
        .from(feedback)
        .leftJoin(conversations, and(...conversationsJoin))
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(feedback.createdAt)),
      countQuery.where(whereClause),
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
      .where(and(projectScopedWhere(feedback, params.scopes), eq(feedback.id, params.feedbackId)))
      .returning();

    return updated;
  };

export const deleteFeedback =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; feedbackId: string }) => {
    const [deleted] = await db
      .delete(feedback)
      .where(and(projectScopedWhere(feedback, params.scopes), eq(feedback.id, params.feedbackId)))
      .returning();

    return deleted;
  };
