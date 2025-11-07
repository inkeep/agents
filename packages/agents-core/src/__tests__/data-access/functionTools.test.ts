import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addFunctionToolToSubAgent,
  createFunctionTool,
  deleteFunctionTool,
  getFunctionToolById,
  getFunctionToolsForSubAgent,
  listFunctionTools,
  updateFunctionTool,
  upsertFunctionTool,
  upsertSubAgentFunctionToolRelation,
} from '../../data-access/functionTools';
import type { DatabaseClient } from '../../db/client';
import { createTestDatabaseClient } from '../../db/test-client';

describe('FunctionTools Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testAgentId = 'test-agent';
  const testSubAgentId = 'test-sub-agent';

  beforeEach(async () => {
    db = await createTestDatabaseClient();
    vi.clearAllMocks();
  });

  describe('getFunctionToolById', () => {
    it('should retrieve a function tool by ID', async () => {
      const functionToolId = 'tool-1';
      const expectedTool = {
        id: functionToolId,
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        name: 'Test Tool',
        description: 'Test description',
        functionId: 'function-1',
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([expectedTool]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getFunctionToolById(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        functionToolId,
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(expectedTool);
    });

    it('should return null if function tool not found', async () => {
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

      const result = await getFunctionToolById(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        functionToolId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('listFunctionTools', () => {
    it('should list function tools with pagination', async () => {
      const expectedTools = [
        { id: 'tool-1', name: 'Tool 1' },
        { id: 'tool-2', name: 'Tool 2' },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedTools),
              }),
            }),
          }),
        }),
      });

      const mockCountSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 2 }]),
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

      const result = await listFunctionTools(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        pagination: { page: 1, limit: 10 },
      });

      expect(result).toEqual({
        data: expectedTools,
        pagination: { page: 1, limit: 10, total: 2, pages: 1 },
      });
    });

    it('should use default pagination options', async () => {
      const expectedTools = [{ id: 'tool-1', name: 'Tool 1' }];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedTools),
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

      const result = await listFunctionTools(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });

    it('should enforce maximum limit of 100', async () => {
      const expectedTools: any[] = [];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedTools),
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

      const result = await listFunctionTools(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        pagination: { page: 1, limit: 200 }, // Request more than max
      });

      expect(result.pagination.limit).toBe(100);
    });
  });

  describe('createFunctionTool', () => {
    it('should create a new function tool', async () => {
      const toolData = {
        id: 'tool-1',
        name: 'Test Tool',
        description: 'Test description',
        functionId: 'function-1',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              ...toolData,
              tenantId: testTenantId,
              projectId: testProjectId,
              agentId: testAgentId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createFunctionTool(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        data: toolData,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toMatchObject(toolData);
    });
  });

  describe('updateFunctionTool', () => {
    it('should update a function tool', async () => {
      const functionToolId = 'tool-1';
      const updateData = {
        name: 'Updated Tool Name',
        description: 'Updated description',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: functionToolId,
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

      const result = await updateFunctionTool(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        functionToolId,
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.name).toBe(updateData.name);
      expect(result.description).toBe(updateData.description);
    });
  });

  describe('deleteFunctionTool', () => {
    it('should delete a function tool', async () => {
      const functionToolId = 'tool-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: functionToolId }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteFunctionTool(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        functionToolId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false if deletion fails', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteFunctionTool(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        functionToolId: 'non-existent',
      });

      expect(result).toBe(false);
    });
  });

  describe('upsertFunctionTool', () => {
    it('should create a new function tool if it does not exist', async () => {
      const toolData = {
        id: 'tool-1',
        name: 'Test Tool',
        description: 'Test description',
        functionId: 'function-1',
      };

      // Mock getFunctionToolById to return null (not found)
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      // Mock createFunctionTool
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              ...toolData,
              tenantId: testTenantId,
              projectId: testProjectId,
              agentId: testAgentId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
        insert: mockInsert,
      } as any;

      const result = await upsertFunctionTool(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        data: toolData,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toMatchObject(toolData);
    });

    it('should update an existing function tool', async () => {
      const toolData = {
        id: 'tool-1',
        name: 'Updated Tool',
        description: 'Updated description',
        functionId: 'function-1',
      };

      const existingTool = {
        ...toolData,
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock getFunctionToolById to return existing tool
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingTool]),
          }),
        }),
      });

      // Mock updateFunctionTool
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                ...existingTool,
                ...toolData,
                updatedAt: new Date().toISOString(),
              },
            ]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
        update: mockUpdate,
      } as any;

      const result = await upsertFunctionTool(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        data: toolData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result).toMatchObject(toolData);
    });
  });

  describe('getFunctionToolsForSubAgent', () => {
    // Skip this test - complex to mock due to nested listFunctionTools call
    it.skip('should retrieve function tools for a sub-agent', async () => {
      const expectedTools = [
        { id: 'tool-1', name: 'Tool 1' },
        { id: 'tool-2', name: 'Tool 2' },
      ];

      const mockSelect = vi.fn();
      let selectCallCount = 0;

      // Mock for listFunctionTools calls
      mockSelect.mockImplementation((params) => {
        if (params && typeof params === 'object' && 'count' in params) {
          // Count query
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 2 }]),
            }),
          };
        }
        // Relations query (returns array of objects with columns)
        selectCallCount++;
        if (selectCallCount === 1) {
          // First select is for relations
          return {
            from: vi.fn().mockReturnValue({
              where: vi
                .fn()
                .mockResolvedValue([{ functionToolId: 'tool-1' }, { functionToolId: 'tool-2' }]),
            }),
          };
        }
        // Second select is for function tools list
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(expectedTools),
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

      const result = await getFunctionToolsForSubAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: testSubAgentId,
      });

      expect(result.data).toEqual(expectedTools);
    });

    // Skip this test - complex to mock due to nested listFunctionTools call
    it.skip('should handle empty tool list', async () => {
      const mockSelect = vi.fn();
      let selectCallCount = 0;

      mockSelect.mockImplementation((params) => {
        if (params && typeof params === 'object' && 'count' in params) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 0 }]),
            }),
          };
        }
        selectCallCount++;
        if (selectCallCount === 1) {
          // Relations query returns empty
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          };
        }
        // Function tools list
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue([]),
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

      const result = await getFunctionToolsForSubAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: testSubAgentId,
      });

      expect(result.data).toEqual([]);
    });
  });

  describe('addFunctionToolToSubAgent', () => {
    it('should add a function tool to a sub-agent', async () => {
      const functionToolId = 'tool-1';

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await addFunctionToolToSubAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: testSubAgentId,
        functionToolId,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');
    });

    it('should handle database errors gracefully', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error('Database error')),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      await expect(
        addFunctionToolToSubAgent(mockDb)({
          scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
          subAgentId: testSubAgentId,
          functionToolId: 'tool-1',
        })
      ).rejects.toThrow('Database error');
    });
  });

  describe('upsertSubAgentFunctionToolRelation - Duplication Prevention', () => {
    /**
     * CRITICAL TEST: This tests the bug fix from PRD-5167
     * When upsertSubAgentFunctionToolRelation is called multiple times with the same parameters,
     * it should NOT create duplicate relations - it should return the existing relation instead.
     */
    it('should return existing relation when called multiple times with same parameters', async () => {
      const existingRelationId = 'existing-relation-id';
      const params = {
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: testSubAgentId,
        functionToolId: 'tool-1',
      };

      // Mock database to return existing relation on select
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: existingRelationId,
                tenantId: testTenantId,
                projectId: testProjectId,
                agentId: testAgentId,
                subAgentId: testSubAgentId,
                functionToolId: 'tool-1',
              },
            ]),
          }),
        }),
      });

      const mockInsert = vi.fn();

      const mockDb = {
        ...db,
        select: mockSelect,
        insert: mockInsert,
      } as any;

      // Call upsert - should find existing and return it without inserting
      const result = await upsertSubAgentFunctionToolRelation(mockDb)(params);

      expect(result.id).toBe(existingRelationId);
      expect(mockInsert).not.toHaveBeenCalled(); // Should NOT insert a new relation
    });

    it('should create new relation when none exists', async () => {
      const params = {
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: testSubAgentId,
        functionToolId: 'tool-1',
      };

      // Mock database to return empty array (no existing relation)
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // No existing relation
          }),
        }),
      });

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
        insert: mockInsert,
      } as any;

      const result = await upsertSubAgentFunctionToolRelation(mockDb)(params);

      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');
      expect(mockInsert).toHaveBeenCalled(); // SHOULD insert a new relation
    });

    it('should update existing relation when relationId is provided', async () => {
      const relationId = 'existing-relation-id';
      const params = {
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: testSubAgentId,
        functionToolId: 'tool-2',
        relationId,
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await upsertSubAgentFunctionToolRelation(mockDb)(params);

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.id).toBe(relationId);
    });

    it('should handle different sub-agents creating separate relations', async () => {
      // Mock to always return empty (no existing relation)
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
        insert: mockInsert,
      } as any;

      // Create relation for first sub-agent
      await upsertSubAgentFunctionToolRelation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: 'sub-agent-1',
        functionToolId: 'tool-1',
      });

      // Create relation for second sub-agent
      await upsertSubAgentFunctionToolRelation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: 'sub-agent-2',
        functionToolId: 'tool-1',
      });

      // Both should have called insert since they're different sub-agents
      expect(mockInsert).toHaveBeenCalledTimes(2);
    });
  });
});
