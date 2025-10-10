import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import { createTestContextConfigDataFull, createTestToolData } from '../../utils/testHelpers';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestExternalAgentData, createTestSubAgentData } from '../../utils/testSubAgent';
import { createTestTenantId } from '../../utils/testTenant';

describe('Graph Full CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create test tool data
  const createTestToolData = (id: string, suffix = '') => ({
    id,
    name: `Test Tool${suffix}`,
    description: `Test tool description${suffix}`,
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
  // Helper function to create full graph data with optional enhanced features
  const createFullGraphData = (
    graphId?: string,
    options?: {
      includeDataComponents?: boolean;
      includeArtifactComponents?: boolean;
      includeContextConfig?: boolean;
      includeExternalAgent?: boolean;
    },
    tenantId?: string,
    projectIdParam?: string
  ) => {
    const id = graphId || nanoid();
    const subAgentId1 = `agent-${id}-1`;
    const subAgentId2 = `agent-${id}-2`;
    const toolId1 = `tool-${id}-1`;
    const toolId2 = `tool-${id}-2`;

    const agent1 = createTestSubAgentData({ id: subAgentId1, suffix: ' Router' });
    const agent2 = createTestSubAgentData({ id: subAgentId2, suffix: ' Specialist' });
    const tool1 = createTestToolData(toolId1, '1');
    const tool2 = createTestToolData(toolId2, '2');

    // Set up relationships
    agent1.canTransferTo = [subAgentId2];
    agent1.canDelegateTo = [subAgentId2];
    agent2.canTransferTo = [subAgentId1];

    // Add tool IDs to agents via canUse field
    agent1.canUse = [{ toolId: tool1.id }];
    agent2.canUse = [{ toolId: tool2.id }];

    const graphData: any = {
      id,
      name: `Test Graph ${id}`,
      description: `Test graph description for ${id}`,
      defaultSubAgentId: subAgentId1,
      subAgents: {
        [subAgentId1]: agent1,
        [subAgentId2]: agent2,
      },
      // Note: tools are now project-scoped and not part of the graph definition
    };

    // Add dataComponents if requested
    if (options?.includeDataComponents) {
      const dataComponentId1 = `dataComponent-${id}-1`;
      const dataComponentId2 = `dataComponent-${id}-2`;
      // Note: dataComponents are now project-scoped and not part of the graph definition
      // Only the relationship (dataComponents array in agent) is graph-scoped

      // Link dataComponents to agents (just IDs)
      agent1.dataComponents = [dataComponentId1];
      agent2.dataComponents = [dataComponentId2];
    }

    // Add artifactComponents if requested
    if (options?.includeArtifactComponents) {
      const artifactComponentId1 = `artifactComponent-${id}-1`;
      const artifactComponentId2 = `artifactComponent-${id}-2`;
      // Note: artifactComponents are now project-scoped and not part of the graph definition
      // Only the relationship (artifactComponents array in agent) is graph-scoped

      // Link artifactComponents to agents (just IDs)
      agent1.artifactComponents = [artifactComponentId1];
      agent2.artifactComponents = [artifactComponentId2];
    }

    // Add contextConfig if requested
    if (options?.includeContextConfig) {
      const contextConfigId = `contextConfig-${id}`;
      graphData.contextConfig = createTestContextConfigDataFull({
        id: contextConfigId,
        suffix: ' Main',
      });
    }

    // Add external agent if requested
    if (options?.includeExternalAgent) {
      const externalSubAgentId = `external-${id}`;
      const externalAgent = createTestExternalAgentData({
        id: externalSubAgentId,
        suffix: 'External',
        tenantId,
        projectId: projectIdParam,
      });

      graphData.subAgents[externalSubAgentId] = externalAgent;

      // Set up relationships with external agent
      agent1.canDelegateTo.push(externalSubAgentId);
    }

    return graphData;
  };

  // Helper function to create a test graph and return its data
  const createTestAgent = async (
    tenantId: string,
    graphData?: ReturnType<typeof createFullGraphData>
  ) => {
    const testGraphData = graphData || createFullGraphData();
    const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
      method: 'POST',
      body: JSON.stringify(testGraphData),
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { graphData: testGraphData, response: createBody };
  };

  describe('POST /', () => {
    it.skip('should create a full graph with all entities', async () => {
      // TODO: Update this test to work with new scoped architecture where tools are project-scoped
      const tenantId = createTestTenantId('graph-create');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData();
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // Verify response structure
      expect(body).toHaveProperty('data');
      expect(body.data).toMatchObject({
        id: graphData.id,
        name: graphData.name,
        defaultSubAgentId: graphData.defaultSubAgentId,
        agents: expect.any(Object),
      });

      // Verify agents were created
      expect(Object.keys(body.data.subAgents)).toHaveLength(2);
      expect(body.data.subAgents).toHaveProperty(graphData.defaultSubAgentId);

      // Verify agent relationships
      const defaultSubAgent = body.data.subAgents[graphData.defaultSubAgentId];
      expect(defaultSubAgent.canTransferTo).toContain(Object.keys(graphData.subAgents)[1]);
      expect(defaultSubAgent.canDelegateTo).toContain(Object.keys(graphData.subAgents)[1]);

      // Verify tools were created and linked
      expect(defaultSubAgent.canUse).toHaveLength(1);
      expect(body.data.tools).toBeDefined();
      const toolId = defaultSubAgent.canUse[0];
      expect(body.data.tools[toolId]).toMatchObject({
        name: expect.stringContaining('Test Tool'),
        status: 'unknown',
      });
    });

    it('should handle graph with no relationships', async () => {
      const tenantId = createTestTenantId('graph-no-relations');
      await ensureTestProject(tenantId, projectId);
      const subAgentId = nanoid();
      const graphId = nanoid();

      const graphData = {
        id: graphId,
        name: 'Simple Graph',
        description: 'Graph with single agent and no relationships',
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            ...createTestSubAgentData({ id: subAgentId, suffix: ' Standalone' }),
            name: 'Single Agent',
            description: 'A standalone agent',
          },
        },
        tools: {},
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.data.subAgents).toHaveProperty(subAgentId);
      expect(body.data.subAgents[subAgentId].canTransferTo).toHaveLength(0);
      expect(body.data.subAgents[subAgentId].canDelegateTo).toHaveLength(0);
      expect(body.data.subAgents[subAgentId].canUse).toHaveLength(0);
    });

    it('should return 400 for invalid graph data', async () => {
      const tenantId = createTestTenantId('graph-invalid');
      await ensureTestProject(tenantId, projectId);

      const invalidGraphData = {
        id: 'test-graph',
        // Missing required fields
        subAgents: {},
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(invalidGraphData),
      });

      expect(res.status).toBe(400);
    });

    it.skip('should include models field in agent responses', async () => {
      // TODO: Update this test to work with new scoped architecture
      const tenantId = createTestTenantId('graph-model-field');
      await ensureTestProject(tenantId, projectId);
      const graphId = nanoid();
      const subAgentId = `agent-${graphId}-1`;
      const toolId = `tool-${graphId}-1`;

      const graphData = {
        id: graphId,
        name: `Test Graph ${graphId}`,
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            id: subAgentId,
            name: 'Test Agent with Model',
            description: 'Agent to verify model field',
            prompt: 'You are a test agent.',
            models: {
              base: {
                model: 'claude-3-5-sonnet-20241022',
              },
            },
            canTransferTo: [],
            canDelegateTo: [],
            tools: [toolId],
          },
        },
        tools: {
          [toolId]: {
            id: toolId,
            name: 'Test Tool',
            description: 'Test tool description',
            config: { type: 'test' },
            transport: 'stdio',
          },
        },
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // Verify models field is present in the response
      expect(body.data.subAgents[subAgentId]).toHaveProperty('models');
      expect(body.data.subAgents[subAgentId].models).toEqual({
        base: {
          model: 'claude-3-5-sonnet-20241022',
        },
      });

      // Also verify via GET endpoint
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphId}`,
        {
          method: 'GET',
        }
      );

      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data.subAgents[subAgentId]).toHaveProperty('models');
      expect(getBody.data.subAgents[subAgentId].models).toEqual({
        base: {
          model: 'claude-3-5-sonnet-20241022',
        },
      });
    });

    it.skip('should include models with providerOptions in agent responses', async () => {
      // TODO: Update this test to work with new scoped architecture
      const tenantId = createTestTenantId('graph-provider-options');
      await ensureTestProject(tenantId, projectId);
      const graphId = nanoid();
      const subAgentId = `agent-${graphId}-1`;
      const toolId = `tool-${graphId}-1`;

      const providerOptions = {
        anthropic: {
          temperature: 0.7,
          maxTokens: 2000,
        },
        openai: {
          temperature: 0.8,
          topP: 0.9,
        },
      };

      const graphData = {
        id: graphId,
        name: `Test Graph ${graphId}`,
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            id: subAgentId,
            name: 'Test Agent with Provider Options',
            description: 'Agent to verify providerOptions field',
            prompt: 'You are a test agent.',
            models: {
              base: {
                model: 'claude-3-5-sonnet-20241022',
                providerOptions,
              },
            },
            canTransferTo: [],
            canDelegateTo: [],
            tools: [toolId],
          },
        },
        tools: {
          [toolId]: {
            id: toolId,
            name: 'Test Tool',
            description: 'Test tool description',
            config: { type: 'test' },
            transport: 'stdio',
          },
        },
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // Verify models with providerOptions is present in the response
      expect(body.data.subAgents[subAgentId]).toHaveProperty('models');
      expect(body.data.subAgents[subAgentId].models).toEqual({
        base: {
          model: 'claude-3-5-sonnet-20241022',
          providerOptions,
        },
      });

      // Also verify via GET endpoint
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphId}`,
        {
          method: 'GET',
        }
      );

      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data.subAgents[subAgentId]).toHaveProperty('models');
      expect(getBody.data.subAgents[subAgentId].models).toEqual({
        base: {
          model: 'claude-3-5-sonnet-20241022',
          providerOptions,
        },
      });
    });
  });

  describe('GET /{graphId}', () => {
    it('should retrieve a full graph by ID', async () => {
      const tenantId = createTestTenantId('graph-get');
      await ensureTestProject(tenantId, projectId);
      const { graphData } = await createTestAgent(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'GET',
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.data).toMatchObject({
        id: graphData.id,
        name: graphData.name,
        defaultSubAgentId: graphData.defaultSubAgentId,
      });

      // Verify agents and their relationships
      expect(Object.keys(body.data.subAgents)).toHaveLength(2);
      const agents = Object.values(body.data.subAgents) as any[];
      expect(agents.some((agent) => agent.canTransferTo.length > 0)).toBe(true);
    });

    it('should return 404 for non-existent graph', async () => {
      const tenantId = createTestTenantId('graph-not-found');
      await ensureTestProject(tenantId, projectId);
      const nonExistentId = nanoid();

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${nonExistentId}`,
        {
          method: 'GET',
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /{graphId}', () => {
    it('should update an existing graph', async () => {
      const tenantId = createTestTenantId('graph-update');
      await ensureTestProject(tenantId, projectId);
      const { graphData } = await createTestAgent(tenantId);

      // Modify the graph data
      const updatedGraphData = {
        ...graphData,
        name: 'Updated Graph Name',
        description: 'Updated description',
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(updatedGraphData),
        }
      );

      if (res.status !== 200) {
        const errorBody = await res.json();
        console.log('Error response:', JSON.stringify(errorBody, null, 2));
        console.log('Request data keys:', Object.keys(updatedGraphData));
        if (updatedGraphData.subAgents) {
          const firstAgent = Object.values(updatedGraphData.subAgents)[0] as any;
          console.log('First agent keys:', Object.keys(firstAgent));
        }
      }
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.data.name).toBe('Updated Graph Name');
      expect(body.data.id).toBe(graphData.id);
    });

    it('should create a new graph if it does not exist (upsert)', async () => {
      const tenantId = createTestTenantId('graph-upsert');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData();

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(graphData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.data).toMatchObject({
        id: graphData.id,
        name: graphData.name,
        defaultSubAgentId: graphData.defaultSubAgentId,
      });
    });

    it('should return 400 for ID mismatch', async () => {
      const tenantId = createTestTenantId('graph-id-mismatch');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData();
      const differentId = nanoid();

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${differentId}`,
        {
          method: 'PUT',
          body: JSON.stringify(graphData),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should handle adding new agents and relationships in update', async () => {
      const tenantId = createTestTenantId('graph-add-agents');
      await ensureTestProject(tenantId, projectId);
      const { graphData } = await createTestAgent(tenantId);

      // Add a new agent and relationships
      const newAgentId = `agent-${graphData.id}-3`;
      const updatedGraphData = {
        ...graphData,
        subAgents: {
          ...graphData.subAgents,
          [newAgentId]: createTestSubAgentData({ id: newAgentId, suffix: ' New Agent' }),
        },
      };

      // Update existing agent to have relationships with new agent
      updatedGraphData.subAgents[graphData.defaultSubAgentId].canTransferTo.push(newAgentId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(updatedGraphData),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(Object.keys(body.data.subAgents)).toHaveLength(3);
      expect(body.data.subAgents).toHaveProperty(newAgentId);
      expect(body.data.subAgents[graphData.defaultSubAgentId].canTransferTo).toContain(newAgentId);
    });

    it('should delete agents that are removed from the graph definition', async () => {
      const tenantId = createTestTenantId('graph-remove-agents');
      await ensureTestProject(tenantId, projectId);

      // Create a graph with external agent included
      const initialGraphData = createFullGraphData(undefined, {
        includeExternalAgent: true,
      });
      const { graphData } = await createTestAgent(tenantId, initialGraphData);

      // Verify initial state - should have 2 internal agents + 1 external agent = 3 total
      const getInitialRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'GET',
        }
      );
      expect(getInitialRes.status).toBe(200);
      const initialBody = await getInitialRes.json();
      expect(Object.keys(initialBody.data.subAgents)).toHaveLength(3);

      // Get agent IDs to verify which are internal vs external
      const allAgentIds = Object.keys(initialBody.data.subAgents);
      const defaultSubAgentId = graphData.defaultSubAgentId;

      // Update graph to only include the default agent (remove 1 internal + 1 external agent)
      const updatedGraphData = {
        ...graphData,
        subAgents: {
          [defaultSubAgentId]: graphData.subAgents[defaultSubAgentId],
        },
      };

      // Clear relationships since other agents are removed
      updatedGraphData.subAgents[defaultSubAgentId].canTransferTo = [];
      updatedGraphData.subAgents[defaultSubAgentId].canDelegateTo = [];

      const updateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(updatedGraphData),
        }
      );

      expect(updateRes.status).toBe(200);
      const updateBody = await updateRes.json();

      // Verify only 1 agent remains
      expect(Object.keys(updateBody.data.subAgents)).toHaveLength(1);
      expect(updateBody.data.subAgents).toHaveProperty(defaultSubAgentId);

      // Verify the removed agents are no longer present
      for (const subAgentId of allAgentIds) {
        if (subAgentId !== defaultSubAgentId) {
          expect(updateBody.data.subAgents).not.toHaveProperty(subAgentId);
        }
      }

      // Verify by fetching the graph again
      const getFinalRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'GET',
        }
      );
      expect(getFinalRes.status).toBe(200);
      const finalBody = await getFinalRes.json();
      expect(Object.keys(finalBody.data.subAgents)).toHaveLength(1);
      expect(finalBody.data.subAgents).toHaveProperty(defaultSubAgentId);
    });

    it('should handle removing all agents except default agent', async () => {
      const tenantId = createTestTenantId('graph-remove-all-but-one');
      await ensureTestProject(tenantId, projectId);
      const { graphData } = await createTestAgent(tenantId);

      // Add more agents to make it interesting
      const agent3Id = `agent-${graphData.id}-3`;
      const agent4Id = `agent-${graphData.id}-4`;
      const expandedGraphData = {
        ...graphData,
        subAgents: {
          ...graphData.subAgents,
          [agent3Id]: createTestSubAgentData({ id: agent3Id, suffix: ' Agent 3' }),
          [agent4Id]: createTestSubAgentData({ id: agent4Id, suffix: ' Agent 4' }),
        },
      };

      // Update to add agents
      await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`, {
        method: 'PUT',
        body: JSON.stringify(expandedGraphData),
      });

      // Verify we have 4 agents
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'GET',
        }
      );
      const getBody = await getRes.json();
      expect(Object.keys(getBody.data.subAgents)).toHaveLength(4);

      // Now remove all but the default agent
      const minimalGraphData = {
        ...graphData,
        subAgents: {
          [graphData.defaultSubAgentId]: {
            ...graphData.subAgents[graphData.defaultSubAgentId],
            canTransferTo: [],
            canDelegateTo: [],
          },
        },
      };

      const updateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(minimalGraphData),
        }
      );

      expect(updateRes.status).toBe(200);
      const updateBody = await updateRes.json();

      // Verify only 1 agent remains
      expect(Object.keys(updateBody.data.subAgents)).toHaveLength(1);
      expect(updateBody.data.subAgents).toHaveProperty(graphData.defaultSubAgentId);
    });
  });

  describe('DELETE /{graphId}', () => {
    it('should delete a graph and its relationships', async () => {
      const tenantId = createTestTenantId('graph-delete');
      await ensureTestProject(tenantId, projectId);
      const { graphData } = await createTestAgent(tenantId);

      const deleteRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'DELETE',
        }
      );

      expect(deleteRes.status).toBe(204);

      // Verify graph is deleted by trying to get it
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'GET',
        }
      );

      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent graph', async () => {
      const tenantId = createTestTenantId('graph-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const nonExistentId = nanoid();

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${nonExistentId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('Complex scenarios', () => {
    it.skip('should handle graph with multiple tools per agent', async () => {
      // TODO: Update this test to work with new scoped architecture where tools are project-scoped
      const tenantId = createTestTenantId('graph-multi-tools');
      await ensureTestProject(tenantId, projectId);
      const graphId = nanoid();
      const subAgentId = `agent-${graphId}`;
      const tool1Id = `tool-${graphId}-1`;
      const tool2Id = `tool-${graphId}-2`;

      const tool1 = createTestToolData(tool1Id, '1');
      const tool2 = createTestToolData(tool2Id, '2');

      const graphData = {
        id: graphId,
        name: 'Multi-Tool Graph',
        description: 'Graph with agent having multiple tools',
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            ...createTestSubAgentData({ id: subAgentId, suffix: ' Multi-Tool' }),
            name: 'Multi-Tool Agent',
            description: 'Agent with multiple tools',
            tools: [tool1Id, tool2Id], // Tool IDs, not objects
          },
        },
        tools: {
          [tool1Id]: tool1,
          [tool2Id]: tool2,
        },
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.data.subAgents[subAgentId].canUse).toHaveLength(2);
      expect(body.data.subAgents[subAgentId].canUse).toContain(tool1Id);
      expect(body.data.subAgents[subAgentId].canUse).toContain(tool2Id);
      expect(body.data.tools).toBeDefined();
      expect(body.data.tools[tool1Id]).toBeDefined();
      expect(body.data.tools[tool2Id]).toBeDefined();
    });

    it('should handle circular agent relationships', async () => {
      const tenantId = createTestTenantId('graph-circular');
      await ensureTestProject(tenantId, projectId);
      const graphId = nanoid();
      const agent1Id = `agent-${graphId}-1`;
      const agent2Id = `agent-${graphId}-2`;

      const graphData = {
        id: graphId,
        name: 'Circular Graph',
        description: 'Graph with circular agent relationships',
        defaultSubAgentId: agent1Id,
        subAgents: {
          [agent1Id]: {
            ...createTestSubAgentData({ id: agent1Id, suffix: ' First' }),
            name: 'Agent 1',
            description: 'First agent',
            canTransferTo: [agent2Id], // Add circular relationship
          },
          [agent2Id]: {
            ...createTestSubAgentData({ id: agent2Id, suffix: ' Second' }),
            name: 'Agent 2',
            description: 'Second agent',
            canTransferTo: [agent1Id], // Add circular relationship
          },
        },
        tools: {}, // No tools in this test
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.data.subAgents[agent1Id].canTransferTo).toContain(agent2Id);
      expect(body.data.subAgents[agent2Id].canTransferTo).toContain(agent1Id);
    });

    it('should handle large graph with many agents', async () => {
      const tenantId = createTestTenantId('graph-large');
      await ensureTestProject(tenantId, projectId);
      const graphId = nanoid();
      const agentCount = 10;

      const agents: Record<string, any> = {};
      const subAgentIds: string[] = [];

      // Create agents
      for (let i = 1; i <= agentCount; i++) {
        const subAgentId = `agent-${graphId}-${i}`;
        subAgentIds.push(subAgentId);
        agents[subAgentId] = createTestSubAgentData({ id: subAgentId, suffix: ` ${i}` });
      }

      // Set up relationships (each agent can transfer to the next one)
      for (let i = 0; i < agentCount - 1; i++) {
        agents[subAgentIds[i]].canTransferTo = [subAgentIds[i + 1]];
      }

      const graphData = {
        id: graphId,
        name: 'Large Graph',
        description: 'Graph with many agents',
        defaultSubAgentId: subAgentIds[0],
        subAgents: agents,
        tools: {}, // No tools for this test
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(Object.keys(body.data.subAgents)).toHaveLength(agentCount);

      // Verify relationships were created
      for (let i = 0; i < agentCount - 1; i++) {
        expect(body.data.subAgents[subAgentIds[i]].canTransferTo).toContain(subAgentIds[i + 1]);
      }
    });

    it('should handle concurrent graph operations on different tenants', async () => {
      const tenant1 = createTestTenantId('concurrent-1');
      const tenant2 = createTestTenantId('concurrent-2');

      await ensureTestProject(tenant1, projectId);
      await ensureTestProject(tenant2, projectId);

      const graph1Data = createFullGraphData();
      const graph2Data = createFullGraphData();

      // Create graphs concurrently
      const [res1, res2] = await Promise.all([
        makeRequest(`/tenants/${tenant1}/projects/${projectId}/agent`, {
          method: 'POST',
          body: JSON.stringify(graph1Data),
        }),
        makeRequest(`/tenants/${tenant2}/projects/${projectId}/agent`, {
          method: 'POST',
          body: JSON.stringify(graph2Data),
        }),
      ]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);

      const [body1, body2] = await Promise.all([res1.json(), res2.json()]);

      expect(body1.data.id).toBe(graph1Data.id);
      expect(body2.data.id).toBe(graph2Data.id);
      expect(body1.data.id).not.toBe(body2.data.id);
    });
  });

  describe('Enhanced Features', () => {
    it.skip('should create a graph with dataComponents', async () => {
      // TODO: Update this test to work with new scoped architecture where dataComponents are project-scoped
      const tenantId = createTestTenantId('graph-datacomponents');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData(undefined, { includeDataComponents: true });

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // Verify dataComponents were created
      expect(body.data.dataComponents).toBeDefined();
      expect(Object.keys(body.data.dataComponents)).toHaveLength(2);

      const dataComponentIds = Object.keys(body.data.dataComponents);
      for (const dcId of dataComponentIds) {
        const dataComponent = body.data.dataComponents[dcId];
        expect(dataComponent).toMatchObject({
          id: dcId,
          name: expect.stringContaining('Test DataComponent'),
          description: expect.stringContaining('Test dataComponent description'),
          props: expect.objectContaining({
            endpoint: expect.stringContaining('https://api.example.com/data'),
            method: 'GET',
          }),
        });
      }

      // Verify agents are linked to dataComponents
      const agents = Object.values(body.data.subAgents);
      const agentsWithDataComponents = agents.filter(
        (agent: any) => agent.dataComponents && agent.dataComponents.length > 0
      );
      expect(agentsWithDataComponents).toHaveLength(2);
    });

    it.skip('should create a graph with artifactComponents', async () => {
      // TODO: Update this test to work with new scoped architecture where artifactComponents are project-scoped
      const tenantId = createTestTenantId('graph-artifactcomponents');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData(undefined, { includeArtifactComponents: true });

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // Verify artifactComponents were created
      expect(body.data.artifactComponents).toBeDefined();
      expect(Object.keys(body.data.artifactComponents)).toHaveLength(2);

      const artifactComponentIds = Object.keys(body.data.artifactComponents);
      for (const acId of artifactComponentIds) {
        const artifactComponent = body.data.artifactComponents[acId];
        expect(artifactComponent).toMatchObject({
          id: acId,
          name: expect.stringContaining('Test ArtifactComponent'),
          description: expect.stringContaining('Test artifactComponent description'),
          props: expect.objectContaining({
            type: 'object',
            properties: expect.objectContaining({
              title: expect.any(Object),
              subtitle: expect.any(Object),
              content: expect.any(Object),
            }),
          }),
        });
      }

      // Verify agents are linked to artifactComponents
      const agents = Object.values(body.data.subAgents);
      const agentsWithArtifactComponents = agents.filter(
        (agent: any) => agent.artifactComponents && agent.artifactComponents.length > 0
      );
      expect(agentsWithArtifactComponents).toHaveLength(2);
    });

    it('should create a graph with contextConfig', async () => {
      const tenantId = createTestTenantId('graph-contextconfig');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData(
        undefined,
        { includeContextConfig: true },
        tenantId,
        projectId
      );

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // Verify contextConfig was created
      expect(body.data.contextConfig).toBeDefined();
      expect(body.data.contextConfig).toMatchObject({
        id: expect.stringContaining('contextConfig-'),
        headersSchema: expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            userId: { type: 'string', description: 'User identifier' },
            sessionToken: { type: 'string', description: 'Session token' },
          }),
          required: ['userId'],
        }),
        contextVariables: expect.objectContaining({
          userProfileMain: expect.objectContaining({
            trigger: 'initialization',
            fetchConfig: expect.objectContaining({
              method: 'GET',
              url: expect.stringContaining('https://api.example.com/users/'),
            }),
          }),
        }),
      });
    });

    it('should create a graph with external agents', async () => {
      const tenantId = createTestTenantId('graph-external');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData(
        undefined,
        { includeExternalAgent: true },
        tenantId,
        projectId
      );

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // Verify agents were created (2 internal + 1 external = 3 total)
      expect(Object.keys(body.data.subAgents)).toHaveLength(3);

      // Find the external agent
      const externalAgent = Object.values(body.data.subAgents).find(
        (agent: any) => agent.baseUrl !== undefined
      );
      expect(externalAgent).toBeDefined();
      expect(externalAgent).toMatchObject({
        name: expect.stringContaining('Test External Agent'),
        description: expect.stringContaining('Test external agent description'),
        baseUrl: expect.stringContaining('https://api.example.com/external-agent'),
      });

      // Verify transfer relationships do not include external agent
      const defaultSubAgent = body.data.subAgents[graphData.defaultSubAgentId];
      expect(defaultSubAgent.canTransferTo).not.toContain((externalAgent as any).id);
    });

    it.skip('should create a complete graph with all features', async () => {
      // TODO: Update this test to work with new scoped architecture
      const tenantId = createTestTenantId('graph-complete');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData(
        undefined,
        {
          includeDataComponents: true,
          includeArtifactComponents: true,
          includeContextConfig: true,
          includeExternalAgent: true,
        },
        tenantId,
        projectId
      );

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // Verify all components are present
      expect(body.data.subAgents).toBeDefined();
      expect(Object.keys(body.data.subAgents)).toHaveLength(3); // 2 internal + 1 external

      expect(body.data.tools).toBeDefined();
      expect(Object.keys(body.data.tools)).toHaveLength(2);

      expect(body.data.dataComponents).toBeDefined();
      expect(Object.keys(body.data.dataComponents)).toHaveLength(2);

      expect(body.data.artifactComponents).toBeDefined();
      expect(Object.keys(body.data.artifactComponents)).toHaveLength(2);

      expect(body.data.contextConfig).toBeDefined();

      // Verify relationships
      const defaultSubAgent = body.data.subAgents[graphData.defaultSubAgentId];
      expect(defaultSubAgent.canTransferTo).toHaveLength(1); // 1 internal
      expect(defaultSubAgent.canDelegateTo).toHaveLength(2); // 1 internal + 1 external
      expect(defaultSubAgent.canUse).toHaveLength(1);
      expect(defaultSubAgent.dataComponents).toHaveLength(1);
      expect(defaultSubAgent.artifactComponents).toHaveLength(1);
    });

    it.skip('should update a graph with enhanced features', async () => {
      // TODO: Update this test to work with new scoped architecture
      const tenantId = createTestTenantId('graph-update-enhanced');
      await ensureTestProject(tenantId, projectId);

      // Create initial graph with basic features
      const initialGraphData = createFullGraphData();
      const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(initialGraphData),
      });
      expect(createRes.status).toBe(201);

      // Update to include enhanced features
      const updatedGraphData = createFullGraphData(
        initialGraphData.id,
        {
          includeDataComponents: true,
          includeArtifactComponents: true,
          includeContextConfig: true,
          includeExternalAgent: true,
        },
        tenantId,
        projectId
      );

      const updateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${initialGraphData.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(updatedGraphData),
        }
      );

      expect(updateRes.status).toBe(200);
      const body = await updateRes.json();

      // Verify enhanced features were added
      expect(body.data.dataComponents).toBeDefined();
      expect(Object.keys(body.data.dataComponents)).toHaveLength(2);
      expect(body.data.contextConfig).toBeDefined();
      expect(Object.keys(body.data.subAgents)).toHaveLength(3); // Added external agent
    });

    it('should handle external agent relationships correctly', async () => {
      const tenantId = createTestTenantId('graph-external-relations');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData(
        undefined,
        { includeExternalAgent: true },
        tenantId,
        projectId
      );

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // Find external agent
      const externalAgent = Object.values(body.data.subAgents).find(
        (agent: any) => agent.baseUrl !== undefined
      );
      expect(externalAgent).toBeDefined();

      // External agents should not have internal relationships or tools fields
      expect((externalAgent as any).canTransferTo).toBeUndefined();
      expect((externalAgent as any).canDelegateTo).toBeUndefined();
      expect((externalAgent as any).canUse).toBeUndefined();

      // Internal agents should be able to transfer to external agents
      const defaultSubAgent = body.data.subAgents[graphData.defaultSubAgentId];
      expect(defaultSubAgent.canTransferTo).not.toContain((externalAgent as any).id);

      // But internal agents should be able to delegate to external agents
      expect(defaultSubAgent.canDelegateTo).toContain((externalAgent as any).id);
    });
  });

  describe('Context Config Clearing in Full Graph', () => {
    it('should clear contextVariables when set to null in full graph update', async () => {
      const tenantId = createTestTenantId('full-graph-clear-context-vars');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData(
        undefined,
        { includeContextConfig: true },
        tenantId,
        projectId
      );

      // Create the graph first
      const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(createRes.status).toBe(201);

      // Update to clear contextVariables
      const updateData = {
        ...graphData,
        contextConfig: {
          ...(graphData.contextConfig || {}),
          contextVariables: null,
        },
      };

      const updateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );
      expect(updateRes.status).toBe(200);
      const body = await updateRes.json();
      expect(body.data.contextConfig.contextVariables).toBeNull();
    });

    it('should clear headersSchema when set to null in full graph update', async () => {
      const tenantId = createTestTenantId('full-graph-clear-request-schema');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData(
        undefined,
        { includeContextConfig: true },
        tenantId,
        projectId
      );

      // Create the graph first
      const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });
      expect(createRes.status).toBe(201);

      // Update to clear headersSchema
      const updateData = {
        ...graphData,
        contextConfig: {
          ...(graphData.contextConfig || {}),
          headersSchema: null,
        },
      };

      const updateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(updateRes.status).toBe(200);
      const body = await updateRes.json();
      expect(body.data.contextConfig.headersSchema).toBeNull();
    });

    it('should clear both contextVariables and headersSchema simultaneously in full graph', async () => {
      const tenantId = createTestTenantId('full-graph-clear-both-fields');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData(
        undefined,
        { includeContextConfig: true },
        tenantId,
        projectId
      );

      // Create the graph first
      const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });
      expect(createRes.status).toBe(201);

      // Update to clear both fields
      const updateData = {
        ...graphData,
        contextConfig: {
          ...(graphData.contextConfig || {}),
          contextVariables: null,
          headersSchema: null,
        },
      };

      const updateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(updateRes.status).toBe(200);
      const body = await updateRes.json();
      expect(body.data.contextConfig.contextVariables).toBeNull();
      expect(body.data.contextConfig.headersSchema).toBeNull();
    });

    it('should handle empty object contextVariables as null in full graph creation', async () => {
      const tenantId = createTestTenantId('full-graph-create-empty-context-vars');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData(
        undefined,
        { includeContextConfig: true },
        tenantId,
        projectId
      );

      // Set contextVariables to empty object
      if (graphData.contextConfig) {
        graphData.contextConfig.contextVariables = {};
      }

      const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(createRes.status).toBe(201);
      const body = await createRes.json();
      expect(body.data.contextConfig.contextVariables).toBeNull();
    });

    it('should retrieve full graph with cleared context config fields consistently', async () => {
      const tenantId = createTestTenantId('full-graph-retrieve-cleared-fields');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData(
        undefined,
        { includeContextConfig: true },
        tenantId,
        projectId
      );

      // Create the graph first
      const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });
      expect(createRes.status).toBe(201);

      // Update to clear both fields
      const updateData = {
        ...graphData,
        contextConfig: {
          ...(graphData.contextConfig || {}),
          contextVariables: null,
          headersSchema: null,
        },
      };

      await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      // Retrieve and verify null values
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'GET',
        }
      );

      expect(getRes.status).toBe(200);
      const body = await getRes.json();
      expect(body.data.contextConfig.contextVariables).toBeNull();
      expect(body.data.contextConfig.headersSchema).toBeNull();
    });
  });

  describe('Tool Full Schema Fields - Verify ToolApiFullSchema', () => {
    it.skip('should verify tool schema fields are present in response', async () => {
      // TODO: Update this test to work with new scoped architecture where tools are project-scoped
      // The existing createTestToolData helper already includes these fields:
      // - status: 'unknown'
      // - capabilities: { tools: true }
      // - lastHealthCheck: new Date().toISOString()
      // - availableTools: [...]

      // Let's verify that these fields are present in the response
      const tenantId = createTestTenantId('verify-tool-schema');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData();

      const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(createRes.status).toBe(201);
      const body = await createRes.json();

      // Get the first tool from the response
      const toolIds = Object.keys(body.data.tools);
      expect(toolIds.length).toBeGreaterThan(0);

      const firstTool = body.data.tools[toolIds[0]];

      // Verify ToolApiFullSchema fields are present
      expect(firstTool).toHaveProperty('id');
      expect(firstTool).toHaveProperty('name');
      expect(firstTool).toHaveProperty('config');

      // The ToolApiFullSchema includes these optional fields which may or may not be present
      // depending on whether they have values
      if (firstTool.status !== undefined) {
        expect(['healthy', 'unhealthy', 'unknown']).toContain(firstTool.status);
      }

      // Check that if these fields exist, they have the right shape
      if (firstTool.capabilities) {
        expect(firstTool.capabilities).toMatchObject({
          tools: expect.any(Boolean),
        });
      }

      if (firstTool.availableTools) {
        expect(Array.isArray(firstTool.availableTools)).toBe(true);
        if (firstTool.availableTools.length > 0) {
          expect(firstTool.availableTools[0]).toMatchObject({
            name: expect.any(String),
          });
        }
      }

      if (firstTool.lastError) {
        expect(typeof firstTool.lastError).toBe('string');
      }
    });

    it.skip('should handle minimal tool config and verify optional fields', async () => {
      // TODO: Update this test to work with new scoped architecture where tools are project-scoped
      const tenantId = createTestTenantId('minimal-tool-fields');
      await ensureTestProject(tenantId, projectId);
      const graphId = nanoid();
      const subAgentId = `agent-${graphId}`;
      const toolId = `tool-${graphId}`;

      const graphData = {
        id: graphId,
        name: 'Minimal Tool Graph',
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            id: subAgentId,
            name: 'Test Agent',
            description: 'Test agent',
            prompt: 'Test instructions',
            tools: [toolId],
            canTransferTo: [],
            canDelegateTo: [],
          },
        },
        tools: {
          [toolId]: {
            id: toolId,
            name: 'Minimal Tool',
            description: 'Minimal test tool',
            config: {
              type: 'mcp',
              mcp: {
                server: {
                  url: 'https://example.com/mcp',
                },
              },
            },
            // Minimal - no optional fields provided
          },
        },
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      const tool = body.data.tools[toolId];
      expect(tool).toBeDefined();

      // Check that the schema allows these optional fields
      // They may or may not be present in the response
      expect(tool).toHaveProperty('id');
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('config');

      // Optional fields - check their types if present
      if (tool.status !== undefined) {
        expect(['healthy', 'unhealthy', 'unknown']).toContain(tool.status);
      }

      if (tool.capabilities !== undefined) {
        expect(tool.capabilities === null || typeof tool.capabilities === 'object').toBe(true);
      }

      if (tool.lastError !== undefined) {
        expect(tool.lastError === null || typeof tool.lastError === 'string').toBe(true);
      }

      if (tool.availableTools !== undefined) {
        expect(tool.availableTools === null || Array.isArray(tool.availableTools)).toBe(true);
      }
    });
  });

  describe.skip('Tool Full Schema Fields - Old Tests', () => {
    it('should include all read-only tool fields in graph response', async () => {
      const tenantId = createTestTenantId('graph-tool-full-fields');
      await ensureTestProject(tenantId, projectId);
      const graphId = nanoid();
      const subAgentId = `agent-${graphId}`;
      const toolId = `tool-${graphId}`;

      const graphData = {
        id: graphId,
        name: 'Graph with Full Tool Fields',
        description: 'Test graph to verify ToolApiFullSchema fields',
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            id: subAgentId,
            name: 'Agent with Tools',
            description: 'Agent to test tool fields',
            prompt: 'Test agent instructions',
            tools: [toolId],
            canTransferTo: [],
            canDelegateTo: [],
          },
        },
        tools: {
          [toolId]: {
            id: toolId,
            name: 'MCP Tool with Full Fields',
            description: 'MCP tool with full schema fields',
            config: {
              type: 'mcp',
              mcp: {
                server: {
                  url: 'https://mcp.example.com/server',
                },
              },
            },
          },
        },
      };

      // Create the graph
      const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();

      // Verify that the tool has all the expected fields in the response
      const createdTool = createBody.data.canUse[toolId];
      expect(createdTool).toBeDefined();

      // Check that all ToolApiFullSchema fields are present
      expect(createdTool).toHaveProperty('id');
      expect(createdTool).toHaveProperty('name');
      expect(createdTool).toHaveProperty('config');
      expect(createdTool).toHaveProperty('status');
      expect(createdTool).toHaveProperty('capabilities');
      expect(createdTool).toHaveProperty('lastError');
      expect(createdTool).toHaveProperty('availableTools');

      // The values should be null/default since they're read-only
      expect(createdTool.status).toBe('unknown');
      expect(createdTool.availableTools).toBeNull();
      expect(createdTool.capabilities).toBeNull();
    });

    it('should preserve tool full schema fields on graph retrieval', async () => {
      const tenantId = createTestTenantId('graph-tool-fields-get');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData();

      // Create the graph
      const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(createRes.status).toBe(201);

      // Retrieve the graph
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'GET',
        }
      );

      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();

      // Check that tools have all the full schema fields
      const tools = Object.values(getBody.data.tools) as any[];
      expect(tools.length).toBeGreaterThan(0);

      for (const tool of tools) {
        // Verify all ToolApiFullSchema fields are present
        expect(tool).toHaveProperty('status');
        expect(tool).toHaveProperty('capabilities');
        expect(tool).toHaveProperty('lastError');
        expect(tool).toHaveProperty('availableTools');

        // The createTestToolData helper includes these fields, so they should have values
        expect(tool.status).toBe('unknown');
        expect(tool.capabilities).toEqual({ tools: true });
        expect(tool.availableTools).toBeDefined();
      }
    });

    it('should handle tools with populated availableTools field', async () => {
      const tenantId = createTestTenantId('graph-tool-available-tools');
      await ensureTestProject(tenantId, projectId);
      const graphId = nanoid();
      const subAgentId = `agent-${graphId}`;
      const toolId = `tool-${graphId}`;

      const graphData = {
        id: graphId,
        name: 'Graph with Available Tools',
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            id: subAgentId,
            name: 'Test Agent',
            description: 'Test agent',
            prompt: 'Test instructions',
            tools: [toolId],
            canTransferTo: [],
            canDelegateTo: [],
          },
        },
        tools: {
          [toolId]: {
            id: toolId,
            name: 'Tool with Available Tools',
            description: 'Tool with available tools list',
            config: {
              type: 'mcp',
              mcp: {
                server: {
                  url: 'https://example.com/mcp',
                },
              },
            },
            availableTools: [
              {
                name: 'function1',
                description: 'First function',
                inputSchema: {
                  type: 'object',
                  properties: {
                    param1: { type: 'string' },
                  },
                },
              },
              {
                name: 'function2',
                description: 'Second function',
              },
            ],
          },
        },
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // Verify availableTools field is present (though it will be null since it's read-only)
      const tool = body.data.tools[toolId];
      expect(tool).toHaveProperty('availableTools');
      expect(tool.availableTools).toBeNull();
    });

    it('should handle multiple tools with different status values', async () => {
      const tenantId = createTestTenantId('graph-tool-statuses');
      await ensureTestProject(tenantId, projectId);
      const graphId = nanoid();
      const subAgentId = `agent-${graphId}`;
      const healthyToolId = `healthy-tool-${graphId}`;
      const unhealthyToolId = `unhealthy-tool-${graphId}`;
      const unknownToolId = `unknown-tool-${graphId}`;

      const graphData = {
        id: graphId,
        name: 'Graph with Tool Statuses',
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            id: subAgentId,
            name: 'Multi-Tool Agent',
            description: 'Agent with multiple tools',
            prompt: 'Test instructions',
            tools: [healthyToolId, unhealthyToolId, unknownToolId],
            canTransferTo: [],
            canDelegateTo: [],
          },
        },
        tools: {
          [healthyToolId]: {
            id: healthyToolId,
            name: 'Healthy Tool',
            description: 'A healthy test tool',
            config: {
              type: 'mcp',
              mcp: { server: { url: 'https://healthy.example.com' } },
            },
            status: 'healthy',
            lastHealthCheck: new Date().toISOString(),
          },
          [unhealthyToolId]: {
            id: unhealthyToolId,
            name: 'Unhealthy Tool',
            description: 'An unhealthy test tool',
            config: {
              type: 'mcp',
              mcp: { server: { url: 'https://unhealthy.example.com' } },
            },
            status: 'unhealthy',
            lastError: 'Connection timeout',
            lastHealthCheck: new Date().toISOString(),
          },
          [unknownToolId]: {
            id: unknownToolId,
            name: 'Unknown Status Tool',
            description: 'A tool with unknown status',
            config: {
              type: 'mcp',
              mcp: { server: { url: 'https://unknown.example.com' } },
            },
            status: 'unknown',
          },
        },
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // All tools should have status field, defaulting to 'unknown'
      expect(body.data.tools[healthyToolId].status).toBe('unknown');
      expect(body.data.tools[unhealthyToolId].status).toBe('unknown');
      expect(body.data.tools[unknownToolId].status).toBe('unknown');

      // All should have the lastError field
      expect(body.data.tools[unhealthyToolId]).toHaveProperty('lastError');
    });

    it('should handle tools with capabilities field', async () => {
      const tenantId = createTestTenantId('graph-tool-capabilities');
      await ensureTestProject(tenantId, projectId);
      const graphId = nanoid();
      const subAgentId = `agent-${graphId}`;
      const toolId = `tool-${graphId}`;

      const graphData = {
        id: graphId,
        name: 'Graph with Tool Capabilities',
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            id: subAgentId,
            name: 'Agent with Capable Tool',
            description: 'Test agent',
            prompt: 'Test instructions',
            tools: [toolId],
            canTransferTo: [],
            canDelegateTo: [],
          },
        },
        tools: {
          [toolId]: {
            id: toolId,
            name: 'Capable Tool',
            description: 'A tool with capabilities',
            config: {
              type: 'mcp',
              mcp: { server: { url: 'https://capable.example.com' } },
            },
            capabilities: {
              tools: true,
              streaming: true,
            },
          },
        },
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // Verify capabilities field is present
      const tool = body.data.tools[toolId];
      expect(tool).toHaveProperty('capabilities');
      expect(tool.capabilities).toBeNull(); // Should be null since it's read-only
    });

    it('should preserve all tool fields during graph update', async () => {
      const tenantId = createTestTenantId('graph-tool-update-preserve');
      await ensureTestProject(tenantId, projectId);
      const graphData = createFullGraphData();

      // Create the graph
      const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });
      expect(createRes.status).toBe(201);

      // Update the graph
      const updatedData = {
        ...graphData,
        name: 'Updated Graph Name',
      };

      const updateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agent/${graphData.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(updatedData),
        }
      );

      expect(updateRes.status).toBe(200);
      const updateBody = await updateRes.json();

      // Verify all tool fields are still present after update
      const tools = Object.values(updateBody.data.tools);
      for (const tool of tools) {
        expect(tool).toHaveProperty('status');
        expect(tool).toHaveProperty('capabilities');
        expect(tool).toHaveProperty('lastError');
        expect(tool).toHaveProperty('availableTools');
      }
    });

    it('should handle empty availableTools array', async () => {
      const tenantId = createTestTenantId('graph-empty-available-tools');
      await ensureTestProject(tenantId, projectId);
      const graphId = nanoid();
      const subAgentId = `agent-${graphId}`;
      const toolId = `tool-${graphId}`;

      const graphData = {
        id: graphId,
        name: 'Graph with Empty Available Tools',
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            id: subAgentId,
            name: 'Test Agent',
            description: 'Test agent',
            prompt: 'Test instructions',
            tools: [toolId],
            canTransferTo: [],
            canDelegateTo: [],
          },
        },
        tools: {
          [toolId]: {
            id: toolId,
            name: 'Tool with Empty Available Tools',
            description: 'Tool with empty available tools array',
            config: {
              type: 'mcp',
              mcp: { server: { url: 'https://example.com' } },
            },
            availableTools: [], // Empty array
          },
        },
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      const tool = body.data.tools[toolId];
      expect(tool).toHaveProperty('availableTools');
      expect(tool.availableTools).toBeNull(); // Should be null since it's read-only during creation
    });

    it('should validate tool schema properly with all optional fields', async () => {
      const tenantId = createTestTenantId('graph-tool-optional-fields');
      await ensureTestProject(tenantId, projectId);
      const graphId = nanoid();
      const subAgentId = `agent-${graphId}`;
      const toolId = `tool-${graphId}`;

      const graphData = {
        id: graphId,
        name: 'Graph with Optional Tool Fields',
        defaultSubAgentId: subAgentId,
        subAgents: {
          [subAgentId]: {
            id: subAgentId,
            name: 'Test Agent',
            description: 'Test agent',
            prompt: 'Test instructions',
            tools: [toolId],
            canTransferTo: [],
            canDelegateTo: [],
          },
        },
        tools: {
          [toolId]: {
            id: toolId,
            name: 'Minimal Tool',
            description: 'Minimal tool with optional fields',
            config: {
              type: 'mcp',
              mcp: { server: { url: 'https://minimal.example.com' } },
            },
            // All ToolApiFullSchema fields are optional
          },
        },
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent`, {
        method: 'POST',
        body: JSON.stringify(graphData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // Even without providing the fields, they should be present in response
      const tool = body.data.tools[toolId];
      expect(tool).toHaveProperty('status');
      expect(tool).toHaveProperty('capabilities');
      expect(tool).toHaveProperty('lastError');
      expect(tool).toHaveProperty('availableTools');
    });
  });
});
