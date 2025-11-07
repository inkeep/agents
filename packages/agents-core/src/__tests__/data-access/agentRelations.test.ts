import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentToolRelation,
  createSubAgentRelation,
  deleteAgentToolRelation,
  deleteSubAgentRelation,
  getAgentRelationById,
  getAgentRelations,
  getAgentRelationsBySource,
  getRelatedAgentsForAgent,
  getSubAgentRelationsByTarget,
  getToolsForAgent,
  listAgentRelations,
  updateAgentRelation,
  updateAgentToolRelation,
  validateSubAgent,
} from '../../data-access/subAgentRelations';
import type { DatabaseClient } from '../../db/client';
import { createTestDatabaseClient } from '../../db/test-client';

describe('Agent Relations Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testAgentId = 'test-agent';

  beforeEach(async () => {
    db = await createTestDatabaseClient();
    vi.clearAllMocks();
  });

  describe('getAgentRelationById', () => {
    it('should retrieve an agent relation by id', async () => {
      const relationId = 'relation-1';
      const expectedRelation = {
        id: relationId,
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        sourceSubAgentId: 'agent-1',
        targetSubAgentId: 'agent-2',
        relationType: 'transfer',
      };

      const mockQuery = {
        subAgentRelations: {
          findFirst: vi.fn().mockResolvedValue(expectedRelation),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getAgentRelationById(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        relationId,
      });

      expect(mockQuery.subAgentRelations.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedRelation);
    });

    it('should return null if relation not found', async () => {
      const mockQuery = {
        subAgentRelations: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getAgentRelationById(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        relationId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('listAgentRelations', () => {
    it('should list agent relations with pagination', async () => {
      const expectedRelations = [
        { id: 'relation-1', sourceSubAgentId: 'agent-1', targetSubAgentId: 'agent-2' },
        { id: 'relation-2', sourceSubAgentId: 'agent-2', targetSubAgentId: 'agent-3' },
      ];

      const mockSelect = vi.fn().mockImplementation((fields) => {
        if (fields?.count) {
          // This is the count query
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 2 }]),
            }),
          };
        }
        // This is the main data query
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(expectedRelations),
                }),
              }),
            }),
          }),
        };
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      // Mock Promise.all to return both data and count results
      const originalPromiseAll = Promise.all;
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedRelations, [{ count: 2 }]]);

      const result = await listAgentRelations(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        pagination: {
          page: 1,
          limit: 10,
        },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual({
        data: expectedRelations,
        pagination: { page: 1, limit: 10, total: 2, pages: 1 },
      });

      // Restore Promise.all
      vi.spyOn(Promise, 'all').mockImplementation(originalPromiseAll);
    });
  });

  describe('getAgentRelations', () => {
    it('should get relations for a specific agent', async () => {
      const expectedRelations = [
        { id: 'relation-1', sourceSubAgentId: 'agent-1', targetSubAgentId: 'agent-2' },
      ];

      const mockQuery = {
        subAgentRelations: {
          findMany: vi.fn().mockResolvedValue(expectedRelations),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getAgentRelations(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
          subAgentId: 'agent-1',
        },
      });

      expect(mockQuery.subAgentRelations.findMany).toHaveBeenCalled();
      expect(result).toEqual(expectedRelations);
    });
  });

  describe('getAgentRelationsBySource', () => {
    it('should get relations by source agent', async () => {
      const expectedRelations = [
        { id: 'relation-1', sourceSubAgentId: 'agent-1', targetSubAgentId: 'agent-2' },
      ];

      const mockSelect = vi.fn().mockImplementation((fields) => {
        if (fields?.count) {
          // This is the count query
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 1 }]),
            }),
          };
        }
        // This is the main data query
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(expectedRelations),
                }),
              }),
            }),
          }),
        };
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      // Mock Promise.all to return both data and count results
      const originalPromiseAll = Promise.all;
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedRelations, [{ count: 1 }]]);

      const result = await getAgentRelationsBySource(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        sourceSubAgentId: 'agent-1',
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual({
        data: expectedRelations,
        pagination: { page: 1, limit: 10, total: 1, pages: 1 },
      });

      // Restore Promise.all
      vi.spyOn(Promise, 'all').mockImplementation(originalPromiseAll);
    });
  });

  describe('getAgentRelationsByTarget', () => {
    it('should get relations by target agent', async () => {
      const expectedRelations = [
        { id: 'relation-1', sourceSubAgentId: 'agent-1', targetSubAgentId: 'agent-2' },
      ];

      const mockSelect = vi.fn().mockImplementation((fields) => {
        if (fields?.count) {
          // This is the count query
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 1 }]),
            }),
          };
        }
        // This is the main data query
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(expectedRelations),
                }),
              }),
            }),
          }),
        };
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      // Mock Promise.all to return both data and count results
      const originalPromiseAll = Promise.all;
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedRelations, [{ count: 1 }]]);

      const result = await getSubAgentRelationsByTarget(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        targetSubAgentId: 'agent-2',
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual({
        data: expectedRelations,
        pagination: { page: 1, limit: 10, total: 1, pages: 1 },
      });

      // Restore Promise.all
      vi.spyOn(Promise, 'all').mockImplementation(originalPromiseAll);
    });
  });

  describe('getRelatedAgentsForAgent', () => {
    it('should get internal related agents', async () => {
      const data = [
        { id: 'agent-2', name: 'Agent 2', description: 'Internal agent', relationType: 'transfer' },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(data),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getRelatedAgentsForAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        subAgentId: 'agent-1',
      });

      expect(result).toEqual({
        data,
      });
    });
  });

  describe('getToolsForAgent', () => {
    it('should get tools for an agent', async () => {
      const expectedTools = [{ id: 'tool-1', name: 'Test Tool', config: {} }];

      const mockSelect = vi.fn().mockImplementation((fields) => {
        if (fields?.count) {
          // This is the count query
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 1 }]),
            }),
          };
        }
        // This is the main data query with specific fields
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockResolvedValue(expectedTools),
                  }),
                }),
              }),
            }),
          }),
        };
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      // Mock Promise.all to return both data and count results
      const originalPromiseAll = Promise.all;
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedTools, [{ count: 1 }]]);

      const result = await getToolsForAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
          subAgentId: 'agent-1',
        },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual({
        data: expectedTools,
        pagination: { page: 1, limit: 10, total: 1, pages: 1 },
      });

      // Restore Promise.all
      vi.spyOn(Promise, 'all').mockImplementation(originalPromiseAll);
    });
  });

  describe('createAgentRelation', () => {
    it('should create a new agent relation with target agent', async () => {
      const relationData = {
        id: 'relation-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        sourceSubAgentId: 'agent-1',
        targetSubAgentId: 'agent-2',
        relationType: 'transfer',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([relationData]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createSubAgentRelation(mockDb)(relationData);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(relationData);
    });

    it('should throw error when neither target agent is specified', async () => {
      const relationData = {
        id: 'relation-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        sourceSubAgentId: 'agent-1',
        relationType: 'transfer',
      };

      await expect(
        createSubAgentRelation(db)({
          ...relationData,
        })
      ).rejects.toThrow(
        'Must specify exactly one of targetSubAgentId, externalSubAgentId, or teamSubAgentId'
      );
    });
  });

  describe('updateAgentRelation', () => {
    it('should update an agent relation', async () => {
      const relationId = 'relation-1';
      const updateData = {
        relationType: 'delegate',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: relationId,
                ...updateData,
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

      const result = await updateAgentRelation(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        relationId,
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.relationType).toBe(updateData.relationType);
    });
  });

  describe('deleteAgentRelation', () => {
    it('should delete an agent relation', async () => {
      const relationId = 'relation-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: relationId }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteSubAgentRelation(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        relationId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('createAgentToolRelation', () => {
    it('should create an agent tool relation', async () => {
      const toolRelationData = {
        id: 'tool-relation-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        subAgentId: 'agent-1',
        toolId: 'tool-1',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([toolRelationData]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createAgentToolRelation(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        relationId: 'tool-relation-1',
        data: { subAgentId: 'agent-1', toolId: 'tool-1' },
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(toolRelationData);
    });
  });

  describe('updateAgentToolRelation', () => {
    it('should update an agent tool relation', async () => {
      const relationId = 'tool-relation-1';
      const updateData = {
        toolId: 'tool-2',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: relationId,
                ...updateData,
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

      const result = await updateAgentToolRelation(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        relationId,
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.toolId).toBe(updateData.toolId);
    });
  });

  describe('deleteAgentToolRelation', () => {
    it('should delete an agent tool relation', async () => {
      const relationId = 'tool-relation-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: relationId }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteAgentToolRelation(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        relationId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('validateInternalAgent', () => {
    it('should return true when internal agent exists', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'agent-1' }]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await validateSubAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
          subAgentId: 'agent-1',
        },
      });

      expect(result).toBe(true);
    });

    it('should return false when internal agent does not exist', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await validateSubAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
          subAgentId: 'non-existent',
        },
      });

      expect(result).toBe(false);
    });
  });
});
