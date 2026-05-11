import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { conversations, messages } from '../../db/runtime/runtime-schema';
import type {
  ConversationHistoryConfig,
  ConversationInsert,
  ConversationMetadata,
  ConversationSelect,
  ConversationUpdate,
  MessageContent,
  MessageSelect,
  PaginationConfig,
  ProjectScopeConfig,
} from '../../types/index';
import { getConversationId } from '../../utils/conversations';
import { getLogger } from '../../utils/logger';
import type { ResolvedRef } from '../../validation/dolt-schemas';
import { projectScopedWhere } from '../manage/scope-helpers';
import { deleteEventsByConversationIds } from './events';

const logger = getLogger('data-access/runtime/conversations');

export const listConversations =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    userId?: string;
    pagination?: PaginationConfig;
  }): Promise<{ conversations: ConversationSelect[]; total: number }> => {
    const { userId, pagination } = params;

    const page = pagination?.page || 1;
    const limit = Math.min(pagination?.limit || 20, 200);
    const offset = (page - 1) * limit;

    const whereConditions = [projectScopedWhere(conversations, params.scopes)];

    if (userId) {
      whereConditions.push(eq(conversations.userId, userId));
    }

    const conversationList = await db
      .select()
      .from(conversations)
      .where(and(...whereConditions))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .offset(offset);

    const totalResult = await db
      .select({ count: count() })
      .from(conversations)
      .where(and(...whereConditions));

    const total = totalResult[0]?.count || 0;

    return {
      conversations: conversationList,
      total: typeof total === 'string' ? Number.parseInt(total, 10) : (total as number),
    };
  };

export const createConversation =
  (db: AgentsRunDatabaseClient) => async (params: ConversationInsert) => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(conversations)
      .values({
        ...params,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

export const updateConversation =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    data: ConversationUpdate;
  }) => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(conversations)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(
          projectScopedWhere(conversations, params.scopes),
          eq(conversations.id, params.conversationId)
        )
      )
      .returning();

    return updated;
  };

export const deleteConversation =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; conversationId: string }): Promise<boolean> => {
    try {
      await deleteEventsByConversationIds(db)({
        scopes: params.scopes,
        conversationIds: [params.conversationId],
      });

      await db
        .delete(messages)
        .where(
          and(
            projectScopedWhere(messages, params.scopes),
            eq(messages.conversationId, params.conversationId)
          )
        );

      await db
        .delete(conversations)
        .where(
          and(
            projectScopedWhere(conversations, params.scopes),
            eq(conversations.id, params.conversationId)
          )
        );

      return true;
    } catch (error) {
      logger.error(
        {
          tenantId: params.scopes.tenantId,
          projectId: params.scopes.projectId,
          conversationId: params.conversationId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to delete conversation (events/messages/conversation cleanup chain)'
      );
      return false;
    }
  };

export const updateConversationActiveSubAgent =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    activeSubAgentId: string;
  }) => {
    return updateConversation(db)({
      scopes: params.scopes,
      conversationId: params.conversationId,
      data: {
        activeSubAgentId: params.activeSubAgentId,
      },
    });
  };

//simpler getConversation
export const getConversation =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; conversationId: string }) => {
    return await db.query.conversations.findFirst({
      where: and(
        projectScopedWhere(conversations, params.scopes),
        eq(conversations.id, params.conversationId)
      ),
    });
  };

