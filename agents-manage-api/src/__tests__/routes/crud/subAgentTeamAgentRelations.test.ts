import { createTestProject } from '@inkeep/agents-core/db/test-client';
import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import dbClient from '../../../data/db/dbClient';
import { makeRequest } from '../../utils/testRequest';
import { createTestSubAgentData } from '../../utils/testSubAgent';
import { createTestTenantWithOrg } from '../../utils/testTenant';

describe('Sub Agent Team Agent Relations CRUD Routes - Integration Tests', () => {
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

  // Helper function to create a team agent (another agent in the same project)
  const createTestTeamAgent = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    const teamAgentData = {
      id: nanoid(),
      name: `Test Team Agent ${nanoid()}${suffix}`,
      defaultSubAgentId: null,
      contextConfigId: null,
    };
    const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents`, {
      method: 'POST',
      body: JSON.stringify(teamAgentData),
    });
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    return { teamAgentData, targetAgentId: createBody.data.id };
  };

  // Helper function to create a sub-agent team agent relation
  const createTestRelation = async ({
    tenantId,
    agentId,
    subAgentId,
    targetAgentId,
    headers = {},
  }: {
    tenantId: string;
    agentId: string;
    subAgentId: string;
    targetAgentId: string;
    headers?: Record<string, string>;
  }) => {
    const relationData = {
      targetAgentId,
      headers,
    };

    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations`,
      {
        method: 'POST',
        body: JSON.stringify(relationData),
      }
    );

    const responseText = await createRes.text();
    expect(
      createRes.status,
      `Failed to create sub-agent team agent relation: ${responseText}`
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

    // Create a team agent (another agent in the same project)
    const { targetAgentId } = await createTestTeamAgent({
      tenantId,
      suffix: ' Team',
    });

    return { subAgentId, targetAgentId, agentId };
  };

  describe('POST /', () => {
    it('should create a new sub-agent team agent relation', async () => {
      const tenantId = await createTestTenantWithOrg('sub-agent-team-relations-create-success');
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, targetAgentId, agentId } = await setupTestEnvironment(tenantId);

      const relationData = {
        targetAgentId,
        headers: { 'X-API-Key': 'test-key' },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        subAgentId,
        targetAgentId,
        tenantId,
        agentId,
      });
      expect(body.data.headers).toEqual({ 'X-API-Key': 'test-key' });
    });

    it('should validate required fields', async () => {
      const tenantId = await createTestTenantWithOrg('sub-agent-team-relations-create-validation');
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, agentId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should create relation without headers', async () => {
      const tenantId = await createTestTenantWithOrg('sub-agent-team-relations-no-headers');
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, targetAgentId, agentId } = await setupTestEnvironment(tenantId);

      const relationData = {
        targetAgentId,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        subAgentId,
        targetAgentId,
      });
    });

    it('should prevent duplicate relations', async () => {
      const tenantId = await createTestTenantWithOrg('sub-agent-team-relations-duplicate');
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, targetAgentId, agentId } = await setupTestEnvironment(tenantId);

      const relationData = {
        targetAgentId,
        headers: { 'X-API-Key': 'test-key' },
      };

      // Create first relation
      const firstRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );
      expect(firstRes.status).toBe(201);

      // Attempt to create duplicate
      const secondRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );
      expect(secondRes.status).toBe(422);
    });
  });

  describe('GET /', () => {
    it('should list sub-agent team agent relations with pagination (empty initially)', async () => {
      const tenantId = await createTestTenantWithOrg('sub-agent-team-relations-list-empty');
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, agentId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });

    it('should list sub-agent team agent relations with pagination (single item)', async () => {
      const tenantId = await createTestTenantWithOrg('sub-agent-team-relations-list-single');
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, targetAgentId, agentId } = await setupTestEnvironment(tenantId);

      await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        targetAgentId,
        headers: { 'X-Test': 'value' },
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        subAgentId,
        targetAgentId,
      });
    });

    it('should list multiple relations for same sub-agent', async () => {
      const tenantId = await createTestTenantWithOrg('sub-agent-team-relations-list-multiple');
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, targetAgentId, agentId } = await setupTestEnvironment(tenantId);

      // Create another team agent
      const { targetAgentId: targetAgentId2 } = await createTestTeamAgent({
        tenantId,
        suffix: ' Team 2',
      });

      // Create relations to both team agents
      await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        targetAgentId,
      });
      await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        targetAgentId: targetAgentId2,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });
  });

  describe('GET /{id}', () => {
    it('should get a sub-agent team agent relation by id', async () => {
      const tenantId = await createTestTenantWithOrg('sub-agent-team-relations-get-by-id');
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, targetAgentId, agentId } = await setupTestEnvironment(tenantId);

      const { relationId } = await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        targetAgentId,
        headers: { 'X-Custom': 'header' },
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations/${relationId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: relationId,
        subAgentId,
        targetAgentId,
      });
      expect(body.data.headers).toEqual({ 'X-Custom': 'header' });
    });

    it('should return 404 when relation not found', async () => {
      const tenantId = await createTestTenantWithOrg('sub-agent-team-relations-get-not-found');
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, agentId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /{id}', () => {
    it('should update an existing sub-agent team agent relation', async () => {
      const tenantId = await createTestTenantWithOrg('sub-agent-team-relations-update-success');
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, targetAgentId, agentId } = await setupTestEnvironment(tenantId);

      const { relationId } = await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        targetAgentId,
        headers: { 'X-Original': 'value' },
      });

      const updateData = {
        headers: { 'X-Updated': 'new-value' },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations/${relationId}`,
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
        targetAgentId,
      });
      expect(body.data.headers).toEqual({ 'X-Updated': 'new-value' });
    });

    it('should allow updating to remove headers', async () => {
      const tenantId = await createTestTenantWithOrg(
        'sub-agent-team-relations-update-remove-headers'
      );
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, targetAgentId, agentId } = await setupTestEnvironment(tenantId);

      const { relationId } = await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        targetAgentId,
        headers: { 'X-Original': 'value' },
      });

      const updateData = {
        headers: null,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations/${relationId}`,
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
      const tenantId = await createTestTenantWithOrg('sub-agent-team-relations-update-not-found');
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, agentId } = await setupTestEnvironment(tenantId);

      const updateData = { headers: { 'X-Test': 'value' } };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations/non-existent-id`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete an existing sub-agent team agent relation', async () => {
      const tenantId = await createTestTenantWithOrg('sub-agent-team-relations-delete-success');
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, targetAgentId, agentId } = await setupTestEnvironment(tenantId);

      const { relationId } = await createTestRelation({
        tenantId,
        agentId,
        subAgentId,
        targetAgentId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations/${relationId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(204);

      // Verify it's deleted
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations/${relationId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent relation', async () => {
      const tenantId = await createTestTenantWithOrg('sub-agent-team-relations-delete-not-found');
      await createTestProject(dbClient, tenantId, projectId);
      const { subAgentId, agentId } = await setupTestEnvironment(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/team-agent-relations/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });
});
