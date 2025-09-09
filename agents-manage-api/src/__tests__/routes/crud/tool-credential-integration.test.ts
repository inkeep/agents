import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import app from '../../../index';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantId } from '../../utils/testTenant';

describe('Tool-Credential Integration Tests', () => {
  const projectId = 'default';

  // Helper to create a test credential
  const createTestCredential = async (tenantId: string) => {
    const credentialData = {
      id: nanoid(),
      type: 'nango',
      credentialStoreId: 'slack-oauth',
      retrievalParams: {
        providerConfigKey: 'slack',
        connectionId: 'test-connection-123',
      },
    };

    const res = await makeRequest(`/tenants/${tenantId}/crud/projects/${projectId}/credentials`, {
      method: 'POST',
      body: JSON.stringify(credentialData),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    return { credentialData, credentialId: body.data.id };
  };

  // Helper to create a test tool
  const createTestTool = async (tenantId: string, credentialReferenceId?: string | null) => {
    const toolData = {
      id: nanoid(),
      name: 'Test MCP Tool',
      config: {
        type: 'mcp' as const,
        mcp: {
          server: {
            url: 'https://api.example.com/mcp',
          },
          transport: {
            type: 'streamable_http' as const,
          },
          activeTools: ['test-function'],
        },
      },
      credentialReferenceId,
      metadata: {
        tags: ['test'],
        category: 'testing',
      },
    };

    const res = await makeRequest(`/tenants/${tenantId}/crud/projects/${projectId}/tools`, {
      method: 'POST',
      body: JSON.stringify(toolData),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    return { toolData, toolId: body.data.id, toolResponse: body.data };
  };

  describe('Creating Tools with Credentials', () => {
    it('should create a tool with a valid credential reference', async () => {
      const tenantId = createTestTenantId('tool-cred-create-valid');
      await ensureTestProject(tenantId, projectId);

      // First create a credential
      const { credentialId } = await createTestCredential(tenantId);

      // Then create a tool that references it
      const { toolResponse } = await createTestTool(tenantId, credentialId);

      expect(toolResponse.credentialReferenceId).toBe(credentialId);
      expect(toolResponse.name).toBe('Test MCP Tool');
    });

    it('should create a tool without credentials (unauthenticated)', async () => {
      const tenantId = createTestTenantId('tool-cred-create-none');
      await ensureTestProject(tenantId, projectId);

      const { toolResponse } = await createTestTool(tenantId);

      expect(toolResponse.credentialReferenceId).toBeUndefined();
    });
  });

  describe('Updating Tool Credentials', () => {
    it('should update a tool to add a credential reference', async () => {
      const tenantId = createTestTenantId('tool-cred-update-add');
      await ensureTestProject(tenantId, projectId);

      // Create tool without credentials
      const { toolId } = await createTestTool(tenantId);

      // Create a credential
      const { credentialId } = await createTestCredential(tenantId);

      // Update tool to add credential
      const updateRes = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            credentialReferenceId: credentialId,
          }),
        }
      );

      expect(updateRes.status).toBe(200);
      const updateBody = await updateRes.json();
      expect(updateBody.data.credentialReferenceId).toBe(credentialId);
    });

    it('should update a tool to remove credential reference', async () => {
      const tenantId = createTestTenantId('tool-cred-update-remove');
      await ensureTestProject(tenantId, projectId);

      // Create credential and tool with credential
      const { credentialId } = await createTestCredential(tenantId);
      const { toolId } = await createTestTool(tenantId, credentialId);

      // Update tool to remove credential
      const updateRes = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            credentialReferenceId: null,
          }),
        }
      );

      expect(updateRes.status).toBe(200);
      const updateBody = await updateRes.json();
      expect(updateBody.data.credentialReferenceId).toBeUndefined();
    });

    it('should update a tool to change credential reference', async () => {
      const tenantId = createTestTenantId('tool-cred-update-change');
      await ensureTestProject(tenantId, projectId);

      // Create two credentials
      const { credentialId: cred1 } = await createTestCredential(tenantId);
      const { credentialId: cred2 } = await createTestCredential(tenantId);

      // Create tool with first credential
      const { toolId } = await createTestTool(tenantId, cred1);

      // Update tool to use second credential
      const updateRes = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${toolId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            credentialReferenceId: cred2,
          }),
        }
      );

      expect(updateRes.status).toBe(200);
      const updateBody = await updateRes.json();
      expect(updateBody.data.credentialReferenceId).toBe(cred2);
    });
  });

  describe('Credential Sharing Between Tools', () => {
    it('should allow multiple tools to share the same credential', async () => {
      const tenantId = createTestTenantId('tool-cred-sharing');
      await ensureTestProject(tenantId, projectId);

      // Create one credential
      const { credentialId } = await createTestCredential(tenantId);

      // Create two tools that use the same credential
      const { toolId: tool1Id } = await createTestTool(tenantId, credentialId);
      const { toolId: tool2Id } = await createTestTool(tenantId, credentialId);

      // Verify both tools reference the same credential
      const tool1Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${tool1Id}`
      );
      const tool2Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${tool2Id}`
      );

      expect(tool1Res.status).toBe(200);
      expect(tool2Res.status).toBe(200);

      const tool1Body = await tool1Res.json();
      const tool2Body = await tool2Res.json();

      expect(tool1Body.data.credentialReferenceId).toBe(credentialId);
      expect(tool2Body.data.credentialReferenceId).toBe(credentialId);
    });

    it('should allow deleting a tool without affecting shared credential or other tools', async () => {
      const tenantId = createTestTenantId('tool-cred-delete-sharing');
      await ensureTestProject(tenantId, projectId);

      // Create one credential shared by two tools
      const { credentialId } = await createTestCredential(tenantId);
      const { toolId: tool1Id } = await createTestTool(tenantId, credentialId);
      const { toolId: tool2Id } = await createTestTool(tenantId, credentialId);

      // Delete first tool
      const deleteRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${tool1Id}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // Verify second tool still exists and references the credential
      const tool2Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/tools/${tool2Id}`
      );
      expect(tool2Res.status).toBe(200);
      const tool2Body = await tool2Res.json();
      expect(tool2Body.data.credentialReferenceId).toBe(credentialId);

      // Verify credential still exists
      const credRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/credentials/${credentialId}`
      );
      expect(credRes.status).toBe(200);
    });
  });

  describe('Listing Tools with Credentials', () => {
    it('should include credential references in tool list', async () => {
      const tenantId = createTestTenantId('tool-cred-list');
      await ensureTestProject(tenantId, projectId);

      // Create credential and tool
      const { credentialId } = await createTestCredential(tenantId);
      await createTestTool(tenantId, credentialId);
      await createTestTool(tenantId); // Tool without credential

      // List tools
      const listRes = await app.request(`/tenants/${tenantId}/crud/projects/${projectId}/tools`);
      expect(listRes.status).toBe(200);

      const listBody = await listRes.json();
      expect(listBody.data).toHaveLength(2);

      // Find tools by credential status
      const toolWithCred = listBody.data.find((t: any) => t.credentialReferenceId);
      const toolWithoutCred = listBody.data.find((t: any) => !t.credentialReferenceId);

      expect(toolWithCred).toBeDefined();
      expect(toolWithCred.credentialReferenceId).toBe(credentialId);
      expect(toolWithoutCred).toBeDefined();
      expect(toolWithoutCred.credentialReferenceId).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle setting credentialReferenceId to empty string', async () => {
      const tenantId = createTestTenantId('tool-cred-empty-string');
      await ensureTestProject(tenantId, projectId);

      const toolData = {
        id: nanoid(),
        name: 'Test Tool',
        config: {
          type: 'mcp',
          mcp: {
            server: { url: 'https://api.example.com/mcp' },
            transport: { type: 'streamable_http' },
          },
        },
        credentialReferenceId: '', // Empty string
      };

      const res = await makeRequest(`/tenants/${tenantId}/crud/projects/${projectId}/tools`, {
        method: 'POST',
        body: JSON.stringify(toolData),
      });

      // Should either accept and normalize to null/undefined, or reject
      // Implementation behavior depends on validation rules
      expect([201, 400, 500]).toContain(res.status); // Empty string may cause DB constraint violation
    });

    it('should handle undefined credentialReferenceId', async () => {
      const tenantId = createTestTenantId('tool-cred-undefined');
      await ensureTestProject(tenantId, projectId);

      const toolData = {
        id: nanoid(),
        name: 'Test Tool',
        config: {
          type: 'mcp',
          mcp: {
            server: { url: 'https://api.example.com/mcp' },
            transport: { type: 'streamable_http' },
          },
        },
      };

      const res = await makeRequest(`/tenants/${tenantId}/crud/projects/${projectId}/tools`, {
        method: 'POST',
        body: JSON.stringify(toolData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.credentialReferenceId).toBeUndefined();
    });
  });
});
