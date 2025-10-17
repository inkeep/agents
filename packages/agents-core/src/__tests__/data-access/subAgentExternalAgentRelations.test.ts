import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '../../types/db';
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

describe('SubAgentExternalAgentRelations Data Access', () => {
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

  let mockDb: DatabaseClient;

  beforeEach(() => {
    mockDb = {
      query: {
        subAgentExternalAgentRelations: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
      },
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([relationData]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
    } as unknown as DatabaseClient;
  });

  describe('getSubAgentExternalAgentRelationById', () => {
    it('should retrieve a sub-agent external agent relation by id', async () => {
      vi.mocked(mockDb.query.subAgentExternalAgentRelations.findFirst).mockResolvedValue(
        relationData
      );

      const result = await getSubAgentExternalAgentRelationById(mockDb)({
        scopes,
        relationId: testRelationId,
      });

      expect(result).toEqual(relationData);
      expect(mockDb.query.subAgentExternalAgentRelations.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
      });
    });

    it('should return undefined when relation not found', async () => {
      vi.mocked(mockDb.query.subAgentExternalAgentRelations.findFirst).mockResolvedValue(
        undefined
      );

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
      vi.mocked(mockDb.orderBy).mockResolvedValue(relations);

      const result = await listSubAgentExternalAgentRelations(mockDb)({ scopes });

      expect(result.data).toEqual(relations);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return empty array when no relations found', async () => {
      vi.mocked(mockDb.orderBy).mockResolvedValue([]);

      const result = await listSubAgentExternalAgentRelations(mockDb)({ scopes });

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('getSubAgentExternalAgentRelations', () => {
    it('should get all relations for a subagent', async () => {
      const relations = [relationData];
      vi.mocked(mockDb.query.subAgentExternalAgentRelations.findMany).mockResolvedValue(relations);

      const result = await getSubAgentExternalAgentRelations(mockDb)({ scopes });

      expect(result).toEqual(relations);
      expect(mockDb.query.subAgentExternalAgentRelations.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
      });
    });
  });

  describe('getSubAgentExternalAgentRelationsByAgent', () => {
    it('should get all relations for an agent', async () => {
      const agentScopes = { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId };
      const relations = [relationData];
      vi.mocked(mockDb.query.subAgentExternalAgentRelations.findMany).mockResolvedValue(relations);

      const result = await getSubAgentExternalAgentRelationsByAgent(mockDb)({
        scopes: agentScopes,
      });

      expect(result).toEqual(relations);
      expect(mockDb.query.subAgentExternalAgentRelations.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
      });
    });
  });

  describe('createSubAgentExternalAgentRelation', () => {
    it('should create a new sub-agent external agent relation', async () => {
      const result = await createSubAgentExternalAgentRelation(mockDb)({
        scopes,
        data: {
          externalAgentId: testExternalAgentId,
          headers: { 'X-Custom-Header': 'test-value' },
        },
      });

      expect(result).toEqual(relationData);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
    });

    it('should generate relationId if not provided', async () => {
      const result = await createSubAgentExternalAgentRelation(mockDb)({
        scopes,
        data: {
          externalAgentId: testExternalAgentId,
        },
      });

      expect(result).toEqual(relationData);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('updateSubAgentExternalAgentRelation', () => {
    it('should update an existing sub-agent external agent relation', async () => {
      const updatedData = {
        ...relationData,
        headers: { 'X-Custom-Header': 'updated-value' },
      };
      vi.mocked(mockDb.returning).mockResolvedValue([updatedData]);

      const result = await updateSubAgentExternalAgentRelation(mockDb)({
        scopes,
        relationId: testRelationId,
        data: { headers: { 'X-Custom-Header': 'updated-value' } },
      });

      expect(result).toEqual(updatedData);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'X-Custom-Header': 'updated-value' },
          updatedAt: expect.any(String),
        })
      );
    });

    it('should return undefined when relation not found', async () => {
      vi.mocked(mockDb.returning).mockResolvedValue([]);

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
      vi.mocked(mockDb.where).mockResolvedValue({ rowsAffected: 1 } as any);

      const result = await deleteSubAgentExternalAgentRelation(mockDb)({
        scopes,
        relationId: testRelationId,
      });

      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should return false when no rows affected', async () => {
      vi.mocked(mockDb.where).mockResolvedValue({ rowsAffected: 0 } as any);

      const result = await deleteSubAgentExternalAgentRelation(mockDb)({
        scopes,
        relationId: testRelationId,
      });

      expect(result).toBe(false);
    });
  });

  describe('upsertSubAgentExternalAgentRelation', () => {
    it('should create a new relation when it does not exist', async () => {
      vi.mocked(mockDb.query.subAgentExternalAgentRelations.findFirst).mockResolvedValue(
        undefined
      );

      const result = await upsertSubAgentExternalAgentRelation(mockDb)({
        scopes,
        data: {
          externalAgentId: testExternalAgentId,
          headers: { 'X-Custom-Header': 'test-value' },
        },
      });

      expect(result).toEqual(relationData);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should return existing relation when it exists', async () => {
      vi.mocked(mockDb.query.subAgentExternalAgentRelations.findFirst).mockResolvedValue(
        relationData
      );

      const result = await upsertSubAgentExternalAgentRelation(mockDb)({
        scopes,
        data: {
          externalAgentId: testExternalAgentId,
          headers: { 'X-Custom-Header': 'updated-value' },
        },
      });

      expect(result).toEqual(relationData);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('deleteSubAgentExternalAgentRelationsBySubAgent', () => {
    it('should delete all relations for a subagent', async () => {
      vi.mocked(mockDb.where).mockResolvedValue({ rowsAffected: 2 } as any);

      const result = await deleteSubAgentExternalAgentRelationsBySubAgent(mockDb)({ scopes });

      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe('deleteSubAgentExternalAgentRelationsByAgent', () => {
    it('should delete all relations for an agent', async () => {
      const agentScopes = { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId };
      vi.mocked(mockDb.where).mockResolvedValue({ rowsAffected: 3 } as any);

      const result = await deleteSubAgentExternalAgentRelationsByAgent(mockDb)({
        scopes: agentScopes,
      });

      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
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
      vi.mocked(mockDb.orderBy).mockResolvedValue(joinedData);

      const result = await getExternalAgentsForSubAgent(mockDb)({ scopes });

      expect(result.data).toEqual(joinedData);
      expect(result.pagination).toBeDefined();
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.innerJoin).toHaveBeenCalled();
    });
  });

  describe('getSubAgentsForExternalAgent', () => {
    it('should get subagents for an external agent with join', async () => {
      const agentScopes = { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId };
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
      vi.mocked(mockDb.orderBy).mockResolvedValue(joinedData);

      const result = await getSubAgentsForExternalAgent(mockDb)({
        scopes: agentScopes,
        externalAgentId: testExternalAgentId,
      });

      expect(result.data).toEqual(joinedData);
      expect(result.pagination).toBeDefined();
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.innerJoin).toHaveBeenCalled();
    });
  });
});
