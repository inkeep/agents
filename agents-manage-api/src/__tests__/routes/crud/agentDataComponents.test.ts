import { describe, expect, it } from 'vitest';
import app from '../../../index';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantId } from '../../utils/testTenant';
import { ensureTestProject } from '../../utils/testProject';

describe('Agent Data Component CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create test agent data
  const createAgentData = ({ suffix = '', tenantId = '' } = {}) => ({
    id: `test-agent${suffix}-${tenantId}`,
    name: `Test Agent${suffix}`,
    description: `Test Description${suffix}`,
    prompt: `Test Instructions${suffix}`,
  });

  // Helper function to create an agent (needed for agent data component relations)
  const createTestAgent = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    const agentData = createAgentData({ suffix, tenantId });
    const createRes = await makeRequest(`/tenants/${tenantId}/crud/projects/${projectId}/agents`, {
      method: 'POST',
      body: JSON.stringify(agentData),
    });
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    return { agentData, agentId: createBody.data.id };
  };

  // Helper function to create test agent graph data
  const createAgentGraphData = ({
    defaultAgentId,
    suffix = '',
  }: {
    defaultAgentId: string;
    suffix?: string;
  }) => ({
    id: `test-graph${suffix}`,
    name: `Test Graph${suffix}`,
    defaultAgentId,
  });

  // Helper function to create test data component data
  const createDataComponentData = ({ suffix = '', tenantId = '' } = {}) => ({
    id: `test-component${suffix}-${tenantId}`,
    name: `TestComponent${suffix}`,
    description: `Test component description${suffix}`,
    props: {
      type: 'object',
      properties: {
        testProp: {
          type: 'string',
          description: 'Test property',
        },
      },
      required: ['testProp'],
    },
  });

  // Helper function to create a data component (needed for agent data component relations)
  const createTestDataComponent = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    const dataComponentData = createDataComponentData({ suffix, tenantId });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/crud/projects/${projectId}/data-components`,
      {
        method: 'POST',
        body: JSON.stringify(dataComponentData),
      }
    );
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    return { dataComponentData, dataComponentId: createBody.data.id };
  };

  // Helper function to create test agent data component relation data
  const createAgentDataComponentData = ({
    agentId,
    dataComponentId,
  }: {
    agentId: string;
    dataComponentId: string;
  }) => ({
    id: `${agentId}-${dataComponentId}`,
    agentId,
    dataComponentId,
  });

  // Helper function to create an agent data component relation
  const createTestAgentDataComponentRelation = async ({
    tenantId,
    agentId,
    dataComponentId,
  }: {
    tenantId: string;
    agentId: string;
    dataComponentId: string;
  }) => {
    const relationData = createAgentDataComponentData({
      agentId,
      dataComponentId,
    });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components`,
      {
        method: 'POST',
        body: JSON.stringify(relationData),
      }
    );

    const responseText = await createRes.text();
    expect(
      createRes.status,
      `Failed to create agent data component relation: ${responseText}`
    ).toBe(201);

    const createBody = JSON.parse(responseText);
    return { relationData, relationId: createBody.data.id };
  };

  // Setup function for tests
  const setupTestEnvironment = async (tenantId: string) => {
    const { agentId } = await createTestAgent({ tenantId });
    const { dataComponentId } = await createTestDataComponent({ tenantId });
    return { agentId, dataComponentId };
  };

  describe('POST /', () => {
    it('should create a new agent data component association', async () => {
      const tenantId = createTestTenantId('agent-data-components-create-success');
      await ensureTestProject(tenantId, projectId);
      const { agentId, dataComponentId } = await setupTestEnvironment(tenantId);

      const relationData = createAgentDataComponentData({
        agentId,
        dataComponentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        agentId,
        dataComponentId,
      });
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('agent-data-components-create-validation');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should reject duplicate associations', async () => {
      const tenantId = createTestTenantId('agent-data-components-create-duplicate');
      await ensureTestProject(tenantId, projectId);
      const { agentId, dataComponentId } = await setupTestEnvironment(tenantId);

      const relationData = createAgentDataComponentData({
        agentId,
        dataComponentId,
      });

      // Create first association
      const res1 = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );
      expect(res1.status).toBe(201);

      // Try to create duplicate - should fail
      const res2 = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );
      expect(res2.status).toBe(409);
    });
  });

  describe('GET /agent/:agentId', () => {
    it('should get data components for an agent', async () => {
      const tenantId = createTestTenantId('agent-data-components-get-for-agent');
      await ensureTestProject(tenantId, projectId);
      const { agentId, dataComponentId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentDataComponentRelation({
        tenantId,
        agentId,
        dataComponentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components/agent/${agentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(dataComponentId);
    });

    it('should return empty array when no data components associated', async () => {
      const tenantId = createTestTenantId('agent-data-components-get-empty');
      await ensureTestProject(tenantId, projectId);
      const { agentId } = await setupTestEnvironment(tenantId);

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components/agent/${agentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(0);
    });
  });

  describe('GET /component/:dataComponentId/agents', () => {
    it('should get agents using a data component', async () => {
      const tenantId = createTestTenantId('agent-data-components-get-agents');
      await ensureTestProject(tenantId, projectId);
      const { agentId, dataComponentId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentDataComponentRelation({
        tenantId,
        agentId,
        dataComponentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components/component/${dataComponentId}/agents`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        agentId,
      });
    });

    it('should return empty array when no agents use the data component', async () => {
      const tenantId = createTestTenantId('agent-data-components-get-agents-empty');
      await ensureTestProject(tenantId, projectId);
      const { dataComponentId } = await setupTestEnvironment(tenantId);

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components/component/${dataComponentId}/agents`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(0);
    });
  });

  describe('GET /agent/:agentId/component/:dataComponentId/exists', () => {
    it('should return true when association exists', async () => {
      const tenantId = createTestTenantId('agent-data-components-check-exists-true');
      await ensureTestProject(tenantId, projectId);
      const { agentId, dataComponentId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentDataComponentRelation({
        tenantId,
        agentId,
        dataComponentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components/agent/${agentId}/component/${dataComponentId}/exists`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.exists).toBe(true);
    });

    it('should return false when association does not exist', async () => {
      const tenantId = createTestTenantId('agent-data-components-check-exists-false');
      await ensureTestProject(tenantId, projectId);
      const { agentId, dataComponentId } = await setupTestEnvironment(tenantId);

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components/agent/${agentId}/component/${dataComponentId}/exists`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.exists).toBe(false);
    });
  });

  describe('DELETE /agent/:agentId/component/:dataComponentId', () => {
    it('should remove an existing association', async () => {
      const tenantId = createTestTenantId('agent-data-components-delete-success');
      await ensureTestProject(tenantId, projectId);
      const { agentId, dataComponentId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentDataComponentRelation({
        tenantId,
        agentId,
        dataComponentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components/agent/${agentId}/component/${dataComponentId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.removed).toBe(true);

      // Verify association is removed
      const checkRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components/agent/${agentId}/component/${dataComponentId}/exists`
      );
      const checkBody = await checkRes.json();
      expect(checkBody.exists).toBe(false);
    });

    it('should return 404 when removing non-existent association', async () => {
      const tenantId = createTestTenantId('agent-data-components-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const { agentId, dataComponentId } = await setupTestEnvironment(tenantId);

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components/agent/${agentId}/component/${dataComponentId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('Integration with multiple agents and data components', () => {
    it('should handle multiple associations correctly', async () => {
      const tenantId = createTestTenantId('agent-data-components-multiple');
      await ensureTestProject(tenantId, projectId);

      // Create multiple agents and data components
      const { agentId: agent1Id } = await createTestAgent({ tenantId, suffix: '1' });
      const { agentId: agent2Id } = await createTestAgent({ tenantId, suffix: '2' });

      const { dataComponentId: dc1Id } = await createTestDataComponent({
        tenantId,
        suffix: '1',
      });
      const { dataComponentId: dc2Id } = await createTestDataComponent({
        tenantId,
        suffix: '2',
      });

      // Create cross-associations
      await createTestAgentDataComponentRelation({
        tenantId,
        agentId: agent1Id,
        dataComponentId: dc1Id,
      });
      await createTestAgentDataComponentRelation({
        tenantId,
        agentId: agent1Id,
        dataComponentId: dc2Id,
      });
      await createTestAgentDataComponentRelation({
        tenantId,
        agentId: agent2Id,
        dataComponentId: dc1Id,
      });

      // Verify agent1 has 2 data components
      const agent1Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components/agent/${agent1Id}`
      );
      const agent1Body = await agent1Res.json();
      expect(agent1Body.data).toHaveLength(2);

      // Verify agent2 has 1 data component
      const agent2Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components/agent/${agent2Id}`
      );
      const agent2Body = await agent2Res.json();
      expect(agent2Body.data).toHaveLength(1);

      // Verify dc1 is used by 2 agents
      const dc1Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components/component/${dc1Id}/agents`
      );
      const dc1Body = await dc1Res.json();
      expect(dc1Body.data).toHaveLength(2);

      // Verify dc2 is used by 1 agent
      const dc2Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-data-components/component/${dc2Id}/agents`
      );
      const dc2Body = await dc2Res.json();
      expect(dc2Body.data).toHaveLength(1);
    });
  });
});
