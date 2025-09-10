import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentRelation,
  createAgentToolRelation,
  createExternalAgentRelation,
  deleteAgentRelation,
  deleteAgentToolRelation,
  getAgentRelationById,
  getAgentRelations,
  getAgentRelationsBySource,
  getAgentRelationsByTarget,
  getExternalAgentRelations,
  getRelatedAgentsForGraph,
  getToolsForAgent,
  listAgentRelations,
  updateAgentRelation,
  updateAgentToolRelation,
  validateExternalAgent,
  validateInternalAgent,
} from '../../data-access/agentRelations.js';
import type { DatabaseClient } from '../../db/client.js';
import { createInMemoryDatabaseClient } from '../../db/client.js';

describe('Agent Relations Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testGraphId = 'test-graph';

  beforeEach(() => {
    db = createInMemoryDatabaseClient();
  });

  describe('getAgentRelationById', () => {
    it('should retrieve an agent relation by id', async () => {
      const relationId = 'relation-1';
      const expectedRelation = {
        id: relationId,
        tenantId: testTenantId,
        projectId: testProjectId,
        graphId: testGraphId,
        sourceAgentId: 'agent-1',
        targetAgentId: 'agent-2',
        relationType: 'transfer',
      };

      const mockQuery = {
        agentRelations: {
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
        },
        relationId,
      });

      expect(mockQuery.agentRelations.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedRelation);
    });

    it('should return null if relation not found', async () => {
      const mockQuery = {
        agentRelations: {
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
        },
        relationId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('listAgentRelations', () => {
    it('should list agent relations with pagination', async () => {
      const expectedRelations = [
        { id: 'relation-1', sourceAgentId: 'agent-1', targetAgentId: 'agent-2' },
        { id: 'relation-2', sourceAgentId: 'agent-2', targetAgentId: 'agent-3' },
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
        { id: 'relation-1', sourceAgentId: 'agent-1', targetAgentId: 'agent-2' },
      ];

      const mockQuery = {
        agentRelations: {
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
        },
        graphId: testGraphId,
        agentId: 'agent-1',
      });

      expect(mockQuery.agentRelations.findMany).toHaveBeenCalled();
      expect(result).toEqual(expectedRelations);
    });
  });

  describe('getAgentRelationsBySource', () => {
    it('should get relations by source agent', async () => {
      const expectedRelations = [
        { id: 'relation-1', sourceAgentId: 'agent-1', targetAgentId: 'agent-2' },
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
        },
        sourceAgentId: 'agent-1',
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
        { id: 'relation-1', sourceAgentId: 'agent-1', targetAgentId: 'agent-2' },
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

      const result = await getAgentRelationsByTarget(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        targetAgentId: 'agent-2',
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

  describe('getRelatedAgentsForGraph', () => {
    it('should get both internal and external related agents', async () => {
      const internalRelations = [
        { id: 'agent-2', name: 'Agent 2', description: 'Internal agent', relationType: 'transfer' },
      ];
      const externalRelations = [
        {
          id: 'relation-1',
          relationType: 'delegate',
          externalAgent: { id: 'ext-1', name: 'External Agent', baseUrl: 'http://example.com' },
        },
      ];

      const mockSelect = vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(internalRelations),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(externalRelations),
            }),
          }),
        });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getRelatedAgentsForGraph(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        graphId: testGraphId,
        agentId: 'agent-1',
      });

      expect(result).toEqual({
        internalRelations,
        externalRelations,
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
        },
        agentId: 'agent-1',
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
        graphId: testGraphId,
        sourceAgentId: 'agent-1',
        targetAgentId: 'agent-2',
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

      const result = await createAgentRelation(mockDb)(relationData);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(relationData);
    });

    it('should create a new agent relation with external agent', async () => {
      const relationData = {
        id: 'relation-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        graphId: testGraphId,
        sourceAgentId: 'agent-1',
        externalAgentId: 'ext-agent-1',
        relationType: 'delegate',
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

      const result = await createAgentRelation(mockDb)({
        ...relationData,
      });

      expect(result).toEqual(relationData);
    });

    it('should throw error when both target and external agent are specified', async () => {
      const relationData = {
        id: 'relation-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        graphId: testGraphId,
        sourceAgentId: 'agent-1',
        targetAgentId: 'agent-2',
        externalAgentId: 'ext-agent-1',
        relationType: 'transfer',
      };

      await expect(
        createAgentRelation(db)({
          ...relationData,
        })
      ).rejects.toThrow('Cannot specify both targetAgentId and externalAgentId');
    });

    it('should throw error when neither target nor external agent is specified', async () => {
      const relationData = {
        id: 'relation-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        graphId: testGraphId,
        sourceAgentId: 'agent-1',
        relationType: 'transfer',
      };

      await expect(
        createAgentRelation(db)({
          ...relationData,
        })
      ).rejects.toThrow('Must specify either targetAgentId or externalAgentId');
    });
  });

  describe('createExternalAgentRelation', () => {
    it('should create an external agent relation', async () => {
      const relationData = {
        id: 'relation-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        graphId: testGraphId,
        sourceAgentId: 'agent-1',
        externalAgentId: 'ext-agent-1',
        relationType: 'delegate',
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

      const result = await createExternalAgentRelation(mockDb)({
        ...relationData,
      });

      expect(result).toEqual(relationData);
    });
  });

  describe('getExternalAgentRelations', () => {
    it('should get external agent relations', async () => {
      const expectedRelations = [
        {
          id: 'relation-1',
          relationType: 'delegate',
          externalAgent: { id: 'ext-1', name: 'External Agent', baseUrl: 'http://example.com' },
        },
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
        // This is the main data query (no specific fields, just select())
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

      const result = await getExternalAgentRelations(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        externalAgentId: 'ext-1',
      });

      expect(result).toEqual({
        data: expectedRelations,
        pagination: { page: 1, limit: 10, total: 1, pages: 1 },
      });

      // Restore Promise.all
      vi.spyOn(Promise, 'all').mockImplementation(originalPromiseAll);
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
        where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteAgentRelation(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
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
        agentId: 'agent-1',
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
        },
        relationId: 'tool-relation-1',
        data: { agentId: 'agent-1', toolId: 'tool-1' },
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
        where: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteAgentToolRelation(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
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

      const result = await validateInternalAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        agentId: 'agent-1',
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

      const result = await validateInternalAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        agentId: 'non-existent',
      });

      expect(result).toBe(false);
    });
  });

  describe('validateExternalAgent', () => {
    it('should return true when external agent exists', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'ext-agent-1' }]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await validateExternalAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        agentId: 'ext-agent-1',
      });

      expect(result).toBe(true);
    });

    it('should return false when external agent does not exist', async () => {
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

      const result = await validateExternalAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        agentId: 'non-existent',
      });

      expect(result).toBe(false);
    });
  });
});
