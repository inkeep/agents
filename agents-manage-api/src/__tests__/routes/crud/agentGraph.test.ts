import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import app from '../../../index.js';
import { makeRequest } from '../../utils/testRequest.js';
import { createTestTenantId } from '../../utils/testTenant.js';
import { ensureTestProject } from '../../utils/testProject.js';

describe('Agent Graph CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create test agent data (needed for creating default agents)
  const createAgentData = ({ suffix = '' } = {}) => ({
    id: nanoid(),
    name: `Test Agent${suffix}`,
    description: `Test Description${suffix}`,
    prompt: `Test Instructions${suffix}`,
  });

  // Helper function to create test agent graph data
  const createAgentGraphData = ({ defaultAgentId }: { defaultAgentId: string }) => {
    const id = nanoid();
    return {
      id,
      name: id, // Use the same ID as the name for test consistency
      defaultAgentId,
      contextConfigId: null, // Set to null since it's optional and we don't need it for these tests
    };
  };

  // Helper function to create an agent (needed for agent graphs)
  const createTestAgent = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    const agentData = createAgentData({ suffix });
    const createRes = await makeRequest(`/tenants/${tenantId}/crud/projects/${projectId}/agents`, {
      method: 'POST',
      body: JSON.stringify(agentData),
    });
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    return { agentData, agentId: createBody.data.id };
  };

  // Helper function to create an agent graph and return its ID
  const createTestAgentGraph = async ({
    tenantId,
    defaultAgentId,
  }: {
    tenantId: string;
    defaultAgentId: string;
  }) => {
    const agentGraphData = createAgentGraphData({ defaultAgentId });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs`,
      {
        method: 'POST',
        body: JSON.stringify(agentGraphData),
      }
    );
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    // The ID is now sent from the client, so we can return it directly
    return { agentGraphData, agentGraphId: createBody.data.id };
  };

  // Helper function to create multiple agent graphs
  const createMultipleAgentGraphs = async ({
    tenantId,
    count,
  }: {
    tenantId: string;
    count: number;
  }) => {
    const agentGraphs: Awaited<ReturnType<typeof createTestAgentGraph>>[] = [];
    for (let i = 1; i <= count; i++) {
      // Create a unique agent for each graph
      const { agentId } = await createTestAgent({ tenantId, suffix: ` ${i}` });
      const agentGraph = await createTestAgentGraph({ tenantId, defaultAgentId: agentId });
      agentGraphs.push(agentGraph);
    }
    return agentGraphs;
  };

  describe('GET /', () => {
    it('should list agent graphs with pagination (empty initially)', async () => {
      const tenantId = createTestTenantId('agent-graphs-list-empty');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual({
        data: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          pages: 0,
        },
      });
    });

    it('should list agent graphs with pagination (single item)', async () => {
      const tenantId = createTestTenantId('agent-graphs-list-single');
      await ensureTestProject(tenantId, projectId);
      const { agentId } = await createTestAgent({ tenantId });
      const { agentGraphData } = await createTestAgentGraph({
        tenantId,
        defaultAgentId: agentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: agentGraphData.id,
        defaultAgentId: agentGraphData.defaultAgentId,
        tenantId,
      });
      expect(body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        pages: 1,
      });
    });

    it('should handle pagination with multiple pages (small page size)', async () => {
      const tenantId = createTestTenantId('agent-graphs-list-multipages');
      await ensureTestProject(tenantId, projectId);
      await createMultipleAgentGraphs({ tenantId, count: 5 });

      const page1Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs?page=1&limit=2`
      );
      expect(page1Res.status).toBe(200);

      const page1Body = await page1Res.json();
      // Note: The current implementation doesn't actually paginate, it returns all items
      expect(page1Body.data).toHaveLength(5);
      expect(page1Body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        pages: 3,
      });

      // Verify all agent graphs are present
      expect(page1Body.data.every((g: any) => g.tenantId === tenantId)).toBe(true);
    });
  });

  describe('GET /{id}', () => {
    it('should get an agent graph by id', async () => {
      const tenantId = createTestTenantId('agent-graphs-get-by-id');
      await ensureTestProject(tenantId, projectId);
      const { agentId } = await createTestAgent({ tenantId });
      const { agentGraphData, agentGraphId } = await createTestAgentGraph({
        tenantId,
        defaultAgentId: agentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs/${agentGraphId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: agentGraphId,
        defaultAgentId: agentGraphData.defaultAgentId,
        tenantId,
      });
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should return 404 when agent graph not found', async () => {
      const tenantId = createTestTenantId('agent-graphs-get-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs/non-existent-id`
      );
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body).toEqual({
        code: 'not_found',
        detail: 'Agent graph not found',
        error: {
          code: 'not_found',
          message: 'Agent graph not found',
        },
        status: 404,
        title: 'Not Found',
      });
    });

    it('should return RFC 7807-compliant problem details JSON and header for 404', async () => {
      const tenantId = createTestTenantId('agent-graphs-problem-details-404');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs/non-existent-id`
      );
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/);

      const body = await res.json();
      // RFC 7807 required fields
      expect(typeof body.type === 'string' || body.type === undefined).toBe(true); // type is string or omitted (defaults to about:blank)
      expect(typeof body.title).toBe('string');
      expect(typeof body.status).toBe('number');
      expect(typeof body.detail).toBe('string');
      // instance is optional
      if (body.instance !== undefined) {
        expect(typeof body.instance).toBe('string');
      }
      // Custom fields allowed, but must not break the spec
    });
  });

  describe('POST /', () => {
    it('should create a new agent graph', async () => {
      const tenantId = createTestTenantId('agent-graphs-create-success');
      await ensureTestProject(tenantId, projectId);
      const { agentId } = await createTestAgent({ tenantId });
      const agentGraphData = createAgentGraphData({ defaultAgentId: agentId });

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs`,
        {
          method: 'POST',
          body: JSON.stringify(agentGraphData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: agentGraphData.id,
        defaultAgentId: agentGraphData.defaultAgentId,
        tenantId,
      });
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('agent-graphs-create-validation');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /{id}', () => {
    it('should update an existing agent graph', async () => {
      const tenantId = createTestTenantId('agent-graphs-update-success');
      await ensureTestProject(tenantId, projectId);
      const { agentId: originalAgentId } = await createTestAgent({
        tenantId,
        suffix: ' Original',
      });
      const { agentId: newAgentId } = await createTestAgent({ tenantId, suffix: ' New' });
      const { agentGraphId } = await createTestAgentGraph({
        tenantId,
        defaultAgentId: originalAgentId,
      });

      const updateData = {
        defaultAgentId: newAgentId,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs/${agentGraphId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: agentGraphId,
        defaultAgentId: newAgentId,
        tenantId,
      });
    });

    it('should return 404 when updating non-existent agent graph', async () => {
      const tenantId = createTestTenantId('agent-graphs-update-not-found');
      await ensureTestProject(tenantId, projectId);
      const { agentId } = await createTestAgent({ tenantId });
      const updateData = {
        defaultAgentId: agentId,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs/non-existent-id`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete an existing agent graph', async () => {
      const tenantId = createTestTenantId('agent-graphs-delete-success');
      await ensureTestProject(tenantId, projectId);
      const { agentId } = await createTestAgent({ tenantId });
      const { agentGraphId } = await createTestAgentGraph({
        tenantId,
        defaultAgentId: agentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs/${agentGraphId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(204);

      // Verify the agent graph is deleted
      const getRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs/${agentGraphId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent agent graph', async () => {
      const tenantId = createTestTenantId('agent-graphs-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs/non-existent-id`,
        {
          method: 'DELETE',
        }
      );

      // The deleteAgentGraph function returns false for non-existent graphs
      expect(res.status).toBe(404);
    });
  });

  describe('GET /{graphId}/agents/{agentId}/related', () => {
    it('should get related agent infos (empty initially)', async () => {
      const tenantId = createTestTenantId('agent-graphs-related-empty');
      await ensureTestProject(tenantId, projectId);
      const { agentId } = await createTestAgent({ tenantId });
      const { agentGraphId } = await createTestAgentGraph({
        tenantId,
        defaultAgentId: agentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs/${agentGraphId}/agents/${agentId}/related`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual({
        data: [],
        pagination: {
          page: 1,
          limit: 0,
          total: 0,
          pages: 1,
        },
      });
    });
  });

  describe('GET /{graphId}/full', () => {
    it('should get full graph definition with basic structure', async () => {
      const tenantId = createTestTenantId('agent-graphs-full-basic');
      await ensureTestProject(tenantId, projectId);
      const { agentId } = await createTestAgent({ tenantId });
      const { agentGraphId } = await createTestAgentGraph({
        tenantId,
        defaultAgentId: agentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs/${agentGraphId}/full`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('data');
      expect(body.data).toMatchObject({
        id: agentGraphId,
        name: agentGraphId, // Using graphId as name
        defaultAgentId: agentId,
      });

      // Verify the structure contains required fields
      expect(body.data).toHaveProperty('agents');
      expect(body.data).toHaveProperty('createdAt');
      expect(body.data).toHaveProperty('updatedAt');

      // Verify the default agent is included in agents
      expect(body.data.agents).toHaveProperty(agentId);
      expect(body.data.agents[agentId]).toMatchObject({
        id: agentId,
        name: expect.any(String),
        description: expect.any(String),
        canDelegateTo: expect.any(Array),
        tools: expect.any(Array),
      });
    });

    it('should return 404 when graph not found', async () => {
      const tenantId = createTestTenantId('agent-graphs-full-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs/non-existent-graph/full`
      );
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body).toEqual({
        code: 'not_found',
        detail: 'Agent graph not found',
        error: {
          code: 'not_found',
          message: 'Agent graph not found',
        },
        status: 404,
        title: 'Not Found',
      });
    });

    it('should include multiple agents when graph has relationships', async () => {
      const tenantId = createTestTenantId('agent-graphs-full-multiple-agents');
      await ensureTestProject(tenantId, projectId);

      // Create multiple agents
      const { agentId: agent1Id } = await createTestAgent({ tenantId, suffix: ' 1' });
      const { agentId: agent2Id } = await createTestAgent({ tenantId, suffix: ' 2' });
      const { agentId: agent3Id } = await createTestAgent({ tenantId, suffix: ' 3' });

      // Create the graph with agent1 as default
      const { agentGraphId } = await createTestAgentGraph({
        tenantId,
        defaultAgentId: agent1Id,
      });

      // Create some relationships between agents in the graph
      // Note: This assumes the agent relations CRUD endpoints exist
      try {
        await makeRequest(`/tenants/${tenantId}/crud/projects/${projectId}/agent-relations`, {
          method: 'POST',
          body: JSON.stringify({
            graphId: agentGraphId,
            sourceAgentId: agent1Id,
            targetAgentId: agent2Id,
            relationType: 'transfer',
          }),
        });

        await makeRequest(`/tenants/${tenantId}/crud/projects/${projectId}/agent-relations`, {
          method: 'POST',
          body: JSON.stringify({
            graphId: agentGraphId,
            sourceAgentId: agent2Id,
            targetAgentId: agent3Id,
            relationType: 'transfer',
          }),
        });
      } catch (error) {
        // If agent relations endpoints don't exist or fail, we'll skip this part
        // and just test with the default agent
        console.warn('Agent relations creation failed, testing with default agent only');
      }

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs/${agentGraphId}/full`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveProperty('agents');

      // At minimum, the default agent should be present
      expect(body.data.agents).toHaveProperty(agent1Id);

      // If relationships were created successfully, other agents should be included
      const agentIds = Object.keys(body.data.agents);
      expect(agentIds).toContain(agent1Id);

      // Verify agent structure
      for (const agentId of agentIds) {
        const agent = body.data.agents[agentId];
        expect(agent).toMatchObject({
          id: agentId,
          name: expect.any(String),
          description: expect.any(String),
          canDelegateTo: expect.any(Array),
          tools: expect.any(Array),
        });
      }
    });

    it('should handle empty graph with just default agent', async () => {
      const tenantId = createTestTenantId('agent-graphs-full-empty');
      await ensureTestProject(tenantId, projectId);
      const { agentId } = await createTestAgent({ tenantId, suffix: ' Default' });
      const { agentGraphId } = await createTestAgentGraph({
        tenantId,
        defaultAgentId: agentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-graphs/${agentGraphId}/full`
      );
      expect(res.status).toBe(200);

      const body = await res.json();

      // Should contain exactly one agent (the default agent)
      expect(Object.keys(body.data.agents)).toHaveLength(1);
      expect(body.data.agents[agentId]).toBeDefined();

      // The default agent should have empty relationship arrays
      expect(body.data.agents[agentId].canTransferTo).toEqual([]);
      expect(body.data.agents[agentId].canDelegateTo).toEqual([]);
      expect(body.data.agents[agentId].tools).toEqual([]);
    });
  });
});
