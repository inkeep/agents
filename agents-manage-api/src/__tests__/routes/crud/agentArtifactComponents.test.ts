import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestSubAgentData } from '../../utils/testSubAgent';
import { createTestTenantId } from '../../utils/testTenant';

describe('Agent Artifact Component CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create a sub-agent (needed for sub-agent artifact component relations)
  const createTestAgent = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    // First create a default graph if it doesn't exist (without defaultSubAgentId)
    const graphId = nanoid();
    const graphData = {
      id: graphId,
      name: 'Test Graph',
      defaultSubAgentId: null,
    };
    // Try to create the graph, ignore if it already exists
    const graphRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent-graphs`, {
      method: 'POST',
      body: JSON.stringify(graphData),
    });

    if (graphRes.status !== 201 && graphRes.status !== 409) {
      const errorText = await graphRes.clone().text();
      console.error('Failed to create graph:', graphRes.status, errorText);
      throw new Error(`Failed to create graph: ${graphRes.status} - ${errorText}`);
    }

    // Use the graphId from the created or existing graph (409 means it already exists)
    const effectiveGraphId = graphId;

    const subAgentData = { ...createTestSubAgentData({ suffix, tenantId, projectId }) };
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/graphs/${effectiveGraphId}/agents`,
      {
        method: 'POST',
        body: JSON.stringify(subAgentData),
      }
    );

    if (createRes.status !== 201) {
      const errorText = await createRes.clone().text();
      console.error(
        'Failed to create sub-agent:',
        createRes.status,
        errorText,
        'with data:',
        subAgentData
      );
    }

    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    return { subAgentData, subAgentId: createBody.data.id, graphId: effectiveGraphId };
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
    props: {
      type: 'object',
      properties: {
        title: { type: 'string', description: `Title field${suffix}`, inPreview: true },
        type: { type: 'string', description: `Type field${suffix}`, inPreview: true },
        content: { type: 'string', description: `Content field${suffix}`, inPreview: false },
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
      `/tenants/${tenantId}/projects/${projectId}/artifact-components`,
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
    subAgentId,
    artifactComponentId,
    graphId = 'default',
  }: {
    subAgentId: string;
    artifactComponentId: string;
    graphId?: string;
  }) => ({
    subAgentId: subAgentId,
    artifactComponentId,
    graphId,
    // tenantId and projectId are extracted from URL path, not body
  });

  // Helper function to create an agent artifact component relation
  const createTestAgentArtifactComponentRelation = async ({
    tenantId,
    subAgentId,
    artifactComponentId,
    graphId = 'default',
  }: {
    tenantId: string;
    subAgentId: string;
    artifactComponentId: string;
    graphId?: string;
  }) => {
    const relationData = createAgentArtifactComponentData({
      subAgentId: subAgentId,
      artifactComponentId,
      graphId,
    });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components`,
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
    const { subAgentId, graphId } = await createTestAgent({ tenantId });
    const { artifactComponentId } = await createTestArtifactComponent({ tenantId });
    return { subAgentId, artifactComponentId, graphId };
  };

  describe('POST /', () => {
    it('should create a new agent artifact component association', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-create-success');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, artifactComponentId, graphId } = await setupTestEnvironment(tenantId);

      const relationData = createAgentArtifactComponentData({
        subAgentId,
        artifactComponentId,
        graphId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        subAgentId,
        artifactComponentId,
      });
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-create-validation');
      await ensureTestProject(tenantId, projectId);
      const { graphId } = await createTestAgent({ tenantId });
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components`,
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
      const { subAgentId, artifactComponentId, graphId } = await setupTestEnvironment(tenantId);

      const relationData = createAgentArtifactComponentData({
        subAgentId,
        artifactComponentId,
        graphId,
      });

      // Create first association
      const firstRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );
      expect(firstRes.status).toBe(201);

      // Try to create duplicate association
      const secondRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components`,
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
      const { graphId } = await createTestAgent({ tenantId });
      const nonExistentSubAgentId = nanoid();

      const relationData = createAgentArtifactComponentData({
        subAgentId: nonExistentSubAgentId,
        artifactComponentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components`,
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
      const { subAgentId, graphId } = await createTestAgent({ tenantId });
      const nonExistentArtifactComponentId = nanoid();

      const relationData = createAgentArtifactComponentData({
        subAgentId,
        artifactComponentId: nonExistentArtifactComponentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('GET /agent/:subAgentId', () => {
    it('should return empty list for agent with no artifact components', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-get-empty');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, graphId } = await createTestAgent({ tenantId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toEqual([]);
    });

    it('should return artifact components for agent', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-get-success');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, artifactComponentId, graphId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentArtifactComponentRelation({
        tenantId,
        subAgentId,
        artifactComponentId,
        graphId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: artifactComponentId,
        name: expect.stringContaining('TestArtifactComponent'),
        description: expect.stringContaining('Test artifact component description'),
        props: expect.any(Object),
      });
    });

    it('should return multiple artifact components for agent', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-get-multiple');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, graphId } = await createTestAgent({ tenantId });

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
        subAgentId,
        artifactComponentId: ac1Id,
        graphId,
      });
      await createTestAgentArtifactComponentRelation({
        tenantId,
        subAgentId,
        artifactComponentId: ac2Id,
        graphId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}`
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
      const { graphId } = await createTestAgent({ tenantId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/component/${artifactComponentId}/agents`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toEqual([]);
    });

    it('should return agents using artifact component', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-get-agents-success');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, artifactComponentId, graphId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentArtifactComponentRelation({
        tenantId,
        subAgentId,
        artifactComponentId,
        graphId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/component/${artifactComponentId}/agents`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        subAgentId,
        createdAt: expect.any(String),
      });
    });

    it('should return multiple agents using artifact component', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-get-agents-multiple');
      await ensureTestProject(tenantId, projectId);
      const { artifactComponentId } = await createTestArtifactComponent({ tenantId });

      // Create multiple agents
      const { subAgentId: subAgent1Id, graphId: graph1Id } = await createTestAgent({
        tenantId,
        suffix: ' 1',
      });
      const { subAgentId: subAgent2Id, graphId: graph2Id } = await createTestAgent({
        tenantId,
        suffix: ' 2',
      });

      // Associate both agents with the artifact component
      await createTestAgentArtifactComponentRelation({
        tenantId,
        subAgentId: subAgent1Id,
        artifactComponentId,
        graphId: graph1Id,
      });
      await createTestAgentArtifactComponentRelation({
        tenantId,
        subAgentId: subAgent2Id,
        artifactComponentId,
        graphId: graph2Id,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graph1Id}/agent-artifact-components/component/${artifactComponentId}/agents`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data.map((a: any) => a.subAgentId)).toContain(subAgent1Id);
      expect(body.data.map((a: any) => a.subAgentId)).toContain(subAgent2Id);
    });
  });

  describe('GET /agent/:subAgentId/component/:artifactComponentId/exists', () => {
    it('should return false for non-existent association', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-exists-false');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, artifactComponentId, graphId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}/component/${artifactComponentId}/exists`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.exists).toBe(false);
    });

    it('should return true for existing association', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-exists-true');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, artifactComponentId, graphId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentArtifactComponentRelation({
        tenantId,
        subAgentId,
        artifactComponentId,
        graphId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}/component/${artifactComponentId}/exists`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.exists).toBe(true);
    });
  });

  describe('DELETE /agent/:subAgentId/component/:artifactComponentId', () => {
    it('should remove existing association', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-delete-success');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, artifactComponentId, graphId } = await setupTestEnvironment(tenantId);

      // Create association
      await createTestAgentArtifactComponentRelation({
        tenantId,
        subAgentId,
        artifactComponentId,
        graphId,
      });

      // Verify association exists
      const existsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}/component/${artifactComponentId}/exists`
      );
      expect(existsRes.status).toBe(200);
      const existsBody = await existsRes.json();
      expect(existsBody.exists).toBe(true);

      // Remove association
      const deleteRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}/component/${artifactComponentId}`,
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
      const verifyRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}/component/${artifactComponentId}/exists`
      );
      expect(verifyRes.status).toBe(200);
      const verifyBody = await verifyRes.json();
      expect(verifyBody.exists).toBe(false);
    });

    it('should return 404 for non-existent association', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, artifactComponentId, graphId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}/component/${artifactComponentId}`,
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
      const { graphId } = await createTestAgent({ tenantId });
      const nonExistentSubAgentId = nanoid();

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${nonExistentSubAgentId}/component/${artifactComponentId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent artifact component', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-delete-component-not-found');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, graphId } = await createTestAgent({ tenantId });
      const nonExistentArtifactComponentId = nanoid();

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}/component/${nonExistentArtifactComponentId}`,
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
      const { subAgentId, artifactComponentId, graphId } = await setupTestEnvironment(tenantId);

      // 1. Verify no association exists initially
      const initialExistsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}/component/${artifactComponentId}/exists`
      );
      expect(initialExistsRes.status).toBe(200);
      const initialExistsBody = await initialExistsRes.json();
      expect(initialExistsBody.exists).toBe(false);

      // 2. Create association
      const _ = await createTestAgentArtifactComponentRelation({
        tenantId,
        subAgentId,
        artifactComponentId,
        graphId,
      });

      // 3. Verify association exists
      const existsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}/component/${artifactComponentId}/exists`
      );
      expect(existsRes.status).toBe(200);
      const existsBody = await existsRes.json();
      expect(existsBody.exists).toBe(true);

      // 4. Get artifact components for agent
      const subAgentArtifactComponentsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}`
      );
      expect(subAgentArtifactComponentsRes.status).toBe(200);
      const subAgentArtifactComponentsBody = await subAgentArtifactComponentsRes.json();
      expect(subAgentArtifactComponentsBody.data).toHaveLength(1);
      expect(subAgentArtifactComponentsBody.data[0].id).toBe(artifactComponentId);

      // 5. Get agents using artifact component
      const artifactComponentAgentsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/component/${artifactComponentId}/agents`
      );
      expect(artifactComponentAgentsRes.status).toBe(200);
      const artifactComponentAgentsBody = await artifactComponentAgentsRes.json();
      expect(artifactComponentAgentsBody.data).toHaveLength(1);
      expect(artifactComponentAgentsBody.data[0].subAgentId).toBe(subAgentId);

      // 6. Remove association
      const deleteRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}/component/${artifactComponentId}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(200);

      // 7. Verify association no longer exists
      const finalExistsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}/component/${artifactComponentId}/exists`
      );
      expect(finalExistsRes.status).toBe(200);
      const finalExistsBody = await finalExistsRes.json();
      expect(finalExistsBody.exists).toBe(false);

      // 8. Verify empty lists
      const finalAgentArtifactComponentsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/agent/${subAgentId}`
      );
      expect(finalAgentArtifactComponentsRes.status).toBe(200);
      const finalAgentArtifactComponentsBody = await finalAgentArtifactComponentsRes.json();
      expect(finalAgentArtifactComponentsBody.data).toHaveLength(0);

      const finalArtifactComponentAgentsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/agent-artifact-components/component/${artifactComponentId}/agents`
      );
      expect(finalArtifactComponentAgentsRes.status).toBe(200);
      const finalArtifactComponentAgentsBody = await finalArtifactComponentAgentsRes.json();
      expect(finalArtifactComponentAgentsBody.data).toHaveLength(0);
    });

    it('should handle multiple associations correctly', async () => {
      const tenantId = createTestTenantId('agent-artifact-components-multiple-e2e');
      await ensureTestProject(tenantId, projectId);

      // Create multiple agents and artifact components
      const { subAgentId: subAgent1Id, graphId: graph1Id } = await createTestAgent({
        tenantId,
        suffix: ' 1',
      });
      const { subAgentId: subAgent2Id, graphId: graph2Id } = await createTestAgent({
        tenantId,
        suffix: ' 2',
      });
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
        subAgentId: subAgent1Id,
        artifactComponentId: ac1Id,
        graphId: graph1Id,
      });
      // Agent 1 -> Artifact Component 2
      await createTestAgentArtifactComponentRelation({
        tenantId,
        subAgentId: subAgent1Id,
        artifactComponentId: ac2Id,
        graphId: graph1Id,
      });
      // Agent 2 -> Artifact Component 1
      await createTestAgentArtifactComponentRelation({
        tenantId,
        subAgentId: subAgent2Id,
        artifactComponentId: ac1Id,
        graphId: graph2Id,
      });

      // Verify Agent 1 has 2 artifact components
      const agent1ArtifactComponentsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graph1Id}/agent-artifact-components/agent/${subAgent1Id}`
      );
      expect(agent1ArtifactComponentsRes.status).toBe(200);
      const agent1ArtifactComponentsBody = await agent1ArtifactComponentsRes.json();
      expect(agent1ArtifactComponentsBody.data).toHaveLength(2);

      // Verify Agent 2 has 1 artifact component
      const agent2ArtifactComponentsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graph2Id}/agent-artifact-components/agent/${subAgent2Id}`
      );
      expect(agent2ArtifactComponentsRes.status).toBe(200);
      const agent2ArtifactComponentsBody = await agent2ArtifactComponentsRes.json();
      expect(agent2ArtifactComponentsBody.data).toHaveLength(1);

      // Verify Artifact Component 1 has 2 agents
      const ac1AgentsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graph1Id}/agent-artifact-components/component/${ac1Id}/agents`
      );
      expect(ac1AgentsRes.status).toBe(200);
      const ac1AgentsBody = await ac1AgentsRes.json();
      expect(ac1AgentsBody.data).toHaveLength(2);

      // Verify Artifact Component 2 has 1 agent
      const ac2AgentsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${graph1Id}/agent-artifact-components/component/${ac2Id}/agents`
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
      const {
        subAgentId: subAgent1Id,
        artifactComponentId: ac1Id,
        graphId: graph1Id,
      } = await setupTestEnvironment(tenantId1);
      await createTestAgentArtifactComponentRelation({
        tenantId: tenantId1,
        subAgentId: subAgent1Id,
        artifactComponentId: ac1Id,
        graphId: graph1Id,
      });

      // Create agent and artifact component in tenant 2
      const {
        subAgentId: subAgent2Id,
        artifactComponentId: ac2Id,
        graphId: graph2Id,
      } = await setupTestEnvironment(tenantId2);

      // Try to query from tenant 2 - should not see tenant 1's associations
      const res = await makeRequest(
        `/tenants/${tenantId2}/projects/${projectId}/graphs/${graph2Id}/agent-artifact-components/agent/${subAgent2Id}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);

      // Try to query artifact component from tenant 2 - should not see tenant 1's associations
      const acRes = await makeRequest(
        `/tenants/${tenantId2}/projects/${projectId}/graphs/${graph2Id}/agent-artifact-components/component/${ac2Id}/agents`
      );
      expect(acRes.status).toBe(200);
      const acBody = await acRes.json();
      expect(acBody.data).toHaveLength(0);
    });
  });
});
