import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countContextConfigs,
  createContextConfig,
  deleteContextConfig,
  getContextConfigById,
  getContextConfigsByName,
  hasContextConfig,
  listContextConfigs,
  listContextConfigsPaginated,
  updateContextConfig,
} from '../../data-access/contextConfigs.js';
import type { DatabaseClient } from '../../db/client.js';
import { createInMemoryDatabaseClient } from '../../db/client.js';

describe('Context Configs Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';

  beforeEach(() => {
    db = createInMemoryDatabaseClient();
  });

  describe('getContextConfigById', () => {
    it('should retrieve a context config by id', async () => {
      const contextConfigId = 'context-1';
      const expectedContextConfig = {
        id: contextConfigId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Context Config',
        description: 'Test context configuration',
        requestContextSchema: { type: 'object' },
        contextVariables: {
          testVar: {
            id: 'testVar',
            trigger: 'initialization',
            fetchConfig: { url: 'https://api.example.com/data' },
          },
        },
        createdAt: '2024-01-01T00:00:00.00Z',
        updatedAt: '2024-01-01T00:00:00.00Z',
      };

      const mockQuery = {
        contextConfigs: {
          findFirst: vi.fn().mockResolvedValue(expectedContextConfig),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getContextConfigById(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: contextConfigId,
      });

      expect(mockQuery.contextConfigs.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedContextConfig);
    });

    it('should return null if context config not found', async () => {
      const mockQuery = {
        contextConfigs: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getContextConfigById(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: 'non-existent',
      });

      expect(result).toBeNull();
    });

    it('should handle null contextVariables', async () => {
      const contextConfig = {
        id: 'context-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Context Config',
        description: 'Test context configuration',
        requestContextSchema: null,
        contextVariables: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        contextConfigs: {
          findFirst: vi.fn().mockResolvedValue(contextConfig),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getContextConfigById(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: 'context-1',
      });

      expect(result?.contextVariables).toBeNull();
    });
  });

  describe('listContextConfigs', () => {
    it('should list all context configs for a project', async () => {
      const expectedConfigs = [
        {
          id: 'context-1',
          name: 'Config 1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          contextVariables: null,
        },
        {
          id: 'context-2',
          name: 'Config 2',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          contextVariables: { testVar: { id: 'test' } },
        },
      ];

      const mockQuery = {
        contextConfigs: {
          findMany: vi.fn().mockResolvedValue(expectedConfigs),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await listContextConfigs(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(mockQuery.contextConfigs.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[1].contextVariables).toEqual({ testVar: { id: 'test' } });
    });
  });

  describe('listContextConfigsPaginated', () => {
    it('should list context configs with pagination', async () => {
      const expectedConfigs = [
        {
          id: 'context-1',
          name: 'Config 1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          contextVariables: null,
        },
        {
          id: 'context-2',
          name: 'Config 2',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          contextVariables: {},
        },
      ];

      const mockSelect = vi.fn().mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedConfigs),
              }),
            }),
          }),
        }),
      });

      const mockCountSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '2' }]),
        }),
      });

      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValueOnce(mockSelect()).mockReturnValueOnce(mockCountSelect()),
      } as any;

      // Mock Promise.all
      vi.spyOn(Promise, 'all').mockResolvedValue([expectedConfigs, [{ count: '2' }]]);

      const result = await listContextConfigsPaginated(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        pagination: {
          page: 1,
          limit: 10,
        },
      });

      expect(result).toEqual({
        data: expectedConfigs,
        pagination: { page: 1, limit: 10, total: 2, pages: 1 },
      });

      vi.restoreAllMocks();
    });

    it('should handle default pagination options', async () => {
      const expectedConfigs = [{ id: 'context-1', name: 'Config 1' }];

      vi.spyOn(Promise, 'all').mockResolvedValue([expectedConfigs, [{ count: '1' }]]);

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedConfigs),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listContextConfigsPaginated(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);

      vi.restoreAllMocks();
    });

    it('should enforce maximum limit', async () => {
      const expectedConfigs = [{ id: 'context-1' }];

      vi.spyOn(Promise, 'all').mockResolvedValue([expectedConfigs, [{ count: '1' }]]);

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedConfigs),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listContextConfigsPaginated(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        pagination: {
          limit: 200,
        },
      });

      expect(result.pagination.limit).toBe(100); // Should be capped

      vi.restoreAllMocks();
    });
  });

  describe('createContextConfig', () => {
    it('should create a new context config', async () => {
      const configData = {
        id: 'test-config-id',
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Context Config',
        description: 'Test context configuration',
        requestContextSchema: { type: 'object' },
        contextVariables: {
          testVar: {
            id: 'testVar',
            trigger: 'initialization' as const,
            fetchConfig: { url: 'https://api.example.com/data' },
          },
        },
      };

      const expectedConfig = {
        ...configData,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedConfig]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createContextConfig(mockDb)(configData);

      expect(mockInsert).toHaveBeenCalled();
      expect(result.contextVariables).toEqual(configData.contextVariables);
    });

    it('should create a context config with custom id', async () => {
      const configData = {
        id: 'custom-id',
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Context Config',
        description: 'Test context configuration',
        requestContextSchema: null,
        contextVariables: null,
      };

      const expectedConfig = {
        ...configData,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedConfig]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createContextConfig(mockDb)(configData);

      expect(result.id).toBe('custom-id');
    });

    it('should convert empty contextVariables object to null', async () => {
      const configData = {
        id: 'test-config-empty',
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Context Config',
        description: 'Test context configuration',
        contextVariables: {}, // Empty object should become null
      };

      const expectedConfig = {
        ...configData,
        contextVariables: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedConfig]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      await createContextConfig(mockDb)(configData);

      // Verify that the values call was made with null contextVariables
      expect(mockInsert().values).toHaveBeenCalledWith(
        expect.objectContaining({
          contextVariables: null,
        })
      );
    });
  });

  describe('updateContextConfig', () => {
    it('should update a context config', async () => {
      const configId = 'context-1';
      const updateData = {
        name: 'Updated Context Config',
        description: 'Updated description',
        contextVariables: {
          newVar: {
            id: 'newVar',
            trigger: 'invocation' as const,
            fetchConfig: { url: 'https://api.example.com/updated' },
          },
        },
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: configId,
                ...updateData,
                createdAt: '2024-01-01T00:00:00Z',
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

      const result = await updateContextConfig(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: configId,
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.name).toBe(updateData.name);
      expect(result.description).toBe(updateData.description);
    });

    it('should handle clearing contextVariables with null', async () => {
      const updateData = {
        contextVariables: null,
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 'context-1',
                name: 'Test Config',
                contextVariables: null,
                createdAt: '2024-01-01T00:00:00Z',
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

      const result = await updateContextConfig(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: 'context-1',
        data: updateData,
      });

      expect(result.contextVariables).toBeNull();
    });

    it('should handle clearing contextVariables with empty object', async () => {
      const updateData = {
        contextVariables: {}, // Empty object should become null
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 'context-1',
                name: 'Test Config',
                contextVariables: null,
                createdAt: '2024-01-01T00:00:00Z',
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

      await updateContextConfig(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: 'context-1',
        data: updateData,
      });

      // Verify that the set method was called with null contextVariables
      expect(mockUpdate().set).toHaveBeenCalledWith(
        expect.objectContaining({
          contextVariables: null,
        })
      );
    });

    it('should handle clearing requestContextSchema', async () => {
      const updateData = {
        requestContextSchema: null,
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 'context-1',
                name: 'Test Config',
                requestContextSchema: null,
                createdAt: '2024-01-01T00:00:00Z',
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

      await updateContextConfig(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: 'context-1',
        data: updateData,
      });

      // Verify that the set method was called with null requestContextSchema
      expect(mockUpdate().set).toHaveBeenCalledWith(
        expect.objectContaining({
          requestContextSchema: null,
        })
      );
    });
  });

  describe('deleteContextConfig', () => {
    it('should delete a context config successfully', async () => {
      const configId = 'context-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: configId }]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteContextConfig(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: configId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when deletion fails', async () => {
      const configId = 'context-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      // Mock console.error to avoid test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await deleteContextConfig(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: configId,
      });

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should return false when no rows deleted', async () => {
      const configId = 'context-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]), // No rows deleted
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteContextConfig(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: configId,
      });

      expect(result).toBe(false);
    });
  });

  describe('hasContextConfig', () => {
    it('should return true when context config exists', async () => {
      const configId = 'context-1';
      const existingConfig = {
        id: configId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Config',
        description: 'Test description',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        contextConfigs: {
          findFirst: vi.fn().mockResolvedValue(existingConfig),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await hasContextConfig(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: configId,
      });

      expect(result).toBe(true);
    });

    it('should return false when context config does not exist', async () => {
      const mockQuery = {
        contextConfigs: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await hasContextConfig(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        id: 'non-existent',
      });

      expect(result).toBe(false);
    });
  });

  describe('countContextConfigs', () => {
    it('should count context configs for a project', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countContextConfigs(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toBe(5);
    });

    it('should handle string count values', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '10' }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countContextConfigs(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(result).toBe(10);
    });

    it('should return 0 when no count result', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countContextConfigs(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      });

      expect(result).toBe(0);
    });
  });

  describe('getContextConfigsByName', () => {
    it('should get context configs by name', async () => {
      const configName = 'Test Config';
      const expectedConfigs = [
        {
          id: 'context-1',
          name: configName,
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        {
          id: 'context-2',
          name: configName,
          tenantId: testTenantId,
          projectId: testProjectId,
        },
      ];

      const mockQuery = {
        contextConfigs: {
          findMany: vi.fn().mockResolvedValue(expectedConfigs),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getContextConfigsByName(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        name: configName,
      });

      expect(mockQuery.contextConfigs.findMany).toHaveBeenCalled();
      expect(result).toEqual(expectedConfigs);
    });

    it('should return empty array when no configs found by name', async () => {
      const mockQuery = {
        contextConfigs: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getContextConfigsByName(mockDb)({
        scopes: {
          tenantId: testTenantId,
          projectId: testProjectId,
        },
        name: 'Non-existent Config',
      });

      expect(result).toEqual([]);
    });
  });
});
