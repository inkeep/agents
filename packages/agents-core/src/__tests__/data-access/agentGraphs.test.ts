import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentGraph,
  deleteAgentGraph,
  getAgentGraph,
  getAgentGraphById,
  getAgentGraphWithDefaultAgent,
  listAgentGraphs,
  listAgentGraphsPaginated,
  updateAgentGraph,
} from '../../data-access/agentGraphs';
import type { DatabaseClient } from '../../db/client';
import { createInMemoryDatabaseClient } from '../../db/client';

describe('Agent Graph Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';

  beforeEach(() => {
    db = createInMemoryDatabaseClient();
  });

  describe('getAgentGraph', () => {
    it('should retrieve an agent graph by tenant and graph ID', async () => {
      const graphId = 'graph-1';
      const expectedGraph = {
        id: graphId,
        tenantId: testTenantId,
        name: 'Test Graph',
        description: 'Test description',
      };

      const mockQuery = {
        agentGraph: {
          findFirst: vi.fn().mockResolvedValue(expectedGraph),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getAgentGraph(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId,
      });

      expect(mockQuery.agentGraph.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedGraph);
    });

    it('should return null if graph not found', async () => {
      const mockQuery = {
        agentGraph: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getAgentGraph(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('getAgentGraphById', () => {
    it('should retrieve an agent graph by full parameters', async () => {
      const graphId = 'graph-1';
      const expectedGraph = {
        id: graphId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Graph',
        description: 'Test description',
      };

      const mockQuery = {
        agentGraph: {
          findFirst: vi.fn().mockResolvedValue(expectedGraph),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getAgentGraphById(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId,
      });

      expect(mockQuery.agentGraph.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedGraph);
    });
  });

  describe('getAgentGraphWithDefaultAgent', () => {
    it('should retrieve an agent graph with default agent relation', async () => {
      const graphId = 'graph-1';
      const expectedGraph = {
        id: graphId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Graph',
        defaultAgent: { id: 'agent-1', name: 'Default Agent' },
      };

      const mockQuery = {
        agentGraph: {
          findFirst: vi.fn().mockResolvedValue(expectedGraph),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getAgentGraphWithDefaultAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId,
      });

      expect(mockQuery.agentGraph.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedGraph);
    });
  });

  describe('listAgentGraphs', () => {
    it('should list all agent graphs', async () => {
      const expectedGraphs = [
        { id: 'graph-1', name: 'Graph 1' },
        { id: 'graph-2', name: 'Graph 2' },
      ];

      const mockQuery = {
        agentGraph: {
          findMany: vi.fn().mockResolvedValue(expectedGraphs),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await listAgentGraphs(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });
      expect(mockQuery.agentGraph.findMany).toHaveBeenCalled();
      expect(result).toEqual(expectedGraphs);
    });
  });

  describe('listAgentGraphsPaginated', () => {
    it('should handle pagination without limit and offset', async () => {
      const expectedGraphs = [{ id: 'graph-1', name: 'Graph 1' }];

      // Mock the query chain that includes limit, offset, orderBy
      const mockQuery = vi.fn().mockResolvedValue(expectedGraphs);
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: mockQuery,
              }),
            }),
          }),
        }),
      });

      // Mock the count query
      const mockCountQuery = vi.fn().mockResolvedValue([{ count: 1 }]);

      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation((fields) => {
          if (fields?.count) {
            // This is the count query
            return {
              from: vi.fn().mockReturnValue({
                where: mockCountQuery,
              }),
            };
          }
          // This is the main data query
          return mockSelect();
        }),
      } as any;

      // Mock Promise.all to return both data and count results
      const originalPromiseAll = Promise.all;
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedGraphs, [{ count: 1 }]]);

      const result = await listAgentGraphsPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: { page: 1, limit: 10 },
      });

      expect(result).toEqual({
        data: expectedGraphs,
        pagination: { page: 1, limit: 10, total: 1, pages: 1 },
      });

      // Restore Promise.all
      vi.spyOn(Promise, 'all').mockImplementation(originalPromiseAll);
    });
  });

  describe('createAgentGraph', () => {
    it('should create a new agent graph', async () => {
      const graphData = {
        id: 'graph-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Graph',
        description: 'A test graph',
        defaultAgentId: 'agent-1',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([graphData]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createAgentGraph(mockDb)({
        ...graphData,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toMatchObject({
        id: 'graph-1',
        name: graphData.name,
        description: graphData.description,
        defaultAgentId: graphData.defaultAgentId,
      });
    });

    it('should create an agent graph without optional fields', async () => {
      const graphData = {
        id: 'graph-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Graph',
        defaultAgentId: 'agent-1',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([graphData]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createAgentGraph(mockDb)({
        ...graphData,
      });

      expect(result.id).toBe('graph-1');
      expect(result.name).toBe(graphData.name);
    });
  });

  describe('updateAgentGraph', () => {
    it('should update an agent graph', async () => {
      const graphId = 'graph-1';
      const updateData = {
        name: 'Updated Graph Name',
        description: 'Updated description',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: graphId,
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

      const result = await updateAgentGraph(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId,
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.name).toBe(updateData.name);
      expect(result.description).toBe(updateData.description);
    });

    it('should handle model settings clearing', async () => {
      const graphId = 'graph-1';
      const updateData = {
        models: {}, // Empty object should be set to null
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: graphId,
                models: null,
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

      const result = await updateAgentGraph(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId,
        data: updateData,
      });

      expect(result.models).toBeNull();
    });
  });

  describe('deleteAgentGraph', () => {
    it('should delete an agent graph', async () => {
      const graphId = 'graph-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: graphId }]),
        }),
      });

      // Mock getAgentGraphById to return null (graph not found after deletion)
      const mockQuery = {
        agentGraph: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        delete: mockDelete,
        query: mockQuery,
      } as any;

      const result = await deleteAgentGraph(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });
});
