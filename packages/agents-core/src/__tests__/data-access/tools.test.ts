import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addToolToAgent,
  createTool,
  deleteTool,
  getToolById,
  listTools,
  removeToolFromAgent,
  updateTool,
} from '../../data-access/tools';
import type { DatabaseClient } from '../../db/client';
import type { ToolInsert } from '../../types/index';
import { testDbClient } from '../setup';

describe('Tools Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testAgentId = 'test-agent';
  const testToolId = 'test-tool';
  const testSubAgentId = 'test-sub-agent';

  beforeEach(async () => {
    db = testDbClient;
    vi.clearAllMocks();
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
        subAgentId: testSubAgentId,
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
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: testSubAgentId,
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
        subAgentId: testSubAgentId,
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
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: testSubAgentId,
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
        subAgentId: testSubAgentId,
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
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: testSubAgentId,
        toolId: testToolId,
        selectedTools,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedRelation);
    });

    it('should add a tool to an agent with headers specified', async () => {
      const headers = {
        Authorization: 'Bearer token123',
        'X-Custom-Header': 'custom-value',
        'Content-Type': 'application/json',
      };
      const expectedRelation = {
        id: expect.any(String),
        tenantId: testTenantId,
        projectId: testProjectId,
        subAgentId: testSubAgentId,
        toolId: testToolId,
        headers,
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
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: testSubAgentId,
        toolId: testToolId,
        headers,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedRelation);
    });

    it('should add a tool to an agent with both selectedTools and headers', async () => {
      const selectedTools = ['tool_capability_1', 'tool_capability_2'];
      const headers = {
        Authorization: 'Bearer token456',
        'X-API-Key': 'api-key-123',
      };
      const expectedRelation = {
        id: expect.any(String),
        tenantId: testTenantId,
        projectId: testProjectId,
        subAgentId: testSubAgentId,
        toolId: testToolId,
        selectedTools,
        headers,
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
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: testSubAgentId,
        toolId: testToolId,
        selectedTools,
        headers,
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
        subAgentId: testSubAgentId,
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
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
        subAgentId: testSubAgentId,
        toolId: testToolId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toEqual(expectedRelation);
    });
  });
});
