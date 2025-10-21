import { generateId, MCPTransportType } from '@inkeep/agents-core';
import { describe, expect, it, vi } from 'vitest';
import { createTestAgentToolRelationData } from '../../utils/testHelpers';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestSubAgentData } from '../../utils/testSubAgent';
import { createTestTenantId } from '../../utils/testTenant';

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

// Mock dbResultToMcpTool to avoid network calls during tests
vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual('@inkeep/agents-core');
  return {
    ...actual,
    dbResultToMcpTool: vi.fn().mockImplementation((tool) =>
      Promise.resolve({
        ...tool,
        status: 'healthy',
        availableTools: [],
        createdAt: new Date(tool.createdAt),
        updatedAt: new Date(tool.updatedAt),
        // Transform null to undefined for optional fields (matches real behavior)
        credentialReferenceId: tool.credentialReferenceId || undefined,
        headers: tool.headers || undefined,
        capabilities: tool.capabilities || undefined,
        lastError: tool.lastError || undefined,
        imageUrl: tool.imageUrl || undefined,
      })
    ),
  };
});

describe('Agent Tool Relations CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create test tool data
  const createToolData = ({ suffix = '' } = {}) => ({
    id: generateId(),
    name: `Test MCP Tool${suffix}`,
    description: `Test MCP tool description${suffix}`,
    config: {
      type: 'mcp' as const,
      mcp: {
        server: {
          url: 'https://api.example.com/mcp',
          timeout: 5000,
          headers: {
            Authorization: 'Bearer test-token',
          },
        },
        transport: {
          type: MCPTransportType.streamableHttp,
          requestInit: {},
        },
        auth: {
          type: 'bearer' as const,
          token: 'test-token',
        },
        activeTools: ['test-function'],
      },
    },
    metadata: {
      tags: ['test', 'integration'],
      category: 'testing',
    },
  });

  // Helper function to create an agent
  const createTestAgent = async ({
    tenantId,
    suffix = '',
    agentId = undefined,
  }: {
    tenantId: string;
    suffix?: string;
    agentId?: string;
  }) => {
    // Create an agent if not provided
    let effectiveAgentId = agentId;
    if (!effectiveAgentId) {
      effectiveAgentId = generateId();
      const agentData = {
        id: effectiveAgentId,
        name: `Test Agent${suffix}`,
        defaultSubAgentId: null,
      };
      const agentRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/agents`, {
        method: 'POST',
        body: JSON.stringify(agentData),
      });
      expect(agentRes.status).toBe(201);
    }

    const agentData = { ...createTestSubAgentData({ suffix }) };
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/agents/${effectiveAgentId}/sub-agents`,
      {
        method: 'POST',
        body: JSON.stringify(agentData),
      }
    );
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json();
    return { agentData, subAgentId: createBody.data.id, agentId: effectiveAgentId };
  };

  // Helper function to create a tool
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

  // Helper function to create an agent tool relation
  const createTestAgentToolRelation = async ({
    tenantId,
    agentId,
    subAgentId,
    toolId,
  }: {
    tenantId: string;
    agentId: string;
    subAgentId: string;
    toolId: string;
  }) => {
    const relationData = createTestAgentToolRelationData({ subAgentId, toolId, agentId: agentId });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations`,
      {
        method: 'POST',
        body: JSON.stringify(relationData),
      }
    );

    const responseText = await createRes.text();
    expect(createRes.status, `Failed to create agent tool relation: ${responseText}`).toBe(201);

    const createBody = JSON.parse(responseText);
    return { relationData, relationId: createBody.data.id };
  };

  // Setup function for tests
  const setupTestEnvironment = async (tenantId: string) => {
    const { subAgentId, agentId } = await createTestAgent({ tenantId, suffix: ' Agent' });
    const { toolId } = await createTestTool({ tenantId, suffix: ' Tool' });
    return { subAgentId, toolId, agentId };
  };

  describe('POST /', () => {
    it('should create a new agent tool relation', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-create-success');
      await ensureTestProject(tenantId, 'default');
      const { subAgentId, toolId, agentId } = await setupTestEnvironment(tenantId);

      const relationData = createTestAgentToolRelationData({
        agentId: agentId,
        subAgentId,
        toolId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        subAgentId,
        toolId,
        tenantId,
      });
    });

    it('should prevent duplicate agent tool relations', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-create-duplicate');
      await ensureTestProject(tenantId, 'default');
      const { subAgentId, toolId, agentId } = await setupTestEnvironment(tenantId);

      // Create first relation
      const relationData = createTestAgentToolRelationData({
        agentId: agentId,
        subAgentId,
        toolId,
      });
      const firstRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );
      expect(firstRes.status).toBe(201);

      // Try to create duplicate
      const duplicateData = createTestAgentToolRelationData({
        agentId: agentId,
        subAgentId,
        toolId,
      });
      const duplicateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations`,
        {
          method: 'POST',
          body: JSON.stringify(duplicateData),
        }
      );
      expect(duplicateRes.status).toBe(422); // Unprocessable Entity
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-create-validation');
      await ensureTestProject(tenantId, 'default');
      const agentId = 'default';
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
    });
  });

  describe('GET /', () => {
    it('should list agent tool relations with pagination (empty initially)', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-list-empty');
      await ensureTestProject(tenantId, 'default');
      const agentId = 'default';
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });

    it('should list agent tool relations with pagination (single item)', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-list-single');
      await ensureTestProject(tenantId, 'default');
      const { subAgentId, toolId, agentId } = await setupTestEnvironment(tenantId);
      await createTestAgentToolRelation({
        tenantId,
        agentId,
        subAgentId,
        toolId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        subAgentId,
        toolId,
      });
    });

    it('should filter by subAgentId', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-filter-agent');
      await ensureTestProject(tenantId, 'default');
      const { subAgentId, toolId, agentId } = await setupTestEnvironment(tenantId);
      const { subAgentId: otherAgentId } = await createTestAgent({
        tenantId,
        suffix: ' Other Agent',
        agentId,
      });

      // Create relations with different agents
      await createTestAgentToolRelation({ tenantId, agentId, subAgentId, toolId });
      await createTestAgentToolRelation({
        tenantId,
        agentId,
        subAgentId: otherAgentId,
        toolId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations?subAgentId=${subAgentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].subAgentId).toBe(subAgentId);
    });

    it('should filter by toolId', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-filter-tool');
      await ensureTestProject(tenantId, 'default');
      const { subAgentId, toolId, agentId } = await setupTestEnvironment(tenantId);
      const { toolId: otherToolId } = await createTestTool({
        tenantId,
        suffix: ' Other Tool',
      });

      // Create relations with different tools
      await createTestAgentToolRelation({ tenantId, agentId, subAgentId, toolId });
      await createTestAgentToolRelation({
        tenantId,
        agentId,
        subAgentId,
        toolId: otherToolId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations?toolId=${toolId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].toolId).toBe(toolId);
    });

    it('should handle pagination with multiple pages', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-list-multipages');
      await ensureTestProject(tenantId, 'default');
      const { subAgentId, agentId } = await createTestAgent({ tenantId });

      // Create multiple tools and relations
      const toolIds: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const { toolId } = await createTestTool({ tenantId, suffix: ` ${i}` });
        toolIds.push(toolId);
        await createTestAgentToolRelation({ tenantId, agentId, subAgentId, toolId });
      }

      // Test first page with limit 2
      const page1Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations?page=1&limit=2`
      );
      expect(page1Res.status).toBe(200);

      const page1Body = await page1Res.json();
      expect(page1Body.data).toHaveLength(2);
      expect(page1Body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        pages: 3,
      });

      // Test second page
      const page2Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations?page=2&limit=2`
      );
      expect(page2Res.status).toBe(200);

      const page2Body = await page2Res.json();
      expect(page2Body.data).toHaveLength(2);
      expect(page2Body.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 5,
        pages: 3,
      });
    });
  });

  describe('GET /{id}', () => {
    it('should get an agent tool relation by id', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-get-by-id');
      await ensureTestProject(tenantId, 'default');
      const { subAgentId, toolId, agentId } = await setupTestEnvironment(tenantId);
      const { relationId } = await createTestAgentToolRelation({
        tenantId,
        agentId,
        subAgentId,
        toolId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations/${relationId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.id).toBe(relationId);
      expect(body.data.subAgentId).toBe(subAgentId);
      expect(body.data.toolId).toBe(toolId);
    });

    it('should return 404 when agent tool relation not found', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-get-not-found');
      await ensureTestProject(tenantId, 'default');
      const agentId = 'default';
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('GET /tool/{toolId}/agents', () => {
    it('should get agents for a specific tool', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-get-agents-for-tool');
      await ensureTestProject(tenantId, 'default');
      const { toolId } = await createTestTool({ tenantId });
      const { subAgentId: subAgentId1, agentId } = await createTestAgent({
        tenantId,
        suffix: ' 1',
      });
      const { subAgentId: subAgentId2 } = await createTestAgent({
        tenantId,
        suffix: ' 2',
        agentId,
      });

      // Create relations
      await createTestAgentToolRelation({
        tenantId,
        agentId,
        subAgentId: subAgentId1,
        toolId,
      });
      await createTestAgentToolRelation({
        tenantId,
        agentId,
        subAgentId: subAgentId2,
        toolId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations/tool/${toolId}/sub-agents`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data.every((relation: any) => relation.toolId === toolId)).toBe(true);
    });

    it('should return empty array when tool has no agents', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-get-agents-empty');
      await ensureTestProject(tenantId, 'default');
      const { toolId } = await createTestTool({ tenantId });
      const agentId = 'default';

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations/tool/${toolId}/sub-agents`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(0);
    });
  });

  describe('PUT /{id}', () => {
    it('should update an existing agent tool relation', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-update-success');
      await ensureTestProject(tenantId, 'default');
      const { subAgentId, toolId, agentId } = await setupTestEnvironment(tenantId);
      const { relationId } = await createTestAgentToolRelation({
        tenantId,
        agentId,
        subAgentId,
        toolId,
      });

      // Create a new tool to update the relation
      const { toolId: newToolId } = await createTestTool({ tenantId, suffix: ' New' });
      const updateData = {
        toolId: newToolId,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations/${relationId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      const body = await res.json();
      expect(body.data.toolId).toBe(newToolId);
      expect(body.data.id).toBe(relationId);
    });

    it('should return 404 when agent tool relation not found for update', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-update-not-found');
      await ensureTestProject(tenantId, 'default');
      const agentId = 'default';
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations/non-existent-id`,
        {
          method: 'PUT',
          body: JSON.stringify({ toolId: 'some-tool-id' }),
        }
      );
      expect(res.status).toBe(404);
    });

    it('should return 400 when no fields to update', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-update-empty');
      await ensureTestProject(tenantId, 'default');
      const { subAgentId, toolId, agentId } = await setupTestEnvironment(tenantId);
      const { relationId } = await createTestAgentToolRelation({
        tenantId,
        agentId,
        subAgentId,
        toolId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations/${relationId}`,
        {
          method: 'PUT',
          body: JSON.stringify({}),
        }
      );
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete an existing agent tool relation', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-delete-success');
      await ensureTestProject(tenantId, 'default');
      const { subAgentId, toolId, agentId } = await setupTestEnvironment(tenantId);
      const { relationId } = await createTestAgentToolRelation({
        tenantId,
        agentId,
        subAgentId,
        toolId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations/${relationId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(204);

      // Verify it's deleted
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations/${relationId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when agent tool relation not found for deletion', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-delete-not-found');
      await ensureTestProject(tenantId, 'default');
      const agentId = 'default';
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid agent ID in relation creation', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-invalid-agent');
      await ensureTestProject(tenantId, 'default');
      const { toolId } = await createTestTool({ tenantId });
      const agentId = 'default';

      const relationData = createTestAgentToolRelationData({
        agentId: 'default',
        subAgentId: 'non-existent-agent',
        toolId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      // The application should reject creation with non-existent agent IDs
      expect(res.status).toBe(400); // Bad request due to invalid agent ID
    });

    it('should handle invalid tool ID in relation creation', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-invalid-tool');
      await ensureTestProject(tenantId, 'default');
      const { subAgentId, agentId } = await createTestAgent({ tenantId });

      const relationData = createTestAgentToolRelationData({
        agentId: agentId,
        subAgentId,
        toolId: 'non-existent-tool',
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations`,
        {
          method: 'POST',
          body: JSON.stringify(relationData),
        }
      );

      // The application should reject creation with non-existent tool IDs
      expect(res.status).toBe(400); // Bad request due to invalid tool ID
    });

    it('should handle large page sizes gracefully', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-large-page');
      await ensureTestProject(tenantId, 'default');
      const { subAgentId, toolId, agentId } = await setupTestEnvironment(tenantId);
      await createTestAgentToolRelation({ tenantId, agentId, subAgentId, toolId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations?page=1&limit=100`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.pagination.limit).toBe(100);
    });

    it('should return empty data for page beyond available data', async () => {
      const tenantId = createTestTenantId('agent-tool-relations-beyond-pages');
      await ensureTestProject(tenantId, 'default');
      const { subAgentId, toolId, agentId } = await setupTestEnvironment(tenantId);
      await createTestAgentToolRelation({ tenantId, agentId, subAgentId, toolId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/sub-agent-tool-relations?page=10&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination.total).toBe(1);
      expect(body.pagination.pages).toBe(1);
    });
  });
});
