import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countCredentialReferences,
  createCredentialReference,
  deleteCredentialReference,
  getCredentialReference,
  getCredentialReferenceById,
  getCredentialReferenceWithResources,
  hasCredentialReference,
  listCredentialReferences,
  listCredentialReferencesPaginated,
  updateCredentialReference,
} from '../../data-access/manage/credentialReferences';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { CredentialStoreType } from '../../types';
import type { CredentialReferenceInsert, CredentialReferenceUpdate } from '../../types/entities';
import { testManageDbClient } from '../setup';

function createMockSelectChain(result: any) {
  const chain: any = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  // biome-ignore lint/suspicious/noThenProperty: mock thenable for drizzle select chain
  chain.then = (resolve: Function, reject?: Function) =>
    Promise.resolve(result).then(resolve as any, reject as any);
  return chain;
}

describe('Credential References Data Access', () => {
  let db: AgentsManageDatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testCredentialId = 'test-credential';

  beforeEach(async () => {
    db = testManageDbClient;
    vi.clearAllMocks();
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

      const expectedExternalAgents: any[] = [];

      const credentialChain = createMockSelectChain([expectedCredential]);
      const toolsChain = createMockSelectChain(expectedTools);
      const externalAgentsChain = createMockSelectChain(expectedExternalAgents);

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return credentialChain;
          if (selectCallCount === 2) return toolsChain;
          return externalAgentsChain;
        }),
      } as any;

      const result = await getCredentialReferenceWithResources(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
      });

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual({
        ...expectedCredential,
        tools: expectedTools,
        externalAgents: expectedExternalAgents,
      });
    });

    it('should return null if credential reference not found', async () => {
      const credentialChain = createMockSelectChain([]);
      const toolsChain = createMockSelectChain([]);
      const externalAgentsChain = createMockSelectChain([]);

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return credentialChain;
          if (selectCallCount === 2) return toolsChain;
          return externalAgentsChain;
        }),
      } as any;

      const result = await getCredentialReferenceWithResources(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: 'non-existent',
      });

      expect(result).toBeUndefined();
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

      const credentialChain = createMockSelectChain([expectedCredential]);
      const toolsChain = createMockSelectChain([]);
      const externalAgentsChain = createMockSelectChain([]);

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return credentialChain;
          if (selectCallCount === 2) return toolsChain;
          return externalAgentsChain;
        }),
      } as any;

      const result = await getCredentialReferenceWithResources(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
      });

      expect(result?.retrievalParams).toBeNull();
      expect(result?.tools).toEqual([]);
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

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain([expectedCredential])),
      } as any;

      const result = await getCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
      });

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(expectedCredential);
      expect(result).not.toHaveProperty('tools');
    });

    it('should return undefined if credential reference not found', async () => {
      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain([])),
      } as any;

      const result = await getCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: 'non-existent',
      });

      expect(result).toBeUndefined();
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

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain(expectedCredentials)),
      } as any;

      const result = await listCredentialReferences(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(expectedCredentials);
    });

    it('should return empty array when no credentials found', async () => {
      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain([])),
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

      const dataChain = createMockSelectChain(expectedCredentials);
      const countChain = createMockSelectChain([{ count: '2' }]);

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return dataChain;
          return countChain;
        }),
      } as any;

      const result = await listCredentialReferencesPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: { page: 1, limit: 10 },
      });

      expect(result).toEqual({
        data: expectedCredentials,
        pagination: { page: 1, limit: 10, total: 2, pages: 1 },
      });
    });

    it('should handle default pagination options', async () => {
      const expectedCredentials = [{ id: 'cred-1' }];

      const dataChain = createMockSelectChain(expectedCredentials);
      const countChain = createMockSelectChain([{ count: '1' }]);

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return dataChain;
          return countChain;
        }),
      } as any;

      const result = await listCredentialReferencesPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });

    it('should enforce maximum limit', async () => {
      const expectedCredentials = [{ id: 'cred-1' }];

      const dataChain = createMockSelectChain(expectedCredentials);
      const countChain = createMockSelectChain([{ count: '1' }]);

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return dataChain;
          return countChain;
        }),
      } as any;

      const result = await listCredentialReferencesPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: { limit: 200 },
      });

      expect(result.pagination.limit).toBe(100);
    });
  });

  describe('createCredentialReference', () => {
    it('should create a new credential reference', async () => {
      const credentialData: CredentialReferenceInsert = {
        name: 'Test Credential',
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
        name: 'Test Credential',
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

      const updatedCredential = {
        id: testCredentialId,
        type: 'updated-vault',
        retrievalParams: { updatedKey: 'updatedValue' },
      };

      const credentialChain = createMockSelectChain([updatedCredential]);
      const toolsChain = createMockSelectChain([]);
      const externalAgentsChain = createMockSelectChain([]);

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        update: mockUpdate,
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return credentialChain;
          if (selectCallCount === 2) return toolsChain;
          return externalAgentsChain;
        }),
      } as any;

      await updateCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
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

      const credentialChain = createMockSelectChain([]);
      const toolsChain = createMockSelectChain([]);
      const externalAgentsChain = createMockSelectChain([]);

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        update: mockUpdate,
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return credentialChain;
          if (selectCallCount === 2) return toolsChain;
          return externalAgentsChain;
        }),
      } as any;

      const result = await updateCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: 'non-existent',
        data: updateData as CredentialReferenceUpdate,
      });

      expect(result).toBeUndefined();
    });
  });

  describe('deleteCredentialReference', () => {
    it('should delete a credential reference successfully', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const existingCredential = { id: testCredentialId, type: 'vault' };

      const mockDb = {
        ...db,
        delete: mockDelete,
        select: vi
          .fn()
          .mockReturnValueOnce(createMockSelectChain([existingCredential]))
          .mockReturnValueOnce(createMockSelectChain([])),
      } as any;

      const result = await deleteCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
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
      };

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain([existingCredential])),
      } as any;

      const result = await hasCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
      });

      expect(result).toBe(true);
    });

    it('should return false when credential reference does not exist', async () => {
      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain([])),
      } as any;

      const result = await hasCredentialReference(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: 'non-existent',
      });

      expect(result).toBe(false);
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

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain([expectedCredential])),
      } as any;

      const result = await getCredentialReferenceById(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        id: testCredentialId,
      });

      expect(mockDb.select).toHaveBeenCalled();
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
