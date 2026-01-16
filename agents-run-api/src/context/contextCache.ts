import {
  type ContextCacheSelect,
  cleanupTenantCache,
  clearContextConfigCache,
  clearConversationCache,
  type FullExecutionContext,
  generateId,
  getCacheEntry,
  getLogger,
  invalidateHeadersCache,
  invalidateInvocationDefinitionsCache,
  setCacheEntry,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';

const logger = getLogger('context-cache');

export interface CacheEntry {
  contextConfigId: string;
  contextVariableKey: string;
  conversationId: string;
  value: unknown;
  requestHash?: string;
  tenantId: string;
}

/**
 * Context cache with request hash-based invalidation and graceful error handling.
 *
 * Implements conversation-scoped caching with smart cache invalidation based on
 * request hash changes. All cache errors are treated as cache misses to ensure
 * system reliability.
 */
export class ContextCache {
  private executionContext: FullExecutionContext;
  constructor(executionContext: FullExecutionContext) {
    this.executionContext = executionContext;
    logger.info(
      {
        tenantId: this.executionContext.tenantId,
      },
      'ContextCache initialized'
    );
  }

  /**
   * Get cached context data for a conversation
   */
  async get({
    conversationId,
    contextConfigId,
    contextVariableKey,
    requestHash,
  }: {
    conversationId: string;
    contextConfigId: string;
    contextVariableKey: string;
    requestHash?: string;
  }): Promise<CacheEntry | null> {
    try {
      let cacheEntry: ContextCacheSelect | null;

      cacheEntry = await getCacheEntry(dbClient)({
        conversationId,
        contextConfigId,
        contextVariableKey,
        requestHash,
      });
      if (!cacheEntry) {
        return null;
      }
      return {
        contextConfigId: cacheEntry.contextConfigId,
        contextVariableKey: cacheEntry.contextVariableKey,
        conversationId: cacheEntry.conversationId,
        value: cacheEntry.value,
        requestHash: cacheEntry.requestHash || undefined,
        tenantId: this.executionContext.tenantId,
      };
    } catch (error) {
      logger.error(
        {
          conversationId,
          contextConfigId,
          contextVariableKey,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get cache entry'
      );
      // Graceful degradation: treat cache errors as cache misses
      // This ensures the system continues to function even if caching fails
      return null;
    }
  }

  /**
   * Set cached context data for a conversation
   */
  async set(entry: CacheEntry): Promise<void> {
    try {
      const { tenantId, projectId } = this.executionContext;
      const cacheData = {
        id: generateId(),
        tenantId,
        projectId,
        conversationId: entry.conversationId,
        contextConfigId: entry.contextConfigId,
        contextVariableKey: entry.contextVariableKey,
        value: entry.value as any,
        requestHash: entry.requestHash,
        fetchedAt: new Date().toISOString(),
        fetchSource: `${entry.contextConfigId}:${entry.contextVariableKey}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ref: this.executionContext.resolvedRef,
      };

      await setCacheEntry(dbClient)(cacheData);

      logger.debug(
        {
          conversationId: entry.conversationId,
          contextConfigId: entry.contextConfigId,
          contextVariableKey: entry.contextVariableKey,
        },
        'Cache entry set successfully'
      );
    } catch (error) {
      logger.error(
        {
          conversationId: entry.conversationId,
          contextConfigId: entry.contextConfigId,
          contextVariableKey: entry.contextVariableKey,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to set cache entry'
      );
      // Don't throw - caching failures shouldn't break context resolution
    }
  }

  /**
   * Clear cache entries for a specific conversation
   */
  async clearConversation(
    tenantId: string,
    projectId: string,
    conversationId: string
  ): Promise<void> {
    try {
      let result: number | undefined;
      result = await clearConversationCache(dbClient)({
        scopes: { tenantId, projectId },
        conversationId,
      });

      logger.info(
        {
          conversationId,
          rowsCleared: result,
        },
        'Conversation cache cleared successfully'
      );
    } catch (error) {
      logger.error(
        {
          conversationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to clear conversation cache'
      );
      throw error;
    }
  }

  /**
   * Clear all cache entries for a specific context configuration
   */
  async clearContextConfig(
    tenantId: string,
    projectId: string,
    contextConfigId: string
  ): Promise<void> {
    try {
      const result = await clearContextConfigCache(dbClient)({
        scopes: { tenantId, projectId },
        contextConfigId,
      });

      logger.info(
        {
          contextConfigId,
          rowsCleared: result,
        },
        'Context config cache cleared successfully'
      );
    } catch (error) {
      logger.error(
        {
          contextConfigId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to clear context config cache'
      );
      throw error;
    }
  }

  /**
   * Clean up expired or orphaned cache entries
   */
  async cleanup(): Promise<void> {
    try {
      const { tenantId, projectId } = this.executionContext;
      const result = await cleanupTenantCache(dbClient)({
        scopes: { tenantId, projectId },
      });

      logger.info(
        {
          rowsCleared: result,
        },
        'Cache cleanup completed'
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to cleanup cache'
      );
      throw error;
    }
  }

  async invalidateInvocationDefinitions(
    tenantId: string,
    projectId: string,
    conversationId: string,
    contextConfigId: string,
    definitionIds: string[]
  ): Promise<void> {
    await invalidateInvocationDefinitionsCache(dbClient)({
      scopes: { tenantId, projectId },
      conversationId,
      contextConfigId,
      invocationDefinitionIds: definitionIds,
    });
  }

  async invalidateHeaders(
    tenantId: string,
    projectId: string,
    conversationId: string,
    contextConfigId: string
  ): Promise<void> {
    await invalidateHeadersCache(dbClient)({
      scopes: { tenantId, projectId },
      conversationId,
      contextConfigId,
    });
  }
}
