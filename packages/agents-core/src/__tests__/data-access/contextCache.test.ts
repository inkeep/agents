import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupTenantCache,
  clearContextConfigCache,
  clearConversationCache,
  getCacheEntry,
  getContextConfigCacheEntries,
  getConversationCacheEntries,
  invalidateHeadersCache,
  invalidateInvocationDefinitionsCache,
  setCacheEntry,
} from '../../data-access/contextCache';
import type { DatabaseClient } from '../../db/client';
import type { ContextCacheInsert } from '../../types/entities';
import { testDbClient } from '../setup';

describe('Context Cache Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testConversationId = 'test-conversation';
  const testContextConfigId = 'test-context-config';
  const testContextVariableKey = 'testVariable';

  beforeEach(async () => {
    db = testDbClient;
    vi.clearAllMocks();
  });

  describe('getCacheEntry', () => {
    it('should retrieve a cache entry', async () => {
      const expectedEntry = {
        id: 'cache-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        contextVariableKey: testContextVariableKey,
        value: { data: 'test-data' },
        requestHash: 'hash123',
        fetchedAt: '2024-01-01T00:00:00Z',
        fetchSource: 'test-source',
        fetchDurationMs: 100,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        contextCache: {
          findFirst: vi.fn().mockResolvedValue(expectedEntry),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getCacheEntry(mockDb)({
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        contextVariableKey: testContextVariableKey,
      });

      expect(mockQuery.contextCache.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedEntry);
    });

    it('should return null if cache entry not found', async () => {
      const mockQuery = {
        contextCache: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getCacheEntry(mockDb)({
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        contextVariableKey: testContextVariableKey,
      });

      expect(result).toBeNull();
    });

    it('should return null when request hash does not match', async () => {
      const cacheEntry = {
        id: 'cache-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        contextVariableKey: testContextVariableKey,
        value: { data: 'test-data' },
        requestHash: 'oldHash',
        fetchedAt: '2024-01-01T00:00:00Z',
        fetchSource: 'test-source',
        fetchDurationMs: 100,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        contextCache: {
          findFirst: vi.fn().mockResolvedValue(cacheEntry),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getCacheEntry(mockDb)({
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        contextVariableKey: testContextVariableKey,
        requestHash: 'newHash',
      });

      expect(result).toBeNull();
    });

    it('should return entry when request hash matches', async () => {
      const cacheEntry = {
        id: 'cache-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        contextVariableKey: testContextVariableKey,
        value: { data: 'test-data' },
        requestHash: 'matchingHash',
        fetchedAt: '2024-01-01T00:00:00Z',
        fetchSource: 'test-source',
        fetchDurationMs: 100,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        contextCache: {
          findFirst: vi.fn().mockResolvedValue(cacheEntry),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getCacheEntry(mockDb)({
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        contextVariableKey: testContextVariableKey,
        requestHash: 'matchingHash',
      });

      expect(result).not.toBeNull();
      expect(result?.requestHash).toBe('matchingHash');
    });

    it('should return null on database error', async () => {
      const mockQuery = {
        contextCache: {
          findFirst: vi.fn().mockRejectedValue(new Error('Database error')),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getCacheEntry(mockDb)({
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        contextVariableKey: testContextVariableKey,
      });

      expect(result).toBeNull();
    });

    it('should handle null requestHash in cache entry', async () => {
      const cacheEntry = {
        id: 'cache-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        contextVariableKey: testContextVariableKey,
        value: { data: 'test-data' },
        requestHash: null,
        fetchedAt: '2024-01-01T00:00:00Z',
        fetchSource: 'test-source',
        fetchDurationMs: 100,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        contextCache: {
          findFirst: vi.fn().mockResolvedValue(cacheEntry),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getCacheEntry(mockDb)({
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        contextVariableKey: testContextVariableKey,
        requestHash: 'someHash',
      });

      expect(result).not.toBeNull();
      expect(result?.requestHash).toBeNull();
    });
  });

  describe('setCacheEntry', () => {
    it('should set a cache entry successfully', async () => {
      const cacheEntry: ContextCacheInsert = {
        id: 'cache-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        contextVariableKey: testContextVariableKey,
        value: { data: 'test-data' },
        fetchedAt: '2024-01-01T00:00:00Z',
        requestHash: 'hash123',
      };

      const expectedResult = {
        ...cacheEntry,
        id: expect.any(String),
        fetchedAt: expect.any(String),
        fetchSource: `${testContextConfigId}:${testContextVariableKey}`,
        fetchDurationMs: 0,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedResult]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await setCacheEntry(mockDb)(cacheEntry);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('should handle cache entry without requestHash', async () => {
      const cacheEntry: ContextCacheInsert = {
        id: 'cache-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        contextVariableKey: testContextVariableKey,
        value: { data: 'test-data' },
        fetchedAt: '2024-01-01T00:00:00Z',
      };

      const expectedResult = {
        ...cacheEntry,
        id: expect.any(String),
        requestHash: null,
        fetchedAt: expect.any(String),
        fetchSource: `${testContextConfigId}:${testContextVariableKey}`,
        fetchDurationMs: 0,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedResult]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await setCacheEntry(mockDb)(cacheEntry);

      expect(result?.requestHash).toBeNull();
    });

    it('should return null on database error', async () => {
      const cacheEntry: ContextCacheInsert = {
        id: 'cache-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        contextVariableKey: testContextVariableKey,
        value: { data: 'test-data' },
        fetchedAt: '2024-01-01T00:00:00Z',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await setCacheEntry(mockDb)(cacheEntry);

      expect(result).toBeNull();
    });
  });

  describe('clearConversationCache', () => {
    it('should clear conversation cache successfully', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await clearConversationCache(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        conversationId: testConversationId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(5);
    });

    it('should handle case when no rows affected', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await clearConversationCache(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        conversationId: testConversationId,
      });

      expect(result).toBe(0);
    });

    it('should handle case when rowsAffected is undefined', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await clearConversationCache(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        conversationId: testConversationId,
      });

      expect(result).toBe(0);
    });

    it('should throw error on database failure', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      await expect(
        clearConversationCache(mockDb)({
          scopes: {
            tenantId: testTenantId,
            projectId: testProjectId,
          },
          conversationId: testConversationId,
        })
      ).rejects.toThrow('Database error');
    });
  });

  describe('clearContextConfigCache', () => {
    it('should clear context config cache successfully', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: `${i + 1}` }))),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await clearContextConfigCache(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        contextConfigId: testContextConfigId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(10);
    });

    it('should throw error on database failure', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      await expect(
        clearContextConfigCache(mockDb)({
          scopes: {
            tenantId: testTenantId,
            projectId: testProjectId,
          },
          contextConfigId: testContextConfigId,
        })
      ).rejects.toThrow('Database error');
    });
  });

  describe('cleanupTenantCache', () => {
    it('should cleanup tenant cache successfully', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue(Array.from({ length: 25 }, (_, i) => ({ id: `${i + 1}` }))),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await cleanupTenantCache(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(25);
    });

    it('should throw error on database failure', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      await expect(
        cleanupTenantCache(mockDb)({
          scopes: {
            tenantId: testTenantId,
            projectId: testProjectId,
          },
        })
      ).rejects.toThrow('Database error');
    });
  });

  describe('invalidateHeadersCache', () => {
    it('should invalidate headers cache successfully', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: '1' }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await invalidateHeadersCache(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(1);
    });

    it('should throw error on database failure', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      await expect(
        invalidateHeadersCache(mockDb)({
          scopes: {
            tenantId: testTenantId,
            projectId: testProjectId,
          },
          conversationId: testConversationId,
          contextConfigId: testContextConfigId,
        })
      ).rejects.toThrow('Database error');
    });
  });

  describe('invalidateInvocationDefinitionsCache', () => {
    it('should invalidate invocation definitions cache successfully', async () => {
      const definitionIds = ['def1', 'def2', 'def3'];

      const mockDelete = vi
        .fn()
        .mockReturnValueOnce({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: '1' }]),
          }),
        })
        .mockReturnValueOnce({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: '2' }, { id: '3' }]),
          }),
        })
        .mockReturnValueOnce({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: '4' }]),
          }),
        });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await invalidateInvocationDefinitionsCache(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        invocationDefinitionIds: definitionIds,
      });

      expect(mockDelete).toHaveBeenCalledTimes(3);
      expect(result).toBe(4); // 1 + 2 + 1
    });

    it('should handle empty definition IDs', async () => {
      const mockDb = {
        ...db,
        delete: vi.fn(),
      } as any;

      const result = await invalidateInvocationDefinitionsCache(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        invocationDefinitionIds: [],
      });

      expect(mockDb.delete).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('should handle case when rowsAffected is undefined', async () => {
      const definitionIds = ['def1'];

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await invalidateInvocationDefinitionsCache(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        conversationId: testConversationId,
        contextConfigId: testContextConfigId,
        invocationDefinitionIds: definitionIds,
      });

      expect(result).toBe(0);
    });

    it('should throw error on database failure', async () => {
      const definitionIds = ['def1'];

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      await expect(
        invalidateInvocationDefinitionsCache(mockDb)({
          scopes: {
            tenantId: testTenantId,
            projectId: testProjectId,
          },
          conversationId: testConversationId,
          contextConfigId: testContextConfigId,
          invocationDefinitionIds: definitionIds,
        })
      ).rejects.toThrow('Database error');
    });
  });

  describe('getConversationCacheEntries', () => {
    it('should get all cache entries for a conversation', async () => {
      const expectedEntries = [
        {
          id: 'cache-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          conversationId: testConversationId,
          contextConfigId: testContextConfigId,
          contextVariableKey: 'var1',
          value: { data: 'data1' },
          requestHash: 'hash1',
          fetchedAt: '2024-01-01T00:00:00Z',
          fetchSource: 'source1',
          fetchDurationMs: 100,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'cache-2',
          tenantId: testTenantId,
          projectId: testProjectId,
          conversationId: testConversationId,
          contextConfigId: testContextConfigId,
          contextVariableKey: 'var2',
          value: { data: 'data2' },
          requestHash: 'hash2',
          fetchedAt: '2024-01-01T00:00:00Z',
          fetchSource: 'source2',
          fetchDurationMs: 200,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockQuery = {
        contextCache: {
          findMany: vi.fn().mockResolvedValue(expectedEntries),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getConversationCacheEntries(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        conversationId: testConversationId,
      });

      expect(mockQuery.contextCache.findMany).toHaveBeenCalled();
      expect(result).toEqual(expectedEntries);
    });

    it('should return empty array when no entries found', async () => {
      const mockQuery = {
        contextCache: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getConversationCacheEntries(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        conversationId: testConversationId,
      });

      expect(result).toEqual([]);
    });
  });

  describe('getContextConfigCacheEntries', () => {
    it('should get all cache entries for a context config', async () => {
      const expectedEntries = [
        {
          id: 'cache-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          conversationId: 'conv1',
          contextConfigId: testContextConfigId,
          contextVariableKey: 'var1',
          value: { data: 'data1' },
        },
        {
          id: 'cache-2',
          tenantId: testTenantId,
          projectId: testProjectId,
          conversationId: 'conv2',
          contextConfigId: testContextConfigId,
          contextVariableKey: 'var2',
          value: { data: 'data2' },
        },
      ];

      const mockQuery = {
        contextCache: {
          findMany: vi.fn().mockResolvedValue(expectedEntries),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getContextConfigCacheEntries(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        contextConfigId: testContextConfigId,
      });

      expect(mockQuery.contextCache.findMany).toHaveBeenCalled();
      expect(result).toEqual(expectedEntries);
    });

    it('should return empty array when no entries found', async () => {
      const mockQuery = {
        contextCache: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getContextConfigCacheEntries(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        contextConfigId: testContextConfigId,
      });

      expect(result).toEqual([]);
    });
  });
});
