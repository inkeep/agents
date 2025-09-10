import { nanoid } from 'nanoid';
import {
  cleanupTenantCache,
  clearContextConfigCache,
  clearConversationCache,
  getCacheEntry,
  invalidateInvocationDefinitionsCache,
  invalidateRequestContextCache,
  setCacheEntry,
} from '../data-access/index.js';
import type { DatabaseClient } from '../db/client.js';
import { getLogger } from '../utils/logger.js';

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
  private tenantId: string;
  private projectId: string;
  private dbClient: DatabaseClient;

  constructor(tenantId: string, projectId: string, dbClient: DatabaseClient) {
    this.tenantId = tenantId;
    this.projectId = projectId;
    this.dbClient = dbClient;

    logger.info(
      {
        tenantId: this.tenantId,
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
      const cacheEntry = await getCacheEntry(this.dbClient)({
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
        tenantId: this.tenantId,
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
      const cacheData = {
        id: nanoid(),
        tenantId: this.tenantId,
        projectId: this.projectId,
        conversationId: entry.conversationId,
        contextConfigId: entry.contextConfigId,
        contextVariableKey: entry.contextVariableKey,
        value: entry.value as any,
        requestHash: entry.requestHash,
        fetchedAt: new Date().toISOString(),
        fetchSource: `${entry.contextConfigId}:${entry.contextVariableKey}`,
        fetchDurationMs: 0, // Will be updated by the resolver
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setCacheEntry(this.dbClient)(cacheData);

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
      const result = await clearConversationCache(this.dbClient)({
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
      const result = await clearContextConfigCache(this.dbClient)({
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
      const result = await cleanupTenantCache(this.dbClient)({
        scopes: { tenantId: this.tenantId, projectId: this.projectId },
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
    await invalidateInvocationDefinitionsCache(this.dbClient)({
      scopes: { tenantId, projectId },
      conversationId,
      contextConfigId,
      invocationDefinitionIds: definitionIds,
    });
  }

  async invalidateRequestContext(
    tenantId: string,
    projectId: string,
    conversationId: string,
    contextConfigId: string
  ): Promise<void> {
    await invalidateRequestContextCache(this.dbClient)({
      scopes: { tenantId, projectId },
      conversationId,
      contextConfigId,
    });
  }
}
