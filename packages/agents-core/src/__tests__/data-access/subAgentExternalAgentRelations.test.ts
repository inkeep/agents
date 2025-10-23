import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSubAgentExternalAgentRelation,
  deleteSubAgentExternalAgentRelation,
  deleteSubAgentExternalAgentRelationsByAgent,
  deleteSubAgentExternalAgentRelationsBySubAgent,
  getExternalAgentsForSubAgent,
  getSubAgentExternalAgentRelationById,
  getSubAgentExternalAgentRelations,
  getSubAgentExternalAgentRelationsByAgent,
  getSubAgentsForExternalAgent,
  listSubAgentExternalAgentRelations,
  updateSubAgentExternalAgentRelation,
  upsertSubAgentExternalAgentRelation,
} from '../../data-access/subAgentExternalAgentRelations';
import type { DatabaseClient } from '../../db/client';
import { createTestDatabaseClient } from '../../db/test-client';

describe('SubAgentExternalAgentRelations Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'tenant-123';
  const testProjectId = 'project-456';
  const testAgentId = 'agent-789';
  const testSubAgentId = 'sub-agent-abc';
  const testRelationId = 'relation-xyz';
  const testExternalAgentId = 'external-agent-def';

  const relationData = {
    tenantId: testTenantId,
    projectId: testProjectId,
    agentId: testAgentId,
    subAgentId: testSubAgentId,
    id: testRelationId,
    externalAgentId: testExternalAgentId,
    headers: { 'X-Custom-Header': 'test-value' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const scopes = {
    tenantId: testTenantId,
    projectId: testProjectId,
    agentId: testAgentId,
    subAgentId: testSubAgentId,
  };

  beforeEach(async () => {
    db = await createTestDatabaseClient();
  });

  describe('getSubAgentExternalAgentRelationById', () => {
    it('should retrieve a sub-agent external agent relation by id', async () => {
      const mockQuery = {
        subAgentExternalAgentRelations: {
          findFirst: vi.fn().mockResolvedValue(relationData),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getSubAgentExternalAgentRelationById(mockDb)({
        scopes,
        relationId: testRelationId,
      });

      expect(result).toEqual(relationData);
      expect(mockQuery.subAgentExternalAgentRelations.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
      });
    });

    it('should return undefined when relation not found', async () => {
      const mockQuery = {
        subAgentExternalAgentRelations: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getSubAgentExternalAgentRelationById(mockDb)({
        scopes,
        relationId: testRelationId,
      });

      expect(result).toBeUndefined();
    });
  });

  describe('listSubAgentExternalAgentRelations', () => {
    it('should list all sub-agent external agent relations with pagination', async () => {
      const relations = [relationData];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(relations),
              }),
            }),
          }),
        }),
      });

      const mockCountSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation((params) => {
          if (params && typeof params === 'object' && 'count' in params) {
            return mockCountSelect(params);
          }
          return mockSelect();
        }),
      } as any;

      const result = await listSubAgentExternalAgentRelations(mockDb)({ scopes });

      expect(result.data).toEqual(relations);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(mockSelect).toHaveBeenCalled();
    });

    it('should return empty array when no relations found', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

      const mockCountSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation((params) => {
          if (params && typeof params === 'object' && 'count' in params) {
            return mockCountSelect(params);
          }
          return mockSelect();
        }),
      } as any;

      const result = await listSubAgentExternalAgentRelations(mockDb)({ scopes });

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('getSubAgentExternalAgentRelations', () => {
    it('should get all relations for a subagent', async () => {
      const relations = [relationData];
      const mockQuery = {
        subAgentExternalAgentRelations: {
          findMany: vi.fn().mockResolvedValue(relations),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getSubAgentExternalAgentRelations(mockDb)({ scopes });

      expect(result).toEqual(relations);
      expect(mockQuery.subAgentExternalAgentRelations.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
      });
    });
  });

  describe('getSubAgentExternalAgentRelationsByAgent', () => {
    it('should get all relations for an agent', async () => {
      const agentScopes = {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
      };
      const relations = [relationData];
      const mockQuery = {
        subAgentExternalAgentRelations: {
          findMany: vi.fn().mockResolvedValue(relations),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getSubAgentExternalAgentRelationsByAgent(mockDb)({
        scopes: agentScopes,
      });

      expect(result).toEqual(relations);
      expect(mockQuery.subAgentExternalAgentRelations.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
      });
    });
  });

  describe('createSubAgentExternalAgentRelation', () => {
    it('should create a new sub-agent external agent relation', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([relationData]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createSubAgentExternalAgentRelation(mockDb)({
        scopes,
        data: {
          externalAgentId: testExternalAgentId,
          headers: { 'X-Custom-Header': 'test-value' },
        },
      });

      expect(result).toEqual(relationData);
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should generate relationId if not provided', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([relationData]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createSubAgentExternalAgentRelation(mockDb)({
        scopes,
        data: {
          externalAgentId: testExternalAgentId,
        },
      });

      expect(result).toEqual(relationData);
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe('updateSubAgentExternalAgentRelation', () => {
    it('should update an existing sub-agent external agent relation', async () => {
      const updatedData = {
        ...relationData,
        headers: { 'X-Custom-Header': 'updated-value' },
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedData]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateSubAgentExternalAgentRelation(mockDb)({
        scopes,
        relationId: testRelationId,
        data: { headers: { 'X-Custom-Header': 'updated-value' } },
      });

      expect(result).toEqual(updatedData);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should return undefined when relation not found', async () => {
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

      const result = await updateSubAgentExternalAgentRelation(mockDb)({
        scopes,
        relationId: testRelationId,
        data: { headers: { 'X-Custom-Header': 'updated-value' } },
      });

      expect(result).toBeUndefined();
    });
  });

  describe('deleteSubAgentExternalAgentRelation', () => {
    it('should delete a sub-agent external agent relation', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteSubAgentExternalAgentRelation(mockDb)({
        scopes,
        relationId: testRelationId,
      });

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should return false when no rows affected', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowsAffected: 0 }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteSubAgentExternalAgentRelation(mockDb)({
        scopes,
        relationId: testRelationId,
      });

      expect(result).toBe(false);
    });
  });

  describe('upsertSubAgentExternalAgentRelation', () => {
    it('should create a new relation when it does not exist', async () => {
      const mockQuery = {
        subAgentExternalAgentRelations: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([relationData]),
        }),
      });

      const mockDb = {
        ...db,
        query: mockQuery,
        insert: mockInsert,
      } as any;

      const result = await upsertSubAgentExternalAgentRelation(mockDb)({
        scopes,
        data: {
          externalAgentId: testExternalAgentId,
          headers: { 'X-Custom-Header': 'test-value' },
        },
      });

      expect(result).toEqual(relationData);
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should update existing relation when relationId provided', async () => {
      const updatedData = {
        ...relationData,
        headers: { 'X-Custom-Header': 'updated-value' },
      };

      const mockQuery = {
        subAgentExternalAgentRelations: {
          findFirst: vi.fn().mockResolvedValue(relationData),
        },
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedData]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        query: mockQuery,
        update: mockUpdate,
      } as any;

      const result = await upsertSubAgentExternalAgentRelation(mockDb)({
        scopes,
        relationId: testRelationId,
        data: {
          externalAgentId: testExternalAgentId,
          headers: { 'X-Custom-Header': 'updated-value' },
        },
      });

      expect(result).toEqual(updatedData);
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe('deleteSubAgentExternalAgentRelationsBySubAgent', () => {
    it('should delete all relations for a subagent', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowsAffected: 2 }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteSubAgentExternalAgentRelationsBySubAgent(mockDb)({ scopes });

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('deleteSubAgentExternalAgentRelationsByAgent', () => {
    it('should delete all relations for an agent', async () => {
      const agentScopes = {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
      };

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowsAffected: 3 }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteSubAgentExternalAgentRelationsByAgent(mockDb)({
        scopes: agentScopes,
      });

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('getExternalAgentsForSubAgent', () => {
    it('should get external agents for a subagent with join', async () => {
      const joinedData = [
        {
          ...relationData,
          externalAgent: {
            id: testExternalAgentId,
            name: 'Test External Agent',
            description: 'Test Description',
            baseUrl: 'https://api.example.com',
            credentialReferenceId: null,
            headers: null,
            tenantId: testTenantId,
            projectId: testProjectId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(joinedData),
                }),
              }),
            }),
          }),
        }),
      });

      const mockCountSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation((params) => {
          if (params && typeof params === 'object' && 'count' in params) {
            return mockCountSelect(params);
          }
          return mockSelect();
        }),
      } as any;

      const result = await getExternalAgentsForSubAgent(mockDb)({ scopes });

      expect(result.data).toEqual(joinedData);
      expect(result.pagination).toBeDefined();
      expect(mockSelect).toHaveBeenCalled();
    });
  });

  describe('getSubAgentsForExternalAgent', () => {
    it('should get subagents for an external agent with join', async () => {
      const agentScopes = {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
      };
      const joinedData = [
        {
          ...relationData,
          subAgent: {
            id: testSubAgentId,
            name: 'Test SubAgent',
            description: 'Test Description',
            prompt: 'Test prompt',
            conversationHistoryConfig: null,
            models: null,
            stopWhen: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(joinedData),
                }),
              }),
            }),
          }),
        }),
      });

      const mockCountSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation((params) => {
          if (params && typeof params === 'object' && 'count' in params) {
            return mockCountSelect(params);
          }
          return mockSelect();
        }),
      } as any;

      const result = await getSubAgentsForExternalAgent(mockDb)({
        scopes: agentScopes,
        externalAgentId: testExternalAgentId,
      });

      expect(result.data).toEqual(joinedData);
      expect(result.pagination).toBeDefined();
      expect(mockSelect).toHaveBeenCalled();
    });
  });
});
