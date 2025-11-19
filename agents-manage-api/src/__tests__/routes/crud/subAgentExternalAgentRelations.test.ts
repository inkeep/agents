import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestExternalAgentData, createTestSubAgentData } from '../../utils/testSubAgent';
import { createTestTenantId } from '../../utils/testTenant';

describe('Sub Agent External Agent Relations CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create an agent
  const createTestAgent = async ({
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

  // Helper function to create an external agent
  const createTestExternalAgent = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    const externalAgentData = createTestExternalAgentData({ suffix });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/external-agents`,
      {
        method: 'POST',
        body: JSON.stringify(externalAgentData),
      }
    );
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    return { externalAgentData, externalAgentId: createBody.data.id };
  };

  // Helper function to create a sub-agent external agent relation
  const createTestRelation = async ({
    tenantId,
    agentId,
    subAgentId,
    externalAgentId,
    headers = {},
  }: {
    tenantId: string;
    agentId: string;
    subAgentId: string;
    externalAgentId: string;
    headers?: Record<string, string>;
  }) => {
    const relationData = {
      externalAgentId,
      headers,
    };

    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations`,
      {
        method: 'POST',
        body: JSON.stringify(relationData),
      }
    );

    const responseText = await createRes.text();
    expect(
      createRes.status,
      `Failed to create sub-agent external agent relation: ${responseText}`
    ).toBe(201);

    const createBody = JSON.parse(responseText);
    return { relationData, relationId: createBody.data.id };
  };

  // Setup function for tests
  const setupTestEnvironment = async (tenantId: string) => {
    // Create an agent first
    const tempAgentData = {
      id: nanoid(),
      name: `Test Agent ${nanoid()}`,
      defaultSubAgentId: null,
      contextConfigId: null,
    };
    const agentRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents`, {
      method: 'POST',
      body: JSON.stringify(tempAgentData),
    });
    expect(agentRes.status).toBe(201);
    const agentBody = await agentRes.json();
    const agentId = agentBody.data.id;

    // Create a sub-agent
    const { subAgentId } = await createTestAgent({
      tenantId,
      agentId,
      suffix: ' Test',
    });

    // Create an external agent (project-scoped)
    const { externalAgentId } = await createTestExternalAgent({
      tenantId,
      suffix: ' External',
    });

    return { subAgentId, externalAgentId, agentId };
  };

  describe('POST /', () => {
    it('should create a new sub-agent external agent relation', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-create-success');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, externalAgentId, agentId } = await setupTestEnvironment(tenantId);

      const relationData = {
        externalAgentId,
        headers: { 'X-API-Key': 'test-key' },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        subAgentId,
        externalAgentId,
        tenantId,
        agentId,
      });
      expect(body.data.headers).toEqual({ 'X-API-Key': 'test-key' });
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-create-validation');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, agentId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should create relation without headers', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-no-headers');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, externalAgentId, agentId } = await setupTestEnvironment(tenantId);

      const relationData = {
        externalAgentId,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        subAgentId,
        externalAgentId,
      });
    });

    it('should prevent duplicate relations', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-duplicate');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, externalAgentId, agentId } = await setupTestEnvironment(tenantId);

      const relationData = {
        externalAgentId,
        headers: { 'X-API-Key': 'test-key' },
      };

      // Create first relation
      const firstRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );
      expect(firstRes.status).toBe(201);

      // Attempt to create duplicate
      const secondRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );
      expect(secondRes.status).toBe(422);
    });
  });

  describe('GET /', () => {
    it('should list sub-agent external agent relations with pagination (empty initially)', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-list-empty');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, agentId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });

    it('should list sub-agent external agent relations with pagination (single item)', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-list-single');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, externalAgentId, agentId } = await setupTestEnvironment(tenantId);

      await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        externalAgentId,
        headers: { 'X-Test': 'value' },
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        subAgentId,
        externalAgentId,
      });
    });

    it('should list multiple relations for same sub-agent', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-list-multiple');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, externalAgentId, agentId } = await setupTestEnvironment(tenantId);

      // Create another external agent
      const { externalAgentId: externalAgentId2 } = await createTestExternalAgent({
        tenantId,
        suffix: ' External 2',
      });

      // Create relations to both external agents
      await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        externalAgentId,
      });
      await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        externalAgentId: externalAgentId2,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });
  });

  describe('GET /{id}', () => {
    it('should get a sub-agent external agent relation by id', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-get-by-id');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, externalAgentId, agentId } = await setupTestEnvironment(tenantId);

      const { relationId } = await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        externalAgentId,
        headers: { 'X-Custom': 'header' },
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations/${relationId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: relationId,
        subAgentId,
        externalAgentId,
      });
      expect(body.data.headers).toEqual({ 'X-Custom': 'header' });
    });

    it('should return 404 when relation not found', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-get-not-found');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, agentId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /{id}', () => {
    it('should update an existing sub-agent external agent relation', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-update-success');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, externalAgentId, agentId } = await setupTestEnvironment(tenantId);

      const { relationId } = await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        externalAgentId,
        headers: { 'X-Original': 'value' },
      });

      const updateData = {
        headers: { 'X-Updated': 'new-value' },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations/${relationId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: relationId,
        subAgentId,
        externalAgentId,
      });
      expect(body.data.headers).toEqual({ 'X-Updated': 'new-value' });
    });

    it('should allow updating to remove headers', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-update-remove-headers');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, externalAgentId, agentId } = await setupTestEnvironment(tenantId);

      const { relationId } = await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        externalAgentId,
        headers: { 'X-Original': 'value' },
      });

      const updateData = {
        headers: null,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations/${relationId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.headers).toBeNull();
    });

    it('should return 404 when updating non-existent relation', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-update-not-found');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, agentId } = await setupTestEnvironment(tenantId);

      const updateData = { headers: { 'X-Test': 'value' } };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations/non-existent-id`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete an existing sub-agent external agent relation', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-delete-success');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, externalAgentId, agentId } = await setupTestEnvironment(tenantId);

      const { relationId } = await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        externalAgentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations/${relationId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(204);

      // Verify it's deleted
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations/${relationId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent relation', async () => {
      const tenantId = createTestTenantId('sub-agent-ext-relations-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const { subAgentId, agentId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/external-agent-relations/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });
});
