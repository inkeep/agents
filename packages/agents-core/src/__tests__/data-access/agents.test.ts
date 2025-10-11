import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAgent,
  deleteAgent,
  getAgentById,
  getAgentWithDefaultSubAgent,
  listAgents,
  listAgentsPaginated,
  updateAgent,
} from '../../data-access/agents';
import type { DatabaseClient } from '../../db/client';
import { createInMemoryDatabaseClient } from '../../db/client';

describe('Agent Agent Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';

  beforeEach(() => {
    db = createInMemoryDatabaseClient();
  });

  describe('getAgentAgentById', () => {
    it('should retrieve an agent agent by tenant and agent ID', async () => {
      const agentId = 'agent-1';
      const expectedAgent = {
        id: agentId,
        tenantId: testTenantId,
        name: 'Test Agent',
        description: 'Test description',
      };

      const mockQuery = {
        agents: {
          findFirst: vi.fn().mockResolvedValue(expectedAgent),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getAgentById(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentId },
      });

      expect(mockQuery.agents.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedAgent);
    });

    it('should return null if agent not found', async () => {
      const mockQuery = {
        agents: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getAgentById(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: 'non-existent' },
      });

      expect(result).toBeNull();
    });
  });

  describe('getAgentAgentById', () => {
    it('should retrieve an agent agent by full parameters', async () => {
      const agentId = 'agent-1';
      const expectedAgent = {
        id: agentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Agent',
        description: 'Test description',
      };

      const mockQuery = {
        agents: {
          findFirst: vi.fn().mockResolvedValue(expectedAgent),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getAgentById(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentId },
      });

      expect(mockQuery.agents.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedAgent);
    });
  });

  describe('getAgentAgentWithDefaultSubAgent', () => {
    it('should retrieve an agent agent with default agent relation', async () => {
      const agentId = 'agent-1';
      const expectedAgent = {
        id: agentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Agent',
        defaultSubAgent: { id: 'agent-1', name: 'Default Agent' },
      };

      const mockQuery = {
        agents: {
          findFirst: vi.fn().mockResolvedValue(expectedAgent),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getAgentWithDefaultSubAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentId },
      });

      expect(mockQuery.agents.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedAgent);
    });
  });

  describe('listAgentAgents', () => {
    it('should list all agent agent', async () => {
      const expectedAgents = [
        { id: 'agent-1', name: 'Agent 1' },
        { id: 'agent-2', name: 'Agent 2' },
      ];

      const mockQuery = {
        agents: {
          findMany: vi.fn().mockResolvedValue(expectedAgents),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await listAgents(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });
      expect(mockQuery.agents.findMany).toHaveBeenCalled();
      expect(result).toEqual(expectedAgents);
    });
  });

  describe('listAgentAgentsPaginated', () => {
    it('should handle pagination without limit and offset', async () => {
      const expectedAgents = [{ id: 'agent-1', name: 'Agent 1' }];

      // Mock the query chain that includes limit, offset, orderBy
      const mockQuery = vi.fn().mockResolvedValue(expectedAgents);
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
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedAgents, [{ count: 1 }]]);

      const result = await listAgentsPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: { page: 1, limit: 10 },
      });

      expect(result).toEqual({
        data: expectedAgents,
        pagination: { page: 1, limit: 10, total: 1, pages: 1 },
      });

      // Restore Promise.all
      vi.spyOn(Promise, 'all').mockImplementation(originalPromiseAll);
    });
  });

  describe('createAgentAgent', () => {
    it('should create a new agent agent', async () => {
      const agentData = {
        id: 'agent-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Agent',
        description: 'A test agent',
        defaultSubAgentId: 'agent-1',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([agentData]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createAgent(mockDb)({
        ...agentData,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toMatchObject({
        id: 'agent-1',
        name: agentData.name,
        description: agentData.description,
        defaultSubAgentId: agentData.defaultSubAgentId,
      });
    });

    it('should create an agent agent without optional fields', async () => {
      const agentData = {
        id: 'agent-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Agent',
        description: 'Test description',
        defaultSubAgentId: 'agent-1',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([agentData]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createAgent(mockDb)({
        ...agentData,
      });

      expect(result.id).toBe('agent-1');
      expect(result.name).toBe(agentData.name);
    });
  });

  describe('updateAgentAgent', () => {
    it('should update an agent agent', async () => {
      const agentId = 'agent-1';
      const updateData = {
        name: 'Updated Agent Name',
        description: 'Updated description',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: agentId,
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

      const result = await updateAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentId },
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.name).toBe(updateData.name);
      expect(result.description).toBe(updateData.description);
    });

    it('should handle model settings clearing', async () => {
      const agentId = 'agent-1';
      const updateData = {
        models: {}, // Empty object should be set to null
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: agentId,
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

      const result = await updateAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentId },
        data: updateData,
      });

      expect(result.models).toBeNull();
    });
  });

  describe('deleteAgentAgent', () => {
    it('should delete an agent agent', async () => {
      const agentId = 'agent-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: agentId }]),
        }),
      });

      // Mock getAgentAgentById to return null (agent not found after deletion)
      const mockQuery = {
        agents: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        delete: mockDelete,
        query: mockQuery,
      } as any;

      const result = await deleteAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: agentId },
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });
});
