import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFullGraphDefinition } from '../../data-access/agentGraphs';
import type { DatabaseClient } from '../../db/client';
import { createInMemoryDatabaseClient } from '../../db/client';

describe('GraphFull Data Access - getFullGraphDefinition', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testGraphId = 'test-graph-1';

  beforeEach(() => {
    db = createInMemoryDatabaseClient();
    vi.clearAllMocks();
  });

  describe('getFullGraphDefinition', () => {
    it('should return null when graph is not found', async () => {
      // Mock the database query to return null for graph lookup
      const mockQuery = {
        agentGraph: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        projects: {
          findFirst: vi.fn().mockResolvedValue(null), // No project with stopWhen configuration
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getFullGraphDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: testGraphId,
      });

      expect(result).toBeNull();
      expect(mockQuery.agentGraph.findFirst).toHaveBeenCalled();
    });

    it('should return basic graph definition with default agent only', async () => {
      const mockGraph = {
        id: testGraphId,
        name: 'Test Graph',
        defaultAgentId: 'default-agent-1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        tenantId: testTenantId,
        projectId: testProjectId,
        description: null,
        models: null,
        contextConfigId: null,
      };

      // Mock database queries
      const mockQuery = {
        agentGraph: {
          findFirst: vi.fn().mockResolvedValue(mockGraph),
        },
        agentRelations: {
          findMany: vi.fn().mockResolvedValue([]), // No relations
        },
        agents: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'default-agent-1',
            name: 'Default Agent',
            description: 'Default agent description',
            prompt: 'Default prompt',
            models: null,
            tenantId: testTenantId,
            projectId: testProjectId,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          }),
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'default-agent-1',
              name: 'Default Agent',
              description: 'Default agent description',
              prompt: 'Default prompt',
              models: null,
              tenantId: testTenantId,
              projectId: testProjectId,
              graphId: testGraphId,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
          ]),
        },
        agentDataComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        agentArtifactComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        projects: {
          findFirst: vi.fn().mockResolvedValue(null), // No project with stopWhen configuration
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
        selectDistinct: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as any;

      const result = await getFullGraphDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: testGraphId,
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(testGraphId);
      expect(result?.name).toBe('Test Graph');
      expect(result?.defaultAgentId).toBe('default-agent-1');
      expect(result?.agents).toHaveProperty('default-agent-1');
      expect(result?.agents['default-agent-1']).toEqual({
        id: 'default-agent-1',
        name: 'Default Agent',
        description: 'Default agent description',
        prompt: 'Default prompt',
        models: null,
        canTransferTo: [],
        canDelegateTo: [],
        dataComponents: [],
        artifactComponents: [],
        tools: [],
      });
    });

    it('should handle graph with agent relationships', async () => {
      const mockGraph = {
        id: testGraphId,
        name: 'Test Graph',
        defaultAgentId: 'agent-1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        tenantId: testTenantId,
        projectId: testProjectId,
        description: null,
        models: null,
        contextConfigId: null,
      };

      const mockRelations = [
        {
          id: 'relation-1',
          sourceAgentId: 'agent-1',
          targetAgentId: 'agent-2',
          externalAgentId: null,
          relationType: 'transfer',
          graphId: testGraphId,
          tenantId: testTenantId,
          projectId: testProjectId,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          description: 'First agent',
          prompt: 'Instructions 1',
          models: null,
          tenantId: testTenantId,
          projectId: testProjectId,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          description: 'Second agent',
          prompt: 'Instructions 2',
          models: null,
          tenantId: testTenantId,
          projectId: testProjectId,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      // Mock database queries
      const mockQuery = {
        agentGraph: {
          findFirst: vi.fn().mockResolvedValue(mockGraph),
        },
        agentRelations: {
          findMany: vi.fn().mockResolvedValue(mockRelations),
        },
        agents: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(mockAgents[0]) // First call for agent-1
            .mockResolvedValueOnce(mockAgents[1]), // Second call for agent-2
          findMany: vi.fn().mockResolvedValue(
            mockAgents.map((agent) => ({
              ...agent,
              graphId: testGraphId,
            }))
          ),
        },
        agentDataComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        agentArtifactComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        projects: {
          findFirst: vi.fn().mockResolvedValue(null), // No project with stopWhen configuration
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
        selectDistinct: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as any;

      const result = await getFullGraphDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: testGraphId,
      });

      expect(result).toBeDefined();
      expect(result?.agents).toHaveProperty('agent-1');
      expect(result?.agents).toHaveProperty('agent-2');
    });

    it('should include tools when present', async () => {
      const mockGraph = {
        id: testGraphId,
        name: 'Test Graph',
        defaultAgentId: 'agent-1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        tenantId: testTenantId,
        projectId: testProjectId,
        description: null,
        models: null,
        contextConfigId: null,
      };

      const mockAgent = {
        id: 'agent-1',
        name: 'Agent 1',
        description: 'First agent',
        prompt: 'Instructions 1',
        models: null,
        tenantId: testTenantId,
        projectId: testProjectId,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const mockTools = [
        {
          id: 'tool-1',
          name: 'Test Tool',
          config: { type: 'test' },
          imageUrl: 'https://example.com/tool.png',
          status: 'active',
          capabilities: ['read', 'write'],
          lastHealthCheck: '2024-01-01T00:00:00.000Z',
          lastError: null,
          availableTools: ['tool1', 'tool2'],
          lastToolsSync: '2024-01-01T00:00:00.000Z',
        },
      ];

      // Mock database queries
      const mockQuery = {
        agentGraph: {
          findFirst: vi.fn().mockResolvedValue(mockGraph),
        },
        agentRelations: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        agents: {
          findFirst: vi.fn().mockResolvedValue(mockAgent),
          findMany: vi.fn().mockResolvedValue([
            {
              ...mockAgent,
              graphId: testGraphId,
            },
          ]),
        },
        agentDataComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        agentArtifactComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        projects: {
          findFirst: vi.fn().mockResolvedValue(null), // No project with stopWhen configuration
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
        selectDistinct: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(mockTools),
            }),
          }),
        }),
      } as any;

      const result = await getFullGraphDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: testGraphId,
      });

      expect(result?.tools).toHaveProperty('tool-1');
      expect(result?.tools?.['tool-1']).toEqual({
        id: 'tool-1',
        name: 'Test Tool',
        config: { type: 'test' },
        imageUrl: 'https://example.com/tool.png',
        status: 'active',
        capabilities: ['read', 'write'],
        lastHealthCheck: '2024-01-01T00:00:00.000Z',
        lastError: undefined,
        availableTools: ['tool1', 'tool2'],
        activeTools: undefined,
        lastToolsSync: '2024-01-01T00:00:00.000Z',
      });
      expect((result?.agents['agent-1'] as any).tools).toEqual(['tool-1']);
    });

    it('should include model settings when present', async () => {
      const mockModelSettings = {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
      };

      const mockGraph = {
        id: testGraphId,
        name: 'Test Graph',
        defaultAgentId: 'agent-1',
        models: mockModelSettings,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        tenantId: testTenantId,
        projectId: testProjectId,
        description: null,
        contextConfigId: null,
      };

      const mockAgent = {
        id: 'agent-1',
        name: 'Agent 1',
        description: 'First agent',
        prompt: 'Instructions 1',
        models: null,
        tenantId: testTenantId,
        projectId: testProjectId,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      // Mock database queries
      const mockQuery = {
        agentGraph: {
          findFirst: vi.fn().mockResolvedValue(mockGraph),
        },
        agentRelations: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        agents: {
          findFirst: vi.fn().mockResolvedValue(mockAgent),
          findMany: vi.fn().mockResolvedValue([
            {
              ...mockAgent,
              graphId: testGraphId,
            },
          ]),
        },
        agentDataComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        agentArtifactComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        projects: {
          findFirst: vi.fn().mockResolvedValue(null), // No project with stopWhen configuration
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
        selectDistinct: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as any;

      const result = await getFullGraphDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: testGraphId,
      });

      expect(result?.models).toEqual(mockModelSettings);
    });

    it('should handle invalid dates gracefully', async () => {
      const mockGraph = {
        id: testGraphId,
        name: 'Test Graph',
        defaultAgentId: 'agent-1',
        createdAt: 'invalid-date',
        updatedAt: 'invalid-date',
        tenantId: testTenantId,
        projectId: testProjectId,
        description: null,
        models: null,
        contextConfigId: null,
      };

      const mockAgent = {
        id: 'agent-1',
        name: 'Agent 1',
        description: 'First agent',
        prompt: 'Instructions 1',
        models: null,
        tenantId: testTenantId,
        projectId: testProjectId,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const mockTools = [
        {
          id: 'tool-1',
          name: 'Test Tool',
          config: { type: 'test' },
          imageUrl: null,
          status: 'active',
          capabilities: null,
          lastHealthCheck: 'invalid-date',
          lastError: null,
          availableTools: null,
          lastToolsSync: 'invalid-date',
        },
      ];

      // Mock database queries
      const mockQuery = {
        agentGraph: {
          findFirst: vi.fn().mockResolvedValue(mockGraph),
        },
        agentRelations: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        agents: {
          findFirst: vi.fn().mockResolvedValue(mockAgent),
          findMany: vi.fn().mockResolvedValue([
            {
              ...mockAgent,
              graphId: testGraphId,
            },
          ]),
        },
        agentDataComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        agentArtifactComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        projects: {
          findFirst: vi.fn().mockResolvedValue(null), // No project with stopWhen configuration
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
        selectDistinct: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(mockTools),
            }),
          }),
        }),
      } as any;

      const result = await getFullGraphDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: testGraphId,
      });

      // Should use current date for invalid dates
      expect(result?.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      expect(result?.updatedAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);

      // Tool dates should be undefined for invalid dates
      expect(result?.tools?.['tool-1']?.lastHealthCheck).toBeUndefined();
      expect(result?.tools?.['tool-1']?.lastToolsSync).toBeUndefined();
    });

    it('should filter out null agent responses gracefully', async () => {
      const mockGraph = {
        id: testGraphId,
        name: 'Test Graph',
        defaultAgentId: 'agent-1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        tenantId: testTenantId,
        projectId: testProjectId,
        description: null,
        models: null,
        contextConfigId: null,
      };

      const mockRelations = [
        {
          id: 'relation-1',
          sourceAgentId: 'agent-1',
          targetAgentId: 'non-existent-agent',
          externalAgentId: null,
          relationType: 'transfer',
          graphId: testGraphId,
          tenantId: testTenantId,
          projectId: testProjectId,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      // Mock database queries
      const mockQuery = {
        agentGraph: {
          findFirst: vi.fn().mockResolvedValue(mockGraph),
        },
        agentRelations: {
          findMany: vi.fn().mockResolvedValue(mockRelations),
        },
        agents: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({
              id: 'agent-1',
              name: 'Agent 1',
              description: 'First agent',
              prompt: 'Instructions 1',
              models: null,
              tenantId: testTenantId,
              projectId: testProjectId,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            })
            .mockResolvedValueOnce(undefined), // Non-existent agent returns undefined
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'agent-1',
              name: 'Agent 1',
              description: 'First agent',
              prompt: 'Instructions 1',
              models: null,
              tenantId: testTenantId,
              projectId: testProjectId,
              graphId: testGraphId,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
          ]),
        },
        agentDataComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        agentArtifactComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        projects: {
          findFirst: vi.fn().mockResolvedValue(null), // No project with stopWhen configuration
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
        selectDistinct: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as any;

      const result = await getFullGraphDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        graphId: testGraphId,
      });

      // Should only include the valid agent
      expect(result?.agents).toHaveProperty('agent-1');
      expect(result?.agents).not.toHaveProperty('non-existent-agent');
      expect(Object.keys(result?.agents || {})).toHaveLength(1);
    });
  });
});
