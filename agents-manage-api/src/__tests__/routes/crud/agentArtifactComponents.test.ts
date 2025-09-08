import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import app from '../../../index';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantId } from '../../utils/testTenant';
import { ensureTestProject } from '../../utils/testProject';

describe('Agent Artifact Component CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create test agent data
  const createAgentData = ({
    suffix = '',
    tenantId = 'default-tenant',
    projectId = 'default',
  }: {
    suffix?: string;
    tenantId?: string;
    projectId?: string;
  } = {}) => ({
    id: nanoid(),
    tenantId,
    projectId,
    name: `Test Agent${suffix}`,
    description: `Test Description${suffix}`,
    prompt: `Test Instructions${suffix}`,
  });

  // Helper function to create an agent (needed for agent artifact component relations)
  const createTestAgent = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    const agentData = createAgentData({ suffix, tenantId, projectId });
    const createRes = await makeRequest(`/tenants/${tenantId}/crud/projects/${projectId}/agents`, {
      method: 'POST',
      body: JSON.stringify(agentData),
    });
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    return { agentData, agentId: createBody.data.id };
  };

  // Helper function to create test artifact component data
  const createArtifactComponentData = ({
    suffix = '',
    tenantId = 'default-tenant',
    projectId = 'default',
  }: {
    suffix?: string;
    tenantId?: string;
    projectId?: string;
  } = {}) => ({
    id: nanoid(),
    tenantId,
    projectId,
    name: `TestArtifactComponent${suffix}`,
    description: `Test artifact component description${suffix}`,
    summaryProps: {
      type: 'object',
      properties: {
        title: { type: 'string', description: `Title field${suffix}` },
        type: { type: 'string', description: `Type field${suffix}` },
      },
      required: ['title'],
    },
    fullProps: {
      type: 'object',
      properties: {
        title: { type: 'string', description: `Title field${suffix}` },
        type: { type: 'string', description: `Type field${suffix}` },
        content: { type: 'string', description: `Content field${suffix}` },
      },
      required: ['title', 'content'],
    },
  });

  // Helper function to create an artifact component (needed for agent artifact component relations)
  const createTestArtifactComponent = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    const artifactComponentData = createArtifactComponentData({ suffix, tenantId, projectId });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/crud/projects/${projectId}/artifact-components`,
      {
        method: 'POST',
        body: JSON.stringify(artifactComponentData),
      }
    );
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    return { artifactComponentData, artifactComponentId: createBody.data.id };
  };

  // Helper function to create test agent artifact component relation data
  const createAgentArtifactComponentData = ({
    agentId,
    artifactComponentId,
  }: {
    agentId: string;
    artifactComponentId: string;
  }) => ({
    agentId,
    artifactComponentId,
    // tenantId and projectId are extracted from URL path, not body
  });

  // Helper function to create an agent artifact component relation
  const createTestAgentArtifactComponentRelation = async ({
    tenantId,
    agentId,
    artifactComponentId,
  }: {
    tenantId: string;
    agentId: string;
    artifactComponentId: string;
  }) => {
    const relationData = createAgentArtifactComponentData({
      agentId,
      artifactComponentId,
    });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components`,
      {
        method: 'POST',
        body: JSON.stringify(relationData),
      }
    );

    const responseText = await createRes.text();
    expect(
      createRes.status,
      `Failed to create agent artifact component relation: ${responseText}`
    ).toBe(201);

    const createBody = JSON.parse(responseText);
    return { relationData, relationId: createBody.data.id };
  };

  // Setup function for tests
  const setupTestEnvironment = async (tenantId: string) => {
    const { agentId } = await createTestAgent({ tenantId });
    const { artifactComponentId } = await createTestArtifactComponent({ tenantId });
    return { agentId, artifactComponentId };
  };

  describe('POST /', () => {
    it('should create a new agent artifact component association', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-create-success');
      await ensureTestProject(tenantId, projectId);
      const { agentId, artifactComponentId } = await setupTestEnvironment(tenantId);

      const relationData = createAgentArtifactComponentData({
        agentId,
        artifactComponentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        agentId,
        artifactComponentId,
      });
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-create-validation');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should reject duplicate associations', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-create-duplicate');
      await ensureTestProject(tenantId, projectId);
      const { agentId, artifactComponentId } = await setupTestEnvironment(tenantId);

      const relationData = createAgentArtifactComponentData({
        agentId,
        artifactComponentId,
      });

      // Create first association
      const firstRes = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );
      expect(firstRes.status).toBe(201);

      // Try to create duplicate association
      const secondRes = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );
      expect(secondRes.status).toBe(409); // Conflict
    });

    it('should return 404 for non-existent agent', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-create-agent-not-found');
      await ensureTestProject(tenantId, projectId);
      const { artifactComponentId } = await createTestArtifactComponent({ tenantId });
      const nonExistentAgentId = nanoid();

      const relationData = createAgentArtifactComponentData({
        agentId: nonExistentAgentId,
        artifactComponentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent artifact component', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-create-component-not-found');
      await ensureTestProject(tenantId, projectId);
      const { agentId } = await createTestAgent({ tenantId });
      const nonExistentArtifactComponentId = nanoid();

      const relationData = createAgentArtifactComponentData({
        agentId,
        artifactComponentId: nonExistentArtifactComponentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('GET /agent/:agentId', () => {
    it('should return empty list for agent with no artifact components', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-get-empty');
      await ensureTestProject(tenantId, projectId);
      const { agentId } = await createTestAgent({ tenantId });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toEqual([]);
    });

    it('should return artifact components for agent', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-get-success');
      await ensureTestProject(tenantId, projectId);
      const { agentId, artifactComponentId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentArtifactComponentRelation({
        tenantId,
        agentId,
        artifactComponentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: artifactComponentId,
        name: expect.stringContaining('TestArtifactComponent'),
        description: expect.stringContaining('Test artifact component description'),
        summaryProps: expect.any(Object),
        fullProps: expect.any(Object),
      });
    });

    it('should return multiple artifact components for agent', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-get-multiple');
      await ensureTestProject(tenantId, projectId);
      const { agentId } = await createTestAgent({ tenantId });

      // Create multiple artifact components
      const { artifactComponentId: ac1Id } = await createTestArtifactComponent({
        tenantId,
        suffix: ' 1',
      });
      const { artifactComponentId: ac2Id } = await createTestArtifactComponent({
        tenantId,
        suffix: ' 2',
      });

      // Associate both with the agent
      await createTestAgentArtifactComponentRelation({
        tenantId,
        agentId,
        artifactComponentId: ac1Id,
      });
      await createTestAgentArtifactComponentRelation({
        tenantId,
        agentId,
        artifactComponentId: ac2Id,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data.map((ac: any) => ac.id)).toContain(ac1Id);
      expect(body.data.map((ac: any) => ac.id)).toContain(ac2Id);
    });
  });

  describe('GET /component/:artifactComponentId/agents', () => {
    it('should return empty list for artifact component with no agents', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-get-agents-empty');
      await ensureTestProject(tenantId, projectId);
      const { artifactComponentId } = await createTestArtifactComponent({ tenantId });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/component/${artifactComponentId}/agents`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toEqual([]);
    });

    it('should return agents using artifact component', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-get-agents-success');
      await ensureTestProject(tenantId, projectId);
      const { agentId, artifactComponentId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentArtifactComponentRelation({
        tenantId,
        agentId,
        artifactComponentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/component/${artifactComponentId}/agents`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        agentId,
        createdAt: expect.any(String),
      });
    });

    it('should return multiple agents using artifact component', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-get-agents-multiple');
      await ensureTestProject(tenantId, projectId);
      const { artifactComponentId } = await createTestArtifactComponent({ tenantId });

      // Create multiple agents
      const { agentId: agent1Id } = await createTestAgent({ tenantId, suffix: ' 1' });
      const { agentId: agent2Id } = await createTestAgent({ tenantId, suffix: ' 2' });

      // Associate both agents with the artifact component
      await createTestAgentArtifactComponentRelation({
        tenantId,
        agentId: agent1Id,
        artifactComponentId,
      });
      await createTestAgentArtifactComponentRelation({
        tenantId,
        agentId: agent2Id,
        artifactComponentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/component/${artifactComponentId}/agents`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data.map((a: any) => a.agentId)).toContain(agent1Id);
      expect(body.data.map((a: any) => a.agentId)).toContain(agent2Id);
    });
  });

  describe('GET /agent/:agentId/component/:artifactComponentId/exists', () => {
    it('should return false for non-existent association', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-exists-false');
      await ensureTestProject(tenantId, projectId);
      const { agentId, artifactComponentId } = await setupTestEnvironment(tenantId);

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}/component/${artifactComponentId}/exists`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.exists).toBe(false);
    });

    it('should return true for existing association', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-exists-true');
      await ensureTestProject(tenantId, projectId);
      const { agentId, artifactComponentId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentArtifactComponentRelation({
        tenantId,
        agentId,
        artifactComponentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}/component/${artifactComponentId}/exists`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.exists).toBe(true);
    });
  });

  describe('DELETE /agent/:agentId/component/:artifactComponentId', () => {
    it('should remove existing association', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-delete-success');
      await ensureTestProject(tenantId, projectId);
      const { agentId, artifactComponentId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentArtifactComponentRelation({
        tenantId,
        agentId,
        artifactComponentId,
      });

      // Verify association exists
      const existsRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}/component/${artifactComponentId}/exists`
      );
      expect(existsRes.status).toBe(200);
      const existsBody = await existsRes.json();
      expect(existsBody.exists).toBe(true);

      // Remove association
      const deleteRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}/component/${artifactComponentId}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(200);

      const deleteBody = await deleteRes.json();
      expect(deleteBody).toMatchObject({
        message: 'Association removed successfully',
        removed: true,
      });

      // Verify association no longer exists
      const verifyRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}/component/${artifactComponentId}/exists`
      );
      expect(verifyRes.status).toBe(200);
      const verifyBody = await verifyRes.json();
      expect(verifyBody.exists).toBe(false);
    });

    it('should return 404 for non-existent association', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const { agentId, artifactComponentId } = await setupTestEnvironment(tenantId);

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}/component/${artifactComponentId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent agent', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-delete-agent-not-found');
      await ensureTestProject(tenantId, projectId);
      const { artifactComponentId } = await createTestArtifactComponent({ tenantId });
      const nonExistentAgentId = nanoid();

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${nonExistentAgentId}/component/${artifactComponentId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent artifact component', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-delete-component-not-found');
      await ensureTestProject(tenantId, projectId);
      const { agentId } = await createTestAgent({ tenantId });
      const nonExistentArtifactComponentId = nanoid();

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}/component/${nonExistentArtifactComponentId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full agent artifact component association lifecycle', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-e2e');
      await ensureTestProject(tenantId, projectId);
      const { agentId, artifactComponentId } = await setupTestEnvironment(tenantId);

      // 1. Verify no association exists initially
      const initialExistsRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}/component/${artifactComponentId}/exists`
      );
      expect(initialExistsRes.status).toBe(200);
      const initialExistsBody = await initialExistsRes.json();
      expect(initialExistsBody.exists).toBe(false);

      // 2. Create association
      const { relationId } = await createTestAgentArtifactComponentRelation({
        tenantId,
        agentId,
        artifactComponentId,
      });

      // 3. Verify association exists
      const existsRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}/component/${artifactComponentId}/exists`
      );
      expect(existsRes.status).toBe(200);
      const existsBody = await existsRes.json();
      expect(existsBody.exists).toBe(true);

      // 4. Get artifact components for agent
      const agentArtifactComponentsRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}`
      );
      expect(agentArtifactComponentsRes.status).toBe(200);
      const agentArtifactComponentsBody = await agentArtifactComponentsRes.json();
      expect(agentArtifactComponentsBody.data).toHaveLength(1);
      expect(agentArtifactComponentsBody.data[0].id).toBe(artifactComponentId);

      // 5. Get agents using artifact component
      const artifactComponentAgentsRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/component/${artifactComponentId}/agents`
      );
      expect(artifactComponentAgentsRes.status).toBe(200);
      const artifactComponentAgentsBody = await artifactComponentAgentsRes.json();
      expect(artifactComponentAgentsBody.data).toHaveLength(1);
      expect(artifactComponentAgentsBody.data[0].agentId).toBe(agentId);

      // 6. Remove association
      const deleteRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}/component/${artifactComponentId}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(200);

      // 7. Verify association no longer exists
      const finalExistsRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}/component/${artifactComponentId}/exists`
      );
      expect(finalExistsRes.status).toBe(200);
      const finalExistsBody = await finalExistsRes.json();
      expect(finalExistsBody.exists).toBe(false);

      // 8. Verify empty lists
      const finalAgentArtifactComponentsRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agentId}`
      );
      expect(finalAgentArtifactComponentsRes.status).toBe(200);
      const finalAgentArtifactComponentsBody = await finalAgentArtifactComponentsRes.json();
      expect(finalAgentArtifactComponentsBody.data).toHaveLength(0);

      const finalArtifactComponentAgentsRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/component/${artifactComponentId}/agents`
      );
      expect(finalArtifactComponentAgentsRes.status).toBe(200);
      const finalArtifactComponentAgentsBody = await finalArtifactComponentAgentsRes.json();
      expect(finalArtifactComponentAgentsBody.data).toHaveLength(0);
    });

    it('should handle multiple associations correctly', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-multiple-e2e');
      await ensureTestProject(tenantId, projectId);

      // Create multiple agents and artifact components
      const { agentId: agent1Id } = await createTestAgent({ tenantId, suffix: ' 1' });
      const { agentId: agent2Id } = await createTestAgent({ tenantId, suffix: ' 2' });
      const { artifactComponentId: ac1Id } = await createTestArtifactComponent({
        tenantId,
        suffix: ' 1',
      });
      const { artifactComponentId: ac2Id } = await createTestArtifactComponent({
        tenantId,
        suffix: ' 2',
      });

      // Create multiple associations
      // Agent 1 -> Artifact Component 1
      await createTestAgentArtifactComponentRelation({
        tenantId,
        agentId: agent1Id,
        artifactComponentId: ac1Id,
      });
      // Agent 1 -> Artifact Component 2
      await createTestAgentArtifactComponentRelation({
        tenantId,
        agentId: agent1Id,
        artifactComponentId: ac2Id,
      });
      // Agent 2 -> Artifact Component 1
      await createTestAgentArtifactComponentRelation({
        tenantId,
        agentId: agent2Id,
        artifactComponentId: ac1Id,
      });

      // Verify Agent 1 has 2 artifact components
      const agent1ArtifactComponentsRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agent1Id}`
      );
      expect(agent1ArtifactComponentsRes.status).toBe(200);
      const agent1ArtifactComponentsBody = await agent1ArtifactComponentsRes.json();
      expect(agent1ArtifactComponentsBody.data).toHaveLength(2);

      // Verify Agent 2 has 1 artifact component
      const agent2ArtifactComponentsRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/agent/${agent2Id}`
      );
      expect(agent2ArtifactComponentsRes.status).toBe(200);
      const agent2ArtifactComponentsBody = await agent2ArtifactComponentsRes.json();
      expect(agent2ArtifactComponentsBody.data).toHaveLength(1);

      // Verify Artifact Component 1 has 2 agents
      const ac1AgentsRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/component/${ac1Id}/agents`
      );
      expect(ac1AgentsRes.status).toBe(200);
      const ac1AgentsBody = await ac1AgentsRes.json();
      expect(ac1AgentsBody.data).toHaveLength(2);

      // Verify Artifact Component 2 has 1 agent
      const ac2AgentsRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-artifact-components/component/${ac2Id}/agents`
      );
      expect(ac2AgentsRes.status).toBe(200);
      const ac2AgentsBody = await ac2AgentsRes.json();
      expect(ac2AgentsBody.data).toHaveLength(1);
    });
  });

  describe('Tenant Isolation', () => {
    it('should not show associations from other tenants', async () => {
      const tenantId1 = createTestTenantId('agent-artifact-components-tenant1');
      const tenantId2 = createTestTenantId('agent-artifact-components-tenant2');

      await ensureTestProject(tenantId1, projectId);
      await ensureTestProject(tenantId2, projectId);

      // Create associations in tenant 1
      const { agentId: agent1Id, artifactComponentId: ac1Id } =
        await setupTestEnvironment(tenantId1);
      await createTestAgentArtifactComponentRelation({
        tenantId: tenantId1,
        agentId: agent1Id,
        artifactComponentId: ac1Id,
      });

      // Create agent and artifact component in tenant 2
      const { agentId: agent2Id, artifactComponentId: ac2Id } =
        await setupTestEnvironment(tenantId2);

      // Try to query from tenant 2 - should not see tenant 1's associations
      const res = await app.request(
        `/tenants/${tenantId2}/crud/projects/${projectId}/agent-artifact-components/agent/${agent2Id}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);

      // Try to query artifact component from tenant 2 - should not see tenant 1's associations
      const acRes = await app.request(
        `/tenants/${tenantId2}/crud/projects/${projectId}/agent-artifact-components/component/${ac2Id}/agents`
      );
      expect(acRes.status).toBe(200);
      const acBody = await acRes.json();
      expect(acBody.data).toHaveLength(0);
    });
  });
});
