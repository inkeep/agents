import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAgentFromProject,
  getSubAgentFromProject,
  extractTransferRelations,
  parseDelegateRelations,
  getSubAgentRelations,
  getToolsForSubAgent,
  getDataComponentsForSubAgent,
  getArtifactComponentsForSubAgent,
  getTransferRelationsForTargetSubAgent,
  getExternalAgentRelationsForTargetSubAgent,
  buildRelationsForDescription,
  enhanceInternalRelation,
  enhanceTeamRelation,
} from '../project';

// Mock the logger
vi.mock('../../logger', () => ({
  getLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock generateDescriptionWithRelationData
const mockGenerateDescriptionWithRelationData = vi
  .fn()
  .mockImplementation((baseDesc) => `Enhanced: ${baseDesc}`);
vi.mock('../../data/agents', () => ({
  generateDescriptionWithRelationData: (...args: unknown[]) =>
    mockGenerateDescriptionWithRelationData(...args),
}));

// Helper to create minimal project fixtures
function createMockProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-1',
    name: 'Test Project',
    description: 'Test project description',
    tenantId: 'tenant-1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    agents: {},
    tools: {},
    externalAgents: {},
    dataComponents: {},
    artifactComponents: {},
    credentialReferences: {},
    functions: {},
    ...overrides,
  } as any;
}

function createMockSubAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-agent-1',
    name: 'Test Sub Agent',
    description: 'Test sub-agent description',
    type: 'internal',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    canUse: [],
    canTransferTo: null,
    canDelegateTo: null,
    dataComponents: null,
    artifactComponents: null,
    prompt: null,
    models: null,
    stopWhen: null,
    contextConfigId: null,
    conversationHistoryConfig: null,
    ...overrides,
  } as any;
}

function createMockAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    description: 'Test agent description',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    defaultSubAgentId: 'sub-agent-1',
    contextConfigId: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    subAgents: {},
    tools: null,
    externalAgents: null,
    teamAgents: null,
    prompt: null,
    ...overrides,
  } as any;
}

