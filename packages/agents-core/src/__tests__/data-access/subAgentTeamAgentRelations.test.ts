import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSubAgentTeamAgentRelation,
  deleteSubAgentTeamAgentRelation,
  deleteSubAgentTeamAgentRelationsByAgent,
  deleteSubAgentTeamAgentRelationsBySubAgent,
  getSubAgentsForTeamAgent,
  getSubAgentTeamAgentRelationById,
  getSubAgentTeamAgentRelations,
  getSubAgentTeamAgentRelationsByAgent,
  getSubAgentTeamAgentRelationsByTeamAgent,
  getTeamAgentsForSubAgent,
  listSubAgentTeamAgentRelations,
  updateSubAgentTeamAgentRelation,
  upsertSubAgentTeamAgentRelation,
} from '../../data-access/subAgentTeamAgentRelations';
import type { DatabaseClient } from '../../db/client';
import { createTestDatabaseClient } from '../../db/test-client';

describe('SubAgentTeamAgentRelations Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'tenant-123';
  const testProjectId = 'project-456';
  const testAgentId = 'agent-789';
  const testSubAgentId = 'sub-agent-abc';
  const testRelationId = 'relation-xyz';
  const testTargetAgentId = 'target-agent-def';

  const relationData = {
    tenantId: testTenantId,
    projectId: testProjectId,
    agentId: testAgentId,
    subAgentId: testSubAgentId,
    id: testRelationId,
    targetAgentId: testTargetAgentId,
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

  describe('getSubAgentTeamAgentRelationById', () => {
    it('should retrieve a sub-agent team agent relation by id', async () => {
      const mockQuery = {
        subAgentTeamAgentRelations: {
          findFirst: vi.fn().mockResolvedValue(relationData),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getSubAgentTeamAgentRelationById(mockDb)({
        scopes,
        relationId: testRelationId,
      });

      expect(result).toEqual(relationData);
      expect(mockQuery.subAgentTeamAgentRelations.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
      });
    });

    it('should return undefined when relation not found', async () => {
      const mockQuery = {
        subAgentTeamAgentRelations: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getSubAgentTeamAgentRelationById(mockDb)({
        scopes,
        relationId: testRelationId,
      });

      expect(result).toBeUndefined();
    });
  });

  describe('listSubAgentTeamAgentRelations', () => {
    it('should list all sub-agent team agent relations with pagination', async () => {
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

      const result = await listSubAgentTeamAgentRelations(mockDb)({ scopes });

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

      const result = await listSubAgentTeamAgentRelations(mockDb)({ scopes });

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('getSubAgentTeamAgentRelations', () => {
    it('should get all relations for a subagent', async () => {
      const relations = [relationData];
      const mockQuery = {
        subAgentTeamAgentRelations: {
          findMany: vi.fn().mockResolvedValue(relations),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getSubAgentTeamAgentRelations(mockDb)({ scopes });

      expect(result).toEqual(relations);
      expect(mockQuery.subAgentTeamAgentRelations.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
      });
    });
  });

  describe('getSubAgentTeamAgentRelationsByAgent', () => {
    it('should get all relations for an agent', async () => {
      const agentScopes = {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
      };
      const relations = [relationData];
      const mockQuery = {
        subAgentTeamAgentRelations: {
          findMany: vi.fn().mockResolvedValue(relations),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getSubAgentTeamAgentRelationsByAgent(mockDb)({
        scopes: agentScopes,
      });

      expect(result).toEqual(relations);
      expect(mockQuery.subAgentTeamAgentRelations.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
      });
    });
  });

  describe('createSubAgentTeamAgentRelation', () => {
    it('should create a new sub-agent team agent relation', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([relationData]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createSubAgentTeamAgentRelation(mockDb)({
        scopes,
        data: {
          targetAgentId: testTargetAgentId,
          headers: { 'X-Custom-Header': 'updated-value' },
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

      const result = await createSubAgentTeamAgentRelation(mockDb)({
        scopes,
        data: {
          targetAgentId: testTargetAgentId,
          headers: { 'X-Custom-Header': 'updated-value' },
        },
      });

      expect(result).toEqual(relationData);
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe('updateSubAgentTeamAgentRelation', () => {
    it('should update an existing sub-agent team agent relation', async () => {
      const updatedData = {
        ...relationData,
        updatedAt: new Date().toISOString(),
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

      const result = await updateSubAgentTeamAgentRelation(mockDb)({
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

      const result = await updateSubAgentTeamAgentRelation(mockDb)({
        scopes,
        relationId: testRelationId,
        data: { headers: { 'X-Custom-Header': 'updated-value' } },
      });

      expect(result).toBeUndefined();
    });
  });

  describe('deleteSubAgentTeamAgentRelation', () => {
    it('should delete a sub-agent team agent relation', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteSubAgentTeamAgentRelation(mockDb)({
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

      const result = await deleteSubAgentTeamAgentRelation(mockDb)({
        scopes,
        relationId: testRelationId,
      });

      expect(result).toBe(false);
    });
  });

  describe('upsertSubAgentTeamAgentRelation', () => {
    it('should create a new relation when it does not exist', async () => {
      const mockQuery = {
        subAgentTeamAgentRelations: {
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

      const result = await upsertSubAgentTeamAgentRelation(mockDb)({
        scopes,
        data: {
          targetAgentId: testTargetAgentId,
          headers: { 'X-Custom-Header': 'test-value' },
        },
      });

      expect(result).toEqual(relationData);
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should update existing relation when relationId provided', async () => {
      const updatedData = {
        ...relationData,
        updatedAt: new Date().toISOString(),
      };

      const mockQuery = {
        subAgentTeamAgentRelations: {
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

      const result = await upsertSubAgentTeamAgentRelation(mockDb)({
        scopes,
        relationId: testRelationId,
        data: {
          targetAgentId: testTargetAgentId,
          headers: { 'X-Custom-Header': 'updated-value' },
        },
      });

      expect(result).toEqual(updatedData);
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe('deleteSubAgentTeamAgentRelationsBySubAgent', () => {
    it('should delete all relations for a subagent', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowsAffected: 2 }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteSubAgentTeamAgentRelationsBySubAgent(mockDb)({ scopes });

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('deleteSubAgentTeamAgentRelationsByAgent', () => {
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

      const result = await deleteSubAgentTeamAgentRelationsByAgent(mockDb)({
        scopes: agentScopes,
      });

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('getTeamAgentsForSubAgent', () => {
    it('should get team agents for a subagent with join', async () => {
      const joinedData = [
        {
          ...relationData,
          targetAgent: {
            id: testTargetAgentId,
            name: 'Test Target Agent',
            description: 'Test Description',
            defaultSubAgentId: null,
            contextConfigId: null,
            models: null,
            statusUpdates: null,
            prompt: null,
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

      const result = await getTeamAgentsForSubAgent(mockDb)({ scopes });

      expect(result.data).toEqual(joinedData);
      expect(result.pagination).toBeDefined();
      expect(mockSelect).toHaveBeenCalled();
    });
  });

  describe('getSubAgentsForTeamAgent', () => {
    it('should get subagents for a team agent with join', async () => {
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

      const result = await getSubAgentsForTeamAgent(mockDb)({
        scopes: agentScopes,
        targetAgentId: testTargetAgentId,
      });

      expect(result.data).toEqual(joinedData);
      expect(result.pagination).toBeDefined();
      expect(mockSelect).toHaveBeenCalled();
    });
  });

  describe('getSubAgentTeamAgentRelationsByTeamAgent', () => {
    it('should get relations for a team agent with pagination', async () => {
      const agentScopes = {
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
      };
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

      const result = await getSubAgentTeamAgentRelationsByTeamAgent(mockDb)({
        scopes: agentScopes,
        targetAgentId: testTargetAgentId,
      });

      expect(result.data).toEqual(relations);
      expect(result.pagination).toBeDefined();
      expect(mockSelect).toHaveBeenCalled();
    });
  });
});
