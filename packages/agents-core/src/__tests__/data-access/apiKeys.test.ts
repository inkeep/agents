import type { ApiKeyInsert } from '@inkeep/agents-core/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countApiKeys,
  createApiKey,
  deleteApiKey,
  getApiKeyById,
  getApiKeyByPublicId,
  hasApiKey,
  listApiKeys,
  listApiKeysPaginated,
  updateApiKey,
  updateApiKeyLastUsed,
} from '../../data-access/apiKeys';
import type { DatabaseClient } from '../../db/client';
import {
  extractPublicId,
  generateApiKey,
  hashApiKey,
  isApiKeyExpired,
  maskApiKey,
  validateApiKey,
} from '../../utils/apiKeys';
import { testDbClient } from '../setup';

describe('API Keys Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testAgentId = 'test-agent';

  beforeEach(async () => {
    db = testDbClient;
    vi.clearAllMocks();
  });

  describe('getApiKeyById', () => {
    it('should retrieve an API key by id', async () => {
      const apiKeyId = 'key-1';
      const expectedApiKey = {
        id: apiKeyId,
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        publicId: 'pub-1',
        keyPrefix: 'ik_test',
        keyHash: 'hash123',
      } satisfies ApiKeyInsert;

      const mockQuery = {
        apiKeys: {
          findFirst: vi.fn().mockResolvedValue(expectedApiKey),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getApiKeyById(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: apiKeyId,
      });

      expect(mockQuery.apiKeys.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedApiKey);
    });

    it('should return null if API key not found', async () => {
      const mockQuery = {
        apiKeys: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getApiKeyById(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('getApiKeyByPublicId', () => {
    it('should retrieve an API key by public id', async () => {
      const publicId = 'pub-1';
      const expectedApiKey = {
        id: 'key-1',
        publicId,
        tenantId: testTenantId,
        projectId: testProjectId,
      };

      const mockQuery = {
        apiKeys: {
          findFirst: vi.fn().mockResolvedValue(expectedApiKey),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getApiKeyByPublicId(mockDb)(publicId);

      expect(mockQuery.apiKeys.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedApiKey);
    });

    it('should return null if API key not found by public id', async () => {
      const mockQuery = {
        apiKeys: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getApiKeyByPublicId(mockDb)('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('listApiKeys', () => {
    it('should list API keys with agentId filter', async () => {
      const expectedApiKeys = [
        { id: 'key-1', agentId: testAgentId, keyPrefix: 'ik_test_1' },
        { id: 'key-2', agentId: testAgentId, keyPrefix: 'ik_test_2' },
      ];

      const mockQuery = {
        apiKeys: {
          findMany: vi.fn().mockResolvedValue(expectedApiKeys),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await listApiKeys(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        agentId: testAgentId,
      });

      expect(mockQuery.apiKeys.findMany).toHaveBeenCalled();
      expect(result).toEqual(expectedApiKeys);
    });

    it('should list API keys without agentId filter', async () => {
      const expectedApiKeys = [
        { id: 'key-1', agentId: 'agent-1', keyPrefix: 'ik_test_1' },
        { id: 'key-2', agentId: 'agent-2', keyPrefix: 'ik_test_2' },
      ];

      const mockQuery = {
        apiKeys: {
          findMany: vi.fn().mockResolvedValue(expectedApiKeys),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await listApiKeys(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(result).toEqual(expectedApiKeys);
    });
  });

  describe('listApiKeysPaginated', () => {
    it('should list API keys with pagination', async () => {
      const expectedApiKeys = [
        { id: 'key-1', keyPrefix: 'ik_test_1' },
        { id: 'key-2', keyPrefix: 'ik_test_2' },
      ];

      const mockSelect = vi.fn().mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedApiKeys),
              }),
            }),
          }),
        }),
      });

      const mockCountSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 2 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValueOnce(mockSelect()).mockReturnValueOnce(mockCountSelect()),
      } as any;

      // Mock Promise.all
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedApiKeys, [{ count: 2 }]]);

      const result = await listApiKeysPaginated(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        pagination: {
          page: 1,
          limit: 10,
        },
        agentId: testAgentId,
      });

      expect(result).toEqual({
        data: expectedApiKeys,
        pagination: { page: 1, limit: 10, total: 2, pages: 1 },
      });

      vi.restoreAllMocks();
    });

    it('should handle default pagination options', async () => {
      const expectedApiKeys = [{ id: 'key-1', keyPrefix: 'ik_test_1' }];

      vi.spyOn(Promise, 'all').mockResolvedValue([expectedApiKeys, [{ count: 1 }]]);

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedApiKeys),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listApiKeysPaginated(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(1);

      vi.restoreAllMocks();
    });

    it('should enforce maximum limit', async () => {
      const expectedApiKeys = [{ id: 'key-1' }];

      vi.spyOn(Promise, 'all').mockResolvedValue([expectedApiKeys, [{ count: 1 }]]);

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedApiKeys),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listApiKeysPaginated(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        pagination: {
          limit: 200, // Over maximum
        },
      });

      expect(result.pagination.limit).toBe(100); // Should be capped

      vi.restoreAllMocks();
    });
  });

  describe('createApiKey', () => {
    it('should create a new API key', async () => {
      const apiKeyData = {
        id: 'key-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        publicId: 'pub-1',
        keyHash: 'hash123',
        keyPrefix: 'ik_test',
        expiresAt: new Date().toISOString(),
      } satisfies ApiKeyInsert;

      const expectedApiKey = {
        ...apiKeyData,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedApiKey]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createApiKey(mockDb)({
        ...apiKeyData,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedApiKey);
    });

    it('should create an API key without expiration', async () => {
      const apiKeyData = {
        id: 'key-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        publicId: 'pub-1',
        keyHash: 'hash123',
        keyPrefix: 'ik_test',
      } satisfies ApiKeyInsert;

      const expectedApiKey = {
        ...apiKeyData,
        expiresAt: undefined,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedApiKey]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createApiKey(mockDb)({
        ...apiKeyData,
      });

      expect(result.expiresAt).toBeUndefined();
    });
  });

  describe('updateApiKey', () => {
    it('should update an API key', async () => {
      const apiKeyId = 'key-1';
      const updateData = {
        id: apiKeyId,
        expiresAt: '2025-12-31T23:59:59Z',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: apiKeyId,
                expiresAt: updateData.expiresAt,
                updatedAt: new Date().toISOString(),
              },
            ]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateApiKey(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: 'key-1',
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.expiresAt).toBe(updateData.expiresAt);
    });

    it('should clear expiration date when set to null', async () => {
      const updateData = {
        id: 'key-1',
        expiresAt: null,
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 'key-1',
                expiresAt: null,
                updatedAt: new Date().toISOString(),
              },
            ]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateApiKey(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: 'key-1',
        data: updateData,
      });

      expect(result.expiresAt).toBeNull();
    });
  });

  describe('deleteApiKey', () => {
    it('should delete an API key successfully', async () => {
      const apiKeyId = 'key-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const mockQuery = {
        apiKeys: {
          findFirst: vi.fn().mockResolvedValue({
            id: apiKeyId,
            tenantId: testTenantId,
            projectId: testProjectId,
            name: 'Test API Key',
          }),
        },
      };

      const mockDb = {
        ...db,
        delete: mockDelete,
        query: mockQuery,
      } as any;

      const result = await deleteApiKey(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: apiKeyId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deletion fails', async () => {
      const apiKeyId = 'key-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('Database error')),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      // Mock console.error to avoid test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await deleteApiKey(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: apiKeyId,
      });

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('hasApiKey', () => {
    it('should return true when API key exists', async () => {
      const apiKeyId = 'key-1';
      const existingApiKey = {
        id: apiKeyId,
      };

      const mockQuery = {
        apiKeys: {
          findFirst: vi.fn().mockResolvedValue(existingApiKey),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await hasApiKey(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: apiKeyId,
      });

      expect(result).toBe(true);
    });

    it('should return false when API key does not exist', async () => {
      const mockQuery = {
        apiKeys: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await hasApiKey(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: 'non-existent',
      });

      expect(result).toBe(false);
    });
  });

  describe('updateApiKeyLastUsed', () => {
    it('should update the lastUsedAt timestamp', async () => {
      const apiKeyId = 'key-1';

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      await updateApiKeyLastUsed(mockDb)(apiKeyId);

      expect(mockUpdate).toHaveBeenCalled();
      // Verify the set method was called with lastUsedAt
      expect(mockUpdate().set).toHaveBeenCalledWith({
        lastUsedAt: expect.any(String),
      });
    });
  });

  describe('countApiKeys', () => {
    it('should count API keys with agentId filter', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countApiKeys(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        agentId: testAgentId,
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toBe(5);
    });

    it('should count API keys without agentId filter', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 10 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countApiKeys(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(result).toBe(10);
    });

    it('should handle string count values', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '15' }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countApiKeys(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(result).toBe(15);
    });

    it('should return 0 when no count result', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countApiKeys(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(result).toBe(0);
    });
  });

  describe('API Key Utilities', () => {
    describe('generateApiKey', () => {
      it('should generate a valid API key with new format', async () => {
        const result = await generateApiKey('test-tenant', 'test-project');

        expect(result.id).toBeDefined();
        expect(result.publicId).toBeDefined();
        expect(result.publicId).toHaveLength(12);
        expect(result.keyHash).toBeDefined();
        expect(result.keyPrefix).toBeDefined();

        // Check key format: sk_<env>_<publicId>.<secret>
        expect(result.key).toMatch(/^sk_[^.]+\.[^.]+$/);
        expect(result.key).toContain(result.publicId);
      });

      it('should generate unique keys', async () => {
        const key1 = await generateApiKey('test-tenant', 'test-project');
        const key2 = await generateApiKey('test-tenant', 'test-project');

        expect(key1.key).not.toBe(key2.key);
        expect(key1.publicId).not.toBe(key2.publicId);
        expect(key1.keyHash).not.toBe(key2.keyHash);
      });
    });

    describe('extractPublicId', () => {
      it('should extract publicId from valid key format', async () => {
        const result = await generateApiKey('test-tenant', 'test-project');
        const extractedId = extractPublicId(result.key);

        expect(extractedId).toBe(result.publicId);
      });

      it('should return null for invalid key format', () => {
        expect(extractPublicId('invalid-key')).toBeNull();
        expect(extractPublicId('sk_abc')).toBeNull(); // Missing dot
        expect(extractPublicId('sk_abc.def.ghi')).toBeNull(); // Too many dots
      });

      it('should return null for short publicId', () => {
        expect(extractPublicId('sk_short.secret')).toBeNull();
      });
    });

    describe('hashApiKey and validateApiKey', () => {
      it('should hash and validate a key correctly', async () => {
        const key = 'testkey123';
        const hash = await hashApiKey(key);

        expect(hash).toBeDefined();
        expect(hash.length).toBeGreaterThan(0);

        const isValid = await validateApiKey(key, hash);
        expect(isValid).toBe(true);
      });

      it('should reject invalid keys', async () => {
        const key = 'testkey123';
        const hash = await hashApiKey(key);

        const isValid = await validateApiKey('wrongkey', hash);
        expect(isValid).toBe(false);
      });

      it('should handle invalid hash format gracefully', async () => {
        const isValid = await validateApiKey('ik_live_test', 'invalid-hash');
        expect(isValid).toBe(false);
      });
    });

    describe('maskApiKey', () => {
      it('should mask API key correctly', async () => {
        const result = await generateApiKey('test-tenant', 'test-project');
        const masked = maskApiKey(result.keyPrefix);
        expect(masked).toBe(`${result.keyPrefix}...`);
      });
    });

    describe('isApiKeyExpired', () => {
      it('should return false for keys without expiration', () => {
        expect(isApiKeyExpired(null)).toBe(false);
        expect(isApiKeyExpired(undefined)).toBe(false);
      });

      it('should return true for expired keys', () => {
        const pastDate = '2020-01-01T00:00:00Z';
        expect(isApiKeyExpired(pastDate)).toBe(true);
      });

      it('should return false for future expiration dates', () => {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);
        expect(isApiKeyExpired(futureDate.toISOString())).toBe(false);
      });

      it('should return true for current time (edge case)', () => {
        const now = new Date();
        const pastByOneSecond = new Date(now.getTime() - 1000);
        expect(isApiKeyExpired(pastByOneSecond.toISOString())).toBe(true);
      });
    });
  });
});