export const createOrGetConversation =
  (db: AgentsRunDatabaseClient) => async (input: ConversationInsert) => {
    const conversationId = input.id || getConversationId();

    if (input.id) {
      const existing = await db.query.conversations.findFirst({
        where: and(eq(conversations.tenantId, input.tenantId), eq(conversations.id, input.id)),
      });

      if (existing) {
        const updateSet: Partial<ConversationInsert> & { updatedAt: string } = {
          updatedAt: new Date().toISOString(),
        };
        let needsUpdate = false;

        if (existing.activeSubAgentId !== input.activeSubAgentId) {
          updateSet.activeSubAgentId = input.activeSubAgentId;
          needsUpdate = true;
        }
        if (input.userProperties !== undefined) {
          updateSet.userProperties = input.userProperties;
          needsUpdate = true;
        }
        if (input.properties !== undefined) {
          updateSet.properties = input.properties;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await db.update(conversations).set(updateSet).where(eq(conversations.id, input.id));

          return {
            ...existing,
            ...(updateSet.activeSubAgentId ? { activeSubAgentId: updateSet.activeSubAgentId } : {}),
            ...(input.userProperties !== undefined ? { userProperties: input.userProperties } : {}),
            ...(input.properties !== undefined ? { properties: input.properties } : {}),
          };
        }
        return existing;
      }
    }

    const newConversation: ConversationInsert = {
      id: conversationId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      userId: input.userId,
      agentId: input.agentId,
      activeSubAgentId: input.activeSubAgentId,
      title: input.title,
      lastContextResolution: input.lastContextResolution,
      metadata: input.metadata,
      userProperties: input.userProperties,
      properties: input.properties,
      ref: input.ref,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.insert(conversations).values(newConversation);
    return newConversation;
  };

/**
 * Extract text content from message content object
 */
function extractMessageText(content: MessageContent): string {
  if (content.text) {
    return content.text;
  }

  if (content.parts) {
    return content.parts
      .filter((part) => part.kind === 'text' && part.text)
      .map((part) => part.text)
      .join(' ');
  }

  return '';
}

/**
 * Apply context window management by truncating or summarizing old messages
 */
function applyContextWindowManagement(
  messageHistory: MessageSelect[],
  maxOutputTokens: number
): MessageSelect[] {
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);

  let totalTokens = 0;
  const managedHistory = [];

  for (let i = messageHistory.length - 1; i >= 0; i--) {
    const message = messageHistory[i];
    const messageText = extractMessageText(message.content);
    const messageTokens = estimateTokens(messageText);

    if (totalTokens + messageTokens <= maxOutputTokens) {
      managedHistory.unshift(message);
      totalTokens += messageTokens;
    } else {
      // Add a summary message for truncated history if there are more messages
      if (i > 0) {
        const referenceMessage = messageHistory[0];
        const summaryMessage: MessageSelect = {
          id: `summary-${getConversationId()}`,
          tenantId: referenceMessage.tenantId,
          projectId: referenceMessage.projectId,
          conversationId: referenceMessage.conversationId,
          role: 'system',
          fromSubAgentId: null,
          toSubAgentId: null,
          fromExternalAgentId: null,
          toExternalAgentId: null,
          fromTeamAgentId: null,
          toTeamAgentId: null,
          content: {
            text: `[Previous conversation history truncated - ${i + 1} earlier messages]`,
          },
          visibility: 'system',
          messageType: 'chat',
          taskId: null,
          parentMessageId: null,
          a2aTaskId: null,
          a2aSessionId: null,
          metadata: null,
          userProperties: null,
          properties: null,
          createdAt: referenceMessage.createdAt,
          updatedAt: referenceMessage.updatedAt,
        };
        managedHistory.unshift(summaryMessage);
      }
      break;
    }
  }

  return managedHistory;
}

/**
 * Get conversation history with filtering and context management
 */
export const getConversationHistory =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    options?: ConversationHistoryConfig;
  }): Promise<MessageSelect[]> => {
    const { scopes, conversationId, options = {} } = params;

    const {
      limit = options.limit ?? 50,
      includeInternal = options.includeInternal ?? false,
      maxOutputTokens,
      messageTypes,
    } = options;

    const whereConditions = [
      projectScopedWhere(messages, scopes),
      eq(messages.conversationId, conversationId),
    ];

    // Filter by visibility unless explicitly including internal messages
    if (!includeInternal) {
      whereConditions.push(eq(messages.visibility, 'user-facing'));
    }

    // Filter by messageTypes if specified
    if (messageTypes && messageTypes.length > 0) {
      whereConditions.push(inArray(messages.messageType, messageTypes));
    }

    const messageHistory: MessageSelect[] = await db
      .select()
      .from(messages)
      .where(and(...whereConditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    // Reverse to get chronological order (oldest first)
    const chronologicalHistory = messageHistory.reverse();

    // Apply context window management if maxOutputTokens is specified
    if (maxOutputTokens) {
      return applyContextWindowManagement(chronologicalHistory, maxOutputTokens);
    }

    return chronologicalHistory;
  };

/**
 * Get active agent for a conversation
 */
export const getActiveAgentForConversation =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; conversationId: string }) => {
    return await db.query.conversations.findFirst({
      where: and(
        projectScopedWhere(conversations, params.scopes),
        eq(conversations.id, params.conversationId)
      ),
    });
  };

/**
 * Set active agent for a conversation (upsert operation)
 */
export const setActiveAgentForConversation =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    subAgentId: string;
    agentId: string;
    ref: ResolvedRef;
    userId?: string;
    metadata?: ConversationMetadata;
    userProperties?: Record<string, unknown> | null;
    properties?: Record<string, unknown> | null;
  }): Promise<void> => {
    const now = new Date().toISOString();
    await db
      .insert(conversations)
      .values({
        id: params.conversationId,
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        activeSubAgentId: params.subAgentId,
        agentId: params.agentId,
        ref: params.ref,
        userId: params.userId,
        metadata: params.metadata,
        userProperties: params.userProperties,
        properties: params.properties,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [conversations.tenantId, conversations.projectId, conversations.id],
        set: {
          activeSubAgentId: params.subAgentId,
          updatedAt: now,
          ...(params.userProperties !== undefined ? { userProperties: params.userProperties } : {}),
          ...(params.properties !== undefined ? { properties: params.properties } : {}),
        },
      });
  };

export const setActiveAgentForThread =
  (db: AgentsRunDatabaseClient) =>
  async ({
    scopes,
    threadId,
    subAgentId,
    agentId,
    ref,
  }: {
    scopes: ProjectScopeConfig;
    threadId: string;
    subAgentId: string;
    agentId: string;
    ref: ResolvedRef;
  }) => {
    return setActiveAgentForConversation(db)({
      scopes,
      conversationId: threadId,
      subAgentId,
      agentId,
      ref,
    });
  };
