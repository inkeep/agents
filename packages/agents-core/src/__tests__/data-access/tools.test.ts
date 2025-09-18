import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addToolToAgent,
  createTool,
  deleteTool,
  getToolById,
  getToolsByStatus,
  listTools,
  removeToolFromAgent,
  updateTool,
  updateToolStatus,
} from '../../data-access/tools';
import type { DatabaseClient } from '../../db/client';
import { createInMemoryDatabaseClient } from '../../db/client';
import type { ToolInsert } from '../../types/index';

describe('Tools Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testGraphId = 'test-graph';
  const testToolId = 'test-tool';
  const testAgentId = 'test-agent';

  beforeEach(() => {
    db = createInMemoryDatabaseClient();
    vi.restoreAllMocks();
  });

  describe('getToolById', () => {
    it('should retrieve a tool by ID', async () => {
      const expectedTool = {
        id: testToolId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Test Tool',
        type: 'function',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        tools: {
          findFirst: vi.fn().mockResolvedValue(expectedTool),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getToolById(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        toolId: testToolId,
      });

      expect(mockQuery.tools.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedTool);
    });

    it('should return null when tool not found', async () => {
      const mockQuery = {
        tools: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getToolById(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        toolId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('listTools', () => {
    it('should list tools with pagination', async () => {
      const expectedTools = [
        {
          id: 'tool-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          name: 'Tool 1',
          type: 'function',
          status: 'active',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockSelect = vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(expectedTools),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listTools(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: { page: 1, limit: 10 },
      });

      expect(mockSelect).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        data: expectedTools,
        pagination: { page: 1, limit: 10, total: 1, pages: 1 },
      });
    });

    it('should use default pagination values', async () => {
      const expectedTools: ToolInsert[] = [];

      const mockSelect = vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(expectedTools),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listTools(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: {},
      });

      expect(result).toEqual({
        data: expectedTools,
        pagination: { page: 1, limit: 10, total: 0, pages: 0 },
      });
    });
  });

  describe('getToolsByStatus', () => {
    it('should retrieve tools by status', async () => {
      const expectedTools = [
        {
          id: 'tool-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          name: 'Active Tool',
          status: 'active',
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(expectedTools),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getToolsByStatus(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        status: 'active',
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(expectedTools);
    });
  });

  describe('createTool', () => {
    it('should create a new tool', async () => {
      const toolData = {
        id: testToolId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'New Tool',
        type: 'function',
        status: 'active',
        definition: { schema: { type: 'object' } },
      };

      const expectedTool = {
        ...toolData,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedTool]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createTool(mockDb)({
        ...toolData,
        config: { type: 'mcp', mcp: { server: { url: 'http://localhost:8000' } } },
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedTool);
    });
  });

  describe('updateTool', () => {
    it('should update an existing tool', async () => {
      const updateData = {
        name: 'Updated Tool',
        status: 'inactive',
      };

      const expectedTool = {
        id: testToolId,
        tenantId: testTenantId,
        projectId: testProjectId,
        ...updateData,
        updatedAt: expect.any(String),
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([expectedTool]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateTool(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        toolId: testToolId,
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result).toEqual(expectedTool);
    });
  });

  describe('deleteTool', () => {
    it('should delete a tool', async () => {
      const expectedTool = {
        id: testToolId,
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Deleted Tool',
      };

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedTool]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteTool(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        toolId: testToolId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toEqual(true);
    });
  });

  describe('addToolToAgent', () => {
    it('should add a tool to an agent', async () => {
      const expectedRelation = {
        id: expect.any(String),
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        toolId: testToolId,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedRelation]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await addToolToAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: testGraphId },
        agentId: testAgentId,
        toolId: testToolId,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedRelation);
    });
    it('should add a tool to an agent with selectedTools specified', async () => {
      const selectedTools = ['tool_capability_1', 'tool_capability_2'];
      const expectedRelation = {
        id: expect.any(String),
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        toolId: testToolId,
        selectedTools,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedRelation]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await addToolToAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: testGraphId },
        agentId: testAgentId,
        toolId: testToolId,
        selectedTools,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedRelation);
    });

    it('should add a tool to an agent with empty selectedTools array', async () => {
      const selectedTools: string[] = [];
      const expectedRelation = {
        id: expect.any(String),
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        toolId: testToolId,
        selectedTools,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedRelation]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await addToolToAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: testGraphId },
        agentId: testAgentId,
        toolId: testToolId,
        selectedTools,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedRelation);
    });
  });

  describe('removeToolFromAgent', () => {
    it('should remove a tool from an agent', async () => {
      const expectedRelation = {
        id: 'rel-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        agentId: testAgentId,
        toolId: testToolId,
      };

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedRelation]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await removeToolFromAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, graphId: testGraphId },
        agentId: testAgentId,
        toolId: testToolId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toEqual(expectedRelation);
    });
  });

  describe('updateToolStatus', () => {
    it('should update tool status using updateTool', async () => {
      const expectedTool = {
        id: testToolId,
        tenantId: testTenantId,
        projectId: testProjectId,
        status: 'inactive',
        lastHealthCheck: expect.any(String),
        lastError: 'Connection failed',
        updatedAt: expect.any(String),
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([expectedTool]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateToolStatus(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        toolId: testToolId,
        status: 'inactive',
        lastError: 'Connection failed',
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result).toEqual(expectedTool);
    });

    it('should use current timestamp for lastHealthCheck when not provided', async () => {
      const expectedTool = {
        id: testToolId,
        status: 'active',
        lastHealthCheck: expect.any(String),
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([expectedTool]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateToolStatus(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        toolId: testToolId,
        status: 'active',
      });

      expect(result.lastHealthCheck).toBeDefined();
    });
  });
});
