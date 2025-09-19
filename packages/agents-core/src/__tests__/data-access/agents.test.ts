import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAgent,
  deleteAgent,
  getAgentById,
  getAgentsByIds,
  listAgents,
  listAgentsPaginated,
  updateAgent,
} from '../../data-access/agents';
import type { DatabaseClient } from '../../db/client';
import { createInMemoryDatabaseClient } from '../../db/client';

describe('Agent Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testGraphId = 'test-graph';

  beforeEach(() => {
    db = createInMemoryDatabaseClient();
  });

  describe('createAgent', () => {
    it('should create a new agent', async () => {
      const agentData = {
        id: 'agent-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        graphId: testGraphId,
        name: 'Test Agent',
        description: 'A test agent',
        prompt: 'Test prompt',
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
        prompt: agentData.prompt,
      });
    });

    it('should create an agent with custom id', async () => {
      const customId = 'custom-agent-id';
      const agentData = {
        id: customId,
        tenantId: testTenantId,
        projectId: testProjectId,
        graphId: testGraphId,
        name: 'Custom Agent',
        description: 'Custom agent description',
        prompt: 'Custom prompt',
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

      expect(result.id).toBe(customId);
    });
  });

  describe('getAgentById', () => {
    it('should retrieve an agent by id', async () => {
      const agentId = 'agent-1';
      const expectedAgent = {
        id: agentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        graphId: testGraphId,
        name: 'Test Agent',
        description: 'Test description',
        prompt: 'Test prompt',
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
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
        },
        agentId,
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
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
        },
        agentId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('listAgents', () => {
    it('should list all agents', async () => {
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
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
        },
      });

      expect(mockQuery.agents.findMany).toHaveBeenCalled();
      expect(result).toEqual(expectedAgents);
    });
  });

  describe('listAgentsPaginated', () => {
    it('should list agents with pagination', async () => {
      const expectedAgents = [
        { id: 'agent-1', name: 'Agent 1' },
        { id: 'agent-2', name: 'Agent 2' },
      ];

      const mockSelect = vi.fn().mockReturnValue({
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

      const mockCountSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 10 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation((params) => {
          // Return different mocks based on whether it's a count query
          if (params && typeof params === 'object' && 'count' in params) {
            return mockCountSelect(params);
          }
          return mockSelect();
        }),
      } as any;

      const result = await listAgentsPaginated(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
        },
        pagination: { page: 1, limit: 5 },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual({
        data: expectedAgents,
        pagination: {
          page: 1,
          limit: 5,
          total: 10,
          pages: 2,
        },
      });
    });

    it('should use default pagination options', async () => {
      const expectedAgents = [{ id: 'agent-1', name: 'Agent 1' }];

      const mockSelect = vi.fn().mockReturnValue({
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

      const result = await listAgentsPaginated(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
        },
        pagination: {},
      });

      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        pages: 1,
      });
    });

    it('should enforce maximum limit', async () => {
      const expectedAgents: any[] = [];

      const mockSelect = vi.fn().mockReturnValue({
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

      const result = await listAgentsPaginated(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
        },
        pagination: { limit: 200 }, // Request more than max
      });

      // Should be capped at 100
      expect(result.pagination.limit).toBe(100);
    });
  });

  describe('updateAgent', () => {
    it('should update an agent', async () => {
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
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
        },
        agentId,
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.name).toBe(updateData.name);
      expect(result.description).toBe(updateData.description);
    });
  });

  describe('deleteAgent', () => {
    it('should delete an agent', async () => {
      const agentId = 'agent-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      // Mock getAgentById to return null (agent not found after deletion)
      const mockQuery = {
        agents: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      };

      const mockDb = {
        ...db,
        delete: mockDelete,
        query: mockQuery,
      } as any;

      const result = await deleteAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
        },
        agentId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true); // Returns true when agent is successfully deleted
    });
  });

  describe('getAgentsByIds', () => {
    it('should return empty array for empty id list', async () => {
      const result = await getAgentsByIds(db)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
        },
        agentIds: [],
      });

      expect(result).toEqual([]);
    });

    it('should retrieve multiple agents by ids', async () => {
      const agentIds = ['agent-1', 'agent-2'];
      const expectedAgents = [
        { id: 'agent-1', name: 'Agent 1' },
        { id: 'agent-2', name: 'Agent 2' },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(expectedAgents),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getAgentsByIds(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          graphId: testGraphId,
        },
        agentIds,
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(expectedAgents);
    });
  });
});
