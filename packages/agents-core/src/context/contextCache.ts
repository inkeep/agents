import {
  cleanupTenantCache,
  clearContextConfigCache,
  clearConversationCache,
  getCacheEntry,
  invalidateHeadersCache,
  invalidateInvocationDefinitionsCache,
  setCacheEntry,
} from '../data-access/index';
import type { DatabaseClient } from '../db/client';
import { executeInBranch } from '../dolt/branch-scoped-execution';
import type { ResolvedRef } from '../dolt/ref';
import type { ContextCacheSelect } from '../types/entities';
import { generateId } from '../utils/conversations';
import { getLogger } from '../utils/logger';

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
  private ref?: ResolvedRef;
  constructor(tenantId: string, projectId: string, dbClient: DatabaseClient, ref?: ResolvedRef) {
    this.tenantId = tenantId;
    this.projectId = projectId;
    this.dbClient = dbClient;
    this.ref = ref;
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
      let cacheEntry: ContextCacheSelect | null;
      if (this.ref) {
        cacheEntry = await executeInBranch(
          {
            dbClient: this.dbClient,
            ref: this.ref,
          },
          async (db) => {
            return await getCacheEntry(db)({
              conversationId,
              contextConfigId,
              contextVariableKey,
              requestHash,
            });
          }
        );
      } else {
        cacheEntry = await getCacheEntry(this.dbClient)({
          conversationId,
          contextConfigId,
          contextVariableKey,
          requestHash,
        });
      }
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
        id: generateId(),
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

      if (this.ref) {
        await executeInBranch(
          {
            dbClient: this.dbClient,
            ref: this.ref,
            autoCommit: true,
            commitMessage: 'Set cache entry',
          },
          async (db) => {
            return await setCacheEntry(db)(cacheData);
          }
        );
      } else {
        await setCacheEntry(this.dbClient)(cacheData);
      }

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
      if (this.ref) {
        result = await executeInBranch(
          {
            dbClient: this.dbClient,
            ref: this.ref,
            autoCommit: true,
            commitMessage: 'Clear conversation cache',
          },
          async (db) => {
            return await clearConversationCache(db)({
              scopes: { tenantId, projectId },
              conversationId,
            });
          }
        );
      } else {
        result = await clearConversationCache(this.dbClient)({
          scopes: { tenantId, projectId },
          conversationId,
        });
      }

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
      let result: number | undefined;
      if (this.ref) {
        result = await executeInBranch(
          {
            dbClient: this.dbClient,
            ref: this.ref,
            autoCommit: true,
            commitMessage: 'Clear context config cache',
          },
          async (db) => {
            return await clearContextConfigCache(db)({
              scopes: { tenantId, projectId },
              contextConfigId,
            });
          }
        );
      } else {
        result = await clearContextConfigCache(this.dbClient)({
          scopes: { tenantId, projectId },
          contextConfigId,
        });
      }

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
      let result: number | undefined;
      if (this.ref) {
        result = await executeInBranch(
          {
            dbClient: this.dbClient,
            ref: this.ref,
            autoCommit: true,
            commitMessage: 'Cleanup tenant cache',
          },
          async (db) => {
            return await cleanupTenantCache(db)({
              scopes: { tenantId: this.tenantId, projectId: this.projectId },
            });
          }
        );
      } else {
        result = await cleanupTenantCache(this.dbClient)({
          scopes: { tenantId: this.tenantId, projectId: this.projectId },
        });
      }
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
    let result: number | undefined;
    if (this.ref) {
      result = await executeInBranch(
        {
          dbClient: this.dbClient,
          ref: this.ref,
          autoCommit: true,
          commitMessage: 'Invalidate invocation definitions cache',
        },
        async (db) => {
          return await invalidateInvocationDefinitionsCache(db)({
            scopes: { tenantId, projectId },
            conversationId,
            contextConfigId,
            invocationDefinitionIds: definitionIds,
          });
        }
      );
    } else {
      result = await invalidateInvocationDefinitionsCache(this.dbClient)({
        scopes: { tenantId, projectId },
        conversationId,
        contextConfigId,
        invocationDefinitionIds: definitionIds,
      });
    }
  }

  async invalidateHeaders(
    tenantId: string,
    projectId: string,
    conversationId: string,
    contextConfigId: string
  ): Promise<void> {
    let result: number | undefined;
    if (this.ref) {
      result = await executeInBranch(
        {
          dbClient: this.dbClient,
          ref: this.ref,
          autoCommit: true,
          commitMessage: 'Invalidate headers cache',
        },
        async (db) => {
          return await invalidateHeadersCache(db)({
            scopes: { tenantId, projectId },
            conversationId,
            contextConfigId,
          });
        }
      );
    } else {
      result = await invalidateHeadersCache(this.dbClient)({
        scopes: { tenantId, projectId },
        conversationId,
        contextConfigId,
      });
    }
  }
}
