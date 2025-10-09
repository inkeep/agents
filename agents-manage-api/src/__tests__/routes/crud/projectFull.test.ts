import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantId } from '../../utils/testTenant';

describe('Project Full CRUD Routes - Integration Tests', () => {
  // Helper function to create test agent data
  const createTestAgentData = (id: string, suffix = '') => ({
    id,
    name: `Test Agent${suffix}`,
    description: `Test agent description${suffix}`,
    prompt: `You are a helpful assistant${suffix}.`,
    canDelegateTo: [] as string[],
    tools: [] as string[],
    dataComponents: [] as string[],
    artifactComponents: [] as string[],
    canUse: [],
    type: 'internal' as const,
  });

  // Helper function to create test tool data
  const createTestToolData = (id: string, suffix = '') => ({
    id,
    name: `Test Tool${suffix}`,
    config: {
      type: 'mcp',
      mcp: {
        server: {
          url: `http://localhost:300${suffix || '1'}`,
        },
      },
    },
    status: 'unknown' as const,
    capabilities: { tools: true },
    lastHealthCheck: new Date().toISOString(),
    availableTools: [
      {
        name: `testTool${suffix}`,
        description: `Test tool function${suffix}`,
      },
    ],
  });

  // Helper function to create full graph definition
  const createTestGraphDefinition = (
    graphId: string,
    subAgentId: string,
    toolId: string,
    suffix = ''
  ) => ({
    id: graphId,
    name: `Test Graph${suffix}`,
    description: `Complete test graph${suffix}`,
    defaultSubAgentId: subAgentId,
    agents: {
      [subAgentId]: createTestAgentData(subAgentId, suffix),
    },
    tools: {
      [toolId]: createTestToolData(toolId, suffix),
    },
    credentialReferences: {},
    dataComponents: {},
    artifactComponents: {},
    models: {
      base: {
        model: 'gpt-4o-mini',
      },
    },
    stopWhen: {
      transferCountIs: 5,
    },
  });

  // Helper function to create full project definition
  const createTestProjectDefinition = (projectId: string, suffix = '') => {
    const subAgentId = `agent-${nanoid()}`;
    const toolId = `tool-${nanoid()}`;
    const graphId = `graph-${nanoid()}`;

    return {
      id: projectId,
      name: `Test Project${suffix}`,
      description: `Complete test project${suffix}`,
      models: {
        base: {
          model: 'gpt-4o-mini',
        },
        structuredOutput: {
          model: 'gpt-4o',
        },
      },
      stopWhen: {
        transferCountIs: 10,
        stepCountIs: 50,
      },
      graphs: {
        [graphId]: createTestGraphDefinition(graphId, subAgentId, toolId, suffix),
      },
      tools: {}, // Required field, even if empty
    };
  };

  describe('POST /project-full', () => {
    it('should create a full project with all nested resources', async () => {
      const tenantId = createTestTenantId();
      const projectId = `project-${nanoid()}`;
      const projectDefinition = createTestProjectDefinition(projectId);

      const response = await makeRequest(`/tenants/${tenantId}/project-full`, {
        method: 'POST',
        body: JSON.stringify(projectDefinition),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data).toMatchObject({
        id: projectId,
        name: projectDefinition.name,
        description: projectDefinition.description,
        models: projectDefinition.models,
        stopWhen: projectDefinition.stopWhen,
      });
      expect(body.data.graphs).toBeDefined();
      expect(Object.keys(body.data.graphs).length).toBeGreaterThan(0);
    });

    it('should handle minimal project definition', async () => {
      const tenantId = createTestTenantId();
      const projectId = `project-${nanoid()}`;
      const minimalProject = {
        id: projectId,
        name: 'Minimal Project',
        description: 'Minimal test project',
        models: {
          base: {
            model: 'claude-sonnet-4',
            providerOptions: {},
          },
        },
        graphs: {},
        tools: {}, // Required field
      };

      const response = await makeRequest(`/tenants/${tenantId}/project-full`, {
        method: 'POST',
        body: JSON.stringify(minimalProject),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data).toMatchObject({
        id: projectId,
        name: 'Minimal Project',
        description: 'Minimal test project',
      });
    });

    it('should return 409 when project already exists', async () => {
      const tenantId = createTestTenantId();
      const projectId = `project-${nanoid()}`;
      const projectDefinition = createTestProjectDefinition(projectId);

      // Create the project first
      await makeRequest(`/tenants/${tenantId}/project-full`, {
        method: 'POST',
        body: JSON.stringify(projectDefinition),
      });

      // Try to create the same project again
      const response = await makeRequest(`/tenants/${tenantId}/project-full`, {
        method: 'POST',
        body: JSON.stringify(projectDefinition),
        expectError: true,
      });

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.title).toBe('Conflict');
      expect(body.detail).toContain('already exists');
    });

    it('should validate project definition schema', async () => {
      const tenantId = createTestTenantId();
      const invalidProject = {
        // Missing required fields (id, description, graphs, tools)
        name: 'Invalid Project',
      };

      const response = await makeRequest(`/tenants/${tenantId}/project-full`, {
        method: 'POST',
        body: JSON.stringify(invalidProject),
        expectError: true,
      });

      expect(response.status).toBe(400);
      const body = await response.json();

      // The validation error should either be in Problem JSON format or the legacy format
      if (body.title) {
        // Problem JSON format
        expect(body.title).toBe('Validation Failed');
        expect(body.status).toBe(400);
        expect(body.errors).toBeDefined();
      } else {
        // Legacy format
        expect(body.success).toBe(false);
        expect(body.error).toBeDefined();
        expect(body.error.name).toBe('ZodError');
      }
    });
  });

  describe('GET /project-full/{projectId}', () => {
    it('should retrieve a full project definition', async () => {
      const tenantId = createTestTenantId();
      const projectId = `project-${nanoid()}`;
      const projectDefinition = createTestProjectDefinition(projectId);

      // Create the project first
      await makeRequest(`/tenants/${tenantId}/project-full`, {
        method: 'POST',
        body: JSON.stringify(projectDefinition),
      });

      // Retrieve the project
      const response = await makeRequest(`/tenants/${tenantId}/project-full/${projectId}`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toMatchObject({
        id: projectId,
        name: projectDefinition.name,
        description: projectDefinition.description,
      });
      expect(body.data.graphs).toBeDefined();
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should return 404 for non-existent project', async () => {
      const tenantId = createTestTenantId();
      const nonExistentId = `project-${nanoid()}`;

      const response = await makeRequest(`/tenants/${tenantId}/project-full/${nonExistentId}`, {
        method: 'GET',
        expectError: true,
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.title).toBe('Not Found');
    });
  });

  describe('PUT /project-full/{projectId}', () => {
    it('should update an existing project', async () => {
      const tenantId = createTestTenantId();
      const projectId = `project-${nanoid()}`;
      const originalDefinition = createTestProjectDefinition(projectId);

      // Create the project first
      await makeRequest(`/tenants/${tenantId}/project-full`, {
        method: 'POST',
        body: JSON.stringify(originalDefinition),
      });

      // Update the project
      const updatedDefinition = {
        ...originalDefinition,
        name: 'Updated Project Name',
        description: 'Updated project description',
      };

      const response = await makeRequest(`/tenants/${tenantId}/project-full/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify(updatedDefinition),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toMatchObject({
        id: projectId,
        name: 'Updated Project Name',
        description: 'Updated project description',
      });
    });

    it('should create project if it does not exist (upsert behavior)', async () => {
      const tenantId = createTestTenantId();
      const projectId = `project-${nanoid()}`;
      const projectDefinition = createTestProjectDefinition(projectId);

      // Try to update a non-existent project
      const response = await makeRequest(`/tenants/${tenantId}/project-full/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify(projectDefinition),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data).toMatchObject({
        id: projectId,
        name: projectDefinition.name,
        description: projectDefinition.description,
      });
    });

    it('should validate project ID matches URL parameter', async () => {
      const tenantId = createTestTenantId();
      const projectId = `project-${nanoid()}`;
      const differentProjectId = `project-${nanoid()}`;
      const projectDefinition = createTestProjectDefinition(differentProjectId);

      const response = await makeRequest(`/tenants/${tenantId}/project-full/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify(projectDefinition),
        expectError: true,
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.title).toBe('Bad Request');
      expect(body.detail).toContain('ID mismatch');
    });

    it('should delete graphs that are removed from the project definition', async () => {
      const tenantId = createTestTenantId();
      const projectId = `project-${nanoid()}`;

      // Create a project with 3 graphs
      const graph1Id = `graph-${projectId}-1`;
      const graph2Id = `graph-${projectId}-2`;
      const graph3Id = `graph-${projectId}-3`;

      const originalDefinition = createTestProjectDefinition(projectId);
      originalDefinition.graphs = {
        [graph1Id]: createTestGraphDefinition(
          graph1Id,
          `agent-${graph1Id}`,
          `tool-${graph1Id}`,
          ' 1'
        ),
        [graph2Id]: createTestGraphDefinition(
          graph2Id,
          `agent-${graph2Id}`,
          `tool-${graph2Id}`,
          ' 2'
        ),
        [graph3Id]: createTestGraphDefinition(
          graph3Id,
          `agent-${graph3Id}`,
          `tool-${graph3Id}`,
          ' 3'
        ),
      };

      // Create the project
      const createRes = await makeRequest(`/tenants/${tenantId}/project-full`, {
        method: 'POST',
        body: JSON.stringify(originalDefinition),
      });
      expect(createRes.status).toBe(201);

      // Verify all 3 graphs exist
      const getInitialRes = await makeRequest(`/tenants/${tenantId}/project-full/${projectId}`, {
        method: 'GET',
      });
      expect(getInitialRes.status).toBe(200);
      const initialBody = await getInitialRes.json();
      expect(Object.keys(initialBody.data.graphs)).toHaveLength(3);

      // Update project to only include 1 graph (remove 2 graphs)
      const updatedDefinition = {
        ...originalDefinition,
        graphs: {
          [graph1Id]: originalDefinition.graphs[graph1Id],
        },
      };

      const updateRes = await makeRequest(`/tenants/${tenantId}/project-full/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify(updatedDefinition),
      });

      expect(updateRes.status).toBe(200);
      const updateBody = await updateRes.json();

      // Verify only 1 graph remains
      expect(Object.keys(updateBody.data.graphs)).toHaveLength(1);
      expect(updateBody.data.graphs).toHaveProperty(graph1Id);
      expect(updateBody.data.graphs).not.toHaveProperty(graph2Id);
      expect(updateBody.data.graphs).not.toHaveProperty(graph3Id);

      // Verify by fetching the project again
      const getFinalRes = await makeRequest(`/tenants/${tenantId}/project-full/${projectId}`, {
        method: 'GET',
      });
      expect(getFinalRes.status).toBe(200);
      const finalBody = await getFinalRes.json();
      expect(Object.keys(finalBody.data.graphs)).toHaveLength(1);
      expect(finalBody.data.graphs).toHaveProperty(graph1Id);
    });

    it('should handle removing all graphs from a project', async () => {
      const tenantId = createTestTenantId();
      const projectId = `project-${nanoid()}`;

      // Create a project with 2 graphs
      const graph1Id = `graph-${projectId}-1`;
      const graph2Id = `graph-${projectId}-2`;

      const originalDefinition = createTestProjectDefinition(projectId);
      originalDefinition.graphs = {
        [graph1Id]: createTestGraphDefinition(
          graph1Id,
          `agent-${graph1Id}`,
          `tool-${graph1Id}`,
          ' 1'
        ),
        [graph2Id]: createTestGraphDefinition(
          graph2Id,
          `agent-${graph2Id}`,
          `tool-${graph2Id}`,
          ' 2'
        ),
      };

      // Create the project
      await makeRequest(`/tenants/${tenantId}/project-full`, {
        method: 'POST',
        body: JSON.stringify(originalDefinition),
      });

      // Update project to have no graphs
      const updatedDefinition = {
        ...originalDefinition,
        graphs: {},
      };

      const updateRes = await makeRequest(`/tenants/${tenantId}/project-full/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify(updatedDefinition),
      });

      expect(updateRes.status).toBe(200);
      const updateBody = await updateRes.json();

      // Verify no graphs remain
      expect(Object.keys(updateBody.data.graphs)).toHaveLength(0);

      // Verify by fetching the project again
      const getFinalRes = await makeRequest(`/tenants/${tenantId}/project-full/${projectId}`, {
        method: 'GET',
      });
      expect(getFinalRes.status).toBe(200);
      const finalBody = await getFinalRes.json();
      expect(Object.keys(finalBody.data.graphs)).toHaveLength(0);
    });
  });

  describe('DELETE /project-full/{projectId}', () => {
    it('should delete a project and all its resources', async () => {
      const tenantId = createTestTenantId();
      const projectId = `project-${nanoid()}`;
      const projectDefinition = createTestProjectDefinition(projectId);

      // Create the project first
      await makeRequest(`/tenants/${tenantId}/project-full`, {
        method: 'POST',
        body: JSON.stringify(projectDefinition),
      });

      // Delete the project
      const response = await makeRequest(`/tenants/${tenantId}/project-full/${projectId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(204);
      // 204 No Content response has no body;

      // Verify the project is deleted
      const getResponse = await makeRequest(`/tenants/${tenantId}/project-full/${projectId}`, {
        method: 'GET',
        expectError: true,
      });

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 when trying to delete non-existent project', async () => {
      const tenantId = createTestTenantId();
      const nonExistentId = `project-${nanoid()}`;

      const response = await makeRequest(`/tenants/${tenantId}/project-full/${nonExistentId}`, {
        method: 'DELETE',
        expectError: true,
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.title).toBe('Not Found');
    });
  });

  describe('Project with Complex Graph Structure', () => {
    it('should handle project with multiple graphs and complex relationships', async () => {
      const tenantId = createTestTenantId();
      const projectId = `project-${nanoid()}`;

      // Create a more complex project with multiple graphs
      const agent1Id = `agent-${nanoid()}`;
      const agent2Id = `agent-${nanoid()}`;
      const tool1Id = `tool-${nanoid()}`;
      const tool2Id = `tool-${nanoid()}`;
      const graph1Id = `graph-${nanoid()}`;
      const graph2Id = `graph-${nanoid()}`;

      const complexProject = {
        id: projectId,
        name: 'Complex Multi-Graph Project',
        description: 'Project with multiple interconnected graphs',
        models: {
          base: { model: 'gpt-4o-mini' },
          structuredOutput: { model: 'gpt-4o' },
        },
        stopWhen: {
          transferCountIs: 15,
          stepCountIs: 100,
        },
        graphs: {
          [graph1Id]: createTestGraphDefinition(graph1Id, agent1Id, tool1Id, '-1'),
          [graph2Id]: createTestGraphDefinition(graph2Id, agent2Id, tool2Id, '-2'),
        },
        tools: {}, // Required field
      };

      const response = await makeRequest(`/tenants/${tenantId}/project-full`, {
        method: 'POST',
        body: JSON.stringify(complexProject),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.graphs).toBeDefined();
      expect(Object.keys(body.data.graphs)).toHaveLength(2);

      // Verify both graphs are created with their resources
      expect(body.data.graphs[graph1Id]).toBeDefined();
      expect(body.data.graphs[graph2Id]).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON in request body', async () => {
      const tenantId = createTestTenantId();

      const response = await makeRequest(`/tenants/${tenantId}/project-full`, {
        method: 'POST',
        body: 'invalid-json',
        expectError: true,
        customHeaders: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(400);
    });

    it('should handle projects with empty IDs', async () => {
      const tenantId = createTestTenantId();
      const projectDefinition = createTestProjectDefinition(''); // Empty ID

      const response = await makeRequest(`/tenants/${tenantId}/project-full`, {
        method: 'POST',
        body: JSON.stringify(projectDefinition),
        expectError: false,
      });

      // The API currently accepts empty IDs (might be used for special cases)
      // This behavior could be changed if empty IDs should be rejected
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe(''); // Empty ID is preserved
    });
  });
});
