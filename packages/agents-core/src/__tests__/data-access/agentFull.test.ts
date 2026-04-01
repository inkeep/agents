import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFullAgentDefinition } from '../../data-access/manage/agents';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { testManageDbClient } from '../setup';

function createMockSelectChain(result: any) {
  const chain: any = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  // biome-ignore lint/suspicious/noThenProperty: mock thenable for drizzle select chain
  chain.then = (resolve: Function, reject?: Function) =>
    Promise.resolve(result).then(resolve as any, reject as any);
  return chain;
}

describe('AgentFull Data Access - getFullAgentDefinition', () => {
  let db: AgentsManageDatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testAgentId = 'test-agent-1';

  beforeEach(async () => {
    db = testManageDbClient;
    vi.clearAllMocks();
  });

  describe('getFullAgentDefinition', () => {
    it('should return null when agent is not found', async () => {
      const mockDb = {
        ...db,
        select: vi.fn().mockReturnValue(createMockSelectChain([])),
        selectDistinct: vi.fn().mockReturnValue(createMockSelectChain([])),
        query: {
          projects: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
      } as any;

      const result = await getFullAgentDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      expect(result).toBeNull();
      expect(mockDb.select).toHaveBeenCalled();
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

      const mockSubAgent = {
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
      };

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        query: {
          projects: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
        selectDistinct: vi.fn().mockReturnValue(createMockSelectChain([])),
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          const callIndex = selectCallCount;
          switch (callIndex) {
            case 1:
              return createMockSelectChain([mockAgent]); // getAgentById
            case 2:
              return createMockSelectChain([]); // getAgentRelationsByAgent
            case 3:
              return createMockSelectChain([mockSubAgent]); // db.select().from(subAgents) - list sub-agents
            case 4:
              return createMockSelectChain([]); // getSubAgentExternalAgentRelationsByAgent
            case 5:
              return createMockSelectChain([]); // getSubAgentTeamAgentRelationsByAgent
            // getSkillsForSubAgents won't call select since subAgentIds is empty? No, we have 1 sub-agent
            case 6:
              return createMockSelectChain([]); // getSkillsForSubAgents
            // Per sub-agent processing (1 sub-agent):
            case 7:
              return createMockSelectChain([]); // subAgentToolRelations (MCP tools)
            case 8:
              return createMockSelectChain([]); // subAgentFunctionToolRelations (function tools)
            case 9:
              return createMockSelectChain([]); // subAgentDataComponents
            case 10:
              return createMockSelectChain([]); // subAgentArtifactComponents
            // fetchComponentRelationships calls (data + artifact)
            case 11:
              return createMockSelectChain([]); // fetchComponentRelationships (data)
            case 12:
              return createMockSelectChain([]); // fetchComponentRelationships (artifact)
            // project lookup for stopWhen
            case 13:
              return createMockSelectChain([]); // project lookup
            default:
              return createMockSelectChain([]);
          }
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
        skills: [],
        stopWhen: undefined,
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

      const mockSubAgents = [
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
        {
          id: 'agent-2',
          name: 'Agent 2',
          description: 'Second agent',
          prompt: 'Instructions 2',
          models: null,
          tenantId: testTenantId,
          projectId: testProjectId,
          agentId: testAgentId,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        query: {
          projects: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
        selectDistinct: vi.fn().mockReturnValue(createMockSelectChain([])),
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          const callIndex = selectCallCount;
          switch (callIndex) {
            case 1:
              return createMockSelectChain([mockAgent]); // getAgentById
            case 2:
              return createMockSelectChain(mockRelations); // getAgentRelationsByAgent
            case 3:
              return createMockSelectChain(mockSubAgents); // db.select().from(subAgents)
            case 4:
              return createMockSelectChain([]); // getSubAgentExternalAgentRelationsByAgent
            case 5:
              return createMockSelectChain([]); // getSubAgentTeamAgentRelationsByAgent
            case 6:
              return createMockSelectChain([]); // getSkillsForSubAgents
            // Per sub-agent processing (2 sub-agents, interleaved):
            case 7:
              return createMockSelectChain([]); // agent-1 MCP tools
            case 8:
              return createMockSelectChain([]); // agent-1 function tools
            case 9:
              return createMockSelectChain([]); // agent-1 dataComponents
            case 10:
              return createMockSelectChain([]); // agent-1 artifactComponents
            case 11:
              return createMockSelectChain([]); // agent-2 MCP tools
            case 12:
              return createMockSelectChain([]); // agent-2 function tools
            case 13:
              return createMockSelectChain([]); // agent-2 dataComponents
            case 14:
              return createMockSelectChain([]); // agent-2 artifactComponents
            // fetchComponentRelationships
            case 15:
              return createMockSelectChain([]); // data components
            case 16:
              return createMockSelectChain([]); // artifact components
            // project lookup
            case 17:
              return createMockSelectChain([]); // project
            default:
              return createMockSelectChain([]);
          }
        }),
      } as any;

      const result = await getFullAgentDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      expect(result).toBeDefined();
      expect(result?.subAgents).toHaveProperty('agent-1');
      expect(result?.subAgents).toHaveProperty('agent-2');
    });

    it('should handle agent with team agent relationships', async () => {
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

      const mockTeamAgentRelations = [
        {
          id: 'team-relation-1',
          subAgentId: 'agent-1',
          targetAgentId: 'team-agent-1',
          headers: { 'X-Custom-Header': 'value' },
          agentId: testAgentId,
          tenantId: testTenantId,
          projectId: testProjectId,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      const mockSubAgent = {
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
      };

      const mockTeamAgent = {
        id: 'team-agent-1',
        name: 'Team Agent 1',
        description: 'Team agent',
        defaultSubAgentId: null,
        tenantId: testTenantId,
        projectId: testProjectId,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        models: null,
        contextConfigId: null,
      };

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        query: {
          projects: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
        selectDistinct: vi.fn().mockReturnValue(createMockSelectChain([])),
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          const callIndex = selectCallCount;
          switch (callIndex) {
            case 1:
              return createMockSelectChain([mockAgent]); // getAgentById
            case 2:
              return createMockSelectChain([]); // getAgentRelationsByAgent
            case 3:
              return createMockSelectChain([mockSubAgent]); // db.select().from(subAgents)
            case 4:
              return createMockSelectChain([]); // getSubAgentExternalAgentRelationsByAgent
            case 5:
              return createMockSelectChain(mockTeamAgentRelations); // getSubAgentTeamAgentRelationsByAgent
            case 6:
              return createMockSelectChain([]); // getSkillsForSubAgents
            // Per sub-agent processing (1 sub-agent):
            case 7:
              return createMockSelectChain([]); // MCP tools
            case 8:
              return createMockSelectChain([]); // function tools
            case 9:
              return createMockSelectChain([]); // dataComponents
            case 10:
              return createMockSelectChain([]); // artifactComponents
            // team agent lookup (getAgentById for team-agent-1)
            case 11:
              return createMockSelectChain([mockTeamAgent]);
            // fetchComponentRelationships
            case 12:
              return createMockSelectChain([]); // data components
            case 13:
              return createMockSelectChain([]); // artifact components
            // project lookup
            case 14:
              return createMockSelectChain([]); // project
            default:
              return createMockSelectChain([]);
          }
        }),
      } as any;

      const result = await getFullAgentDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      expect(result).toBeDefined();
      expect(result?.subAgents).toHaveProperty('agent-1');

      const agent1 = result?.subAgents['agent-1'];
      expect(agent1?.canDelegateTo).toContainEqual({
        agentId: 'team-agent-1',
        subAgentTeamAgentRelationId: 'team-relation-1',
        headers: { 'X-Custom-Header': 'value' },
      });
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
        agentId: testAgentId,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const mockMcpTools = [
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
          selectedTools: null,
          headers: null,
          toolPolicies: null,
          agentToolRelationId: undefined,
        },
      ];

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        query: {
          projects: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
        selectDistinct: vi.fn().mockReturnValue(createMockSelectChain([])),
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          const callIndex = selectCallCount;
          switch (callIndex) {
            case 1:
              return createMockSelectChain([mockAgent]); // getAgentById
            case 2:
              return createMockSelectChain([]); // getAgentRelationsByAgent
            case 3:
              return createMockSelectChain([mockSubAgent]); // db.select().from(subAgents)
            case 4:
              return createMockSelectChain([]); // getSubAgentExternalAgentRelationsByAgent
            case 5:
              return createMockSelectChain([]); // getSubAgentTeamAgentRelationsByAgent
            case 6:
              return createMockSelectChain([]); // getSkillsForSubAgents
            // Per sub-agent processing (1 sub-agent):
            case 7:
              return createMockSelectChain(mockMcpTools); // MCP tools (subAgentToolRelations join)
            case 8:
              return createMockSelectChain([]); // function tools
            case 9:
              return createMockSelectChain([]); // dataComponents
            case 10:
              return createMockSelectChain([]); // artifactComponents
            // fetchComponentRelationships
            case 11:
              return createMockSelectChain([]); // data components
            case 12:
              return createMockSelectChain([]); // artifact components
            // project lookup
            case 13:
              return createMockSelectChain([]); // project
            default:
              return createMockSelectChain([]);
          }
        }),
      } as any;

      const result = await getFullAgentDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      expect((result?.subAgents['agent-1'] as any).canUse).toEqual([
        {
          agentToolRelationId: undefined,
          toolId: 'tool-1',
          toolSelection: null,
          headers: null,
          toolPolicies: null,
        },
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
        agentId: testAgentId,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        query: {
          projects: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
        selectDistinct: vi.fn().mockReturnValue(createMockSelectChain([])),
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          const callIndex = selectCallCount;
          switch (callIndex) {
            case 1:
              return createMockSelectChain([mockAgent]); // getAgentById
            case 2:
              return createMockSelectChain([]); // getAgentRelationsByAgent
            case 3:
              return createMockSelectChain([mockSubAgent]); // db.select().from(subAgents)
            case 4:
              return createMockSelectChain([]); // getSubAgentExternalAgentRelationsByAgent
            case 5:
              return createMockSelectChain([]); // getSubAgentTeamAgentRelationsByAgent
            case 6:
              return createMockSelectChain([]); // getSkillsForSubAgents
            // Per sub-agent processing (1 sub-agent):
            case 7:
              return createMockSelectChain([]); // MCP tools
            case 8:
              return createMockSelectChain([]); // function tools
            case 9:
              return createMockSelectChain([]); // dataComponents
            case 10:
              return createMockSelectChain([]); // artifactComponents
            // fetchComponentRelationships
            case 11:
              return createMockSelectChain([]); // data components
            case 12:
              return createMockSelectChain([]); // artifact components
            // project lookup
            case 13:
              return createMockSelectChain([]); // project
            default:
              return createMockSelectChain([]);
          }
        }),
      } as any;

      const result = await getFullAgentDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      expect(result?.models).toEqual(mockModelSettings);
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

      const mockSubAgent = {
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
      };

      let selectCallCount = 0;
      const mockDb = {
        ...db,
        query: {
          projects: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
        selectDistinct: vi.fn().mockReturnValue(createMockSelectChain([])),
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          const callIndex = selectCallCount;
          switch (callIndex) {
            case 1:
              return createMockSelectChain([mockAgent]); // getAgentById
            case 2:
              return createMockSelectChain(mockRelations); // getAgentRelationsByAgent
            case 3:
              return createMockSelectChain([mockSubAgent]); // db.select().from(subAgents) - only agent-1 exists
            case 4:
              return createMockSelectChain([]); // getSubAgentExternalAgentRelationsByAgent
            case 5:
              return createMockSelectChain([]); // getSubAgentTeamAgentRelationsByAgent
            case 6:
              return createMockSelectChain([]); // getSkillsForSubAgents
            // Per sub-agent processing (1 sub-agent - agent-1 only, non-existent is not in the list):
            case 7:
              return createMockSelectChain([]); // MCP tools
            case 8:
              return createMockSelectChain([]); // function tools
            case 9:
              return createMockSelectChain([]); // dataComponents
            case 10:
              return createMockSelectChain([]); // artifactComponents
            // fetchComponentRelationships
            case 11:
              return createMockSelectChain([]); // data components
            case 12:
              return createMockSelectChain([]); // artifact components
            // project lookup
            case 13:
              return createMockSelectChain([]); // project
            default:
              return createMockSelectChain([]);
          }
        }),
      } as any;

      const result = await getFullAgentDefinition(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId, agentId: testAgentId },
      });

      expect(result?.subAgents).toHaveProperty('agent-1');
      expect(result?.subAgents).not.toHaveProperty('non-existent-agent');
      expect(Object.keys(result?.subAgents || {})).toHaveLength(1);
    });
  });
});
