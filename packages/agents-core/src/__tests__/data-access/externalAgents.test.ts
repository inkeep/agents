import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countExternalAgents,
  createExternalAgent,
  deleteExternalAgent,
  externalAgentExists,
  externalAgentUrlExists,
  getExternalAgent,
  getExternalAgentByUrl,
  listExternalAgents,
  listExternalAgentsPaginated,
  updateExternalAgent,
} from '../../data-access/externalAgents';
import type { DatabaseClient } from '../../db/client';
import { createTestDatabaseClient } from '../../db/test-client';

describe('External Agents Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'tenant-123';
  const testProjectId = 'project-456';
  const testExternalAgentId = 'external-agent-789';

  beforeEach(async () => {
    db = await createTestDatabaseClient();
    vi.clearAllMocks();
  });

  describe('createExternalAgent', () => {
    it('should create a new external agent', async () => {
      const agentData = {
        tenantId: testTenantId,
        projectId: testProjectId,
        id: testExternalAgentId,
        name: 'Test Agent',
        description: 'A test external agent',
        baseUrl: 'https://api.example.com',
        credentialReferenceId: 'cred-123',
      };

      const expectedAgent = {
        ...agentData,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedAgent]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createExternalAgent(mockDb)(agentData);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedAgent);
    });

    it('should handle external agent with null optional fields', async () => {
      const agentData = {
        tenantId: testTenantId,
        projectId: testProjectId,
        id: testExternalAgentId,
        name: 'Minimal Agent',
        description: 'Agent with minimal data',
        baseUrl: 'https://minimal.api.com',
        credentialReferenceId: undefined,
      };

      const expectedAgent = {
        ...agentData,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedAgent]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createExternalAgent(mockDb)(agentData);

      expect(result.credentialReferenceId).toBeUndefined();
    });
  });

  describe('getExternalAgent', () => {
    it('should retrieve an external agent by ID', async () => {
      const expectedAgent = {
        id: testExternalAgentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Agent',
        description: 'A test external agent',
        baseUrl: 'https://api.example.com',
        credentialReferenceId: 'cred-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        externalAgents: {
          findFirst: vi.fn().mockResolvedValue(expectedAgent),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getExternalAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        externalAgentId: testExternalAgentId,
      });

      expect(mockQuery.externalAgents.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedAgent);
    });

    it('should return null if external agent not found', async () => {
      const mockQuery = {
        externalAgents: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getExternalAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        externalAgentId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('getExternalAgentByUrl', () => {
    it('should retrieve an external agent by base URL', async () => {
      const expectedAgent = {
        id: testExternalAgentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'URL Agent',
        description: 'Agent found by URL',
        baseUrl: 'https://unique.api.com',
        credentialReferenceId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        externalAgents: {
          findFirst: vi.fn().mockResolvedValue(expectedAgent),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getExternalAgentByUrl(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        baseUrl: 'https://unique.api.com',
      });

      expect(mockQuery.externalAgents.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedAgent);
    });

    it('should return null if agent with URL not found', async () => {
      const mockQuery = {
        externalAgents: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getExternalAgentByUrl(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        baseUrl: 'https://nonexistent.api.com',
      });

      expect(result).toBeNull();
    });
  });

  describe('listExternalAgents', () => {
    it('should list all external agents for a tenant', async () => {
      const expectedAgents = [
        {
          id: 'agent-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          name: 'Agent A',
          description: 'First agent',
          baseUrl: 'https://api-a.com',
          credentialReferenceId: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'agent-2',
          tenantId: testTenantId,
          projectId: testProjectId,
          name: 'Agent B',
          description: 'Second agent',
          baseUrl: 'https://api-b.com',
          credentialReferenceId: 'cred-456',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      const mockQuery = {
        externalAgents: {
          findMany: vi.fn().mockResolvedValue(expectedAgents),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await listExternalAgents(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(mockQuery.externalAgents.findMany).toHaveBeenCalled();
      expect(result).toEqual(expectedAgents);
    });

    it('should return empty array when no agents found', async () => {
      const mockQuery = {
        externalAgents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await listExternalAgents(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toEqual([]);
    });
  });

  describe('listExternalAgentsPaginated', () => {
    it('should list external agents with pagination', async () => {
      const expectedAgents = [
        {
          id: 'agent-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          name: 'Agent 1',
          description: 'First agent',
          baseUrl: 'https://api-1.com',
          credentialReferenceId: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedAgents),
              }),
            }),
          }),
        }),
      });

      const mockCountQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation((fields) => {
          if (fields && 'count' in fields) {
            return mockCountQuery();
          }
          return mockQuery();
        }),
      } as any;

      // Mock Promise.all
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedAgents, [{ count: 5 }]]);

      const result = await listExternalAgentsPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: { page: 1, limit: 10 },
      });

      expect(result).toEqual({
        data: expectedAgents,
        pagination: { page: 1, limit: 10, total: 5, pages: 1 },
      });

      vi.restoreAllMocks();
    });

    it('should handle default pagination options', async () => {
      const expectedAgents: any[] = [];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedAgents),
              }),
            }),
          }),
        }),
      });

      const mockCountQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation((fields) => {
          if (fields && 'count' in fields) {
            return mockCountQuery();
          }
          return mockQuery();
        }),
      } as any;

      // Mock Promise.all
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedAgents, [{ count: 0 }]]);

      const result = await listExternalAgentsPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toEqual({
        data: expectedAgents,
        pagination: { page: 1, limit: 10, total: 0, pages: 0 },
      });

      vi.restoreAllMocks();
    });

    it('should enforce maximum limit', async () => {
      const expectedAgents: any[] = [];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedAgents),
              }),
            }),
          }),
        }),
      });

      const mockCountQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '0' }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation((fields) => {
          if (fields && 'count' in fields) {
            return mockCountQuery();
          }
          return mockQuery();
        }),
      } as any;

      // Mock Promise.all
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedAgents, [{ count: '0' }]]);

      const result = await listExternalAgentsPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: { page: 1, limit: 150 }, // Above max of 100
      });

      expect(result.pagination.limit).toBe(100);

      vi.restoreAllMocks();
    });
  });

  describe('updateExternalAgent', () => {
    it('should update an external agent', async () => {
      const updateData = {
        name: 'Updated Agent',
        description: 'Updated description',
        baseUrl: 'https://updated.api.com',
      };

      const expectedAgent = {
        id: testExternalAgentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Updated Agent',
        description: 'Updated description',
        baseUrl: 'https://updated.api.com',
        credentialReferenceId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T12:00:00Z',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([expectedAgent]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateExternalAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        externalAgentId: testExternalAgentId,
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result).toEqual(expectedAgent);
    });

    it('should handle clearing optional fields', async () => {
      const updateData = {
        credentialReferenceId: null,
      };

      const expectedAgent = {
        id: testExternalAgentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Agent',
        description: 'Agent description',
        baseUrl: 'https://api.example.com',
        credentialReferenceId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T12:00:00Z',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([expectedAgent]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateExternalAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        externalAgentId: testExternalAgentId,
        data: updateData,
      });

      expect(result?.credentialReferenceId).toBeNull();
    });

    it('should throw error when no fields to update', async () => {
      const mockDb = {
        ...db,
      } as any;

      await expect(
        updateExternalAgent(mockDb)({
          scopes: { tenantId: testTenantId, projectId: testProjectId },
          externalAgentId: testExternalAgentId,
          data: {},
        })
      ).rejects.toThrow('No fields to update');
    });

    it('should return null if external agent not found after update', async () => {
      const updateData = {
        name: 'Updated Agent',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateExternalAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        externalAgentId: 'non-existent',
        data: updateData,
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteExternalAgent', () => {
    it('should delete an external agent successfully', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: testExternalAgentId }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteExternalAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        externalAgentId: testExternalAgentId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when external agent does not exist', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteExternalAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        externalAgentId: 'non-existent',
      });

      expect(result).toBe(false);
    });

    it('should return false when delete operation throws error', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      // Mock console.error to avoid noise in test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await deleteExternalAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        externalAgentId: testExternalAgentId,
      });

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('externalAgentExists', () => {
    it('should return true when external agent exists', async () => {
      const existingAgent = {
        id: testExternalAgentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Existing Agent',
        description: 'Agent that exists',
        baseUrl: 'https://existing.api.com',
        credentialReferenceId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        externalAgents: {
          findFirst: vi.fn().mockResolvedValue(existingAgent),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await externalAgentExists(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        externalAgentId: testExternalAgentId,
      });

      expect(result).toBe(true);
    });

    it('should return false when external agent does not exist', async () => {
      const mockQuery = {
        externalAgents: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await externalAgentExists(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        externalAgentId: 'non-existent',
      });

      expect(result).toBe(false);
    });
  });

  describe('externalAgentUrlExists', () => {
    it('should return true when external agent with URL exists', async () => {
      const existingAgent = {
        id: testExternalAgentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'URL Agent',
        description: 'Agent with unique URL',
        baseUrl: 'https://unique.url.api.com',
        credentialReferenceId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        externalAgents: {
          findFirst: vi.fn().mockResolvedValue(existingAgent),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await externalAgentUrlExists(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        baseUrl: 'https://unique.url.api.com',
      });

      expect(result).toBe(true);
    });

    it('should return false when external agent with URL does not exist', async () => {
      const mockQuery = {
        externalAgents: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await externalAgentUrlExists(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        baseUrl: 'https://nonexistent.url.api.com',
      });

      expect(result).toBe(false);
    });
  });

  describe('countExternalAgents', () => {
    it('should count external agents for a tenant', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 3 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await countExternalAgents(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toBe(3);
    });

    it('should handle string count values', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '7' }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await countExternalAgents(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toBe(7);
    });

    it('should return 0 when no count result', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await countExternalAgents(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toBe(0);
    });
  });
});
