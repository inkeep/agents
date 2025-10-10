import { createFullGraphServerSide, extractPublicId } from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import dbClient from '../../../data/db/dbClient';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestSubAgentData } from '../../utils/testSubAgent';
import { createTestTenantId } from '../../utils/testTenant';

describe('API Key CRUD Routes - Integration Tests', () => {

  // Helper function to create full graph data with optional enhanced features
  const createFullGraphData = (graphId: string) => {
    const id = graphId || nanoid();

    const agent = createTestSubAgentData();

    const graphData: any = {
      id,
      name: `Test Graph ${id}`,
      description: `Test graph description for ${id}`,
      defaultSubAgentId: agent.id,
      subAgents: {
        [agent.id]: agent, // Agents should be an object keyed by ID
      },
      // Note: tools are now project-scoped and not part of the graph definition
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return graphData;
  };

  // Helper function to create test graph and agent
  const createTestGraphAndAgent = async (
    tenantId: string,
    projectId: string = 'default-project'
  ) => {
    // Ensure the project exists for this tenant before creating the graph
    await ensureTestProject(tenantId, projectId);

    const graphId = `test-graph${nanoid(6)}`;
    const graphData = createFullGraphData(graphId);
    await createFullGraphServerSide(dbClient)({ tenantId, projectId }, graphData);
    return { graphId, projectId }; // Return projectId as well
  };

  // Helper function to create a test API key
  const createTestApiKey = async ({
    tenantId,
    projectId = 'default-project',
    graphId,
    expiresAt,
  }: {
    tenantId: string;
    projectId?: string;
    graphId: string;
    expiresAt?: string;
  }) => {
    const createData = {
      agentId: graphId,
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
      const tenantId = createTestTenantId('api-keys-list-empty');
      const projectId = 'default-project';
      await ensureTestProject(tenantId, projectId);
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
      const tenantId = createTestTenantId('api-keys-list');
      await ensureTestProject(tenantId, 'default-project');
      const { graphId, projectId } = await createTestGraphAndAgent(tenantId);

      // Create multiple API keys
      const _apiKey1 = await createTestApiKey({ tenantId, projectId, graphId });
      const _apiKey2 = await createTestApiKey({ tenantId, projectId, graphId });

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
      expect(firstApiKey).toHaveProperty('agentId', graphId);
      expect(firstApiKey).toHaveProperty('publicId');
      expect(firstApiKey).toHaveProperty('keyPrefix');
      expect(firstApiKey).toHaveProperty('createdAt');
      expect(firstApiKey).toHaveProperty('updatedAt');
      expect(firstApiKey).not.toHaveProperty('keyHash'); // Should never expose hash
      expect(firstApiKey).not.toHaveProperty('tenantId'); // Should not expose tenantId in API
      expect(firstApiKey).not.toHaveProperty('projectId'); // Should not expose projectId in API
    });

    it('should filter API keys by agentId', async () => {
      const tenantId = createTestTenantId('api-keys-filter-graph');
      await ensureTestProject(tenantId, 'project-1');
      const { graphId: graph1, projectId } = await createTestGraphAndAgent(tenantId, 'project-1');
      const { graphId: graph2 } = await createTestGraphAndAgent(tenantId, 'project-1');

      // Create API keys for different graphs
      await createTestApiKey({ tenantId, projectId, graphId: graph1 });
      await createTestApiKey({ tenantId, projectId, graphId: graph2 });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys?agentId=${graph1}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].agentId).toBe(graph1);
    });

    it('should handle pagination correctly', async () => {
      const tenantId = createTestTenantId('api-keys-pagination');
      await ensureTestProject(tenantId, 'default-project');
      const { graphId, projectId } = await createTestGraphAndAgent(tenantId);

      // Create 5 API keys
      for (let i = 0; i < 5; i++) {
        await createTestApiKey({ tenantId, projectId, graphId });
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
      const tenantId = createTestTenantId('api-keys-get-by-id');
      await ensureTestProject(tenantId, 'default-project');
      const { graphId, projectId } = await createTestGraphAndAgent(tenantId);
      const { apiKey } = await createTestApiKey({ tenantId, projectId, graphId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys/${apiKey.id}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.id).toBe(apiKey.id);
      expect(body.data.agentId).toBe(graphId);
      expect(body.data.publicId).toBe(apiKey.publicId);
      expect(body.data).not.toHaveProperty('keyHash'); // Should never expose hash
    });

    it('should return 404 for non-existent API key', async () => {
      const tenantId = createTestTenantId('api-keys-get-not-found');
      const projectId = 'default-project';
      await ensureTestProject(tenantId, projectId);
      const nonExistentId = `non-existent-${nanoid()}`;

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys/${nonExistentId}`
      );
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error.message).toBe('API key not found');
    });

    it('should respect tenant isolation', async () => {
      const tenantId1 = createTestTenantId('api-keys-tenant-1');
      const tenantId2 = createTestTenantId('api-keys-tenant-2');
      const projectId = 'default-project';

      await ensureTestProject(tenantId1, projectId);
      const { graphId } = await createTestGraphAndAgent(tenantId1, projectId);
      const { apiKey } = await createTestApiKey({ tenantId: tenantId1, projectId, graphId });

      // Try to access from different tenant
      const res = await makeRequest(
        `/tenants/${tenantId2}/projects/${projectId}/api-keys/${apiKey.id}`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should create API key successfully', async () => {
      const tenantId = createTestTenantId('api-keys-create');
      await ensureTestProject(tenantId, 'default-project');
      const { graphId, projectId } = await createTestGraphAndAgent(tenantId);

      const createData = {
        agentId: graphId,
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
      expect(apiKey.agentId).toBe(graphId);
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
      const tenantId = createTestTenantId('api-keys-create-expires');
      await ensureTestProject(tenantId, 'default-project');
      const { graphId, projectId } = await createTestGraphAndAgent(tenantId);

      const expiresAt = '2025-12-31T23:59:59Z';
      const createData = {
        agentId: graphId,
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
      const tenantId = createTestTenantId('api-keys-create-invalid-graph');
      const projectId = 'default-project';
      await ensureTestProject(tenantId, projectId);
      const invalidGraphId = `invalid-${nanoid()}`;

      const createData = {
        agentId: invalidGraphId,
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
      const tenantId = createTestTenantId('api-keys-update');
      await ensureTestProject(tenantId, 'default-project');
      const { graphId, projectId } = await createTestGraphAndAgent(tenantId);
      const { apiKey } = await createTestApiKey({ tenantId, projectId, graphId });

      // Wait 1ms to ensure updatedAt will be different
      await new Promise((resolve) => setTimeout(resolve, 1));

      const newExpiresAt = '2025-12-31T23:59:59Z';
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
      const tenantId = createTestTenantId('api-keys-update-clear');
      await ensureTestProject(tenantId, 'default-project');
      const { graphId, projectId } = await createTestGraphAndAgent(tenantId);
      const { apiKey } = await createTestApiKey({
        tenantId,
        projectId,
        graphId,
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
      const tenantId = createTestTenantId('api-keys-update-not-found');
      const projectId = 'default-project';
      await ensureTestProject(tenantId, projectId);
      const nonExistentId = `non-existent-${nanoid()}`;

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
      const tenantId1 = createTestTenantId('api-keys-update-tenant-1');
      const tenantId2 = createTestTenantId('api-keys-update-tenant-2');
      const projectId = 'default-project';

      await ensureTestProject(tenantId1, projectId);
      const { graphId } = await createTestGraphAndAgent(tenantId1, projectId);
      const { apiKey } = await createTestApiKey({ tenantId: tenantId1, projectId, graphId });

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
      const tenantId = createTestTenantId('api-keys-delete');
      await ensureTestProject(tenantId, 'default-project');
      const { graphId, projectId } = await createTestGraphAndAgent(tenantId);
      const { apiKey } = await createTestApiKey({ tenantId, projectId, graphId });

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
      const tenantId = createTestTenantId('api-keys-delete-not-found');
      const projectId = 'default-project';
      await ensureTestProject(tenantId, projectId);
      const nonExistentId = `non-existent-${nanoid()}`;

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/api-keys/${nonExistentId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);
    });

    it('should respect tenant isolation', async () => {
      const tenantId1 = createTestTenantId('api-keys-delete-tenant-1');
      const tenantId2 = createTestTenantId('api-keys-delete-tenant-2');
      const projectId = 'default-project';

      await ensureTestProject(tenantId1, projectId);
      const { graphId } = await createTestGraphAndAgent(tenantId1, projectId);
      const { apiKey } = await createTestApiKey({ tenantId: tenantId1, projectId, graphId });

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
      const tenantId = createTestTenantId('api-keys-security');
      await ensureTestProject(tenantId, 'default-project');
      const { graphId, projectId } = await createTestGraphAndAgent(tenantId);
      const { apiKey } = await createTestApiKey({ tenantId, projectId, graphId });

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
      const tenantId = createTestTenantId('api-keys-security-key-once');
      await ensureTestProject(tenantId, 'default-project');
      const { graphId, projectId } = await createTestGraphAndAgent(tenantId);

      // Create API key
      const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/api-keys`, {
        method: 'POST',
        body: JSON.stringify({ agentId: graphId }),
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
