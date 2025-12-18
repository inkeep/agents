import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { conversations, tasks, contextCache, apiKeys } from '../../db/runtime/runtime-schema';
import type { ProjectScopeConfig, AgentScopeConfig } from '../../types/index';

/**
 * Result of a cascade delete operation
 */
export type CascadeDeleteResult = {
  conversationsDeleted: number;
  tasksDeleted: number;
  contextCacheDeleted: number;
  apiKeysDeleted: number;
};

/**
 * Delete all runtime entities for a specific branch.
 * PostgreSQL cascades handle: messages, taskRelations, ledgerArtifacts
 *
 * @param db - Runtime database client
 * @returns Function that performs the cascade delete
 */
export const cascadeDeleteByBranch =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    fullBranchName: string;
  }): Promise<CascadeDeleteResult> => {
    const { scopes, fullBranchName } = params;

    // Delete contextCache entries for this branch
    // (also cascades when conversations are deleted, but some may be orphaned)
    const contextCacheResult = await db
      .delete(contextCache)
      .where(
        and(
          eq(contextCache.tenantId, scopes.tenantId),
          eq(contextCache.projectId, scopes.projectId),
          sql`${contextCache.ref}->>'name' = ${fullBranchName}`
        )
      )
      .returning();

    // Delete conversations for this branch (cascades to messages)
    const conversationsResult = await db
      .delete(conversations)
      .where(
        and(
          eq(conversations.tenantId, scopes.tenantId),
          eq(conversations.projectId, scopes.projectId),
          sql`${conversations.ref}->>'name' = ${fullBranchName}`
        )
      )
      .returning();

    // Delete tasks for this branch (cascades to ledgerArtifacts, taskRelations)
    const tasksResult = await db
      .delete(tasks)
      .where(
        and(
          eq(tasks.tenantId, scopes.tenantId),
          eq(tasks.projectId, scopes.projectId),
          sql`${tasks.ref}->>'name' = ${fullBranchName}`
        )
      )
      .returning();

    return {
      conversationsDeleted: conversationsResult.length,
      tasksDeleted: tasksResult.length,
      contextCacheDeleted: contextCacheResult.length,
      apiKeysDeleted: 0, // API keys are branch-agnostic
    };
  };

/**
 * Delete all runtime entities for a project on a specific branch.
 * Used when deleting a project from a branch.
 * PostgreSQL cascades handle: messages, taskRelations, ledgerArtifacts
 *
 * @param db - Runtime database client
 * @returns Function that performs the cascade delete
 */
export const cascadeDeleteByProject =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    fullBranchName: string;
  }): Promise<CascadeDeleteResult> => {
    const { scopes, fullBranchName } = params;

    // Delete contextCache for this project on this branch
    const contextCacheResult = await db
      .delete(contextCache)
      .where(
        and(
          eq(contextCache.tenantId, scopes.tenantId),
          eq(contextCache.projectId, scopes.projectId),
          sql`${contextCache.ref}->>'name' = ${fullBranchName}`
        )
      )
      .returning();

    // Delete conversations for this project on this branch (cascades to messages)
    const conversationsResult = await db
      .delete(conversations)
      .where(
        and(
          eq(conversations.tenantId, scopes.tenantId),
          eq(conversations.projectId, scopes.projectId),
          sql`${conversations.ref}->>'name' = ${fullBranchName}`
        )
      )
      .returning();

    // Delete tasks for this project on this branch (cascades to ledgerArtifacts, taskRelations)
    const tasksResult = await db
      .delete(tasks)
      .where(
        and(
          eq(tasks.tenantId, scopes.tenantId),
          eq(tasks.projectId, scopes.projectId),
          sql`${tasks.ref}->>'name' = ${fullBranchName}`
        )
      )
      .returning();

    // Delete all API keys for this project (API keys are branch-agnostic)
    const apiKeysResult = await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.tenantId, scopes.tenantId), eq(apiKeys.projectId, scopes.projectId)))
      .returning();

    return {
      conversationsDeleted: conversationsResult.length,
      tasksDeleted: tasksResult.length,
      contextCacheDeleted: contextCacheResult.length,
      apiKeysDeleted: apiKeysResult.length,
    };
  };

/**
 * Delete all runtime entities for a specific agent on a specific branch.
 * This includes tasks for the agent and conversations where the agent's
 * subAgents are active.
 *
 * @param db - Runtime database client
 * @returns Function that performs the cascade delete
 */
