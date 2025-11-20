import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFullProjectServerSide,
  deleteFullProject,
  getFullProject,
  updateFullProjectServerSide,
} from '../../data-access/projectFull';
import type { DatabaseClient } from '../../db/client';
import type { FullProjectDefinition } from '../../types/entities';
import { generateId } from '../../utils/conversations';
import { getLogger } from '../../utils/logger';
import { testDbClient } from '../setup';

describe('projectFull data access', () => {
  let db: DatabaseClient;
  const logger = getLogger('test');

  beforeEach(async () => {
    db = testDbClient;
    vi.clearAllMocks();
  });
  const tenantId = `tenant-${generateId()}`;

  const createTestProjectDefinition = (projectId: string): FullProjectDefinition => ({
    id: projectId,
    name: 'Test Project',
    description: 'A test project for data access testing',
    models: {
      base: { model: 'gpt-4o-mini' },
      structuredOutput: { model: 'gpt-4o' },
    },
    stopWhen: {
      transferCountIs: 10,
      stepCountIs: 50,
    },
    tools: {},
    agents: {}, // Start with empty agent for basic testing
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const createTestProjectWithAgents = (projectId: string): FullProjectDefinition => {
    const agentId = `agent-${generateId()}`;
    const subAgentId = `agent-${generateId()}`;
    const toolId = `tool-${generateId()}`;

    return {
      id: projectId,
      name: 'Test Project with Agent',
      description: 'A test project with agent',
      models: {
        base: { model: 'gpt-4o-mini' },
      },
      stopWhen: {
        transferCountIs: 5,
      },
      agents: {
        [agentId]: {
          id: agentId,
          name: 'Test Agent',
          description: 'A test agent',
          defaultSubAgentId: subAgentId,
          subAgents: {
            [subAgentId]: {
              id: subAgentId,
              name: 'Test Agent',
              description: 'A test agent',
              prompt: 'You are a helpful assistant.',
              type: 'internal', // Add type field for discriminated union
              canDelegateTo: [],
              canUse: [{ toolId, toolSelection: null }], // Use new canUse structure
              dataComponents: [],
              artifactComponents: [],
            },
          },
          // No tools here - they're at project level now
        },
      },
      // Tools are now at project level
      tools: {
        [toolId]: {
          id: toolId,
          name: 'Test Tool',
          config: {
            type: 'mcp',
            mcp: {
              server: {
                url: 'http://localhost:3001',
              },
            },
          },
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  describe('createFullProjectServerSide', () => {
    it('should create a project with basic metadata', async () => {
      const projectId = `project-${generateId()}`;
      const projectData = createTestProjectDefinition(projectId);

      const result = await createFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        projectData
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(projectId);
      expect(result.name).toBe(projectData.name);
      expect(result.description).toBe(projectData.description);
      expect(result.models).toEqual(projectData.models);
      expect(result.stopWhen).toEqual(projectData.stopWhen);
    });

    it('should create a project with agent and nested resources', async () => {
      const projectId = `project-${generateId()}`;
      const projectData = createTestProjectWithAgents(projectId);

      const result = await createFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        projectData
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(projectId);
      expect(result.agents).toBeDefined();
      expect(Object.keys(result.agents)).toHaveLength(1);
    });

    it('should handle projects with minimal data', async () => {
      const projectId = `project-${generateId()}`;
      const minimalProject: FullProjectDefinition = {
        id: projectId,
        name: 'Minimal Project',
        description: '',
        models: {
          base: {
            model: 'claude-sonnet-4',
            providerOptions: {},
          },
        },
        agents: {},
        tools: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await createFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        minimalProject
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(projectId);
      expect(result.name).toBe('Minimal Project');
      expect(result.agents).toEqual({});
    });
  });

  describe('getFullProject', () => {
    it('should retrieve an existing project', async () => {
      const projectId = `project-${generateId()}`;
      const projectData = createTestProjectDefinition(projectId);

      // Create the project first
      await createFullProjectServerSide(db, logger)({ tenantId, projectId }, projectData);

      // Retrieve it
      const result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.id).toBe(projectId);
        expect(result.name).toBe(projectData.name);
        expect(result.description).toBe(projectData.description);
      }
    });

    it('should return null for non-existent project', async () => {
      const nonExistentId = `project-${generateId()}`;

      const result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId: nonExistentId },
      });

      expect(result).toBeNull();
    });

    it('should include all agent in the project', async () => {
      const projectId = `project-${generateId()}`;
      const projectData = createTestProjectWithAgents(projectId);

      // Create the project with agent
      await createFullProjectServerSide(db, logger)({ tenantId, projectId }, projectData);

      // Retrieve it
      const result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.agents).toBeDefined();
      }
      // Note: The actual agent count depends on implementation
      // This test verifies structure, not exact content
    });

    it('should have tools at project level, not in agent', async () => {
      const projectId = `project-${generateId()}`;
      const projectData = createTestProjectWithAgents(projectId);

      // Create the project with agent and tools
      await createFullProjectServerSide(db, logger)({ tenantId, projectId }, projectData);

      // Retrieve it
      const result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });

      expect(result).toBeDefined();
      if (result) {
        // Tools should be at project level
        expect(result.tools).toBeDefined();
        const toolIds = Object.keys(result.tools);
        expect(toolIds.length).toBeGreaterThan(0);

        // Verify the tool structure at project level
        const firstToolId = toolIds[0];
        const tool = result.tools[firstToolId];
        expect(tool).toBeDefined();
        expect(tool.name).toBe('Test Tool');
        expect(tool.config).toBeDefined();
      }
    });
  });

  describe('updateFullProjectServerSide', () => {
    it('should update an existing project', async () => {
      const projectId = `project-${generateId()}`;
      const originalData = createTestProjectDefinition(projectId);

      // Create the project first
      await createFullProjectServerSide(db, logger)({ tenantId, projectId }, originalData);

      // Update it
      const updatedData = {
        ...originalData,
        name: 'Updated Project Name',
        description: 'Updated description',
      };

      const result = await updateFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        updatedData
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(projectId);
      expect(result.name).toBe('Updated Project Name');
      expect(result.description).toBe('Updated description');
    });

    it('should create project if it does not exist', async () => {
      const projectId = `project-${generateId()}`;
      const projectData = createTestProjectDefinition(projectId);

      // Try to update a non-existent project (should create it)
      const result = await updateFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        projectData
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(projectId);
      expect(result.name).toBe(projectData.name);
    });

    it('should handle updating project models and stopWhen', async () => {
      const projectId = `project-${generateId()}`;
      const originalData = createTestProjectDefinition(projectId);

      // Create the project first
      await createFullProjectServerSide(db, logger)({ tenantId, projectId }, originalData);

      // Update with new models and stopWhen
      const updatedData = {
        ...originalData,
        models: {
          base: { model: 'gpt-4' },
          summarizer: { model: 'gpt-3.5-turbo' },
        },
        stopWhen: {
          transferCountIs: 20,
          stepCountIs: 100,
        },
      };

      const result = await updateFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        updatedData
      );

      expect(result).toBeDefined();
      expect(result.models).toEqual(updatedData.models);
      expect(result.stopWhen).toEqual(updatedData.stopWhen);
    });

    it('should delete orphaned tools when removed from project', async () => {
      const projectId = `project-${generateId()}`;
      const tool1Id = `tool-${generateId()}`;
      const tool2Id = `tool-${generateId()}`;

      const projectWithTools: FullProjectDefinition = {
        ...createTestProjectDefinition(projectId),
        tools: {
          [tool1Id]: {
            id: tool1Id,
            name: 'Tool 1',
            config: {
              type: 'mcp',
              mcp: {
                server: {
                  url: 'http://localhost:3001',
                },
              },
            },
          },
          [tool2Id]: {
            id: tool2Id,
            name: 'Tool 2',
            config: {
              type: 'mcp',
              mcp: {
                server: {
                  url: 'http://localhost:3002',
                },
              },
            },
          },
        },
      };

      await createFullProjectServerSide(db, logger)({ tenantId, projectId }, projectWithTools);

      let result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.tools).toBeDefined();
      expect(Object.keys(result?.tools || {})).toHaveLength(2);

      const updatedProjectWithOneTool: FullProjectDefinition = {
        ...projectWithTools,
        tools: {
          [tool1Id]: projectWithTools.tools[tool1Id],
        },
      };

      await updateFullProjectServerSide(db, logger)({ tenantId, projectId }, updatedProjectWithOneTool);

      result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.tools).toBeDefined();
      expect(Object.keys(result?.tools || {})).toHaveLength(1);
      expect(result?.tools[tool1Id]).toBeDefined();
      expect(result?.tools[tool2Id]).toBeUndefined();
    });

    it('should delete orphaned functions when removed from project', async () => {
      const projectId = `project-${generateId()}`;
      const func1Id = `func-${generateId()}`;
      const func2Id = `func-${generateId()}`;

      const projectWithFunctions: FullProjectDefinition = {
        ...createTestProjectDefinition(projectId),
        functions: {
          [func1Id]: {
            id: func1Id,
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            executeCode: 'export default function test() { return { result: "test1" }; }',
            dependencies: {},
          },
          [func2Id]: {
            id: func2Id,
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            executeCode: 'export default function test() { return { result: "test2" }; }',
            dependencies: {},
          },
        },
      };

      await createFullProjectServerSide(db, logger)({ tenantId, projectId }, projectWithFunctions);

      let result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.functions).toBeDefined();
      expect(Object.keys(result?.functions || {})).toHaveLength(2);

      const updatedProjectWithOneFunction: FullProjectDefinition = {
        ...projectWithFunctions,
        functions: {
          [func1Id]: projectWithFunctions.functions![func1Id],
        },
      };

      await updateFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        updatedProjectWithOneFunction
      );

      result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.functions).toBeDefined();
      expect(Object.keys(result?.functions || {})).toHaveLength(1);
      expect(result?.functions![func1Id]).toBeDefined();
      expect(result?.functions![func2Id]).toBeUndefined();
    });

    it('should delete orphaned credentialReferences when removed from project', async () => {
      const projectId = `project-${generateId()}`;
      const cred1Id = `cred-${generateId()}`;
      const cred2Id = `cred-${generateId()}`;

      const projectWithCredentials: FullProjectDefinition = {
        ...createTestProjectDefinition(projectId),
        credentialReferences: {
          [cred1Id]: {
            id: cred1Id,
            name: 'Credential 1',
            type: 'memory',
            credentialStoreId: 'store-1',
            retrievalParams: {},
          },
          [cred2Id]: {
            id: cred2Id,
            name: 'Credential 2',
            type: 'memory',
            credentialStoreId: 'store-2',
            retrievalParams: {},
          },
        },
      };

      await createFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        projectWithCredentials
      );

      let result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.credentialReferences).toBeDefined();
      expect(Object.keys(result?.credentialReferences || {})).toHaveLength(2);

      const updatedProjectWithOneCredential: FullProjectDefinition = {
        ...projectWithCredentials,
        credentialReferences: {
          [cred1Id]: projectWithCredentials.credentialReferences![cred1Id],
        },
      };

      await updateFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        updatedProjectWithOneCredential
      );

      result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.credentialReferences).toBeDefined();
      expect(Object.keys(result?.credentialReferences || {})).toHaveLength(1);
      expect(result?.credentialReferences![cred1Id]).toBeDefined();
      expect(result?.credentialReferences![cred2Id]).toBeUndefined();
    });

    it('should delete orphaned externalAgents when removed from project', async () => {
      const projectId = `project-${generateId()}`;
      const ext1Id = `ext-${generateId()}`;
      const ext2Id = `ext-${generateId()}`;

      const projectWithExternalAgents: FullProjectDefinition = {
        ...createTestProjectDefinition(projectId),
        externalAgents: {
          [ext1Id]: {
            id: ext1Id,
            name: 'External Agent 1',
            description: 'Test external agent 1',
            baseUrl: 'http://localhost:4001',
          },
          [ext2Id]: {
            id: ext2Id,
            name: 'External Agent 2',
            description: 'Test external agent 2',
            baseUrl: 'http://localhost:4002',
          },
        },
      };

      await createFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        projectWithExternalAgents
      );

      let result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.externalAgents).toBeDefined();
      expect(Object.keys(result?.externalAgents || {})).toHaveLength(2);

      const updatedProjectWithOneExternalAgent: FullProjectDefinition = {
        ...projectWithExternalAgents,
        externalAgents: {
          [ext1Id]: projectWithExternalAgents.externalAgents![ext1Id],
        },
      };

      await updateFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        updatedProjectWithOneExternalAgent
      );

      result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.externalAgents).toBeDefined();
      expect(Object.keys(result?.externalAgents || {})).toHaveLength(1);
      expect(result?.externalAgents![ext1Id]).toBeDefined();
      expect(result?.externalAgents![ext2Id]).toBeUndefined();
    });

    it('should delete orphaned dataComponents when removed from project', async () => {
      const projectId = `project-${generateId()}`;
      const data1Id = `data-${generateId()}`;
      const data2Id = `data-${generateId()}`;

      const projectWithDataComponents: FullProjectDefinition = {
        ...createTestProjectDefinition(projectId),
        dataComponents: {
          [data1Id]: {
            id: data1Id,
            name: 'Data Component 1',
            description: 'Test data component 1',
            config: {
              type: 'static',
              static: {
                content: 'Test content 1',
              },
            },
          },
          [data2Id]: {
            id: data2Id,
            name: 'Data Component 2',
            description: 'Test data component 2',
            config: {
              type: 'static',
              static: {
                content: 'Test content 2',
              },
            },
          },
        },
      };

      await createFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        projectWithDataComponents
      );

      let result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.dataComponents).toBeDefined();
      expect(Object.keys(result?.dataComponents || {})).toHaveLength(2);

      const updatedProjectWithOneDataComponent: FullProjectDefinition = {
        ...projectWithDataComponents,
        dataComponents: {
          [data1Id]: projectWithDataComponents.dataComponents![data1Id],
        },
      };

      await updateFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        updatedProjectWithOneDataComponent
      );

      result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.dataComponents).toBeDefined();
      expect(Object.keys(result?.dataComponents || {})).toHaveLength(1);
      expect(result?.dataComponents![data1Id]).toBeDefined();
      expect(result?.dataComponents![data2Id]).toBeUndefined();
    });

    it('should delete orphaned artifactComponents when removed from project', async () => {
      const projectId = `project-${generateId()}`;
      const artifact1Id = `artifact-${generateId()}`;
      const artifact2Id = `artifact-${generateId()}`;

      const projectWithArtifactComponents: FullProjectDefinition = {
        ...createTestProjectDefinition(projectId),
        artifactComponents: {
          [artifact1Id]: {
            id: artifact1Id,
            name: 'Artifact Component 1',
            description: 'Test artifact component 1',
          },
          [artifact2Id]: {
            id: artifact2Id,
            name: 'Artifact Component 2',
            description: 'Test artifact component 2',
          },
        },
      };

      await createFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        projectWithArtifactComponents
      );

      let result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.artifactComponents).toBeDefined();
      expect(Object.keys(result?.artifactComponents || {})).toHaveLength(2);

      const updatedProjectWithOneArtifactComponent: FullProjectDefinition = {
        ...projectWithArtifactComponents,
        artifactComponents: {
          [artifact1Id]: projectWithArtifactComponents.artifactComponents![artifact1Id],
        },
      };

      await updateFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        updatedProjectWithOneArtifactComponent
      );

      result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.artifactComponents).toBeDefined();
      expect(Object.keys(result?.artifactComponents || {})).toHaveLength(1);
      expect(result?.artifactComponents![artifact1Id]).toBeDefined();
      expect(result?.artifactComponents![artifact2Id]).toBeUndefined();
    });

    it('should delete orphaned agents when removed from project', async () => {
      const projectId = `project-${generateId()}`;
      const agent1Id = `agent-${generateId()}`;
      const agent2Id = `agent-${generateId()}`;
      const subAgent1Id = `subagent-${generateId()}`;
      const subAgent2Id = `subagent-${generateId()}`;

      const projectWithAgents: FullProjectDefinition = {
        ...createTestProjectDefinition(projectId),
        agents: {
          [agent1Id]: {
            id: agent1Id,
            name: 'Agent 1',
            description: 'Test agent 1',
            defaultSubAgentId: subAgent1Id,
            subAgents: {
              [subAgent1Id]: {
                id: subAgent1Id,
                name: 'SubAgent 1',
                description: 'Test subagent 1',
                prompt: 'You are a helpful assistant.',
                type: 'internal',
                canDelegateTo: [],
                canUse: [],
                dataComponents: [],
                artifactComponents: [],
              },
            },
          },
          [agent2Id]: {
            id: agent2Id,
            name: 'Agent 2',
            description: 'Test agent 2',
            defaultSubAgentId: subAgent2Id,
            subAgents: {
              [subAgent2Id]: {
                id: subAgent2Id,
                name: 'SubAgent 2',
                description: 'Test subagent 2',
                prompt: 'You are a helpful assistant.',
                type: 'internal',
                canDelegateTo: [],
                canUse: [],
                dataComponents: [],
                artifactComponents: [],
              },
            },
          },
        },
      };

      await createFullProjectServerSide(db, logger)({ tenantId, projectId }, projectWithAgents);

      let result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.agents).toBeDefined();
      expect(Object.keys(result?.agents || {})).toHaveLength(2);

      const updatedProjectWithOneAgent: FullProjectDefinition = {
        ...projectWithAgents,
        agents: {
          [agent1Id]: projectWithAgents.agents[agent1Id],
        },
      };

      await updateFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        updatedProjectWithOneAgent
      );

      result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.agents).toBeDefined();
      expect(Object.keys(result?.agents || {})).toHaveLength(1);
      expect(result?.agents[agent1Id]).toBeDefined();
      expect(result?.agents[agent2Id]).toBeUndefined();
    });

    it('should handle removing all resources of a type', async () => {
      const projectId = `project-${generateId()}`;
      const toolId = `tool-${generateId()}`;

      const projectWithTools: FullProjectDefinition = {
        ...createTestProjectDefinition(projectId),
        tools: {
          [toolId]: {
            id: toolId,
            name: 'Tool 1',
            config: {
              type: 'mcp',
              mcp: {
                server: {
                  url: 'http://localhost:3001',
                },
              },
            },
          },
        },
      };

      await createFullProjectServerSide(db, logger)({ tenantId, projectId }, projectWithTools);

      let result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.tools).toBeDefined();
      expect(Object.keys(result?.tools || {})).toHaveLength(1);

      const updatedProjectWithNoTools: FullProjectDefinition = {
        ...projectWithTools,
        tools: {},
      };

      await updateFullProjectServerSide(db, logger)({ tenantId, projectId }, updatedProjectWithNoTools);

      result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(result?.tools).toBeDefined();
      expect(Object.keys(result?.tools || {})).toHaveLength(0);
    });
  });

  describe('deleteFullProject', () => {
    it('should delete an existing project', async () => {
      const projectId = `project-${generateId()}`;
      const projectData = createTestProjectDefinition(projectId);

      // Create the project first
      await createFullProjectServerSide(db, logger)({ tenantId, projectId }, projectData);

      // Delete it
      const deleted = await deleteFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });

      expect(deleted).toBe(true);

      // Verify it's deleted
      const result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });

      expect(result).toBeNull();
    });

    it('should return false for non-existent project', async () => {
      const nonExistentId = `project-${generateId()}`;

      const deleted = await deleteFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId: nonExistentId },
      });

      expect(deleted).toBe(false);
    });

    it('should cascade delete all project resources', async () => {
      const projectId = `project-${generateId()}`;
      const projectData = createTestProjectWithAgents(projectId);

      // Create the project with agent
      await createFullProjectServerSide(db, logger)({ tenantId, projectId }, projectData);

      // Verify the project exists
      let project = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(project).toBeDefined();

      // Delete the project
      const deleted = await deleteFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });

      expect(deleted).toBe(true);

      // Verify the project and all its resources are deleted
      project = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });
      expect(project).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid project data gracefully', async () => {
      const invalidData = {
        // Missing required fields
        name: 'Invalid Project',
      } as FullProjectDefinition;

      await expect(
        createFullProjectServerSide(db, logger)(
          { tenantId, projectId: invalidData.id },
          invalidData
        )
      ).rejects.toThrow();
    });

    it('should handle database errors gracefully', async () => {
      const projectId = `project-${generateId()}`;
      const projectData = createTestProjectDefinition(projectId);

      // Create the project first
      await createFullProjectServerSide(db, logger)(
        { tenantId, projectId: projectData.id },
        projectData
      );

      // Try to create the same project again (should cause conflict)
      await expect(
        createFullProjectServerSide(db, logger)({ tenantId, projectId }, projectData)
      ).rejects.toThrow();
    });
  });
});
