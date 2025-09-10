import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countCredentialReferences,
  createCredentialReference,
  deleteCredentialReference,
  getCredentialReference,
  getCredentialReferenceById,
  getCredentialReferenceWithTools,
  hasCredentialReference,
  listCredentialReferences,
  listCredentialReferencesPaginated,
  updateCredentialReference,
} from '../../data-access/credentialReferences';
import type { DatabaseClient } from '../../db/client';
import { createInMemoryDatabaseClient } from '../../db/client';
import { CredentialStoreType } from '../../types';
import type { CredentialReferenceInsert, CredentialReferenceUpdate } from '../../types/entities';

describe('Credential References Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testCredentialId = 'test-credential';

  beforeEach(() => {
    db = createInMemoryDatabaseClient();
  });

  describe('getCredentialReferenceWithTools', () => {
    it('should retrieve a credential reference with related tools', async () => {
      const expectedCredential = {
        id: testCredentialId,
        tenantId: testTenantId,
        projectId: testProjectId,
        type: 'vault',
        credentialStoreId: 'store-1',
        retrievalParams: { key: 'value' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const expectedTools = [
        {
          id: 'tool-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          credentialReferenceId: testCredentialId,
          name: 'Test Tool',
        },
        {
          id: 'tool-2',
          tenantId: testTenantId,
          projectId: testProjectId,
          credentialReferenceId: testCredentialId,
          name: 'Another Tool',
        },
      ];

      const mockQuery = {
        credentialReferences: {
          findFirst: vi.fn().mockResolvedValue(expectedCredential),
        },
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(expectedTools),
        }),
      });

      const mockDb = {
        ...db,
        query: mockQuery,
        select: mockSelect,
      } as any;

      // Mock Promise.all
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedCredential, expectedTools]);

      const result = await getCredentialReferenceWithTools(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
      });

      expect(mockQuery.credentialReferences.findFirst).toHaveBeenCalled();
      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual({
        ...expectedCredential,
        tools: expectedTools,
      });

      vi.restoreAllMocks();
    });

    it('should return null if credential reference not found', async () => {
      const mockQuery = {
        credentialReferences: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        query: mockQuery,
        select: mockSelect,
      } as any;

      // Mock Promise.all
      vi.spyOn(Promise, 'all').mockResolvedValue([null, []]);

      const result = await getCredentialReferenceWithTools(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: 'non-existent',
      });

      expect(result).toBeUndefined();

      vi.restoreAllMocks();
    });

    it('should handle credential with null retrievalParams', async () => {
      const expectedCredential = {
        id: testCredentialId,
        tenantId: testTenantId,
        projectId: testProjectId,
        type: 'inmemory',
        credentialStoreId: 'store-1',
        retrievalParams: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        credentialReferences: {
          findFirst: vi.fn().mockResolvedValue(expectedCredential),
        },
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        query: mockQuery,
        select: mockSelect,
      } as any;

      // Mock Promise.all
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedCredential, []]);

      const result = await getCredentialReferenceWithTools(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
      });

      expect(result?.retrievalParams).toBeNull();
      expect(result?.tools).toEqual([]);

      vi.restoreAllMocks();
    });
  });

  describe('getCredentialReference', () => {
    it('should retrieve a basic credential reference without tools', async () => {
      const expectedCredential = {
        id: testCredentialId,
        tenantId: testTenantId,
        projectId: testProjectId,
        type: 'vault',
        credentialStoreId: 'store-1',
        retrievalParams: { key: 'value' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        credentialReferences: {
          findFirst: vi.fn().mockResolvedValue(expectedCredential),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
      });

      expect(mockQuery.credentialReferences.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedCredential);
      expect(result).not.toHaveProperty('tools');
    });

    it('should return null if credential reference not found', async () => {
      const mockQuery = {
        credentialReferences: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('listCredentialReferences', () => {
    it('should list all credential references for a project', async () => {
      const expectedCredentials = [
        {
          id: 'cred-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          type: 'vault',
          credentialStoreId: 'store-1',
          retrievalParams: { key: 'value1' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'cred-2',
          tenantId: testTenantId,
          projectId: testProjectId,
          type: CredentialStoreType.nango,
          credentialStoreId: 'store-2',
          retrievalParams: { key: 'value2' },
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      const mockQuery = {
        credentialReferences: {
          findMany: vi.fn().mockResolvedValue(expectedCredentials),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await listCredentialReferences(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(mockQuery.credentialReferences.findMany).toHaveBeenCalled();
      expect(result).toEqual(expectedCredentials);
    });

    it('should return empty array when no credentials found', async () => {
      const mockQuery = {
        credentialReferences: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await listCredentialReferences(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toEqual([]);
    });
  });

  describe('listCredentialReferencesPaginated', () => {
    it('should list credential references with pagination', async () => {
      const expectedCredentials = [
        {
          id: 'cred-1',
          type: 'vault',
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'cred-2',
          type: CredentialStoreType.nango,
          createdAt: '2024-01-02T00:00:00Z',
        },
      ];

      const mockSelect = vi.fn().mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedCredentials),
              }),
            }),
          }),
        }),
      });

      const mockCountSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '2' }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValueOnce(mockSelect()).mockReturnValueOnce(mockCountSelect()),
      } as any;

      // Mock Promise.all
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedCredentials, [{ count: '2' }]]);

      const result = await listCredentialReferencesPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: { page: 1, limit: 10 },
      });

      expect(result).toEqual({
        data: expectedCredentials,
        pagination: { page: 1, limit: 10, total: 2, pages: 1 },
      });

      vi.restoreAllMocks();
    });

    it('should handle default pagination options', async () => {
      const expectedCredentials = [{ id: 'cred-1' }];

      vi.spyOn(Promise, 'all').mockResolvedValue([expectedCredentials, [{ count: '1' }]]);

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedCredentials),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listCredentialReferencesPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);

      vi.restoreAllMocks();
    });

    it('should enforce maximum limit', async () => {
      const expectedCredentials = [{ id: 'cred-1' }];

      vi.spyOn(Promise, 'all').mockResolvedValue([expectedCredentials, [{ count: '1' }]]);

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedCredentials),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listCredentialReferencesPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: { limit: 200 },
      });

      expect(result.pagination.limit).toBe(100); // Should be capped

      vi.restoreAllMocks();
    });
  });

  describe('createCredentialReference', () => {
    it('should create a new credential reference', async () => {
      const credentialData: CredentialReferenceInsert = {
        tenantId: testTenantId,
        projectId: testProjectId,
        id: testCredentialId,
        type: 'vault',
        credentialStoreId: 'store-1',
        retrievalParams: { key: 'value' },
      };

      const expectedCredential = {
        id: testCredentialId,
        tenantId: testTenantId,
        projectId: testProjectId,
        type: 'vault',
        credentialStoreId: 'store-1',
        retrievalParams: { key: 'value' },
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedCredential]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createCredentialReference(mockDb)(credentialData);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedCredential);
    });

    it('should handle credential reference with null retrievalParams', async () => {
      const credentialData: CredentialReferenceInsert = {
        tenantId: testTenantId,
        projectId: testProjectId,
        id: testCredentialId,
        type: 'inmemory',
        credentialStoreId: 'store-1',
      };

      const expectedCredential = {
        id: testCredentialId,
        tenantId: testTenantId,
        projectId: testProjectId,
        type: 'inmemory',
        credentialStoreId: 'store-1',
        retrievalParams: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedCredential]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createCredentialReference(mockDb)(credentialData);

      expect(result.retrievalParams).toBeNull();
    });
  });

  describe('updateCredentialReference', () => {
    it('should update a credential reference', async () => {
      const updateData = {
        type: 'updated-vault',
        retrievalParams: { updatedKey: 'updatedValue' },
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const mockQuery = {
        credentialReferences: {
          findFirst: vi.fn().mockResolvedValue({
            id: testCredentialId,
            type: 'updated-vault',
            retrievalParams: { updatedKey: 'updatedValue' },
          }),
        },
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
        query: mockQuery,
        select: mockSelect,
      } as any;

      // Mock Promise.all for getCredentialReference
      vi.spyOn(Promise, 'all').mockResolvedValue([
        { id: testCredentialId, type: 'updated-vault' },
        [],
      ]);

      await updateCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it('should return undefined if credential reference not found after update', async () => {
      const updateData = {
        type: 'updated-vault',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const mockQuery = {
        credentialReferences: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
        query: mockQuery,
        select: mockSelect,
      } as any;

      // Mock Promise.all for getCredentialReference
      vi.spyOn(Promise, 'all').mockResolvedValue([null, []]);

      const result = await updateCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: 'non-existent',
        data: updateData as CredentialReferenceUpdate,
      });

      // This will actually call getCredentialReference which will return null
      expect(result).toBeUndefined();

      vi.restoreAllMocks();
    });
  });

  describe('deleteCredentialReference', () => {
    it('should delete a credential reference successfully', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const mockQuery = {
        credentialReferences: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: testCredentialId, type: 'vault' }) // First call returns credential
            .mockResolvedValueOnce(undefined), // Second call after deletion returns undefined
        },
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
        query: mockQuery,
        select: mockSelect,
      } as any;

      const result = await deleteCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);

      vi.restoreAllMocks();
    });
  });

  describe('hasCredentialReference', () => {
    it('should return true when credential reference exists', async () => {
      const existingCredential = {
        id: testCredentialId,
        tenantId: testTenantId,
        projectId: testProjectId,
        type: 'vault',
        credentialStoreId: 'store-1',
        retrievalParams: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        tools: [],
      };

      const mockQuery = {
        credentialReferences: {
          findFirst: vi.fn().mockResolvedValue(existingCredential),
        },
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        query: mockQuery,
        select: mockSelect,
      } as any;

      // Mock Promise.all for getCredentialReference
      vi.spyOn(Promise, 'all').mockResolvedValue([existingCredential, []]);

      const result = await hasCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
      });

      expect(result).toBe(true);

      vi.restoreAllMocks();
    });

    it('should return false when credential reference does not exist', async () => {
      const mockQuery = {
        credentialReferences: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        query: mockQuery,
        select: mockSelect,
      } as any;

      // Mock Promise.all for getCredentialReference
      vi.spyOn(Promise, 'all').mockResolvedValue([null, []]);

      const result = await hasCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: 'non-existent',
      });

      expect(result).toBe(false);

      vi.restoreAllMocks();
    });
  });

  describe('getCredentialReferenceById', () => {
    it('should retrieve a credential reference by ID without tools', async () => {
      const expectedCredential = {
        id: testCredentialId,
        tenantId: testTenantId,
        projectId: testProjectId,
        type: 'vault',
        credentialStoreId: 'store-1',
        retrievalParams: { key: 'value' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        credentialReferences: {
          findFirst: vi.fn().mockResolvedValue(expectedCredential),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getCredentialReferenceById(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
      });

      expect(mockQuery.credentialReferences.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedCredential);
    });
  });

  describe('countCredentialReferences', () => {
    it('should count credential references for a project', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countCredentialReferences(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toBe(5);
    });

    it('should handle string count values', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '10' }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countCredentialReferences(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toBe(10);
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

      const result = await countCredentialReferences(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toBe(0);
    });
  });
});
