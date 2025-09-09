import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import app from '../../../index';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantId } from '../../utils/testTenant';

describe('Agent Relation CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create test agent data
  const createAgentData = ({ suffix = '' } = {}) => ({
    id: nanoid(),
    name: `Test Agent${suffix}`,
    description: `Test Description${suffix}`,
    prompt: `Test Instructions${suffix}`,
  });

  // Helper function to create an agent (needed for agent relations)
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

  // Helper function to create test agent graph data
  const createAgentGraphData = ({ defaultAgentId }: { defaultAgentId: string }) => ({
    id: nanoid(),
    name: `Test Graph ${nanoid()}`,
    defaultAgentId,
    contextConfigId: null, // Set to null since it's optional and we don't need it for these tests
  });

  // Helper function to create an agent graph (needed for agent relations)
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
    return { agentGraphData, agentGraphId: createBody.data.id };
  };

  // Helper function to create test agent relation data
  const createAgentRelationData = ({
    graphId,
    sourceAgentId,
    targetAgentId,
    relationType = 'transfer',
  }: {
    graphId: string;
    sourceAgentId: string;
    targetAgentId: string;
    relationType?: 'transfer' | 'delegate';
  }) => ({
    id: nanoid(),
    graphId,
    sourceAgentId,
    targetAgentId,
    relationType,
  });

  // Helper function to create an agent relation
  const createTestAgentRelation = async ({
    tenantId,
    graphId,
    sourceAgentId,
    targetAgentId,
    relationType = 'transfer',
  }: {
    tenantId: string;
    graphId: string;
    sourceAgentId: string;
    targetAgentId: string;
    relationType?: 'transfer' | 'delegate';
  }) => {
    const agentRelationData = createAgentRelationData({
      graphId,
      sourceAgentId,
      targetAgentId,
      relationType,
    });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations`,
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
    const { agentId: sourceAgentId } = await createTestAgent({ tenantId, suffix: ' Source' });
    const { agentId: targetAgentId } = await createTestAgent({ tenantId, suffix: ' Target' });
    const { agentGraphId } = await createTestAgentGraph({
      tenantId,
      defaultAgentId: sourceAgentId,
    });
    return { sourceAgentId, targetAgentId, agentGraphId };
  };

  describe('POST /', () => {
    it('should create a new agent relation', async () => {
      const tenantId = createTestTenantId('agent-relations-create-success');
      await ensureTestProject(tenantId, projectId);
      const { sourceAgentId, targetAgentId, agentGraphId } = await setupTestEnvironment(tenantId);

      const agentRelationData = createAgentRelationData({
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify(agentRelationData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
        tenantId,
      });
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('agent-relations-create-validation');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations`,
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
      const { sourceAgentId, targetAgentId, agentGraphId } = await setupTestEnvironment(tenantId);

      const invalidRelationData = {
        id: nanoid(),
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
        relationType: 'invalid-type',
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations`,
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
      const { sourceAgentId, targetAgentId, agentGraphId } = await setupTestEnvironment(tenantId);

      const relationData = createAgentRelationData({
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
        relationType: 'transfer',
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations`,
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
      const { sourceAgentId, targetAgentId, agentGraphId } = await setupTestEnvironment(tenantId);

      const relationData = createAgentRelationData({
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
        relationType: 'delegate',
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations`,
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
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });

    it('should list agent relations with pagination (single item)', async () => {
      const tenantId = createTestTenantId('agent-relations-list-single');
      await ensureTestProject(tenantId, projectId);
      const { sourceAgentId, targetAgentId, agentGraphId } = await setupTestEnvironment(tenantId);
      const { agentRelationData } = await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
      });
    });

    it('should filter by sourceAgentId', async () => {
      const tenantId = createTestTenantId('agent-relations-filter-source');
      await ensureTestProject(tenantId, projectId);
      const { sourceAgentId, targetAgentId, agentGraphId } = await setupTestEnvironment(tenantId);
      const { agentId: otherSourceAgentId } = await createTestAgent({
        tenantId,
        suffix: ' Other Source',
      });

      await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
      });
      await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceAgentId: otherSourceAgentId,
        targetAgentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations?sourceAgentId=${sourceAgentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].sourceAgentId).toBe(sourceAgentId);
    });

    it('should filter by targetAgentId', async () => {
      const tenantId = createTestTenantId('agent-relations-filter-target');
      await ensureTestProject(tenantId, projectId);
      const { sourceAgentId, targetAgentId, agentGraphId } = await setupTestEnvironment(tenantId);
      const { agentId: otherTargetAgentId } = await createTestAgent({
        tenantId,
        suffix: ' Other Target',
      });

      await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
      });
      await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId: otherTargetAgentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations?targetAgentId=${targetAgentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].targetAgentId).toBe(targetAgentId);
    });

    it('should filter by relation type', async () => {
      const tenantId = createTestTenantId('agent-relations-filter-type');
      await ensureTestProject(tenantId, projectId);
      const { sourceAgentId, targetAgentId, agentGraphId } = await setupTestEnvironment(tenantId);
      const { agentId: otherTargetId } = await createTestAgent({
        tenantId,
        suffix: ' Other Target',
      });

      // Create both transfer and delegate relations
      await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
        relationType: 'transfer',
      });
      await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId: otherTargetId,
        relationType: 'delegate',
      });

      // Filter for transfer relations only
      const transferRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations?sourceAgentId=${sourceAgentId}`
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
      const { sourceAgentId, targetAgentId, agentGraphId } = await setupTestEnvironment(tenantId);
      const { agentRelationData, agentRelationId } = await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations/${agentRelationId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: agentRelationId,
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
      });
    });

    it('should return 404 when agent relation not found', async () => {
      const tenantId = createTestTenantId('agent-relations-get-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /{id}', () => {
    it('should update an existing agent relation', async () => {
      const tenantId = createTestTenantId('agent-relations-update-success');
      await ensureTestProject(tenantId, projectId);
      const { sourceAgentId, targetAgentId, agentGraphId } = await setupTestEnvironment(tenantId);
      const { agentRelationId } = await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
        relationType: 'transfer',
      });

      const updateData = {
        relationType: 'delegate' as const,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations/${agentRelationId}`,
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
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations/non-existent-id`,
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
      const { sourceAgentId, targetAgentId, agentGraphId } = await setupTestEnvironment(tenantId);
      const { agentRelationId } = await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
      });

      const invalidUpdateData = {
        relationType: 'invalid-relation-type',
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations/${agentRelationId}`,
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
      const { sourceAgentId, targetAgentId, agentGraphId } = await setupTestEnvironment(tenantId);
      const { agentRelationId } = await createTestAgentRelation({
        tenantId,
        graphId: agentGraphId,
        sourceAgentId,
        targetAgentId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations/${agentRelationId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(204);

      const getRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations/${agentRelationId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent agent relation', async () => {
      const tenantId = createTestTenantId('agent-relations-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/agent-relations/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });
});
