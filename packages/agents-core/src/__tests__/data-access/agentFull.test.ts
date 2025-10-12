import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFullAgentDefinition } from '../../data-access/agents';
import type { DatabaseClient } from '../../db/client';
import { createTestDatabaseClient } from '../../db/test-client';

describe('AgentFull Data Access - getFullAgentDefinition', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testAgentId = 'test-agent-1';

  beforeEach(async () => {
    db = await createTestDatabaseClient();
    vi.clearAllMocks();
  });

  describe('getFullAgentDefinition', () => {
    it('should return null when agent is not found', async () => {
      // Mock the database query to return null for agent lookup
      const mockQuery = {
        agents: {
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

      const result = await getFullAgentDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      expect(result).toBeNull();
      expect(mockQuery.agents.findFirst).toHaveBeenCalled();
    });

    it('should return basic agent definition with default agent only', async () => {
      const mockAgent = {
        id: testAgentId,
        name: 'Test Agent',
        defaultSubAgentId: 'default-agent-1',
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
        agents: {
          findFirst: vi.fn().mockResolvedValue(mockAgent),
        },
        subAgentRelations: {
          findMany: vi.fn().mockResolvedValue([]), // No relations
        },
        subAgents: {
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
              agentId: testAgentId,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
          ]),
        },
        subAgentDataComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        subAgentArtifactComponents: {
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

      const result = await getFullAgentDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(testAgentId);
      expect(result?.name).toBe('Test Agent');
      expect(result?.defaultSubAgentId).toBe('default-agent-1');
      expect(result?.subAgents).toHaveProperty('default-agent-1');
      expect(result?.subAgents['default-agent-1']).toEqual({
        id: 'default-agent-1',
        name: 'Default Agent',
        description: 'Default agent description',
        prompt: 'Default prompt',
        models: null,
        canTransferTo: [],
        canDelegateTo: [],
        dataComponents: [],
        artifactComponents: [],
        canUse: [],
      });
    });

    it('should handle agent with agent relationships', async () => {
      const mockAgent = {
        id: testAgentId,
        name: 'Test Agent',
        defaultSubAgentId: 'agent-1',
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
          sourceSubAgentId: 'agent-1',
          targetSubAgentId: 'agent-2',
          externalSubAgentId: null,
          relationType: 'transfer',
          agentId: testAgentId,
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
        agents: {
          findFirst: vi.fn().mockResolvedValue(mockAgent),
        },
        subAgentRelations: {
          findMany: vi.fn().mockResolvedValue(mockRelations),
        },
        subAgents: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(mockAgents[0]) // First call for agent-1
            .mockResolvedValueOnce(mockAgents[1]), // Second call for agent-2
          findMany: vi.fn().mockResolvedValue(
            mockAgents.map((agent) => ({
              ...agent,
              agentId: testAgentId,
            }))
          ),
        },
        subAgentDataComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        subAgentArtifactComponents: {
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

      const result = await getFullAgentDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      expect(result).toBeDefined();
      expect(result?.subAgents).toHaveProperty('agent-1');
      expect(result?.subAgents).toHaveProperty('agent-2');
    });

    it('should include tools when present', async () => {
      const mockAgent = {
        id: testAgentId,
        name: 'Test Agent',
        defaultSubAgentId: 'agent-1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        tenantId: testTenantId,
        projectId: testProjectId,
        description: null,
        models: null,
        contextConfigId: null,
      };

      const mockSubAgent = {
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
        agents: {
          findFirst: vi.fn().mockResolvedValue(mockAgent),
        },
        subAgentRelations: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        subAgents: {
          findFirst: vi.fn().mockResolvedValue(mockSubAgent),
          findMany: vi.fn().mockResolvedValue([
            {
              ...mockSubAgent,
              agentId: testAgentId,
            },
          ]),
        },
        subAgentDataComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        subAgentArtifactComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        projects: {
          findFirst: vi.fn().mockResolvedValue(null), // No project with stopWhen configuration
        },
      };

      // Create separate mocks for MCP tools and function tools queries
      let queryCallCount = 0;
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
        select: vi.fn().mockImplementation(() => {
          queryCallCount++;
          // First call returns MCP tools, second call returns empty function tools
          if (queryCallCount === 1) {
            return {
              from: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue(mockTools),
                }),
              }),
            };
          } else {
            return {
              from: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue([]),
                }),
              }),
            };
          }
        }),
      } as any;

      const result = await getFullAgentDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      expect((result?.subAgents['agent-1'] as any).canUse).toEqual([
        { agentToolRelationId: undefined, toolId: 'tool-1', toolSelection: null, headers: null },
      ]);
    });

    it('should include model settings when present', async () => {
      const mockModelSettings = {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
      };

      const mockAgent = {
        id: testAgentId,
        name: 'Test Agent',
        defaultSubAgentId: 'agent-1',
        models: mockModelSettings,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        tenantId: testTenantId,
        projectId: testProjectId,
        description: null,
        contextConfigId: null,
      };

      const mockSubAgent = {
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
        agents: {
          findFirst: vi.fn().mockResolvedValue(mockAgent),
        },
        subAgentRelations: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        subAgents: {
          findFirst: vi.fn().mockResolvedValue(mockSubAgent),
          findMany: vi.fn().mockResolvedValue([
            {
              ...mockSubAgent,
              agentId: testAgentId,
            },
          ]),
        },
        subAgentDataComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        subAgentArtifactComponents: {
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

      const result = await getFullAgentDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      expect(result?.models).toEqual(mockModelSettings);
    });

    it('should handle invalid dates gracefully', async () => {
      const mockAgent = {
        id: testAgentId,
        name: 'Test Agent',
        defaultSubAgentId: 'agent-1',
        createdAt: 'invalid-date',
        updatedAt: 'invalid-date',
        tenantId: testTenantId,
        projectId: testProjectId,
        description: null,
        models: null,
        contextConfigId: null,
      };

      const mockSubAgent = {
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
        agents: {
          findFirst: vi.fn().mockResolvedValue(mockAgent),
        },
        subAgentRelations: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        subAgents: {
          findFirst: vi.fn().mockResolvedValue(mockSubAgent),
          findMany: vi.fn().mockResolvedValue([
            {
              ...mockSubAgent,
              agentId: testAgentId,
            },
          ]),
        },
        subAgentDataComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        subAgentArtifactComponents: {
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

      const result = await getFullAgentDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      // Should use current date for invalid dates
      expect(result?.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      expect(result?.updatedAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    it('should filter out null agent responses gracefully', async () => {
      const mockAgent = {
        id: testAgentId,
        name: 'Test Agent',
        defaultSubAgentId: 'agent-1',
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
          sourceSubAgentId: 'agent-1',
          targetSubAgentId: 'non-existent-agent',
          externalSubAgentId: null,
          relationType: 'transfer',
          agentId: testAgentId,
          tenantId: testTenantId,
          projectId: testProjectId,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      // Mock database queries
      const mockQuery = {
        agents: {
          findFirst: vi.fn().mockResolvedValue(mockAgent),
        },
        subAgentRelations: {
          findMany: vi.fn().mockResolvedValue(mockRelations),
        },
        subAgents: {
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
              agentId: testAgentId,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
          ]),
        },
        subAgentDataComponents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        subAgentArtifactComponents: {
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

      const result = await getFullAgentDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      // Should only include the valid agent
      expect(result?.subAgents).toHaveProperty('agent-1');
      expect(result?.subAgents).not.toHaveProperty('non-existent-agent');
      expect(Object.keys(result?.subAgents || {})).toHaveLength(1);
    });
  });
});
