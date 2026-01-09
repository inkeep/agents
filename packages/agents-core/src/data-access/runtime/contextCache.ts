import { and, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { contextCache } from '../../db/runtime/runtime-schema';
import type { ContextCacheInsert, ContextCacheSelect } from '../../types/entities';
import type { ProjectScopeConfig } from '../../types/utility';
import { generateId } from '../../utils/conversations';

/**
 * Get cached context data for a conversation with optional request hash validation
 */
export const getCacheEntry =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    conversationId: string;
    contextConfigId: string;
    contextVariableKey: string;
    requestHash?: string;
  }): Promise<ContextCacheSelect | null> => {
    try {
      const cacheEntry = await db.query.contextCache.findFirst({
        where: and(
          eq(contextCache.conversationId, params.conversationId),
          eq(contextCache.contextConfigId, params.contextConfigId),
          eq(contextCache.contextVariableKey, params.contextVariableKey)
        ),
      });

      if (!cacheEntry) {
        return null;
      }

      if (
        params.requestHash &&
        cacheEntry.requestHash &&
        cacheEntry.requestHash !== params.requestHash
      ) {
        return null; // Cache entry request hash mismatch, treating as miss
      }

      return {
        ...cacheEntry,
        value: cacheEntry.value as any,
      };
    } catch {
      // Graceful degradation: treat cache errors as cache misses
      return null;
    }
  };

/**
 * Set cached context data for a conversation
 */
export const setCacheEntry =
  (db: AgentsRunDatabaseClient) =>
  async (entry: ContextCacheInsert): Promise<ContextCacheSelect | null> => {
    try {
      const cacheData = {
        id: generateId(),
        tenantId: entry.tenantId,
        projectId: entry.projectId,
        conversationId: entry.conversationId,
        contextConfigId: entry.contextConfigId,
        contextVariableKey: entry.contextVariableKey,
        value: entry.value,
        requestHash: entry.requestHash || null,
        fetchedAt: new Date().toISOString(),
        fetchSource: `${entry.contextConfigId}:${entry.contextVariableKey}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ref: entry.ref,
      };

      const [result] = await db.insert(contextCache).values(cacheData).returning();
      return {
        ...result,
        value: result.value as any,
      };
    } catch {
      // Don't throw - caching failures shouldn't break context resolution
      return null;
    }
  };

/**
 * Clear cache entries for a specific conversation
 */
export const clearConversationCache =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; conversationId: string }): Promise<number> => {
    const result = await db
      .delete(contextCache)
      .where(
        and(
          eq(contextCache.tenantId, params.scopes.tenantId),
          eq(contextCache.projectId, params.scopes.projectId),
          eq(contextCache.conversationId, params.conversationId)
        )
      )
      .returning();

    return result.length;
  };

/**
 * Clear all cache entries for a specific context configuration
 */
export const clearContextConfigCache =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; contextConfigId: string }): Promise<number> => {
    const result = await db
      .delete(contextCache)
      .where(
        and(
          eq(contextCache.tenantId, params.scopes.tenantId),
          eq(contextCache.projectId, params.scopes.projectId),
          eq(contextCache.contextConfigId, params.contextConfigId)
        )
      )
      .returning();

    return result.length;
  };

/**
 * Clean up all cache entries for a tenant
 */
export const cleanupTenantCache =
  (db: AgentsRunDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<number> => {
    const result = await db
      .delete(contextCache)
      .where(
        and(
          eq(contextCache.tenantId, params.scopes.tenantId),
          eq(contextCache.projectId, params.scopes.projectId)
        )
      )
      .returning();

    return result.length;
  };

/**
 * Invalidate the headers cache for a conversation
 */
export const invalidateHeadersCache =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    contextConfigId: string;
  }): Promise<number> => {
    const result = await db
      .delete(contextCache)
      .where(
        and(
          eq(contextCache.tenantId, params.scopes.tenantId),
          eq(contextCache.projectId, params.scopes.projectId),
          eq(contextCache.conversationId, params.conversationId),
          eq(contextCache.contextConfigId, params.contextConfigId),
          eq(contextCache.contextVariableKey, 'headers')
        )
      )
      .returning();

    return result.length;
  };

/**
 * Invalidate specific cache entries for invocation-trigger definitions
 */
export const invalidateInvocationDefinitionsCache =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    contextConfigId: string;
    invocationDefinitionIds: string[];
  }): Promise<number> => {
    let totalRowsAffected = 0;

    for (const definitionId of params.invocationDefinitionIds) {
      const result = await db
        .delete(contextCache)
        .where(
          and(
            eq(contextCache.tenantId, params.scopes.tenantId),
            eq(contextCache.projectId, params.scopes.projectId),
            eq(contextCache.conversationId, params.conversationId),
            eq(contextCache.contextConfigId, params.contextConfigId),
            eq(contextCache.contextVariableKey, definitionId)
          )
        )
        .returning();

      totalRowsAffected += result.length;
    }

    return totalRowsAffected;
  };

/**
 * Get all cache entries for a conversation
 */
export const getConversationCacheEntries =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
  }): Promise<ContextCacheSelect[]> => {
    const result = await db.query.contextCache.findMany({
      where: and(
        eq(contextCache.tenantId, params.scopes.tenantId),
        eq(contextCache.projectId, params.scopes.projectId),
        eq(contextCache.conversationId, params.conversationId)
      ),
    });

    return result.map((entry) => ({
      ...entry,
      value: entry.value as any,
    }));
  };

/**
 * Get all cache entries for a context configuration
 */
export const getContextConfigCacheEntries =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    contextConfigId: string;
  }): Promise<ContextCacheSelect[]> => {
    const result = await db.query.contextCache.findMany({
      where: and(
        eq(contextCache.tenantId, params.scopes.tenantId),
        eq(contextCache.projectId, params.scopes.projectId),
        eq(contextCache.contextConfigId, params.contextConfigId)
      ),
    });

    return result.map((entry) => ({
      ...entry,
      value: entry.value as any,
    }));
  };
