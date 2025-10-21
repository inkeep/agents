import { MCPTransportType } from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantId } from '../../utils/testTenant';

describe('Tools CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create test tool data
  const createToolData = ({ suffix = '' }: { suffix?: string } = {}): any => ({
    id: nanoid(16),
    name: `Test MCP Tool${suffix}`,
    description: `Test MCP tool description${suffix}`,
    config: {
      type: 'mcp' as const,
      mcp: {
        server: {
          url: 'https://api.example.com/mcp',
          timeout: 5000,
          headers: {
            'X-Custom-Header': 'test-value',
          },
        },
        transport: {
          type: MCPTransportType.streamableHttp,
          requestInit: {},
        },
        activeTools: ['test-function'],
      },
    },
    metadata: {
      tags: ['test', 'integration'],
      category: 'testing',
    },
  });

  // Helper function to create a tool via API
  const createTestTool = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    const toolData = createToolData({ suffix });
    const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/tools`, {
      method: 'POST',
      body: JSON.stringify(toolData),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { toolData, toolId: createBody.data.id };
  };

  describe('GET /', () => {
    it('should list tools with pagination (empty initially)', async () => {
      const tenantId = createTestTenantId('tools-list-empty');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/tools?page=1&limit=10`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('should filter tools by status', async () => {
      const tenantId = createTestTenantId('tools-filter-status');
      await ensureTestProject(tenantId, projectId);
      await createTestTool({ tenantId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/tools?status=unhealthy`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe('unhealthy');
    });
  });

  describe('GET /{id}', () => {
    it('should get a tool by id', async () => {
      const tenantId = createTestTenantId('tools-get-by-id');
      await ensureTestProject(tenantId, projectId);
      const { toolData, toolId } = await createTestTool({ tenantId });

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/tools/${toolId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(toolId);
      expect(body.data.name).toBe(toolData.name);
      expect(body.data.status).toBe('unhealthy');
    });

    it('should return 404 when tool not found', async () => {
      const tenantId = createTestTenantId('tools-get-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/tools/non-existent-id`
      );
      expect(res.status).toEqual(404);
    });
  });

  describe('POST /', () => {
    it('should create a new tool', async () => {
      const tenantId = createTestTenantId('tools-create-success');
      await ensureTestProject(tenantId, projectId);
      const toolData = createToolData();

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/tools`, {
        method: 'POST',
        body: JSON.stringify(toolData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.name).toBe(toolData.name);
      expect(body.data.tenantId).toBe(tenantId);
      expect(body.data.status).toBe('unhealthy');
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('tools-create-validation');
      await ensureTestProject(tenantId, projectId);
      const invalidToolData = {
        description: 'Missing name',
      };
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/tools`, {
        method: 'POST',
        body: JSON.stringify(invalidToolData),
      });
      expect(res.status).toBe(400);
    });

    // Note: Comprehensive credential-tool integration tests are in tool-credential-integration.test.ts
  });

  describe('PUT /{id}', () => {
    it('should update an existing tool', async () => {
      const tenantId = createTestTenantId('tools-update-success');
      await ensureTestProject(tenantId, projectId);
      const { toolId } = await createTestTool({ tenantId });
      const updateData = {
        name: 'Updated Tool Name',
        description: 'Updated description',
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/tools/${toolId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe('Updated Tool Name');
      expect(body.data.id).toBe(toolId);
    });

    // Note: Tool credential updates are tested in tool-credential-integration.test.ts

    it('should return 404 when tool not found for update', async () => {
      const tenantId = createTestTenantId('tools-update-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/tools/non-existent-id`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated' }),
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete an existing tool', async () => {
      const tenantId = createTestTenantId('tools-delete-success');
      await ensureTestProject(tenantId, projectId);
      const { toolId } = await createTestTool({ tenantId });
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/tools/${toolId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(204);

      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/tools/${toolId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when tool not found for deletion', async () => {
      const tenantId = createTestTenantId('tools-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/tools/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full tool lifecycle', async () => {
      const tenantId = createTestTenantId('tools-e2e');
      await ensureTestProject(tenantId, projectId);
      // 1. Create tool
      const { toolId } = await createTestTool({ tenantId });

      // 2. Get tool
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/tools/${toolId}`
      );
      expect(getRes.status).toBe(200);

      // 3. Update tool
      const updateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/tools/${toolId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Tool' }),
        }
      );
      expect(updateRes.status).toBe(200);

      // 4. List tools (should include our tool)
      const listRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/tools`);
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.data).toHaveLength(1);

      // 5. Delete tool
      const deleteRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/tools/${toolId}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // 6. Verify deletion
      const finalGetRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/tools/${toolId}`
      );
      expect(finalGetRes.status).toBe(404);
    });
  });
});
