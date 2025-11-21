import { createFullAgentServerSide, extractPublicId, generateId } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-client';
import { describe, expect, it } from 'vitest';
import dbClient from '../../../data/db/dbClient';
import { makeRequest } from '../../utils/testRequest';
import { createTestSubAgentData } from '../../utils/testSubAgent';
import { createTestTenantWithOrg } from '../../utils/testTenant';

describe('API Key CRUD Routes - Integration Tests', () => {
  // Helper function to create full agent data with optional enhanced features
  const createFullAgentData = (agentId: string) => {
    const id = agentId || generateId();

    const agent = createTestSubAgentData();

    const agentData: any = {
      id,
      name: `Test Agent ${id}`,
      description: `Test agent description for ${id}`,
      defaultSubAgentId: agent.id,
      subAgents: {
        [agent.id]: agent, // Agents should be an object keyed by ID
      },
      // Note: tools are now project-scoped and not part of the agent definition
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return agentData;
  };

  // Helper function to create test agent and agent
  const createtestAgentAndAgent = async (
    tenantId: string,
    projectId: string = 'default-project'
  ) => {
    // Ensure the project exists for this tenant before creating the agent
    await createTestProject(dbClient, tenantId, projectId);

    const agentId = `test-agent${generateId(6)}`;
    const agentData = createFullAgentData(agentId);
    await createFullAgentServerSide(dbClient)({ tenantId, projectId }, agentData);
    return { agentId, projectId }; // Return projectId as well
  };

  // Helper function to create a test API key
  const createTestApiKey = async ({
    tenantId,
    projectId = 'default-project',
    agentId,
    expiresAt,
  }: {
    tenantId: string;
    projectId?: string;
    agentId: string;
    expiresAt?: string;
  }) => {
    const createData = {
      agentId: agentId,
      ...(expiresAt && { expiresAt }),
    };

    const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify(createData),
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return {
      createData,
      apiKey: createBody.data.apiKey,
      fullKey: createBody.data.key,
    };
  };

  describe('GET /', () => {
    it('should list API keys with pagination (empty initially)', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-list-empty');
      const projectId = 'default-project';
      await createTestProject(dbClient, tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys?page=1&limit=10`
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

    it('should list API keys with pagination', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-list');
      await createTestProject(dbClient, tenantId, 'default-project');
      const { agentId, projectId } = await createtestAgentAndAgent(tenantId);

      // Create multiple API keys
      const _apiKey1 = await createTestApiKey({ tenantId, projectId, agentId });
      const _apiKey2 = await createTestApiKey({ tenantId, projectId, agentId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        pages: 1,
      });

      // Verify API key structure (should not include keyHash or actual key)
      const firstApiKey = body.data[0];
      expect(firstApiKey).toHaveProperty('id');
      expect(firstApiKey).toHaveProperty('agentId', agentId);
      expect(firstApiKey).toHaveProperty('publicId');
      expect(firstApiKey).toHaveProperty('keyPrefix');
      expect(firstApiKey).toHaveProperty('createdAt');
      expect(firstApiKey).toHaveProperty('updatedAt');
      expect(firstApiKey).not.toHaveProperty('keyHash'); // Should never expose hash
      expect(firstApiKey).not.toHaveProperty('tenantId'); // Should not expose tenantId in API
      expect(firstApiKey).not.toHaveProperty('projectId'); // Should not expose projectId in API
    });

    it('should filter API keys by agentId', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-filter-agent');
      await createTestProject(dbClient, tenantId, 'project-1');
      const { agentId: agent1, projectId } = await createtestAgentAndAgent(tenantId, 'project-1');
      const { agentId: agent2 } = await createtestAgentAndAgent(tenantId, 'project-1');

      // Create API keys for different agent
      await createTestApiKey({ tenantId, projectId, agentId: agent1 });
      await createTestApiKey({ tenantId, projectId, agentId: agent2 });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys?agentId=${agent1}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].agentId).toBe(agent1);
    });

    it('should handle pagination correctly', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-pagination');
      await createTestProject(dbClient, tenantId, 'default-project');
      const { agentId, projectId } = await createtestAgentAndAgent(tenantId);

      // Create 5 API keys
      for (let i = 0; i < 5; i++) {
        await createTestApiKey({ tenantId, projectId, agentId });
      }

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys?page=1&limit=3`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(3);
      expect(body.pagination).toEqual({
        page: 1,
        limit: 3,
        total: 5,
        pages: 2,
      });
    });
  });

  describe('GET /{id}', () => {
    it('should get API key by ID', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-get-by-id');
      await createTestProject(dbClient, tenantId, 'default-project');
      const { agentId, projectId } = await createtestAgentAndAgent(tenantId);
      const { apiKey } = await createTestApiKey({ tenantId, projectId, agentId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys/${apiKey.id}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.id).toBe(apiKey.id);
      expect(body.data.agentId).toBe(agentId);
      expect(body.data.publicId).toBe(apiKey.publicId);
      expect(body.data).not.toHaveProperty('keyHash'); // Should never expose hash
    });

    it('should return 404 for non-existent API key', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-get-not-found');
      const projectId = 'default-project';
      await createTestProject(dbClient, tenantId, projectId);
      const nonExistentId = `non-existent-${generateId()}`;

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys/${nonExistentId}`
      );
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error.message).toBe('API key not found');
    });

    it('should respect tenant isolation', async () => {
      const tenantId1 = await createTestTenantWithOrg('api-keys-tenant-1');
      const tenantId2 = await createTestTenantWithOrg('api-keys-tenant-2');
      const projectId = 'default-project';

      await createTestProject(dbClient, tenantId1, projectId);
      const { agentId } = await createtestAgentAndAgent(tenantId1, projectId);
      const { apiKey } = await createTestApiKey({ tenantId: tenantId1, projectId, agentId });

      // Try to access from different tenant
      const res = await makeRequest(
        `/tenants/${tenantId2}/projects/${projectId}/api-keys/${apiKey.id}`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should create API key successfully', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-create');
      await createTestProject(dbClient, tenantId, 'default-project');
      const { agentId, projectId } = await createtestAgentAndAgent(tenantId);

      const createData = {
        agentId: agentId,
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/api-keys`, {
        method: 'POST',
        body: JSON.stringify(createData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      // Verify response structure
      expect(body.data).toHaveProperty('apiKey');
      expect(body.data).toHaveProperty('key');

      // Verify API key structure
      const apiKey = body.data.apiKey;
      expect(apiKey.agentId).toBe(agentId);
      expect(apiKey.publicId).toBeDefined();
      expect(apiKey.publicId).toHaveLength(12);
      expect(apiKey.keyPrefix).toBeDefined();
      expect(apiKey.createdAt).toBeDefined();
      expect(apiKey.updatedAt).toBeDefined();
      expect(apiKey.expiresAt).toBeNull();

      // Verify full key format
      const fullKey = body.data.key;
      expect(fullKey).toMatch(/^sk_[^.]+\.[^.]+$/);
      expect(fullKey).toContain(apiKey.publicId);

      // Verify publicId extraction
      const extractedPublicId = extractPublicId(fullKey);
      // Debug: log values to understand the issue
      if (extractedPublicId !== apiKey.publicId) {
        console.log('Debug - fullKey:', fullKey);
        console.log('Debug - apiKey.publicId:', apiKey.publicId);
        console.log('Debug - extractedPublicId:', extractedPublicId);
      }
      expect(extractedPublicId).toBe(apiKey.publicId);
    });

    it('should create API key with expiration date', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-create-expires');
      await createTestProject(dbClient, tenantId, 'default-project');
      const { agentId, projectId } = await createtestAgentAndAgent(tenantId);

      const expiresAt = '2025-12-31 23:59:59';
      const createData = {
        agentId: agentId,
        expiresAt,
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/api-keys`, {
        method: 'POST',
        body: JSON.stringify(createData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.data.apiKey.expiresAt).toBe(expiresAt);
    });

    it('should handle invalid agentId', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-create-invalid-agent');
      const projectId = 'default-project';
      await createTestProject(dbClient, tenantId, projectId);
      const invalidAgentId = `invalid-${generateId()}`;

      const createData = {
        agentId: invalidAgentId,
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/api-keys`, {
        method: 'POST',
        body: JSON.stringify(createData),
        expectError: true,
      });

      expect(res.status).toBe(400); // Invalid agentId returns Bad Request
    });
  });

  describe('PUT /{id}', () => {
    it('should update API key expiration date', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-update');
      await createTestProject(dbClient, tenantId, 'default-project');
      const { agentId, projectId } = await createtestAgentAndAgent(tenantId);
      const { apiKey } = await createTestApiKey({ tenantId, projectId, agentId });

      // Wait 1ms to ensure updatedAt will be different
      await new Promise((resolve) => setTimeout(resolve, 1));

      const newExpiresAt = '2025-12-31 23:59:59';
      const updateData = {
        expiresAt: newExpiresAt,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys/${apiKey.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.data.expiresAt).toBe(newExpiresAt);
      expect(body.data.updatedAt).not.toBe(apiKey.updatedAt); // Should be updated
    });

    it('should clear API key expiration date', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-update-clear');
      await createTestProject(dbClient, tenantId, 'default-project');
      const { agentId, projectId } = await createtestAgentAndAgent(tenantId);
      const { apiKey } = await createTestApiKey({
        tenantId,
        projectId,
        agentId,
        expiresAt: '2025-12-31T23:59:59Z',
      });

      const updateData = {
        expiresAt: null,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys/${apiKey.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.data.expiresAt).toBeNull();
    });

    it('should return 404 for non-existent API key', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-update-not-found');
      const projectId = 'default-project';
      await createTestProject(dbClient, tenantId, projectId);
      const nonExistentId = `non-existent-${generateId()}`;

      const updateData = {
        expiresAt: '2025-12-31T23:59:59Z',
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys/${nonExistentId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(404);
    });

    it('should respect tenant isolation', async () => {
      const tenantId1 = await createTestTenantWithOrg('api-keys-update-tenant-1');
      const tenantId2 = await createTestTenantWithOrg('api-keys-update-tenant-2');
      const projectId = 'default-project';

      await createTestProject(dbClient, tenantId1, projectId);
      const { agentId } = await createtestAgentAndAgent(tenantId1, projectId);
      const { apiKey } = await createTestApiKey({ tenantId: tenantId1, projectId, agentId });

      const updateData = {
        expiresAt: '2025-12-31T23:59:59Z',
      };

      // Try to update from different tenant
      const res = await makeRequest(
        `/tenants/${tenantId2}/projects/${projectId}/api-keys/${apiKey.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete API key successfully', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-delete');
      await createTestProject(dbClient, tenantId, 'default-project');
      const { agentId, projectId } = await createtestAgentAndAgent(tenantId);
      const { apiKey } = await createTestApiKey({ tenantId, projectId, agentId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys/${apiKey.id}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(204);

      // Verify API key is deleted
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys/${apiKey.id}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent API key', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-delete-not-found');
      const projectId = 'default-project';
      await createTestProject(dbClient, tenantId, projectId);
      const nonExistentId = `non-existent-${generateId()}`;

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys/${nonExistentId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);
    });

    it('should respect tenant isolation', async () => {
      const tenantId1 = await createTestTenantWithOrg('api-keys-delete-tenant-1');
      const tenantId2 = await createTestTenantWithOrg('api-keys-delete-tenant-2');
      const projectId = 'default-project';

      await createTestProject(dbClient, tenantId1, projectId);
      const { agentId } = await createtestAgentAndAgent(tenantId1, projectId);
      const { apiKey } = await createTestApiKey({ tenantId: tenantId1, projectId, agentId });

      // Try to delete from different tenant
      const res = await makeRequest(
        `/tenants/${tenantId2}/projects/${projectId}/api-keys/${apiKey.id}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('Security', () => {
    it('should never expose keyHash in any response', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-security');
      await createTestProject(dbClient, tenantId, 'default-project');
      const { agentId, projectId } = await createtestAgentAndAgent(tenantId);
      const { apiKey } = await createTestApiKey({ tenantId, projectId, agentId });

      // Test all endpoints
      const endpoints = [
        `/tenants/${tenantId}/projects/${projectId}/api-keys`,
        `/tenants/${tenantId}/projects/${projectId}/api-keys/${apiKey.id}`,
      ];

      for (const endpoint of endpoints) {
        const res = await makeRequest(endpoint);
        const body = await res.json();

        // Check that keyHash is never present in any data structure
        const checkForKeyHash = (obj: any) => {
          if (Array.isArray(obj)) {
            obj.forEach(checkForKeyHash);
          } else if (obj && typeof obj === 'object') {
            expect(obj).not.toHaveProperty('keyHash');
            Object.values(obj).forEach(checkForKeyHash);
          }
        };

        checkForKeyHash(body);
      }
    });

    it('should only return full key once during creation', async () => {
      const tenantId = await createTestTenantWithOrg('api-keys-security-key-once');
      await createTestProject(dbClient, tenantId, 'default-project');
      const { agentId, projectId } = await createtestAgentAndAgent(tenantId);

      // Create API key
      const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/api-keys`, {
        method: 'POST',
        body: JSON.stringify({ agentId: agentId }),
      });

      const createBody = await createRes.json();
      const { apiKey, key: fullKey } = createBody.data;

      // Verify full key is returned on creation
      expect(fullKey).toBeDefined();
      expect(fullKey).toMatch(/^sk_[^.]+\.[^.]+$/);

      // Verify full key is NOT returned in subsequent operations
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys/${apiKey.id}`
      );
      const getBody = await getRes.json();

      expect(getBody.data).not.toHaveProperty('key');
      expect(getBody.data.keyPrefix).toBeDefined(); // Should still have prefix for display
    });
  });
});
