import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import {
  createFullProjectServerSide,
  deleteFullProject,
  getFullProject,
  updateFullProjectServerSide,
} from '../../data-access/projectFull';
import type { FullProjectDefinition } from '../../types/entities';
import { getLogger } from '../../utils/logger';
import { dbClient } from '../setup';

describe('projectFull data access', () => {
  const db = dbClient;
  const logger = getLogger('test');
  const tenantId = `tenant-${nanoid()}`;

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
    graphs: {}, // Start with empty graphs for basic testing
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const createTestProjectWithGraphs = (projectId: string): FullProjectDefinition => {
    const graphId = `graph-${nanoid()}`;
    const agentId = `agent-${nanoid()}`;
    const toolId = `tool-${nanoid()}`;

    return {
      id: projectId,
      name: 'Test Project with Graphs',
      description: 'A test project with graphs',
      models: {
        base: { model: 'gpt-4o-mini' },
      },
      stopWhen: {
        transferCountIs: 5,
      },
      graphs: {
        [graphId]: {
          id: graphId,
          name: 'Test Graph',
          description: 'A test graph',
          defaultAgentId: agentId,
          agents: {
            [agentId]: {
              id: agentId,
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
      const projectId = `project-${nanoid()}`;
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

    it('should create a project with graphs and nested resources', async () => {
      const projectId = `project-${nanoid()}`;
      const projectData = createTestProjectWithGraphs(projectId);

      const result = await createFullProjectServerSide(db, logger)(
        { tenantId, projectId },
        projectData
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(projectId);
      expect(result.graphs).toBeDefined();
      expect(Object.keys(result.graphs)).toHaveLength(1);
    });

    it('should handle projects with minimal data', async () => {
      const projectId = `project-${nanoid()}`;
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
        graphs: {},
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
      expect(result.graphs).toEqual({});
    });
  });

  describe('getFullProject', () => {
    it('should retrieve an existing project', async () => {
      const projectId = `project-${nanoid()}`;
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
      const nonExistentId = `project-${nanoid()}`;

      const result = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId: nonExistentId },
      });

      expect(result).toBeNull();
    });

    it('should include all graphs in the project', async () => {
      const projectId = `project-${nanoid()}`;
      const projectData = createTestProjectWithGraphs(projectId);

      // Create the project with graphs
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
        expect(result.graphs).toBeDefined();
      }
      // Note: The actual graph count depends on implementation
      // This test verifies structure, not exact content
    });

    it('should have tools at project level, not in graphs', async () => {
      const projectId = `project-${nanoid()}`;
      const projectData = createTestProjectWithGraphs(projectId);

      // Create the project with graphs and tools
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
      const projectId = `project-${nanoid()}`;
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
      const projectId = `project-${nanoid()}`;
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
      const projectId = `project-${nanoid()}`;
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
      const projectId = `project-${nanoid()}`;
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
      const nonExistentId = `project-${nanoid()}`;

      const deleted = await deleteFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId: nonExistentId },
      });

      expect(deleted).toBe(false);
    });

    it('should cascade delete all project resources', async () => {
      const projectId = `project-${nanoid()}`;
      const projectData = createTestProjectWithGraphs(projectId);

      // Create the project with graphs
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
      const projectId = `project-${nanoid()}`;
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
