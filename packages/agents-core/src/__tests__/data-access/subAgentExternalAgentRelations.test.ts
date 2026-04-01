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
} from '../../data-access/manage/subAgentExternalAgentRelations';
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

describe('SubAgentExternalAgentRelations Data Access', () => {
  let db: AgentsManageDatabaseClient;
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
    db = testManageDbClient;
    vi.clearAllMocks();
  });

  describe('getSubAgentExternalAgentRelationById', () => {
    it('should retrieve a sub-agent external agent relation by id', async () => {
      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain([relationData])),
      } as any;

      const result = await getSubAgentExternalAgentRelationById(mockDb)({
        scopes,
        relationId: testRelationId,
      });

      expect(result).toEqual(relationData);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return undefined when relation not found', async () => {
      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain([])),
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

      const dataChain = createMockSelectChain(relations);
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

      const result = await listSubAgentExternalAgentRelations(mockDb)({ scopes });

      expect(result.data).toEqual(relations);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return empty array when no relations found', async () => {
      const dataChain = createMockSelectChain([]);
      const countChain = createMockSelectChain([{ count: 0 }]);

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return dataChain;
          return countChain;
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

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain(relations)),
      } as any;

      const result = await getSubAgentExternalAgentRelations(mockDb)({ scopes });

      expect(result).toEqual(relations);
      expect(mockDb.select).toHaveBeenCalled();
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

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain(relations)),
      } as any;

      const result = await getSubAgentExternalAgentRelationsByAgent(mockDb)({
        scopes: agentScopes,
      });

      expect(result).toEqual(relations);
      expect(mockDb.select).toHaveBeenCalled();
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
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: testRelationId }]),
        }),
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
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
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
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([relationData]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain([])),
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
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'rel-1' }, { id: 'rel-2' }]),
        }),
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
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'rel-1' }, { id: 'rel-2' }, { id: 'rel-3' }]),
        }),
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

      const dataChain = createMockSelectChain(joinedData);
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

      const result = await getExternalAgentsForSubAgent(mockDb)({ scopes });

      expect(result.data).toEqual(joinedData);
      expect(result.pagination).toBeDefined();
      expect(mockDb.select).toHaveBeenCalled();
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

      const dataChain = createMockSelectChain(joinedData);
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

      const result = await getSubAgentsForExternalAgent(mockDb)({
        scopes: agentScopes,
        externalAgentId: testExternalAgentId,
      });

      expect(result.data).toEqual(joinedData);
      expect(result.pagination).toBeDefined();
      expect(mockDb.select).toHaveBeenCalled();
    });
  });
});
