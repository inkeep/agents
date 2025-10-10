import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import app from '../../../index';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestAgentRelationData, createTestSubAgentData } from '../../utils/testSubAgent';
import { createTestTenantId } from '../../utils/testTenant';

describe('Agent Relation CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create an agent (needed for agent relations)
  const createTestAgent = async ({
    tenantId,
    graphId,
    suffix = '',
  }: {
    tenantId: string;
    graphId: string;
    suffix?: string;
  }) => {
    const agentData = createTestSubAgentData({ suffix });
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

  // Helper function to create an agent relation
  const createTestAgentRelation = async ({
    tenantId,
    graphId,
    sourceSubAgentId,
    targetSubAgentId,
    relationType = 'transfer',
  }: {
    tenantId: string;
    graphId: string;
    sourceSubAgentId: string;
    targetSubAgentId: string;
    relationType?: 'transfer' | 'delegate';
  }) => {
    const agentRelationData = createTestAgentRelationData({
      graphId,
      sourceSubAgentId,
      targetSubAgentId,
      relationType,
    });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/graphs/${graphId}/sub-agent-relations`,
      {
        method: 'POST',
        body: JSON.stringify(agentRelationData),
      }
    );

    const responseText = await createRes.text();
    expect(createRes.status, `Failed to create agent relation: ${responseText}`).toBe(201);

    const createBody = JSON.parse(responseText);
    return { agentRelationData, agentRelationId: createBody.data.id };
  };

  // Setup function for tests
  const setupTestEnvironment = async (tenantId: string) => {
    // Create a graph first (without defaultSubAgentId since agents don't exist yet)
    const tempGraphData = {
      id: nanoid(),
      name: `Test Graph ${nanoid()}`,
      defaultSubAgentId: null,
      contextConfigId: null,
    };
    const graphRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agent-graphs`, {
      method: 'POST',
      body: JSON.stringify(tempGraphData),
    });
    expect(graphRes.status).toBe(201);
    const graphBody = await graphRes.json();
    const agentGraphId = graphBody.data.id;

    // Now create agents with the graphId
    const { subAgentId: sourceSubAgentId } = await createTestAgent({
      tenantId,
      graphId: agentGraphId,
      suffix: ' Source',
    });
    const { subAgentId: targetSubAgentId } = await createTestAgent({
      tenantId,
      graphId: agentGraphId,
      suffix: ' Target',
    });

    // Update the graph with a defaultSubAgentId if needed
    const updateRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/agent-graphs/${agentGraphId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ defaultSubAgentId: sourceSubAgentId }),
      }
    );
    expect(updateRes.status).toBe(200);

    return { sourceSubAgentId, targetSubAgentId, agentGraphId };
  };

  describe('POST /', () => {
    it('should create a new agent relation', async () => {
      const tenantId = createTestTenantId('agent-relations-create-success');
      await ensureTestProject(tenantId, projectId);
      const { sourceSubAgentId, targetSubAgentId, agentGraphId } =
        await setupTestEnvironment(tenantId);

      const agentRelationData = createTestAgentRelationData({
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify(agentRelationData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
        tenantId,
      });
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('agent-relations-create-validation');
      await ensureTestProject(tenantId, projectId);
      const { agentGraphId } = await setupTestEnvironment(tenantId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should reject invalid relation types', async () => {
      const tenantId = createTestTenantId('agent-relations-invalid-type');
      await ensureTestProject(tenantId, projectId);
      const { sourceSubAgentId, targetSubAgentId, agentGraphId } =
        await setupTestEnvironment(tenantId);

      const invalidRelationData = {
        id: nanoid(),
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
        relationType: 'invalid-type',
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify(invalidRelationData),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.name).toBe('ZodError');
    });

    it('should create transfer relation type', async () => {
      const tenantId = createTestTenantId('agent-relations-transfer-type');
      await ensureTestProject(tenantId, projectId);
      const { sourceSubAgentId, targetSubAgentId, agentGraphId } =
        await setupTestEnvironment(tenantId);

      const relationData = createTestAgentRelationData({
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
        relationType: 'transfer',
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.relationType).toBe('transfer');
    });

    it('should create delegate relation type', async () => {
      const tenantId = createTestTenantId('agent-relations-delegate-type');
      await ensureTestProject(tenantId, projectId);
      const { sourceSubAgentId, targetSubAgentId, agentGraphId } =
        await setupTestEnvironment(tenantId);

      const relationData = createTestAgentRelationData({
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
        relationType: 'delegate',
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.relationType).toBe('delegate');
    });
  });

  describe('GET /', () => {
    it('should list agent relations with pagination (empty initially)', async () => {
      const tenantId = createTestTenantId('agent-relations-list-empty');
      await ensureTestProject(tenantId, projectId);
      const { agentGraphId } = await setupTestEnvironment(tenantId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });

    it('should list agent relations with pagination (single item)', async () => {
      const tenantId = createTestTenantId('agent-relations-list-single');
      await ensureTestProject(tenantId, projectId);
      const { sourceSubAgentId, targetSubAgentId, agentGraphId } =
        await setupTestEnvironment(tenantId);
      await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
      });
    });

    it('should filter by sourceSubAgentId', async () => {
      const tenantId = createTestTenantId('agent-relations-filter-source');
      await ensureTestProject(tenantId, projectId);
      const { sourceSubAgentId, targetSubAgentId, agentGraphId } =
        await setupTestEnvironment(tenantId);
      const { subAgentId: otherSourceAgentId } = await createTestAgent({
        tenantId,
        graphId: agentGraphId,
        suffix: ' Other Source',
      });

      await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
      });
      await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceSubAgentId: otherSourceAgentId,
        targetSubAgentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations?sourceSubAgentId=${sourceSubAgentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].sourceSubAgentId).toBe(sourceSubAgentId);
    });

    it('should filter by targetSubAgentId', async () => {
      const tenantId = createTestTenantId('agent-relations-filter-target');
      await ensureTestProject(tenantId, projectId);
      const { sourceSubAgentId, targetSubAgentId, agentGraphId } =
        await setupTestEnvironment(tenantId);
      const { subAgentId: otherTargetAgentId } = await createTestAgent({
        tenantId,
        graphId: agentGraphId,
        suffix: ' Other Target',
      });

      await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
      });
      await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId: otherTargetAgentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations?targetSubAgentId=${targetSubAgentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].targetSubAgentId).toBe(targetSubAgentId);
    });

    it('should filter by relation type', async () => {
      const tenantId = createTestTenantId('agent-relations-filter-type');
      await ensureTestProject(tenantId, projectId);
      const { sourceSubAgentId, targetSubAgentId, agentGraphId } =
        await setupTestEnvironment(tenantId);
      const { subAgentId: otherTargetId } = await createTestAgent({
        tenantId,
        graphId: agentGraphId,
        suffix: ' Other Target',
      });

      // Create both transfer and delegate relations
      await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
        relationType: 'transfer',
      });
      await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId: otherTargetId,
        relationType: 'delegate',
      });

      // Filter for transfer relations only
      const transferRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations?sourceSubAgentId=${sourceSubAgentId}`
      );
      expect(transferRes.status).toBe(200);

      const transferBody = await transferRes.json();
      expect(transferBody.data).toHaveLength(2);

      // Check that we have both relation types
      const relationTypes = transferBody.data.map((r: any) => r.relationType);
      expect(relationTypes).toContain('transfer');
      expect(relationTypes).toContain('delegate');
    });
  });

  describe('GET /{id}', () => {
    it('should get an agent relation by id', async () => {
      const tenantId = createTestTenantId('agent-relations-get-by-id');
      await ensureTestProject(tenantId, projectId);
      const { sourceSubAgentId, targetSubAgentId, agentGraphId } =
        await setupTestEnvironment(tenantId);
      const { agentRelationId } = await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations/${agentRelationId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: agentRelationId,
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
      });
    });

    it('should return 404 when agent relation not found', async () => {
      const tenantId = createTestTenantId('agent-relations-get-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/default/sub-agent-relations/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /{id}', () => {
    it('should update an existing agent relation', async () => {
      const tenantId = createTestTenantId('agent-relations-update-success');
      await ensureTestProject(tenantId, projectId);
      const { sourceSubAgentId, targetSubAgentId, agentGraphId } =
        await setupTestEnvironment(tenantId);
      const { agentRelationId } = await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
        relationType: 'transfer',
      });

      const updateData = {
        relationType: 'delegate' as const,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations/${agentRelationId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: agentRelationId,
        relationType: 'delegate',
      });
    });

    it('should return 404 when updating non-existent agent relation', async () => {
      const tenantId = createTestTenantId('agent-relations-update-not-found');
      await ensureTestProject(tenantId, projectId);
      const updateData = { relationType: 'delegate' as const };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/default/sub-agent-relations/non-existent-id`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(404);
    });

    it('should reject invalid relation type in updates', async () => {
      const tenantId = createTestTenantId('agent-relations-update-invalid-type');
      await ensureTestProject(tenantId, projectId);
      const { sourceSubAgentId, targetSubAgentId, agentGraphId } =
        await setupTestEnvironment(tenantId);
      const { agentRelationId } = await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
      });

      const invalidUpdateData = {
        relationType: 'invalid-relation-type',
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations/${agentRelationId}`,
        {
          method: 'PUT',
          body: JSON.stringify(invalidUpdateData),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.name).toBe('ZodError');
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete an existing agent relation', async () => {
      const tenantId = createTestTenantId('agent-relations-delete-success');
      await ensureTestProject(tenantId, projectId);
      const { sourceSubAgentId, targetSubAgentId, agentGraphId } =
        await setupTestEnvironment(tenantId);
      const { agentRelationId } = await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceSubAgentId,
        targetSubAgentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations/${agentRelationId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(204);

      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${agentGraphId}/sub-agent-relations/${agentRelationId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent agent relation', async () => {
      const tenantId = createTestTenantId('agent-relations-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/default/sub-agent-relations/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });
});
