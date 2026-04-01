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
} from '../../data-access/manage/subAgentRelations';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
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

describe('Agent Relations Data Access', () => {
  let db: AgentsManageDatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testAgentId = 'test-agent';

  beforeEach(async () => {
    db = testManageDbClient;
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

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain([expectedRelation])),
      } as any;

      const result = await getAgentRelationById(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        relationId,
      });

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(expectedRelation);
    });

    it('should return undefined if relation not found', async () => {
      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain([])),
      } as any;

      const result = await getAgentRelationById(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        relationId: 'non-existent',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('listAgentRelations', () => {
    it('should list agent relations with pagination', async () => {
      const expectedRelations = [
        { id: 'relation-1', sourceSubAgentId: 'agent-1', targetSubAgentId: 'agent-2' },
        { id: 'relation-2', sourceSubAgentId: 'agent-2', targetSubAgentId: 'agent-3' },
      ];

      const dataChain = createMockSelectChain(expectedRelations);
      const countChain = createMockSelectChain([{ count: 2 }]);

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return dataChain;
          return countChain;
        }),
      } as any;

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

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual({
        data: expectedRelations,
        pagination: { page: 1, limit: 10, total: 2, pages: 1 },
      });
    });
  });

  describe('getAgentRelations', () => {
    it('should get relations for a specific agent', async () => {
      const expectedRelations = [
        { id: 'relation-1', sourceSubAgentId: 'agent-1', targetSubAgentId: 'agent-2' },
      ];

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain(expectedRelations)),
      } as any;

      const result = await getAgentRelations(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
          subAgentId: 'agent-1',
        },
      });

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(expectedRelations);
    });
  });

  describe('getAgentRelationsBySource', () => {
    it('should get relations by source agent', async () => {
      const expectedRelations = [
        { id: 'relation-1', sourceSubAgentId: 'agent-1', targetSubAgentId: 'agent-2' },
      ];

      const dataChain = createMockSelectChain(expectedRelations);
      const countChain = createMockSelectChain([{ count: 1 }]);

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return dataChain;
          return countChain;
        }),
      } as any;

      const result = await getAgentRelationsBySource(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        sourceSubAgentId: 'agent-1',
      });

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual({
        data: expectedRelations,
        pagination: { page: 1, limit: 10, total: 1, pages: 1 },
      });
    });
  });

  describe('getAgentRelationsByTarget', () => {
    it('should get relations by target agent', async () => {
      const expectedRelations = [
        { id: 'relation-1', sourceSubAgentId: 'agent-1', targetSubAgentId: 'agent-2' },
      ];

      const dataChain = createMockSelectChain(expectedRelations);
      const countChain = createMockSelectChain([{ count: 1 }]);

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return dataChain;
          return countChain;
        }),
      } as any;

      const result = await getSubAgentRelationsByTarget(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
        },
        targetSubAgentId: 'agent-2',
      });

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual({
        data: expectedRelations,
        pagination: { page: 1, limit: 10, total: 1, pages: 1 },
      });
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

      const dataChain = createMockSelectChain(expectedTools);
      const countChain = createMockSelectChain([{ count: 1 }]);

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return dataChain;
          return countChain;
        }),
      } as any;

      const result = await getToolsForAgent(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
          subAgentId: 'agent-1',
        },
      });

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual({
        data: expectedTools,
        pagination: { page: 1, limit: 10, total: 1, pages: 1 },
      });
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
