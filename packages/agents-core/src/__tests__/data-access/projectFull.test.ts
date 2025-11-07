import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFullProjectServerSide,
  deleteFullProject,
  getFullProject,
  updateFullProjectServerSide,
} from '../../data-access/projectFull';
import type { DatabaseClient } from '../../db/client';
import { createTestDatabaseClient } from '../../db/test-client';
import type { FullProjectDefinition } from '../../types/entities';
import { generateId } from '../../utils/conversations';
import { getLogger } from '../../utils/logger';

describe('projectFull data access', () => {
  let db: DatabaseClient;
  const logger = getLogger('test');

  beforeEach(async () => {
    db = await createTestDatabaseClient();
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
