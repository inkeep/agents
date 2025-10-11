import { describe, expect, it } from 'vitest';
import { createTestAgentDataComponentData } from '../../utils/testHelpers';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestSubAgentData } from '../../utils/testSubAgent';
import { createTestTenantId } from '../../utils/testTenant';

describe('Agent Data Component CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create an agent (needed for agent data component relations)
  const createTestAgent = async ({
    tenantId,
    suffix = '',
    agentId = undefined,
  }: {
    tenantId: string;
    suffix?: string;
    agentId?: string;
  }) => {
    // Create a agent if not provided
    let effectiveAgentId = agentId;
    if (!effectiveAgentId) {
      effectiveAgentId = `test-agent-${tenantId}${suffix}`;
      const agentData = {
        id: effectiveAgentId,
        name: 'Test Agent',
        defaultSubAgentId: null,
      };
      // Try to create the agent, ignore if it already exists
      const agentRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents`, {
        method: 'POST',
        body: JSON.stringify(agentData),
      });
      // Use the agentId from the created or existing agent
      effectiveAgentId = agentRes.status === 201 ? effectiveAgentId : 'default';
    }

    const agentData = { ...createTestSubAgentData({ suffix, tenantId }) };
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/agents/${effectiveAgentId}/sub-agents`,
      {
        method: 'POST',
        body: JSON.stringify(agentData),
      }
    );
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    return { agentData, subAgentId: createBody.data.id, agentId: effectiveAgentId };
  };

  // Helper function to create test agent agent data
  const _createAgentAgentData = ({
    defaultSubAgentId,
    suffix = '',
  }: {
    defaultSubAgentId: string;
    suffix?: string;
  }) => ({
    id: `test-agent${suffix}`,
    name: `Test Agent${suffix}`,
    defaultSubAgentId,
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
      `/tenants/${tenantId}/projects/${projectId}/data-components`,
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
  // Helper function to create an agent data component relation
  const createTestAgentDataComponentRelation = async ({
    tenantId,
    subAgentId,
    dataComponentId,
    agentId,
  }: {
    tenantId: string;
    subAgentId: string;
    dataComponentId: string;
    agentId: string;
  }) => {
    const relationData = createTestAgentDataComponentData({
      subAgentId,
      dataComponentId,
      agentId: agentId,
    });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components`,
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
    const { subAgentId, agentId } = await createTestAgent({ tenantId });
    const { dataComponentId } = await createTestDataComponent({ tenantId });
    return { subAgentId, dataComponentId, agentId };
  };

  describe('POST /', () => {
    it('should create a new agent data component association', async () => {
      const tenantId = createTestTenantId('agent-data-components-create-success');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, dataComponentId, agentId } = await setupTestEnvironment(tenantId);

      const relationData = createTestAgentDataComponentData({
        subAgentId,
        dataComponentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        subAgentId: subAgentId,
        dataComponentId,
      });
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('agent-data-components-create-validation');
      await ensureTestProject(tenantId, projectId);
      const agentId = 'default';
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components`,
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
      const { subAgentId, dataComponentId, agentId } = await setupTestEnvironment(tenantId);

      const relationData = createTestAgentDataComponentData({
        subAgentId,
        dataComponentId,
      });

      // Create first association
      const res1 = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );
      expect(res1.status).toBe(201);

      // Try to create duplicate - should fail
      const res2 = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );
      expect(res2.status).toBe(409);
    });
  });

  describe('GET /agent/:subAgentId', () => {
    it('should get data components for an agent', async () => {
      const tenantId = createTestTenantId('agent-data-components-get-for-agent');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, dataComponentId, agentId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentDataComponentRelation({
        tenantId,
        subAgentId,
        dataComponentId,
        agentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components/agent/${subAgentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(dataComponentId);
    });

    it('should return empty array when no data components associated', async () => {
      const tenantId = createTestTenantId('agent-data-components-get-empty');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, agentId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components/agent/${subAgentId}`
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
      const { subAgentId, dataComponentId, agentId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentDataComponentRelation({
        tenantId,
        subAgentId,
        dataComponentId,
        agentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components/component/${dataComponentId}/agents`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        subAgentId: subAgentId,
      });
    });

    it('should return empty array when no agents use the data component', async () => {
      const tenantId = createTestTenantId('agent-data-components-get-agents-empty');
      await ensureTestProject(tenantId, projectId);
      const { dataComponentId, agentId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components/component/${dataComponentId}/agents`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(0);
    });
  });

  describe('GET /agent/:subAgentId/component/:dataComponentId/exists', () => {
    it('should return true when association exists', async () => {
      const tenantId = createTestTenantId('agent-data-components-check-exists-true');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, dataComponentId, agentId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentDataComponentRelation({
        tenantId,
        subAgentId,
        dataComponentId,
        agentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components/agent/${subAgentId}/component/${dataComponentId}/exists`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.exists).toBe(true);
    });

    it('should return false when association does not exist', async () => {
      const tenantId = createTestTenantId('agent-data-components-check-exists-false');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, dataComponentId, agentId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components/agent/${subAgentId}/component/${dataComponentId}/exists`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.exists).toBe(false);
    });
  });

  describe('DELETE /agent/:subAgentId/component/:dataComponentId', () => {
    it('should remove an existing association', async () => {
      const tenantId = createTestTenantId('agent-data-components-delete-success');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, dataComponentId, agentId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentDataComponentRelation({
        tenantId,
        subAgentId,
        dataComponentId,
        agentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components/agent/${subAgentId}/component/${dataComponentId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.removed).toBe(true);

      // Verify association is removed
      const checkRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components/agent/${subAgentId}/component/${dataComponentId}/exists`
      );
      const checkBody = await checkRes.json();
      expect(checkBody.exists).toBe(false);
    });

    it('should return 404 when removing non-existent association', async () => {
      const tenantId = createTestTenantId('agent-data-components-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, dataComponentId, agentId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components/agent/${subAgentId}/component/${dataComponentId}`,
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

      // Create multiple agents in the same agent
      const { subAgentId: subAgent1Id, agentId } = await createTestAgent({ tenantId, suffix: '1' });
      const { subAgentId: subAgent2Id } = await createTestAgent({ tenantId, suffix: '2', agentId });

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
        subAgentId: subAgent1Id,
        dataComponentId: dc1Id,
        agentId,
      });
      await createTestAgentDataComponentRelation({
        tenantId,
        subAgentId: subAgent1Id,
        dataComponentId: dc2Id,
        agentId,
      });
      await createTestAgentDataComponentRelation({
        tenantId,
        subAgentId: subAgent2Id,
        dataComponentId: dc1Id,
        agentId,
      });

      // Verify agent1 has 2 data components
      const agent1Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components/agent/${subAgent1Id}`
      );
      const agent1Body = await agent1Res.json();
      expect(agent1Body.data).toHaveLength(2);

      // Verify agent2 has 1 data component
      const agent2Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components/agent/${subAgent2Id}`
      );
      const agent2Body = await agent2Res.json();
      expect(agent2Body.data).toHaveLength(1);

      // Verify dc1 is used by 2 agents
      const dc1Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components/component/${dc1Id}/agents`
      );
      const dc1Body = await dc1Res.json();
      expect(dc1Body.data).toHaveLength(2);

      // Verify dc2 is used by 1 agent
      const dc2Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-data-components/component/${dc2Id}/agents`
      );
      const dc2Body = await dc2Res.json();
      expect(dc2Body.data).toHaveLength(1);
    });
  });
});