export const cascadeDeleteByAgent =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    fullBranchName: string;
    subAgentIds: string[];
  }): Promise<CascadeDeleteResult> => {
    const { scopes, fullBranchName, subAgentIds } = params;

    let contextCacheDeleted = 0;
    let conversationsDeleted = 0;
    let tasksDeleted = 0;
    let apiKeysDeleted = 0;

    if (subAgentIds.length > 0) {
      // Find conversations where activeSubAgentId is one of this agent's subAgents
      const conversationsToDelete = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.tenantId, scopes.tenantId),
            eq(conversations.projectId, scopes.projectId),
            inArray(conversations.activeSubAgentId, subAgentIds),
            sql`${conversations.ref}->>'name' = ${fullBranchName}`
          )
        );

      const conversationIds = conversationsToDelete.map((c) => c.id);

      if (conversationIds.length > 0) {
        // Delete contextCache for these conversations
        const contextCacheResult = await db
          .delete(contextCache)
          .where(
            and(
              eq(contextCache.tenantId, scopes.tenantId),
              eq(contextCache.projectId, scopes.projectId),
              inArray(contextCache.conversationId, conversationIds)
            )
          )
          .returning();
        contextCacheDeleted = contextCacheResult.length;

        // Delete the conversations (cascades to messages)
        const conversationsResult = await db
          .delete(conversations)
          .where(
            and(
              eq(conversations.tenantId, scopes.tenantId),
              eq(conversations.projectId, scopes.projectId),
              inArray(conversations.id, conversationIds)
            )
          )
          .returning();
        conversationsDeleted = conversationsResult.length;
      }
    }

    // Delete tasks for this agent (cascades to ledgerArtifacts, taskRelations)
    const tasksResult = await db
      .delete(tasks)
      .where(
        and(
          eq(tasks.tenantId, scopes.tenantId),
          eq(tasks.projectId, scopes.projectId),
          eq(tasks.agentId, scopes.agentId),
          sql`${tasks.ref}->>'name' = ${fullBranchName}`
        )
      )
      .returning();
    tasksDeleted = tasksResult.length;

    // Delete API keys for this agent
    const apiKeysResult = await db
      .delete(apiKeys)
      .where(
        and(
          eq(apiKeys.tenantId, scopes.tenantId),
          eq(apiKeys.projectId, scopes.projectId),
          eq(apiKeys.agentId, scopes.agentId)
        )
      )
      .returning();
    apiKeysDeleted = apiKeysResult.length;

    return {
      conversationsDeleted,
      tasksDeleted,
      contextCacheDeleted,
      apiKeysDeleted,
    };
  };

/**
 * Delete all runtime entities for a specific subAgent on a specific branch.
 *
 * @param db - Runtime database client
 * @returns Function that performs the cascade delete
 */
export const cascadeDeleteBySubAgent =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    subAgentId: string;
    fullBranchName: string;
  }): Promise<CascadeDeleteResult> => {
    const { scopes, subAgentId, fullBranchName } = params;

    // Find conversations where this subAgent is active
    const conversationsToDelete = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, scopes.tenantId),
          eq(conversations.projectId, scopes.projectId),
          eq(conversations.activeSubAgentId, subAgentId),
          sql`${conversations.ref}->>'name' = ${fullBranchName}`
        )
      );

    const conversationIds = conversationsToDelete.map((c) => c.id);

    let contextCacheDeleted = 0;
    let conversationsDeleted = 0;

    if (conversationIds.length > 0) {
      // Delete contextCache for these conversations
      const contextCacheResult = await db
        .delete(contextCache)
        .where(
          and(
            eq(contextCache.tenantId, scopes.tenantId),
            eq(contextCache.projectId, scopes.projectId),
            inArray(contextCache.conversationId, conversationIds)
          )
        )
        .returning();
      contextCacheDeleted = contextCacheResult.length;

      // Delete the conversations (cascades to messages)
      const conversationsResult = await db
        .delete(conversations)
        .where(
          and(
            eq(conversations.tenantId, scopes.tenantId),
            eq(conversations.projectId, scopes.projectId),
            inArray(conversations.id, conversationIds)
          )
        )
        .returning();
      conversationsDeleted = conversationsResult.length;
    }

    // Delete tasks for this subAgent (cascades to ledgerArtifacts, taskRelations)
    const tasksResult = await db
      .delete(tasks)
      .where(
        and(
          eq(tasks.tenantId, scopes.tenantId),
          eq(tasks.projectId, scopes.projectId),
          eq(tasks.subAgentId, subAgentId),
          sql`${tasks.ref}->>'name' = ${fullBranchName}`
        )
      )
      .returning();

    return {
      conversationsDeleted,
      tasksDeleted: tasksResult.length,
      contextCacheDeleted,
      apiKeysDeleted: 0, // API keys are agent-level, not subAgent-level
    };
  };

/**
 * Delete contextCache entries for a specific contextConfig.
 * Used when deleting a contextConfig from the manage DB.
 *
 * @param db - Runtime database client
 * @returns Function that performs the delete
 */
export const cascadeDeleteByContextConfig =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    contextConfigId: string;
    fullBranchName: string;
  }): Promise<{ contextCacheDeleted: number }> => {
    const { scopes, contextConfigId, fullBranchName } = params;

    const result = await db
      .delete(contextCache)
      .where(
        and(
          eq(contextCache.tenantId, scopes.tenantId),
          eq(contextCache.projectId, scopes.projectId),
          eq(contextCache.contextConfigId, contextConfigId),
          sql`${contextCache.ref}->>'name' = ${fullBranchName}`
        )
      )
      .returning();

    return {
      contextCacheDeleted: result.length,
    };
  };