describe('project helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAgentFromProject', () => {
    it('should return agent when found in project', () => {
      const mockAgent = createMockAgent({ id: 'agent-1' });
      const project = createMockProject({
        agents: { 'agent-1': mockAgent },
      });

      const result = getAgentFromProject({ project, agentId: 'agent-1' });

      expect(result).toEqual(mockAgent);
    });

    it('should return null when agent not found', () => {
      const project = createMockProject({ agents: {} });

      const result = getAgentFromProject({ project, agentId: 'non-existent' });

      expect(result).toBeNull();
    });
  });

  describe('getSubAgentFromProject', () => {
    it('should return sub-agent when found by id', () => {
      const mockSubAgent = createMockSubAgent({ id: 'sub-agent-1' });
      const mockAgent = createMockAgent({
        id: 'agent-1',
        subAgents: { 'sub-agent-1': mockSubAgent },
      });
      const project = createMockProject({
        agents: { 'agent-1': mockAgent },
      });

      const result = getSubAgentFromProject({
        project,
        agentId: 'agent-1',
        subAgentId: 'sub-agent-1',
      });

      expect(result).toEqual(mockSubAgent);
    });

    it('should return default sub-agent when subAgentId not provided', () => {
      const mockSubAgent = createMockSubAgent({ id: 'default-sub' });
      const mockAgent = createMockAgent({
        id: 'agent-1',
        defaultSubAgentId: 'default-sub',
        subAgents: { 'default-sub': mockSubAgent },
      });
      const project = createMockProject({
        agents: { 'agent-1': mockAgent },
      });

      const result = getSubAgentFromProject({ project, agentId: 'agent-1' });

      expect(result).toEqual(mockSubAgent);
    });

    it('should return null when agent not found', () => {
      const project = createMockProject({ agents: {} });

      const result = getSubAgentFromProject({ project, agentId: 'non-existent' });

      expect(result).toBeNull();
    });

    it('should return null when no default sub-agent configured', () => {
      const mockAgent = createMockAgent({
        id: 'agent-1',
        defaultSubAgentId: null,
        subAgents: {},
      });
      const project = createMockProject({
        agents: { 'agent-1': mockAgent },
      });

      const result = getSubAgentFromProject({ project, agentId: 'agent-1' });

      expect(result).toBeNull();
    });

    it('should return null when sub-agent not found', () => {
      const mockAgent = createMockAgent({
        id: 'agent-1',
        subAgents: {},
      });
      const project = createMockProject({
        agents: { 'agent-1': mockAgent },
      });

      const result = getSubAgentFromProject({
        project,
        agentId: 'agent-1',
        subAgentId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('extractTransferRelations', () => {
    it('should extract transfer relations from canTransferTo', () => {
      const subAgent1 = createMockSubAgent({ id: 'sub-1', name: 'Sub 1', description: 'Desc 1' });
      const subAgent2 = createMockSubAgent({ id: 'sub-2', name: 'Sub 2', description: 'Desc 2' });
      const agent = createMockAgent({
        subAgents: { 'sub-1': subAgent1, 'sub-2': subAgent2 },
      });

      const result = extractTransferRelations({
        agent,
        canTransferTo: [
          { subAgentId: 'sub-1', subAgentSubAgentRelationId: 'rel-sub-1' },
          { subAgentId: 'sub-2', subAgentSubAgentRelationId: 'rel-sub-2' },
        ] as any,
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'sub-1',
        name: 'Sub 1',
        description: 'Desc 1',
        relationType: 'transfer',
        relationId: 'rel-sub-1',
      });
      expect(result[1]).toEqual({
        id: 'sub-2',
        name: 'Sub 2',
        description: 'Desc 2',
        relationType: 'transfer',
        relationId: 'rel-sub-2',
      });
    });

    it('should filter out non-existent sub-agents', () => {
      const subAgent1 = createMockSubAgent({ id: 'sub-1', name: 'Sub 1' });
      const agent = createMockAgent({
        subAgents: { 'sub-1': subAgent1 },
      });

      const result = extractTransferRelations({
        agent,
        canTransferTo: [
          { subAgentId: 'sub-1', subAgentSubAgentRelationId: 'rel-sub-1' },
          { subAgentId: 'non-existent', subAgentSubAgentRelationId: 'rel-missing' },
        ] as any,
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('sub-1');
    });

    it('should return empty array for empty canTransferTo', () => {
      const agent = createMockAgent();

      const result = extractTransferRelations({ agent, canTransferTo: [] });

      expect(result).toEqual([]);
    });
  });

  describe('parseDelegateRelations', () => {
    it('should parse internal sub-agent delegations (string ids)', () => {
      const subAgent = createMockSubAgent({ id: 'sub-1', name: 'Sub 1', description: 'Desc' });
      const agent = createMockAgent({
        subAgents: { 'sub-1': subAgent },
      });
      const project = createMockProject();

      const result = parseDelegateRelations({
        agent,
        project,
        canDelegateTo: [
          { subAgentId: 'sub-1', subAgentSubAgentRelationId: 'rel-delegate-sub-1' },
        ] as any,
      });

      expect(result.internalDelegateRelations).toHaveLength(1);
      expect(result.internalDelegateRelations[0]).toEqual({
        id: 'sub-1',
        name: 'Sub 1',
        description: 'Desc',
        relationType: 'delegate',
        relationId: 'rel-delegate-sub-1',
      });
      expect(result.externalRelations).toHaveLength(0);
      expect(result.teamRelations).toHaveLength(0);
    });

    it('should parse external agent delegations', () => {
      const agent = createMockAgent({
        externalAgents: {
          'ext-1': {
            id: 'ext-1',
            name: 'External Agent 1',
            description: 'External desc',
            baseUrl: 'https://external.example.com',
            credentialReferenceId: 'cred-1',
            tenantId: 'tenant-1',
            projectId: 'project-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      });
      const project = createMockProject();

      const result = parseDelegateRelations({
        agent,
        project,
        canDelegateTo: [
          {
            externalAgentId: 'ext-1',
            subAgentExternalAgentRelationId: 'rel-ext-1',
            headers: { 'X-Custom': 'value' },
          },
        ] as any,
      });

      expect(result.externalRelations).toHaveLength(1);
      expect(result.externalRelations[0]).toEqual({
        externalAgent: {
          id: 'ext-1',
          name: 'External Agent 1',
          description: 'External desc',
          baseUrl: 'https://external.example.com',
          credentialReferenceId: 'cred-1',
        },
        headers: { 'X-Custom': 'value' },
        relationId: 'rel-ext-1',
      });
    });

    it('should parse team agent delegations', () => {
      const agent = createMockAgent({
        teamAgents: {
          'team-1': {
            id: 'team-1',
            name: 'Team Agent 1',
            description: 'Team desc',
          },
        },
      });
      const project = createMockProject();

      const result = parseDelegateRelations({
        agent,
        project,
        canDelegateTo: [
          {
            agentId: 'team-1',
            subAgentTeamAgentRelationId: 'rel-team-1',
            headers: { 'X-Team': 'header' },
          },
        ] as any,
      });

      expect(result.teamRelations).toHaveLength(1);
      expect(result.teamRelations[0]).toEqual({
        targetAgent: {
          id: 'team-1',
          name: 'Team Agent 1',
          description: 'Team desc',
        },
        targetAgentId: 'team-1',
        headers: { 'X-Team': 'header' },
        relationId: 'rel-team-1',
      });
    });

    it('should look up external agents from project when not in agent', () => {
      const agent = createMockAgent();
      const project = createMockProject({
        externalAgents: {
          'ext-1': {
            id: 'ext-1',
            name: 'Project External',
            description: 'Project ext desc',
            baseUrl: 'https://project-external.example.com',
            credentialReferenceId: null,
            tenantId: 'tenant-1',
            projectId: 'project-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      });

      const result = parseDelegateRelations({
        agent,
        project,
        canDelegateTo: [
          { externalAgentId: 'ext-1', subAgentExternalAgentRelationId: 'rel-ext-1' },
        ] as any,
      });

      expect(result.externalRelations).toHaveLength(1);
      expect(result.externalRelations[0]?.externalAgent.name).toBe('Project External');
    });

    it('should handle mixed delegate types', () => {
      const subAgent = createMockSubAgent({ id: 'sub-1', name: 'Sub 1' });
      const agent = createMockAgent({
        subAgents: { 'sub-1': subAgent },
        externalAgents: {
          'ext-1': {
            id: 'ext-1',
            name: 'External',
            description: null,
            baseUrl: 'https://ext.com',
            credentialReferenceId: null,
            tenantId: 'tenant-1',
            projectId: 'project-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
        teamAgents: {
          'team-1': { id: 'team-1', name: 'Team', description: null },
        },
      });
      const project = createMockProject();

      const result = parseDelegateRelations({
        agent,
        project,
        canDelegateTo: [
          { subAgentId: 'sub-1', subAgentSubAgentRelationId: 'rel-sub-1' },
          { externalAgentId: 'ext-1', subAgentExternalAgentRelationId: 'rel-ext-1' },
          { agentId: 'team-1', subAgentTeamAgentRelationId: 'rel-team-1' },
        ] as any,
      });

      expect(result.internalDelegateRelations).toHaveLength(1);
      expect(result.externalRelations).toHaveLength(1);
      expect(result.teamRelations).toHaveLength(1);
    });
  });

  describe('getSubAgentRelations', () => {
    it('should combine transfer and delegate relations', () => {
      const subAgent1 = createMockSubAgent({ id: 'sub-1', name: 'Sub 1' });
      const subAgent2 = createMockSubAgent({ id: 'sub-2', name: 'Sub 2' });
      const currentSubAgent = createMockSubAgent({
        id: 'current',
        canTransferTo: [
          { subAgentId: 'sub-1', subAgentSubAgentRelationId: 'rel-transfer-1' },
        ] as any,
        canDelegateTo: [
          { subAgentId: 'sub-2', subAgentSubAgentRelationId: 'rel-delegate-1' },
        ] as any,
      });
      const agent = createMockAgent({
        subAgents: {
          current: currentSubAgent,
          'sub-1': subAgent1,
          'sub-2': subAgent2,
        },
      });
      const project = createMockProject();

      const result = getSubAgentRelations({
        agent,
        project,
        subAgent: currentSubAgent,
      });

      expect(result.transferRelations).toHaveLength(1);
      expect(result.transferRelations[0]?.id).toBe('sub-1');
      expect(result.internalDelegateRelations).toHaveLength(1);
      expect(result.internalDelegateRelations[0]?.id).toBe('sub-2');
    });

    it('should handle empty relations', () => {
      const subAgent = createMockSubAgent({
        canTransferTo: null,
        canDelegateTo: null,
      });
      const agent = createMockAgent();
      const project = createMockProject();

      const result = getSubAgentRelations({ agent, project, subAgent });

      expect(result.transferRelations).toHaveLength(0);
      expect(result.internalDelegateRelations).toHaveLength(0);
      expect(result.externalRelations).toHaveLength(0);
      expect(result.teamRelations).toHaveLength(0);
    });
  });

  describe('getToolsForSubAgent', () => {
    it('should resolve tools from agent-level tools', () => {
      const subAgent = createMockSubAgent({
        canUse: [{ toolId: 'tool-1', toolSelection: ['method1'] }],
      });
      const agent = createMockAgent({
        tools: {
          'tool-1': {
            id: 'tool-1',
            name: 'Tool 1',
            description: 'Tool desc',
            baseUrl: 'https://tool.com',
            capabilities: { tools: [{ name: 'method1' }, { name: 'method2' }] },
            tenantId: 'tenant-1',
            projectId: 'project-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            credentialReferenceId: null,
            imageUrl: null,
          },
        },
      });
      const project = createMockProject();

      const result = getToolsForSubAgent({ agent, project, subAgent });

      expect(result).toHaveLength(1);
      expect(result[0]?.toolId).toBe('tool-1');
      expect(result[0]?.tool.name).toBe('Tool 1');
      expect(result[0]?.selectedTools).toEqual(['method1']);
    });

    it('should resolve tools from project-level tools', () => {
      const subAgent = createMockSubAgent({
        canUse: [{ toolId: 'project-tool-1' }],
      });
      const agent = createMockAgent({ tools: null });
      const project = createMockProject({
        tools: {
          'project-tool-1': {
            id: 'project-tool-1',
            name: 'Project Tool',
            description: null,
            baseUrl: 'https://project-tool.com',
            capabilities: null,
            tenantId: 'tenant-1',
            projectId: 'project-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            credentialReferenceId: null,
            imageUrl: null,
          },
        },
      });

      const result = getToolsForSubAgent({ agent, project, subAgent });

      expect(result).toHaveLength(1);
      expect(result[0]?.tool.name).toBe('Project Tool');
    });

    it('should filter out non-existent tools', () => {
      const subAgent = createMockSubAgent({
        canUse: [{ toolId: 'non-existent' }],
      });
      const agent = createMockAgent();
      const project = createMockProject();

      const result = getToolsForSubAgent({ agent, project, subAgent });

      expect(result).toHaveLength(0);
    });
  });

  describe('getDataComponentsForSubAgent', () => {
    it('should resolve data components from project', () => {
      const subAgent = createMockSubAgent({
        dataComponents: ['dc-1', 'dc-2'],
      });
      const project = createMockProject({
        dataComponents: {
          'dc-1': {
            id: 'dc-1',
            name: 'Data Component 1',
            description: null,
            props: null,
            render: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
          'dc-2': {
            id: 'dc-2',
            name: 'Data Component 2',
            description: null,
            props: null,
            render: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      });

      const result = getDataComponentsForSubAgent({ project, subAgent });

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.name)).toEqual(['Data Component 1', 'Data Component 2']);
    });

    it('should filter out non-existent data components', () => {
      const subAgent = createMockSubAgent({
        dataComponents: ['dc-1', 'non-existent'],
      });
      const project = createMockProject({
        dataComponents: {
          'dc-1': {
            id: 'dc-1',
            name: 'Data Component 1',
            description: null,
            props: null,
            render: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      });

      const result = getDataComponentsForSubAgent({ project, subAgent });

      expect(result).toHaveLength(1);
    });

    it('should handle null dataComponents', () => {
      const subAgent = createMockSubAgent({ dataComponents: null });
      const project = createMockProject();

      const result = getDataComponentsForSubAgent({ project, subAgent });

      expect(result).toHaveLength(0);
    });
  });

  describe('getArtifactComponentsForSubAgent', () => {
    it('should resolve artifact components from project', () => {
      const subAgent = createMockSubAgent({
        artifactComponents: ['ac-1'],
      });
      const project = createMockProject({
        artifactComponents: {
          'ac-1': {
            id: 'ac-1',
            name: 'Artifact Component 1',
            description: null,
            props: null,
            render: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      });

      const result = getArtifactComponentsForSubAgent({ project, subAgent });

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Artifact Component 1');
    });
  });

  describe('buildRelationsForDescription', () => {
    it('should build all relation types for description generation', () => {
      const subAgent1 = createMockSubAgent({ id: 'sub-1', name: 'Transfer Target' });
      const subAgent = createMockSubAgent({
        canTransferTo: [
          { subAgentId: 'sub-1', subAgentSubAgentRelationId: 'rel-transfer-1' },
        ] as any,
        canDelegateTo: [
          { externalAgentId: 'ext-1', subAgentExternalAgentRelationId: 'rel-ext-1' },
          { agentId: 'team-1', subAgentTeamAgentRelationId: 'rel-team-1' },
        ] as any,
      });
      const agent = createMockAgent({
        subAgents: { 'sub-1': subAgent1 },
        externalAgents: {
          'ext-1': {
            id: 'ext-1',
            name: 'External',
            description: 'Ext desc',
            baseUrl: 'https://ext.com',
            credentialReferenceId: null,
            tenantId: 'tenant-1',
            projectId: 'project-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
        teamAgents: {
          'team-1': { id: 'team-1', name: 'Team', description: 'Team desc' },
        },
      });
      const project = createMockProject();

      const result = buildRelationsForDescription({ agent, project, subAgent });

      expect(result.internalRelations).toHaveLength(1);
      expect(result.internalRelations[0]?.relationType).toBe('transfer');
      expect(result.externalRelations).toHaveLength(1);
      expect(result.teamRelations).toHaveLength(1);
    });
  });

  describe('enhanceInternalRelation', () => {
    beforeEach(() => {
      mockGenerateDescriptionWithRelationData.mockClear();
    });

    it('should enhance relation with generated description', () => {
      const relation = {
        id: 'sub-1',
        name: 'Sub Agent 1',
        description: 'Original description',
        relationType: 'transfer' as const,
        relationId: 'rel-internal-1',
      };
      const relatedSubAgent = createMockSubAgent({
        id: 'sub-1',
        canTransferTo: [],
        canDelegateTo: [],
      });
      const agent = createMockAgent({
        subAgents: { 'sub-1': relatedSubAgent },
      });
      const project = createMockProject();

      const result = enhanceInternalRelation({
        relation,
        agent,
        project,
      });

      expect(mockGenerateDescriptionWithRelationData).toHaveBeenCalledWith(
        'Original description',
        expect.any(Array),
        expect.any(Array),
        expect.any(Array)
      );
      expect(result.description).toBe('Enhanced: Original description');
    });

    it('should return original relation when sub-agent not found', () => {
      const relation = {
        id: 'non-existent',
        name: 'Non-existent',
        description: 'Original',
        relationType: 'transfer' as const,
        relationId: 'rel-internal-missing',
      };
      const agent = createMockAgent({ subAgents: {} });
      const project = createMockProject();

      const result = enhanceInternalRelation({
        relation,
        agent,
        project,
      });

      expect(mockGenerateDescriptionWithRelationData).not.toHaveBeenCalled();
      expect(result).toEqual(relation);
    });
  });

  describe('enhanceTeamRelation', () => {
    beforeEach(() => {
      mockGenerateDescriptionWithRelationData.mockClear();
    });

    it('should enhance team relation with generated description', () => {
      const relation = {
        targetAgent: {
          id: 'team-agent-1',
          name: 'Team Agent',
          description: 'Original team desc',
        },
        targetAgentId: 'team-agent-1',
        relationId: 'rel-team-1',
      };
      const defaultSubAgent = createMockSubAgent({
        id: 'default-sub',
        canTransferTo: [],
        canDelegateTo: [],
      });
      const teamAgent = createMockAgent({
        id: 'team-agent-1',
        description: 'Team agent base description',
        defaultSubAgentId: 'default-sub',
        subAgents: { 'default-sub': defaultSubAgent },
      });
      const project = createMockProject({
        agents: { 'team-agent-1': teamAgent },
      });

      const result = enhanceTeamRelation({
        relation,
        project,
      });

      expect(mockGenerateDescriptionWithRelationData).toHaveBeenCalledWith(
        'Team agent base description',
        expect.any(Array),
        expect.any(Array),
        expect.any(Array)
      );
      expect(result.targetAgent.description).toBe('Enhanced: Team agent base description');
    });

    it('should return original relation when team agent has no default sub-agent', () => {
      const relation = {
        targetAgent: { id: 'team-1', name: 'Team', description: 'Desc' },
        targetAgentId: 'team-1',
        relationId: 'rel-team-missing-default',
      };
      const teamAgent = createMockAgent({
        id: 'team-1',
        defaultSubAgentId: null,
      });
      const project = createMockProject({
        agents: { 'team-1': teamAgent },
      });

      const result = enhanceTeamRelation({
        relation,
        project,
      });

      expect(mockGenerateDescriptionWithRelationData).not.toHaveBeenCalled();
      expect(result).toEqual(relation);
    });

    it('should return original relation when team agent not found', () => {
      const relation = {
        targetAgent: { id: 'non-existent', name: 'Non-existent', description: null },
        targetAgentId: 'non-existent',
        relationId: 'rel-team-not-found',
      };
      const project = createMockProject({ agents: {} });

      const result = enhanceTeamRelation({
        relation,
        project,
      });

      expect(mockGenerateDescriptionWithRelationData).not.toHaveBeenCalled();
      expect(result).toEqual(relation);
    });
  });

  describe('getTransferRelationsForTargetSubAgent', () => {
    it('should return transfer relations for a target sub-agent', () => {
      const subAgent1 = createMockSubAgent({
        id: 'sub-1',
        name: 'Sub 1',
        canTransferTo: [
          { subAgentId: 'sub-2', subAgentSubAgentRelationId: 'rel-12' },
          { subAgentId: 'sub-3', subAgentSubAgentRelationId: 'rel-13' },
        ] as any,
      });
      const subAgent2 = createMockSubAgent({ id: 'sub-2', name: 'Sub 2', description: 'Desc 2' });
      const subAgent3 = createMockSubAgent({ id: 'sub-3', name: 'Sub 3', description: 'Desc 3' });
      const agent = createMockAgent({
        subAgents: {
          'sub-1': subAgent1,
          'sub-2': subAgent2,
          'sub-3': subAgent3,
        },
      });

      const result = getTransferRelationsForTargetSubAgent({
        agent,
        subAgentId: 'sub-1',
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'sub-2',
        name: 'Sub 2',
        description: 'Desc 2',
        relationId: 'rel-12',
      });
      expect(result[1]).toEqual({
        id: 'sub-3',
        name: 'Sub 3',
        description: 'Desc 3',
        relationId: 'rel-13',
      });
    });

    it('should return empty array when target sub-agent not found', () => {
      const agent = createMockAgent({ subAgents: {} });

      const result = getTransferRelationsForTargetSubAgent({
        agent,
        subAgentId: 'non-existent',
      });

      expect(result).toHaveLength(0);
    });

    it('should filter out non-existent transfer targets', () => {
      const subAgent1 = createMockSubAgent({
        id: 'sub-1',
        canTransferTo: [
          { subAgentId: 'sub-2', subAgentSubAgentRelationId: 'rel-12' },
          { subAgentId: 'non-existent', subAgentSubAgentRelationId: 'rel-missing' },
        ] as any,
      });
      const subAgent2 = createMockSubAgent({ id: 'sub-2', name: 'Sub 2' });
      const agent = createMockAgent({
        subAgents: { 'sub-1': subAgent1, 'sub-2': subAgent2 },
      });

      const result = getTransferRelationsForTargetSubAgent({
        agent,
        subAgentId: 'sub-1',
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('sub-2');
    });

    it('should return empty array when canTransferTo is null', () => {
      const subAgent1 = createMockSubAgent({
        id: 'sub-1',
        canTransferTo: null,
      });
      const agent = createMockAgent({
        subAgents: { 'sub-1': subAgent1 },
      });

      const result = getTransferRelationsForTargetSubAgent({
        agent,
        subAgentId: 'sub-1',
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('getDelegateRelationsForTargetSubAgent', () => {
    it('should return external agent delegate relations for a target sub-agent', () => {
      const subAgent1 = createMockSubAgent({
        id: 'sub-1',
        canDelegateTo: [{ externalAgentId: 'ext-1', headers: { 'X-Custom': 'value' } }] as any,
      });
      const agent = createMockAgent({
        subAgents: { 'sub-1': subAgent1 },
        externalAgents: {
          'ext-1': {
            id: 'ext-1',
            name: 'External Agent',
            description: 'External desc',
            baseUrl: 'https://external.com',
            credentialReferenceId: 'cred-1',
            tenantId: 'tenant-1',
            projectId: 'project-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      });
      const project = createMockProject();

      const result = getExternalAgentRelationsForTargetSubAgent({
        agent,
        project,
        subAgentId: 'sub-1',
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.externalAgent.name).toBe('External Agent');
      expect(result[0]?.headers).toEqual({ 'X-Custom': 'value' });
    });

    it('should look up external agents from project when not in agent', () => {
      const subAgent1 = createMockSubAgent({
        id: 'sub-1',
        canDelegateTo: [
          { externalAgentId: 'ext-project', subAgentExternalAgentRelationId: 'rel-ext-project' },
        ] as any,
      });
      const agent = createMockAgent({
        subAgents: { 'sub-1': subAgent1 },
        externalAgents: null,
      });
      const project = createMockProject({
        externalAgents: {
          'ext-project': {
            id: 'ext-project',
            name: 'Project External',
            description: null,
            baseUrl: 'https://project-ext.com',
            credentialReferenceId: null,
            tenantId: 'tenant-1',
            projectId: 'project-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      });

      const result = getExternalAgentRelationsForTargetSubAgent({
        agent,
        project,
        subAgentId: 'sub-1',
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.externalAgent.name).toBe('Project External');
    });

    it('should return empty array when target sub-agent not found', () => {
      const agent = createMockAgent({ subAgents: {} });
      const project = createMockProject();

      const result = getExternalAgentRelationsForTargetSubAgent({
        agent,
        project,
        subAgentId: 'non-existent',
      });

      expect(result).toHaveLength(0);
    });

    it('should filter out non-existent external agents', () => {
      const subAgent1 = createMockSubAgent({
        id: 'sub-1',
        canDelegateTo: [
          { externalAgentId: 'non-existent', subAgentExternalAgentRelationId: 'rel-ext-missing' },
        ] as any,
      });
      const agent = createMockAgent({
        subAgents: { 'sub-1': subAgent1 },
        externalAgents: null,
      });
      const project = createMockProject();

      const result = getExternalAgentRelationsForTargetSubAgent({
        agent,
        project,
        subAgentId: 'sub-1',
      });

      expect(result).toHaveLength(0);
    });

    it('should ignore non-external-agent delegate items', () => {
      const subAgent1 = createMockSubAgent({
        id: 'sub-1',
        canDelegateTo: [
          'sub-2', // Internal delegation (string)
          { agentId: 'team-1' }, // Team agent delegation
          { externalAgentId: 'ext-1' }, // External agent delegation
        ] as any,
      });
      const agent = createMockAgent({
        subAgents: { 'sub-1': subAgent1 },
        externalAgents: {
          'ext-1': {
            id: 'ext-1',
            name: 'External',
            description: null,
            baseUrl: 'https://ext.com',
            credentialReferenceId: null,
            tenantId: 'tenant-1',
            projectId: 'project-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      });
      const project = createMockProject();

      const result = getExternalAgentRelationsForTargetSubAgent({
        agent,
        project,
        subAgentId: 'sub-1',
      });

      // Only the external agent should be returned
      expect(result).toHaveLength(1);
      expect(result[0]?.externalAgent.name).toBe('External');
    });
  });
});
