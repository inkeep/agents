import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createInMemoryDatabaseClient } from '../../db/client';
import {
  getDataComponent,
  listDataComponents,
  listDataComponentsPaginated,
  createDataComponent,
  updateDataComponent,
  deleteDataComponent,
  getDataComponentsForAgent,
  associateDataComponentWithAgent,
  removeDataComponentFromAgent,
  getAgentsUsingDataComponent,
  isDataComponentAssociatedWithAgent,
  countDataComponents,
} from '../../data-access/dataComponents';
import type { DatabaseClient } from '../../db/client';
import type { DataComponentInsert, ScopeConfig } from '../../types/index';

describe('Data Components Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'tenant-123';
  const testProjectId = 'project-456';
  const testDataComponentId = 'component-789';
  const testAgentId = 'agent-123';

  beforeEach(() => {
    db = createInMemoryDatabaseClient();
  });

  describe('getDataComponent', () => {
    it('should retrieve a data component by ID', async () => {
      const expectedComponent = {
        id: testDataComponentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Component',
        description: 'A test data component',
        props: { key: 'value' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        dataComponents: {
          findFirst: vi.fn().mockResolvedValue(expectedComponent),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getDataComponent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        dataComponentId: testDataComponentId,
      });

      expect(mockQuery.dataComponents.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedComponent);
    });

    it('should return null if data component not found', async () => {
      const mockQuery = {
        dataComponents: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getDataComponent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        dataComponentId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('listDataComponents', () => {
    it('should list all data components for a project', async () => {
      const expectedComponents = [
        {
          id: 'component-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          name: 'Component 1',
          description: 'First component',
          props: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'component-2',
          tenantId: testTenantId,
          projectId: testProjectId,
          name: 'Component 2',
          description: 'Second component',
          props: { test: true },
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(expectedComponents),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await listDataComponents(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toEqual(expectedComponents);
    });

    it('should return empty array when no components found', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await listDataComponents(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toEqual([]);
    });
  });

  describe('listDataComponentsPaginated', () => {
    it('should list data components with pagination', async () => {
      const expectedComponents = [
        {
          id: 'component-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          name: 'Component 1',
          description: 'First component',
          props: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedComponents),
              }),
            }),
          }),
        }),
      });

      const mockCountQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation((fields) => {
          if (fields && 'count' in fields) {
            return mockCountQuery();
          }
          return mockQuery();
        }),
      } as any;

      // Mock Promise.all
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedComponents, [{ count: 5 }]]);

      const result = await listDataComponentsPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: { page: 1, limit: 10 },
      });

      expect(result).toEqual({
        data: expectedComponents,
        pagination: { page: 1, limit: 10, total: 5, pages: 1 },
      });

      vi.restoreAllMocks();
    });

    it('should handle default pagination options', async () => {
      const expectedComponents: any[] = [];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedComponents),
              }),
            }),
          }),
        }),
      });

      const mockCountQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation((fields) => {
          if (fields && 'count' in fields) {
            return mockCountQuery();
          }
          return mockQuery();
        }),
      } as any;

      // Mock Promise.all
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedComponents, [{ count: 0 }]]);

      const result = await listDataComponentsPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toEqual({
        data: expectedComponents,
        pagination: { page: 1, limit: 10, total: 0, pages: 0 },
      });

      vi.restoreAllMocks();
    });

    it('should enforce maximum limit', async () => {
      const expectedComponents: any[] = [];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedComponents),
              }),
            }),
          }),
        }),
      });

      const mockCountQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '0' }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockImplementation((fields) => {
          if (fields && 'count' in fields) {
            return mockCountQuery();
          }
          return mockQuery();
        }),
      } as any;

      // Mock Promise.all
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedComponents, [{ count: '0' }]]);

      const result = await listDataComponentsPaginated(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: { page: 1, limit: 150 }, // Above max of 100
      });

      expect(result.pagination.limit).toBe(100);

      vi.restoreAllMocks();
    });
  });

  describe('createDataComponent', () => {
    it('should create a new data component', async () => {
      const componentData: DataComponentInsert = {
        id: testDataComponentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'New Component',
        description: 'A new test component',
        props: { key: 'value' },
      };

      const expectedComponent = {
        ...componentData,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedComponent]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createDataComponent(mockDb)(componentData);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedComponent);
    });

    it('should create a data component with generated ID when not provided', async () => {
      const componentData: DataComponentInsert = {
        id: 'generated-id',
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'New Component',
        description: 'A new test component',
        props: { key: 'value' },
      };

      const expectedComponent = {
        ...componentData,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedComponent]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createDataComponent(mockDb)(componentData);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedComponent);
    });
  });

  describe('updateDataComponent', () => {
    it('should update a data component', async () => {
      const updateData = {
        name: 'Updated Component',
        description: 'Updated description',
      };

      const expectedComponent = {
        id: testDataComponentId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Updated Component',
        description: 'Updated description',
        props: { key: 'value' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T12:00:00Z',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const mockQuery = {
        dataComponents: {
          findFirst: vi.fn().mockResolvedValue(expectedComponent),
        },
      };

      const mockDb = {
        ...db,
        update: mockUpdate,
        query: mockQuery,
      } as any;

      const result = await updateDataComponent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        dataComponentId: testDataComponentId,
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockQuery.dataComponents.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedComponent);
    });

    it('should return null if data component not found after update', async () => {
      const updateData = {
        name: 'Updated Component',
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const mockQuery = {
        dataComponents: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        update: mockUpdate,
        query: mockQuery,
      } as any;

      const result = await updateDataComponent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        dataComponentId: 'non-existent',
        data: updateData,
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteDataComponent', () => {
    it('should delete a data component successfully', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: testDataComponentId }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteDataComponent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        dataComponentId: testDataComponentId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when data component does not exist', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteDataComponent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        dataComponentId: 'non-existent',
      });

      expect(result).toBe(false);
    });
  });

  describe('getDataComponentsForAgent', () => {
    it('should retrieve data components for a specific agent', async () => {
      const expectedComponents = [
        {
          id: 'component-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          name: 'Agent Component 1',
          description: 'First agent component',
          props: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(expectedComponents),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await getDataComponentsForAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        agentId: testAgentId,
      });

      expect(result).toEqual(expectedComponents);
    });

    it('should return empty array when agent has no data components', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await getDataComponentsForAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        agentId: testAgentId,
      });

      expect(result).toEqual([]);
    });
  });

  describe('associateDataComponentWithAgent', () => {
    it('should create association between data component and agent', async () => {
      const expectedAssociation = {
        id: 'association-123',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        dataComponentId: testDataComponentId,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedAssociation]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await associateDataComponentWithAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        agentId: testAgentId,
        dataComponentId: testDataComponentId,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedAssociation);
    });
  });

  describe('removeDataComponentFromAgent', () => {
    it('should remove association between data component and agent', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'association-123' }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await removeDataComponentFromAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        agentId: testAgentId,
        dataComponentId: testDataComponentId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when association does not exist', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await removeDataComponentFromAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        agentId: testAgentId,
        dataComponentId: 'non-existent',
      });

      expect(result).toBe(false);
    });
  });

  describe('getAgentsUsingDataComponent', () => {
    it('should retrieve agents using a data component', async () => {
      const expectedAgents = [
        {
          agentId: 'agent-1',
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          agentId: 'agent-2',
          createdAt: '2024-01-02T00:00:00Z',
        },
      ];

      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(expectedAgents),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await getAgentsUsingDataComponent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        dataComponentId: testDataComponentId,
      });

      expect(result).toEqual(expectedAgents);
    });

    it('should return empty array when no agents use the data component', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await getAgentsUsingDataComponent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        dataComponentId: testDataComponentId,
      });

      expect(result).toEqual([]);
    });
  });

  describe('isDataComponentAssociatedWithAgent', () => {
    it('should return true when data component is associated with agent', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'association-123' }]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await isDataComponentAssociatedWithAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        agentId: testAgentId,
        dataComponentId: testDataComponentId,
      });

      expect(result).toBe(true);
    });

    it('should return false when data component is not associated with agent', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await isDataComponentAssociatedWithAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        agentId: testAgentId,
        dataComponentId: testDataComponentId,
      });

      expect(result).toBe(false);
    });
  });

  describe('countDataComponents', () => {
    it('should count data components for a project', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await countDataComponents(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toBe(5);
    });

    it('should handle string count values', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '7' }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await countDataComponents(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toBe(7);
    });

    it('should return 0 when no count result', async () => {
      const mockQuery = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockQuery,
      } as any;

      const result = await countDataComponents(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toBe(0);
    });
  });
});
