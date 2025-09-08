import { nanoid } from 'nanoid';
import { describe, expect, it, vi } from 'vitest';
import app from '../../../index.js';
import { makeRequest } from '../../utils/testRequest.js';
import { createTestTenantId } from '../../utils/testTenant.js';
import { ensureTestProject } from '../../utils/testProject.js';

// Mock the MCP client to avoid external dependencies
vi.mock('../../../tools/mcp-client.js', () => ({
  McpClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    tools: vi.fn().mockResolvedValue([
      {
        name: 'test-function',
        description: 'Test function from MCP server',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        },
      },
    ]),
  })),
}));

describe('Tools CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create test tool data
  const createToolData = ({ suffix = '' }: { suffix?: string } = {}): any => ({
    id: nanoid(),
    name: `Test MCP Tool${suffix}`,
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
          type: 'streamable_http' as const,
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
    const createRes = await makeRequest(`/tenants/${tenantId}/crud/projects/${projectId}/tools`, {
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
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools?page=1&limit=10`
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

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools?status=unknown`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe('unknown');
    });
  });

  describe('GET /{id}', () => {
    it('should get a tool by id', async () => {
      const tenantId = createTestTenantId('tools-get-by-id');
      await ensureTestProject(tenantId, projectId);
      const { toolData, toolId } = await createTestTool({ tenantId });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(toolId);
      expect(body.data.name).toBe(toolData.name);
      expect(body.data.status).toBe('unknown');
    });

    it('should return 404 when tool not found', async () => {
      const tenantId = createTestTenantId('tools-get-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/non-existent-id`
      );
      expect(res.status).toEqual(404);
    });
  });

  describe('POST /', () => {
    it('should create a new tool', async () => {
      const tenantId = createTestTenantId('tools-create-success');
      await ensureTestProject(tenantId, projectId);
      const toolData = createToolData();

      const res = await makeRequest(`/tenants/${tenantId}/crud/projects/${projectId}/tools`, {
        method: 'POST',
        body: JSON.stringify(toolData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.name).toBe(toolData.name);
      expect(body.data.tenantId).toBe(tenantId);
      expect(body.data.status).toBe('unknown');
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('tools-create-validation');
      await ensureTestProject(tenantId, projectId);
      const invalidToolData = {
        description: 'Missing name',
      };
      const res = await makeRequest(`/tenants/${tenantId}/crud/projects/${projectId}/tools`, {
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

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

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
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/non-existent-id`,
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
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(204);

      const getRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when tool not found for deletion', async () => {
      const tenantId = createTestTenantId('tools-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /{id}/health-check', () => {
    it('should check tool health', async () => {
      const tenantId = createTestTenantId('tools-health-check');
      await ensureTestProject(tenantId, projectId);
      const { toolId } = await createTestTool({ tenantId });
      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}/health-check`,
        {
          method: 'POST',
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.tool.id).toBe(toolId);
      expect(body.data.healthCheck.status).toMatch(/healthy|unhealthy/);
    });

    it('should return 404 for non-existent tool health check', async () => {
      const tenantId = createTestTenantId('tools-health-check-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/non-existent-id/health-check`,
        { method: 'POST' }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /health-check-all', () => {
    it('should check health of all tools', async () => {
      const tenantId = createTestTenantId('tools-health-check-all');
      await ensureTestProject(tenantId, projectId);
      await createTestTool({ tenantId, suffix: ' 1' });
      await createTestTool({ tenantId, suffix: ' 2' });

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/health-check-all`,
        {
          method: 'POST',
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.total).toBe(2);
      expect(body.data.results).toHaveLength(2);
    });

    it('should handle empty tool list', async () => {
      const tenantId = createTestTenantId('tools-health-check-all-empty');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/health-check-all`,
        {
          method: 'POST',
        }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.total).toBe(0);
    });
  });

  describe('PATCH /{id}/status', () => {
    it('should update tool status', async () => {
      const tenantId = createTestTenantId('tools-patch-status');
      await ensureTestProject(tenantId, projectId);
      const { toolId } = await createTestTool({ tenantId });
      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'disabled' }),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('disabled');
    });

    it('should validate status enum values', async () => {
      const tenantId = createTestTenantId('tools-patch-status-invalid');
      await ensureTestProject(tenantId, projectId);
      const { toolId } = await createTestTool({ tenantId });
      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'invalid-status' }),
        }
      );
      expect(res.status).toBe(400);
    });
  });

  describe('POST /{id}/sync', () => {
    it('should sync tool definitions', async () => {
      const tenantId = createTestTenantId('tools-sync');
      await ensureTestProject(tenantId, projectId);
      const { toolId } = await createTestTool({ tenantId });
      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}/sync`,
        {
          method: 'POST',
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(toolId);
      expect(body.data.lastToolsSync).toBeDefined();
    });

    it('should return 404 for non-existent tool sync', async () => {
      const tenantId = createTestTenantId('tools-sync-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/non-existent-id/sync`,
        {
          method: 'POST',
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('GET /{id}/available-tools', () => {
    it('should get available tools', async () => {
      const tenantId = createTestTenantId('tools-get-available');
      await ensureTestProject(tenantId, projectId);
      const { toolId } = await createTestTool({ tenantId });
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}/available-tools`
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.availableTools).toBeDefined();
    });

    it('should return 404 when tool not found', async () => {
      const tenantId = createTestTenantId('tools-get-available-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/non-existent-id/available-tools`
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
      const getRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}`
      );
      expect(getRes.status).toBe(200);

      // 3. Update tool
      const updateRes = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Tool' }),
        }
      );
      expect(updateRes.status).toBe(200);

      // 4. Health check
      const healthRes = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}/health-check`,
        { method: 'POST' }
      );
      expect(healthRes.status).toBe(200);

      // 5. Sync definitions
      const syncRes = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}/sync`,
        {
          method: 'POST',
        }
      );
      expect(syncRes.status).toBe(200);

      // 6. Update status
      const statusRes = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'healthy' }),
        }
      );
      expect(statusRes.status).toBe(200);

      // 7. List tools (should include our tool)
      const listRes = await app.request(`/tenants/${tenantId}/crud/projects/${projectId}/tools`);
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.data).toHaveLength(1);

      // 8. Delete tool
      const deleteRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // 9. Verify deletion
      const finalGetRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}`
      );
      expect(finalGetRes.status).toBe(404);
    });
  });
});
