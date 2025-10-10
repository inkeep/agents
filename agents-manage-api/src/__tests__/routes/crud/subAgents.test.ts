import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import app from '../../../index';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestSubAgentData } from '../../utils/testSubAgent';
import { createTestTenantId } from '../../utils/testTenant';

describe('Agent CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create a test graph
  const createTestGraph = async (tenantId: string) => {
    const graphData = {
      id: nanoid(),
      name: `Test Graph ${nanoid()}`,
      defaultSubAgentId: null,
    };
    const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent-graphs`, {
      method: 'POST',
      body: JSON.stringify(graphData),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    return body.data.id;
  };

  // Helper function to create an agent and return its ID
  const createTestAgent = async ({
    tenantId,
    graphId,
    suffix = '',
  }: {
    tenantId: string;
    graphId: string;
    suffix?: string;
  }) => {
    const agentData = createTestSubAgentData({ suffix, graphId });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents`,
      {
        method: 'POST',
        body: JSON.stringify(agentData),
      }
    );

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { agentData, subAgentId: createBody.data.id };
  };

  // Helper function to create multiple agents
  const createMultipleAgents = async ({
    tenantId,
    graphId,
    count,
  }: {
    tenantId: string;
    graphId: string;
    count: number;
  }) => {
    const agents: Awaited<ReturnType<typeof createTestAgent>>[] = [];
    for (let i = 1; i <= count; i++) {
      const agent = await createTestAgent({ tenantId, graphId, suffix: ` ${i}` });
      agents.push(agent);
    }
    return agents;
  };

  describe('GET /', () => {
    it('should list agents with pagination (empty initially)', async () => {
      const tenantId = createTestTenantId('agents-list-empty');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents?page=1&limit=10`
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

    it('should list agents with pagination (single item)', async () => {
      const tenantId = createTestTenantId('agents-list-single');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const { agentData } = await createTestAgent({ tenantId, graphId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        name: agentData.name,
        description: agentData.description,
        prompt: agentData.prompt,
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
      const tenantId = createTestTenantId('agents-list-multipages');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const _agents = await createMultipleAgents({ tenantId, graphId, count: 5 });

      // Test first page with limit 2
      const page1Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents?page=1&limit=2`
      );
      expect(page1Res.status).toBe(200);

      const page1Body = await page1Res.json();
      expect(page1Body.data).toHaveLength(2);
      expect(page1Body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        pages: 3,
      });

      // Test second page
      const page2Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents?page=2&limit=2`
      );
      expect(page2Res.status).toBe(200);

      const page2Body = await page2Res.json();
      expect(page2Body.data).toHaveLength(2);
      expect(page2Body.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 5,
        pages: 3,
      });

      // Test third page (partial)
      const page3Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents?page=3&limit=2`
      );
      expect(page3Res.status).toBe(200);

      const page3Body = await page3Res.json();
      expect(page3Body.data).toHaveLength(1); // Only 1 item on last page
      expect(page3Body.pagination).toEqual({
        page: 3,
        limit: 2,
        total: 5,
        pages: 3,
      });

      // Verify all agents are unique across pages
      const allAgentIds = [
        ...page1Body.data.map((a: any) => a.id),
        ...page2Body.data.map((a: any) => a.id),
        ...page3Body.data.map((a: any) => a.id),
      ];
      expect(new Set(allAgentIds).size).toBe(5); // All should be unique
    });

    it('should return empty data for page beyond available data', async () => {
      const tenantId = createTestTenantId('agents-list-beyond-pages');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      await createMultipleAgents({ tenantId, graphId, count: 3 });

      // Request page 5 with limit 2 (should be empty)
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents?page=5&limit=2`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination).toEqual({
        page: 5,
        limit: 2,
        total: 3,
        pages: 2, // Only 2 pages available
      });
    });

    it('should handle edge case with limit 1', async () => {
      const tenantId = createTestTenantId('agents-list-limit1');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const _agents = await createMultipleAgents({ tenantId, graphId, count: 3 });

      // Test with limit 1 (each page should have exactly 1 item)
      const page1Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents?page=1&limit=1`
      );
      expect(page1Res.status).toBe(200);

      const page1Body = await page1Res.json();
      expect(page1Body.data).toHaveLength(1);
      expect(page1Body.pagination).toEqual({
        page: 1,
        limit: 1,
        total: 3,
        pages: 3,
      });

      // Test middle page
      const page2Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents?page=2&limit=1`
      );
      expect(page2Res.status).toBe(200);

      const page2Body = await page2Res.json();
      expect(page2Body.data).toHaveLength(1);
      expect(page2Body.pagination).toEqual({
        page: 2,
        limit: 1,
        total: 3,
        pages: 3,
      });

      // Test last page
      const page3Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents?page=3&limit=1`
      );
      expect(page3Res.status).toBe(200);

      const page3Body = await page3Res.json();
      expect(page3Body.data).toHaveLength(1);
      expect(page3Body.pagination).toEqual({
        page: 3,
        limit: 1,
        total: 3,
        pages: 3,
      });
    });

    it('should handle large page size (larger than total items)', async () => {
      const tenantId = createTestTenantId('agents-list-large-limit');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const _agents = await createMultipleAgents({ tenantId, graphId, count: 3 });

      // Request with limit 10 (larger than total)
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(3); // All 3 agents
      expect(body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 3,
        pages: 1, // Only 1 page needed
      });
    });
  });

  describe('GET /{id}', () => {
    it('should get an agent by id', async () => {
      const tenantId = createTestTenantId('agents-get-by-id');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const { agentData, subAgentId } = await createTestAgent({ tenantId, graphId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents/${subAgentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: subAgentId,
        name: agentData.name,
        description: agentData.description,
        prompt: agentData.prompt,
        tenantId,
      });
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should return 404 when agent not found', async () => {
      const tenantId = createTestTenantId('agents-get-not-found');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents/non-existent-id`
      );
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body).toEqual({
        code: 'not_found',
        detail: 'SubAgent not found',
        error: {
          code: 'not_found',
          message: 'SubAgent not found',
        },
        status: 404,
        title: 'Not Found',
      });
    });

    it('should return RFC 7807-compliant problem details JSON and header for 404', async () => {
      const tenantId = createTestTenantId('agents-problem-details-404');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents/non-existent-id`
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
    it('should create a new agent', async () => {
      const tenantId = createTestTenantId('agents-create-success');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const agentData = createTestSubAgentData({ graphId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents`,
        {
          method: 'POST',
          body: JSON.stringify(agentData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        name: agentData.name,
        description: agentData.description,
        prompt: agentData.prompt,
        tenantId,
      });
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should create a new agent with a provided id', async () => {
      const tenantId = createTestTenantId('agents-create-with-id');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const agentData = createTestSubAgentData({ graphId });
      const providedId = nanoid();

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents`,
        {
          method: 'POST',
          body: JSON.stringify({ ...agentData, id: providedId }),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: providedId,
        name: agentData.name,
        description: agentData.description,
        prompt: agentData.prompt,
        tenantId,
      });

      // Verify the agent can be fetched with the provided ID
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents/${providedId}`
      );
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data.id).toBe(providedId);
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('agents-create-validation');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /{id}', () => {
    it('should update an existing agent', async () => {
      const tenantId = createTestTenantId('agents-update-success');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const { subAgentId } = await createTestAgent({ tenantId, graphId });

      const updateData = {
        name: 'Updated Agent',
        description: 'Updated Description',
        prompt: 'Updated Instructions',
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents/${subAgentId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: subAgentId,
        name: updateData.name,
        description: updateData.description,
        prompt: updateData.prompt,
        tenantId,
      });
    });

    it('should return 404 when updating non-existent agent', async () => {
      const tenantId = createTestTenantId('agents-update-not-found');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const updateData = {
        name: 'Updated Agent',
        description: 'Updated Description',
        prompt: 'Updated Instructions',
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents/non-existent-id`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete an existing agent', async () => {
      const tenantId = createTestTenantId('agents-delete-success');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const { subAgentId } = await createTestAgent({ tenantId, graphId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents/${subAgentId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(204);

      // Verify the agent is deleted
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents/${subAgentId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 204 when deleting non-existent agent', async () => {
      const tenantId = createTestTenantId('agents-delete-not-found');
      await ensureTestProject(tenantId, 'default');
      const graphId = await createTestGraph(tenantId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agents/non-existent-id`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(204);
    });
  });
});
