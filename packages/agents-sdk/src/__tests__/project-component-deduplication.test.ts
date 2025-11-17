import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent } from '../agent';
import { ArtifactComponent } from '../artifact-component';
import { DataComponent } from '../data-component';
import type { ProjectConfig } from '../project';
import { Project } from '../project';
import { SubAgent } from '../subAgent';

// Mock the logger
vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: async () => ({ data: {} }),
    text: async () => '',
    status: 200,
    statusText: 'OK',
  } as any)
);
global.fetch = mockFetch as any;

describe('Project Component Deduplication', () => {
  let projectConfig: ProjectConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up environment variables for testing
    process.env.ENVIRONMENT = 'test';
    process.env.INKEEP_API_URL = 'http://localhost:3002';

    projectConfig = {
      id: 'test-project',
      name: 'Test Project',
      description: 'A test project',
      models: {
        base: { model: 'gpt-4o-mini' },
      },
      stopWhen: {
        transferCountIs: 5,
      },
    };
  });

  describe('toFullProjectDefinition - component deduplication', () => {
    it('should deduplicate data components when multiple agents reference the same component', async () => {
      // Create a shared data component
      const sharedDataComponent = new DataComponent({
        id: 'shared-data-component',
        name: 'Shared Data Component',
        description: 'A shared data component',
        props: { type: 'object' },
      });

      // Create first agent with the shared component
      const subAgent1 = new SubAgent({
        id: 'sub-agent-1',
        name: 'Sub Agent 1',
        description: 'Sub Agent 1 description',
        prompt: 'Agent 1 prompt',
        dataComponents: () => [sharedDataComponent],
      });

      const agent1 = new Agent({
        id: 'agent-1',
        name: 'Agent 1',
        defaultSubAgent: subAgent1,
      });

      // Create second agent with the same shared component
      const subAgent2 = new SubAgent({
        id: 'sub-agent-2',
        name: 'Sub Agent 2',
        description: 'Sub Agent 2 description',
        prompt: 'Agent 2 prompt',
        dataComponents: () => [sharedDataComponent],
      });

      const agent2 = new Agent({
        id: 'agent-2',
        name: 'Agent 2',
        defaultSubAgent: subAgent2,
      });

      const configWithAgents: ProjectConfig = {
        ...projectConfig,
        agents: () => [agent1, agent2],
      };

      const project = new Project(configWithAgents);
      project.setConfig('test-tenant', 'http://localhost:3002');

      // Get the full project definition
      const fullDefinition = await (project as any).toFullProjectDefinition();

      // Verify that the data component appears only once in project-level dataComponents
      expect(fullDefinition.dataComponents).toBeDefined();
      expect(Object.keys(fullDefinition.dataComponents || {})).toHaveLength(1);
      expect(fullDefinition.dataComponents?.['shared-data-component']).toBeDefined();
      expect(fullDefinition.dataComponents?.['shared-data-component'].name).toBe(
        'Shared Data Component'
      );

      // Verify both agents reference the component by ID
      expect(fullDefinition.agents['agent-1'].subAgents['sub-agent-1'].dataComponents).toEqual([
        'shared-data-component',
      ]);
      expect(fullDefinition.agents['agent-2'].subAgents['sub-agent-2'].dataComponents).toEqual([
        'shared-data-component',
      ]);
    });

    it('should deduplicate artifact components when multiple agents reference the same component', async () => {
      // Create a shared artifact component
      const sharedArtifactComponent = new ArtifactComponent({
        id: 'shared-artifact-component',
        name: 'Shared Artifact Component',
        description: 'A shared artifact component',
        props: { type: 'object' },
      });

      // Create first agent with the shared component
      const subAgent1 = new SubAgent({
        id: 'sub-agent-1',
        name: 'Sub Agent 1',
        description: 'Sub Agent 1 description',
        prompt: 'Agent 1 prompt',
        artifactComponents: () => [sharedArtifactComponent],
      });

      const agent1 = new Agent({
        id: 'agent-1',
        name: 'Agent 1',
        defaultSubAgent: subAgent1,
      });

      // Create second agent with the same shared component
      const subAgent2 = new SubAgent({
        id: 'sub-agent-2',
        name: 'Sub Agent 2',
        description: 'Sub Agent 2 description',
        prompt: 'Agent 2 prompt',
        artifactComponents: () => [sharedArtifactComponent],
      });

      const agent2 = new Agent({
        id: 'agent-2',
        name: 'Agent 2',
        defaultSubAgent: subAgent2,
      });

      const configWithAgents: ProjectConfig = {
        ...projectConfig,
        agents: () => [agent1, agent2],
      };

      const project = new Project(configWithAgents);
      project.setConfig('test-tenant', 'http://localhost:3002');

      // Get the full project definition
      const fullDefinition = await (project as any).toFullProjectDefinition();

      // Verify that the artifact component appears only once in project-level artifactComponents
      expect(fullDefinition.artifactComponents).toBeDefined();
      expect(Object.keys(fullDefinition.artifactComponents || {})).toHaveLength(1);
      expect(fullDefinition.artifactComponents?.['shared-artifact-component']).toBeDefined();
      expect(fullDefinition.artifactComponents?.['shared-artifact-component'].name).toBe(
        'Shared Artifact Component'
      );

      // Verify both agents reference the component by ID
      expect(fullDefinition.agents['agent-1'].subAgents['sub-agent-1'].artifactComponents).toEqual([
        'shared-artifact-component',
      ]);
      expect(fullDefinition.agents['agent-2'].subAgents['sub-agent-2'].artifactComponents).toEqual([
        'shared-artifact-component',
      ]);
    });

    it('should deduplicate components by name when IDs differ but names match', async () => {
      // Create components with same name but different IDs (simulating inconsistent ID generation)
      const component1 = new DataComponent({
        id: 'component-id-1',
        name: 'Shared Component',
        description: 'A shared component',
        props: { type: 'object' },
      });

      // Create a plain object component with same name but different ID format
      const component2 = {
        id: 'shared-component', // Different ID format
        name: 'Shared Component', // Same name
        description: 'A shared component',
        props: { type: 'object' },
      };

      const subAgent1 = new SubAgent({
        id: 'sub-agent-1',
        name: 'Sub Agent 1',
        description: 'Sub Agent 1 description',
        prompt: 'Agent 1 prompt',
        dataComponents: () => [component1],
      });

      const subAgent2 = new SubAgent({
        id: 'sub-agent-2',
        name: 'Sub Agent 2',
        description: 'Sub Agent 2 description',
        prompt: 'Agent 2 prompt',
        dataComponents: () => [component2],
      });

      const agent1 = new Agent({
        id: 'agent-1',
        name: 'Agent 1',
        defaultSubAgent: subAgent1,
      });

      const agent2 = new Agent({
        id: 'agent-2',
        name: 'Agent 2',
        defaultSubAgent: subAgent2,
      });

      const configWithAgents: ProjectConfig = {
        ...projectConfig,
        agents: () => [agent1, agent2],
      };

      const project = new Project(configWithAgents);
      project.setConfig('test-tenant', 'http://localhost:3002');

      // Get the full project definition
      const fullDefinition = await (project as any).toFullProjectDefinition();

      // Should only have one component (the first one encountered)
      expect(fullDefinition.dataComponents).toBeDefined();
      const componentKeys = Object.keys(fullDefinition.dataComponents || {});
      expect(componentKeys.length).toBeLessThanOrEqual(1);
    });

    it('should handle project-level components and agent-level components correctly', async () => {
      // Create project-level component
      const projectDataComponent = new DataComponent({
        id: 'project-data-component',
        name: 'Project Data Component',
        description: 'A project-level component',
        props: { type: 'object' },
      });

      // Create agent-level component
      const agentDataComponent = new DataComponent({
        id: 'agent-data-component',
        name: 'Agent Data Component',
        description: 'An agent-level component',
        props: { type: 'object' },
      });

      const subAgent = new SubAgent({
        id: 'sub-agent-1',
        name: 'Sub Agent 1',
        description: 'Sub Agent 1 description',
        prompt: 'Agent prompt',
        dataComponents: () => [agentDataComponent],
      });

      const agent = new Agent({
        id: 'agent-1',
        name: 'Agent 1',
        defaultSubAgent: subAgent,
      });

      const configWithAgents: ProjectConfig = {
        ...projectConfig,
        agents: () => [agent],
        dataComponents: () => [projectDataComponent],
      };

      const project = new Project(configWithAgents);
      project.setConfig('test-tenant', 'http://localhost:3002');

      // Get the full project definition
      const fullDefinition = await (project as any).toFullProjectDefinition();

      // Both components should be in project-level dataComponents
      expect(fullDefinition.dataComponents).toBeDefined();
      expect(fullDefinition.dataComponents?.['project-data-component']).toBeDefined();
      expect(fullDefinition.dataComponents?.['agent-data-component']).toBeDefined();

      // Agent should reference its component by ID
      expect(fullDefinition.agents['agent-1'].subAgents['sub-agent-1'].dataComponents).toEqual([
        'agent-data-component',
      ]);
    });

    it('should normalize component IDs consistently', async () => {
      // Test with component that has getId method
      const componentWithGetId = new DataComponent({
        id: 'normalized-id',
        name: 'Normalized Component',
        description: 'A component',
        props: { type: 'object' },
      });

      // Test with plain object component
      const componentPlainObject = {
        id: 'normalized-id', // Same ID
        name: 'Normalized Component',
        description: 'A component',
        props: { type: 'object' },
      };

      const subAgent1 = new SubAgent({
        id: 'sub-agent-1',
        name: 'Sub Agent 1',
        description: 'Sub Agent 1 description',
        prompt: 'Agent 1 prompt',
        dataComponents: () => [componentWithGetId],
      });

      const subAgent2 = new SubAgent({
        id: 'sub-agent-2',
        name: 'Sub Agent 2',
        description: 'Sub Agent 2 description',
        prompt: 'Agent 2 prompt',
        dataComponents: () => [componentPlainObject],
      });

      const agent1 = new Agent({
        id: 'agent-1',
        name: 'Agent 1',
        defaultSubAgent: subAgent1,
      });

      const agent2 = new Agent({
        id: 'agent-2',
        name: 'Agent 2',
        defaultSubAgent: subAgent2,
      });

      const configWithAgents: ProjectConfig = {
        ...projectConfig,
        agents: () => [agent1, agent2],
      };

      const project = new Project(configWithAgents);
      project.setConfig('test-tenant', 'http://localhost:3002');

      // Get the full project definition
      const fullDefinition = await (project as any).toFullProjectDefinition();

      // Should only have one component despite different representations
      expect(fullDefinition.dataComponents).toBeDefined();
      expect(Object.keys(fullDefinition.dataComponents || {})).toHaveLength(1);
      expect(fullDefinition.dataComponents?.['normalized-id']).toBeDefined();
    });
  });
});
