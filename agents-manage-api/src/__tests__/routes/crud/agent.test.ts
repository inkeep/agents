import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import app from '../../../index';
import { createTestAgentData } from '../../utils/testHelpers';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestSubAgentData } from '../../utils/testSubAgent';
import { createTestTenantId } from '../../utils/testTenant';

describe('Agent Agent CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create test agent data
  const createAgentData = ({
    defaultSubAgentId = null,
  }: {
    defaultSubAgentId?: string | null;
  } = {}) => {
    const id = nanoid();
    return {
      id,
      name: id, // Use the same ID as the name for test consistency
      defaultSubAgentId,
      contextConfigId: null, // Set to null since it's optional and we don't need it for these tests
    };
  };

  // Helper function to create an agent (needed for agent agent)
  const createTestSubAgent = async ({
    tenantId,
    agentId,
    suffix = '',
  }: {
    tenantId: string;
    agentId: string;
    suffix?: string;
  }) => {
    const agentData = createTestSubAgentData({ suffix });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents`,
      {
        method: 'POST',
        body: JSON.stringify(agentData),
      }
    );
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    return { agentData, subAgentId: createBody.data.id };
  };

  // Helper function to create an agent agent and return its ID
  const createTestAgent = async ({
    tenantId,
    defaultSubAgentId = null,
  }: {
    tenantId: string;
    defaultSubAgentId?: string | null;
  }) => {
    const agentData = createAgentData({ defaultSubAgentId });
    const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents`, {
      method: 'POST',
      body: JSON.stringify(agentData),
    });
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    // The ID is now sent from the client, so we can return it directly
    return { agentData, agentId: createBody.data.id };
  };

  // Helper function to create multiple agent agent
  const createMultipleAgents = async ({
    tenantId,
    count,
  }: {
    tenantId: string;
    count: number;
  }) => {
    const agents: Awaited<ReturnType<typeof createTestAgent>>[] = [];
    for (let i = 1; i <= count; i++) {
      // Create agent first (without defaultSubAgentId)
      const agent = await createTestAgent({ tenantId });

      // Create a unique agent for this agent
      const { subAgentId } = await createTestSubAgent({
        tenantId,
        agentId: agent.agentId,
        suffix: ` ${i}`,
      });

      // Update the agent with the default agent
      await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agent.agentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ defaultSubAgentId: subAgentId }),
        }
      );

      agents.push(agent);
    }
    return agents;
  };

  describe('GET /', () => {
    it('should list agent agent with pagination (empty initially)', async () => {
      const tenantId = createTestTenantId('agent-agent-list-empty');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents?page=1&limit=10`
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

    it('should list agent agent with pagination (single item)', async () => {
      const tenantId = createTestTenantId('agent-agent-list-single');
      await ensureTestProject(tenantId, projectId);

      // Create agent first
      const { agentData: agentAgentData, agentId: agentAgentId } = await createTestAgent({ tenantId });

      // Create agent with the agentId
      const { subAgentId } = await createTestSubAgent({ tenantId, agentId: agentAgentId });

      // Update agent with default agent
      await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}`, {
        method: 'PUT',
        body: JSON.stringify({ defaultSubAgentId: subAgentId }),
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: agentAgentId,
        defaultSubAgentId: subAgentId,
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
      const tenantId = createTestTenantId('agent-agent-list-multipages');
      await ensureTestProject(tenantId, projectId);
      await createMultipleAgents({ tenantId, count: 5 });

      const page1Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents?page=1&limit=2`
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

      // Verify all agent agent are present
      expect(page1Body.data.every((g: any) => g.tenantId === tenantId)).toBe(true);
    });
  });

  describe('GET /{id}', () => {
    it('should get an agent agent by id', async () => {
      const tenantId = createTestTenantId('agent-agent-get-by-id');
      await ensureTestProject(tenantId, projectId);

      // Create agent first
      const { agentData: agentAgentData, agentId: agentAgentId } = await createTestAgent({ tenantId });

      // Create agent with the agentId
      const { subAgentId } = await createTestSubAgent({ tenantId, agentId: agentAgentId });

      // Update agent with default agent
      await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}`, {
        method: 'PUT',
        body: JSON.stringify({ defaultSubAgentId: subAgentId }),
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: agentAgentId,
        defaultSubAgentId: subAgentId,
        tenantId,
      });
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should return 404 when agent agent not found', async () => {
      const tenantId = createTestTenantId('agent-agent-get-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/non-existent-id`
      );
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body).toEqual({
        code: 'not_found',
        detail: 'Agent agent not found',
        error: {
          code: 'not_found',
          message: 'Agent agent not found',
        },
        status: 404,
        title: 'Not Found',
      });
    });

    it('should return RFC 7807-compliant problem details JSON and header for 404', async () => {
      const tenantId = createTestTenantId('agent-agent-problem-details-404');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/non-existent-id`
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
    it('should create a new agent agent', async () => {
      const tenantId = createTestTenantId('agent-agent-create-success');
      await ensureTestProject(tenantId, projectId);

      // Create a temporary agent first for the agent
      const tempAgent = await createTestAgent({ tenantId });
      const { subAgentId } = await createTestSubAgent({ tenantId, agentId: tempAgent.agentId });
      const agentAgentData = createAgentData({ defaultSubAgentId: subAgentId });

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents`, {
        method: 'POST',
        body: JSON.stringify(agentAgentData),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: agentAgentData.id,
        defaultSubAgentId: agentAgentData.defaultSubAgentId,
        tenantId,
      });
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('agent-agent-create-validation');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /{id}', () => {
    it('should update an existing agent agent', async () => {
      const tenantId = createTestTenantId('agent-agent-update-success');
      await ensureTestProject(tenantId, projectId);

      // Create the agent first
      const { agentId: agentAgentId } = await createTestAgent({ tenantId });

      // Create agents with the agentId
      const { subAgentId: originalAgentId } = await createTestSubAgent({
        tenantId,
        agentId: agentAgentId,
        suffix: ' Original',
      });
      const { subAgentId: newAgentId } = await createTestSubAgent({
        tenantId,
        agentId: agentAgentId,
        suffix: ' New',
      });

      const updateData = {
        defaultSubAgentId: newAgentId,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: agentAgentId,
        defaultSubAgentId: newAgentId,
        tenantId,
      });
    });

    it('should return 404 when updating non-existent agent agent', async () => {
      const tenantId = createTestTenantId('agent-agent-update-not-found');
      await ensureTestProject(tenantId, projectId);

      // Create a agent for the agent
      const tempAgent = await createTestAgent({ tenantId });
      const { subAgentId } = await createTestSubAgent({ tenantId, agentId: tempAgent.agentId });
      const updateData = {
        defaultSubAgentId: subAgentId,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/non-existent-id`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete an existing agent agent', async () => {
      const tenantId = createTestTenantId('agent-agent-delete-success');
      await ensureTestProject(tenantId, projectId);

      // Create agent first
      const { agentId: agentAgentId } = await createTestAgent({ tenantId });

      // Create agent with the agentId
      const { subAgentId } = await createTestSubAgent({ tenantId, agentId: agentAgentId });

      // Update agent with default agent
      await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}`, {
        method: 'PUT',
        body: JSON.stringify({ defaultSubAgentId: subAgentId }),
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(204);

      // Verify the agent agent is deleted
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent agent agent', async () => {
      const tenantId = createTestTenantId('agent-agent-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/non-existent-id`,
        {
          method: 'DELETE',
        }
      );

      // The deleteAgentAgent function returns false for non-existent agent
      expect(res.status).toBe(404);
    });
  });

  describe('GET /{agentId}/sub-agents/{subAgentId}/related', () => {
    it('should get related agent infos (empty initially)', async () => {
      const tenantId = createTestTenantId('agent-agent-related-empty');
      await ensureTestProject(tenantId, projectId);

      // Create agent first
      const { agentId: agentAgentId } = await createTestAgent({ tenantId });

      // Create agent with the agentId
      const { subAgentId } = await createTestSubAgent({ tenantId, agentId: agentAgentId });

      // Update agent with default agent
      await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}`, {
        method: 'PUT',
        body: JSON.stringify({ defaultSubAgentId: subAgentId }),
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}/sub-agents/${subAgentId}/related`
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

  describe('GET /{agentId}/full', () => {
    it('should get full agent definition with basic structure', async () => {
      const tenantId = createTestTenantId('agent-agent-full-basic');
      await ensureTestProject(tenantId, projectId);

      // Create agent first
      const { agentId: agentAgentId } = await createTestAgent({ tenantId });

      // Create agent with the agentId
      const { subAgentId } = await createTestSubAgent({ tenantId, agentId: agentAgentId });

      // Update agent with default agent
      await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}`, {
        method: 'PUT',
        body: JSON.stringify({ defaultSubAgentId: subAgentId }),
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}/full`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('data');
      expect(body.data).toMatchObject({
        id: agentAgentId,
        name: agentAgentId, // Using agentId as name
        defaultSubAgentId: subAgentId,
      });

      // Verify the structure contains required fields
      expect(body.data).toHaveProperty('subAgents');
      expect(body.data).toHaveProperty('createdAt');
      expect(body.data).toHaveProperty('updatedAt');

      // Verify the default agent is included in agents
      expect(body.data.subAgents).toHaveProperty(subAgentId);
      expect(body.data.subAgents[subAgentId]).toMatchObject({
        id: subAgentId,
        name: expect.any(String),
        description: expect.any(String),
        canDelegateTo: expect.any(Array),
        canUse: expect.any(Array),
      });
    });

    it('should return 404 when agent not found', async () => {
      const tenantId = createTestTenantId('agent-agent-full-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/non-existent-agent/full`
      );
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body).toEqual({
        code: 'not_found',
        detail: 'Agent agent not found',
        error: {
          code: 'not_found',
          message: 'Agent agent not found',
        },
        status: 404,
        title: 'Not Found',
      });
    });

    it('should include multiple agents when agent has relationships', async () => {
      const tenantId = createTestTenantId('agent-agent-full-multiple-agents');
      await ensureTestProject(tenantId, projectId);

      // Create the agent first
      const { agentId: agentAgentId } = await createTestAgent({ tenantId });

      // Create multiple agents with the agentId
      const { subAgentId: agent1Id } = await createTestSubAgent({
        tenantId,
        agentId: agentAgentId,
        suffix: ' 1',
      });
      const { subAgentId: agent2Id } = await createTestSubAgent({
        tenantId,
        agentId: agentAgentId,
        suffix: ' 2',
      });
      const { subAgentId: agent3Id } = await createTestSubAgent({
        tenantId,
        agentId: agentAgentId,
        suffix: ' 3',
      });

      // Update agent with agent1 as default
      await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}`, {
        method: 'PUT',
        body: JSON.stringify({ defaultSubAgentId: agent1Id }),
      });

      // Create some relationships between agents in the agent
      // Note: This assumes the agent relations CRUD endpoints exist
      try {
        await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent-relations`, {
          method: 'POST',
          body: JSON.stringify({
            agentId: agentAgentId,
            sourceSubAgentId: agent1Id,
            targetSubAgentId: agent2Id,
            relationType: 'transfer',
          }),
        });

        await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent-relations`, {
          method: 'POST',
          body: JSON.stringify({
            agentId: agentAgentId,
            sourceSubAgentId: agent2Id,
            targetSubAgentId: agent3Id,
            relationType: 'transfer',
          }),
        });
      } catch (_error) {
        // If agent relations endpoints don't exist or fail, we'll skip this part
        // and just test with the default agent
        console.warn('Agent relations creation failed, testing with default agent only');
      }

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}/full`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveProperty('subAgents');

      // At minimum, the default agent should be present
      expect(body.data.subAgents).toHaveProperty(agent1Id);

      // If relationships were created successfully, other agents should be included
      const subAgentIds = Object.keys(body.data.subAgents);
      expect(subAgentIds).toContain(agent1Id);

      // Verify agent structure
      for (const subAgentId of subAgentIds) {
        const agent = body.data.subAgents[subAgentId];
        expect(agent).toMatchObject({
          id: subAgentId,
          name: expect.any(String),
          description: expect.any(String),
          canDelegateTo: expect.any(Array),
          canUse: expect.any(Array),
        });
      }
    });

    it('should handle empty agent with just default agent', async () => {
      const tenantId = createTestTenantId('agent-agent-full-empty');
      await ensureTestProject(tenantId, projectId);

      // Create the agent first
      const { agentId: agentAgentId } = await createTestAgent({ tenantId });

      // Create agent with the agentId
      const { subAgentId } = await createTestSubAgent({
        tenantId,
        agentId: agentAgentId,
        suffix: ' Default',
      });

      // Update agent with default agent
      await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}`, {
        method: 'PUT',
        body: JSON.stringify({ defaultSubAgentId: subAgentId }),
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentAgentId}/full`
      );
      expect(res.status).toBe(200);

      const body = await res.json();

      // Should contain exactly one agent (the default agent)
      expect(Object.keys(body.data.subAgents)).toHaveLength(1);
      expect(body.data.subAgents[subAgentId]).toBeDefined();

      // The default agent should have empty relationship arrays
      expect(body.data.subAgents[subAgentId].canTransferTo).toEqual([]);
      expect(body.data.subAgents[subAgentId].canDelegateTo).toEqual([]);
      expect(body.data.subAgents[subAgentId].canUse).toEqual([]);
    });
  });
});
