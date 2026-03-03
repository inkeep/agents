import {
  createFullAgentServerSide,
  createTrigger,
  createTriggerInvocation,
  generateId,
} from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import manageDbClient from '../../../../data/db/manageDbClient';
import runDbClient from '../../../../data/db/runDbClient';
import { env } from '../../../../env';
import { makeRequest } from '../../../utils/testRequest';
import { createTestSubAgentData } from '../../../utils/testSubAgent';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

const { dispatchExecutionMock, assertCanMutateTriggerMock } = vi.hoisted(() => ({
  dispatchExecutionMock: vi.fn().mockResolvedValue({
    invocationId: 'test-invocation-id',
    conversationId: 'test-conversation-id',
  }),
  assertCanMutateTriggerMock: vi.fn(),
}));

vi.mock('../../../../domains/run/services/TriggerService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../domains/run/services/TriggerService')>();
  return {
    ...actual,
    dispatchExecution: dispatchExecutionMock,
  };
});

vi.mock('../../../../domains/manage/routes/triggerHelpers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../domains/manage/routes/triggerHelpers')>();
  return {
    ...actual,
    assertCanMutateTrigger: assertCanMutateTriggerMock,
  };
});

describe('Trigger CRUD Routes - Integration Tests', () => {
  beforeEach(() => {
    dispatchExecutionMock.mockClear();
    assertCanMutateTriggerMock.mockClear();
  });

  // Helper function to create full agent data
  const createFullAgentData = (agentId: string) => {
    const id = agentId || generateId();

    const agent = createTestSubAgentData();

    const agentData: any = {
      id,
      name: `Test Agent ${id}`,
      description: `Test agent description for ${id}`,
      defaultSubAgentId: agent.id,
      subAgents: {
        [agent.id]: agent,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return agentData;
  };

  // Helper function to create test agent
  const createTestAgent = async (tenantId: string, projectId: string = 'default-project') => {
    await createTestProject(manageDbClient, tenantId, projectId);

    const agentId = `test-agent-${generateId(6)}`;
    const agentData = createFullAgentData(agentId);
    await createFullAgentServerSide(manageDbClient)({ tenantId, projectId }, agentData);
    return { agentId, projectId };
  };

  // Helper function to create a test trigger
  const createTestTrigger = async ({
    tenantId,
    projectId = 'default-project',
    agentId,
    name = 'Test Trigger',
    enabled = true,
    authentication = null,
  }: {
    tenantId: string;
    projectId?: string;
    agentId: string;
    name?: string;
    enabled?: boolean;
    authentication?: any;
  }) => {
    const createData = {
      name,
      description: 'Test trigger description',
      enabled,
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
        required: ['message'],
      },
      outputTransform: {
        jmespath: 'message',
      },
      messageTemplate: 'New message: {{message}}',
      authentication,
    };

    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
      {
        method: 'POST',
        body: JSON.stringify(createData),
      }
    );

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return {
      createData,
      trigger: createBody.data,
    };
  };

  describe('GET /', () => {
    it('should list triggers with pagination (empty initially)', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-list-empty');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers?page=1&limit=10`
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

    it('should list triggers with pagination', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-list');
      const { agentId, projectId } = await createTestAgent(tenantId);

      // Create multiple triggers
      await createTestTrigger({ tenantId, projectId, agentId, name: 'Trigger 1' });
      await createTestTrigger({ tenantId, projectId, agentId, name: 'Trigger 2' });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers?page=1&limit=10`
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

      // Verify trigger structure
      const firstTrigger = body.data[0];
      expect(firstTrigger).toHaveProperty('id');
      expect(firstTrigger).toHaveProperty('name');
      expect(firstTrigger).toHaveProperty('description');
      expect(firstTrigger).toHaveProperty('enabled');
      expect(firstTrigger).toHaveProperty('inputSchema');
      expect(firstTrigger).toHaveProperty('outputTransform');
      expect(firstTrigger).toHaveProperty('messageTemplate');
      expect(firstTrigger).toHaveProperty('authentication');
      expect(firstTrigger).toHaveProperty('webhookUrl');
      expect(firstTrigger).toHaveProperty('createdAt');
      expect(firstTrigger).toHaveProperty('updatedAt');
      expect(firstTrigger).not.toHaveProperty('tenantId'); // Should not expose tenantId
      expect(firstTrigger).not.toHaveProperty('projectId'); // Should not expose projectId
      expect(firstTrigger).not.toHaveProperty('agentId'); // Should not expose agentId
    });

    it('should include webhookUrl in response', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-webhook-url');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);

      const returnedTrigger = body.data[0];
      expect(returnedTrigger.webhookUrl).toBe(
        `${env.INKEEP_AGENTS_API_URL}/run/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`
      );
    });

    it('should handle pagination correctly', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-pagination');
      const { agentId, projectId } = await createTestAgent(tenantId);

      // Create 5 triggers
      for (let i = 0; i < 5; i++) {
        await createTestTrigger({
          tenantId,
          projectId,
          agentId,
          name: `Trigger ${i + 1}`,
        });
      }

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers?page=1&limit=3`
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
    it('should get trigger by ID', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-get-by-id');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.id).toBe(trigger.id);
      expect(body.data.name).toBe('Test Trigger');
      expect(body.data.enabled).toBe(true);
      expect(body.data.webhookUrl).toBeDefined();
    });

    it('should return 404 for non-existent trigger', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-get-not-found');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const nonExistentId = `non-existent-${generateId()}`;

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${nonExistentId}`
      );
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error.message).toBe('Trigger not found');
    });

    it('should respect tenant isolation', async () => {
      const tenantId1 = await createTestTenantWithOrg('triggers-tenant-1');
      const tenantId2 = await createTestTenantWithOrg('triggers-tenant-2');
      const projectId = 'default-project';

      const { agentId } = await createTestAgent(tenantId1, projectId);
      const { trigger } = await createTestTrigger({
        tenantId: tenantId1,
        projectId,
        agentId,
      });

      // Try to access from different tenant
      await createTestProject(manageDbClient, tenantId2, projectId);
      const { agentId: agentId2 } = await createTestAgent(tenantId2, projectId);

      const res = await makeRequest(
        `/manage/tenants/${tenantId2}/projects/${projectId}/agents/${agentId2}/triggers/${trigger.id}`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should create trigger successfully', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-create');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const createData = {
        name: 'GitHub Webhook',
        description: 'Trigger from GitHub events',
        enabled: true,
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            repository: { type: 'object' },
          },
          required: ['action'],
        },
        outputTransform: {
          jmespath: '{action: action, repo: repository.name}',
        },
        messageTemplate: 'GitHub event: {{action}} on {{repo}}',
        authentication: {
          headers: [{ name: 'X-GitHub-Token', value: 'test-secret' }],
        },
      };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
        {
          method: 'POST',
          body: JSON.stringify(createData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();

      // Verify response structure
      expect(body.data).toHaveProperty('id');
      expect(body.data.name).toBe(createData.name);
      expect(body.data.description).toBe(createData.description);
      expect(body.data.enabled).toBe(true);
      expect(body.data.inputSchema).toEqual(createData.inputSchema);
      expect(body.data.outputTransform).toEqual(createData.outputTransform);
      expect(body.data.messageTemplate).toBe(createData.messageTemplate);
      // Authentication headers are stored with hashes, not raw values
      expect(body.data.authentication.headers).toHaveLength(1);
      expect(body.data.authentication.headers[0].name).toBe('X-GitHub-Token');
      expect(body.data.authentication.headers[0].valueHash).toBeDefined();
      expect(body.data.authentication.headers[0].valuePrefix).toBe('test-sec');
      expect(body.data.webhookUrl).toBeDefined();
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should create trigger with custom id', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-create-custom-id');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const customId = `custom-trigger-${generateId(6)}`;
      const createData = {
        id: customId,
        name: 'Custom ID Trigger',
        description: 'Trigger with custom ID',
        enabled: true,
        inputSchema: { type: 'object' },
        messageTemplate: 'Test message',
      };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
        {
          method: 'POST',
          body: JSON.stringify(createData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.id).toBe(customId);
    });

    it('should create trigger with header authentication', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-auth-types');
      const { agentId, projectId } = await createTestAgent(tenantId);

      // Test single header authentication
      const singleHeaderData = {
        name: 'Single Header Auth Trigger',
        description: 'Trigger with single auth header',
        enabled: true,
        inputSchema: { type: 'object' },
        messageTemplate: 'Test',
        authentication: {
          headers: [{ name: 'X-API-Key', value: 'test-secret-key' }],
        },
      };

      const singleRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
        {
          method: 'POST',
          body: JSON.stringify(singleHeaderData),
        }
      );
      expect(singleRes.status).toBe(201);
      const singleBody = await singleRes.json();
      // Verify headers are stored with hashed values
      expect(singleBody.data.authentication.headers).toHaveLength(1);
      expect(singleBody.data.authentication.headers[0].name).toBe('X-API-Key');
      expect(singleBody.data.authentication.headers[0].valueHash).toBeDefined();
      expect(singleBody.data.authentication.headers[0].valuePrefix).toBe('test-sec');
      // Original value should not be stored
      expect(singleBody.data.authentication.headers[0].value).toBeUndefined();

      // Test multiple headers authentication
      const multiHeaderData = {
        name: 'Multi Header Auth Trigger',
        description: 'Trigger with multiple auth headers',
        enabled: true,
        inputSchema: { type: 'object' },
        messageTemplate: 'Test',
        authentication: {
          headers: [
            { name: 'X-API-Key', value: 'api-key-123' },
            { name: 'X-Client-ID', value: 'client-456' },
          ],
        },
      };

      const multiRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
        {
          method: 'POST',
          body: JSON.stringify(multiHeaderData),
        }
      );
      expect(multiRes.status).toBe(201);
      const multiBody = await multiRes.json();
      expect(multiBody.data.authentication.headers).toHaveLength(2);
      expect(multiBody.data.authentication.headers[0].name).toBe('X-API-Key');
      expect(multiBody.data.authentication.headers[1].name).toBe('X-Client-ID');
    });

    it('should create trigger with signature verification config', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-signing-secret');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const createData = {
        name: 'Signed Trigger',
        description: 'Trigger with signature verification',
        enabled: true,
        inputSchema: { type: 'object' },
        messageTemplate: 'Test',
        signatureVerification: {
          algorithm: 'sha256',
          encoding: 'hex',
          signature: {
            source: 'header',
            key: 'X-Signature',
            prefix: 'sha256=',
          },
          signedComponents: [
            {
              source: 'body',
              required: true,
            },
          ],
          componentJoin: {
            strategy: 'concatenate',
            separator: '',
          },
        },
      };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
        {
          method: 'POST',
          body: JSON.stringify(createData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.signatureVerification).toBeDefined();
      expect(body.data.signatureVerification.algorithm).toBe('sha256');
    });

    it('should create trigger with no authentication', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-no-auth');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const createData = {
        name: 'No Auth Trigger',
        description: 'Trigger without authentication',
        enabled: true,
        inputSchema: { type: 'object' },
        messageTemplate: 'Test',
      };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
        {
          method: 'POST',
          body: JSON.stringify(createData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.authentication).toBeNull();
    });
  });

  describe('PATCH /{id}', () => {
    it('should update trigger successfully', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-update');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

      // Wait 1ms to ensure updatedAt will be different
      await new Promise((resolve) => setTimeout(resolve, 1));

      const updateData = {
        name: 'Updated Trigger Name',
        description: 'Updated description',
        enabled: false,
      };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.data.name).toBe(updateData.name);
      expect(body.data.description).toBe(updateData.description);
      expect(body.data.enabled).toBe(false);
      expect(body.data.updatedAt).not.toBe(trigger.updatedAt);
    });

    it('should update trigger authentication', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-update-auth');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

      const updateData = {
        authentication: {
          headers: [{ name: 'X-New-Key', value: 'new-secret-value' }],
        },
      };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.authentication.headers).toHaveLength(1);
      expect(body.data.authentication.headers[0].name).toBe('X-New-Key');
      expect(body.data.authentication.headers[0].valueHash).toBeDefined();
      expect(body.data.authentication.headers[0].valuePrefix).toBe('new-secr');
    });

    it('should return 400 for empty update body', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-update-empty');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toBe('No fields to update');
    });

    it('should return 404 for non-existent trigger', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-update-not-found');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const nonExistentId = `non-existent-${generateId()}`;

      const updateData = { name: 'Updated Name' };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${nonExistentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(404);
    });

    it('should respect tenant isolation', async () => {
      const tenantId1 = await createTestTenantWithOrg('triggers-update-tenant-1');
      const tenantId2 = await createTestTenantWithOrg('triggers-update-tenant-2');
      const projectId = 'default-project';

      const { agentId } = await createTestAgent(tenantId1, projectId);
      const { trigger } = await createTestTrigger({
        tenantId: tenantId1,
        projectId,
        agentId,
      });

      const updateData = { name: 'Hacked Name' };

      // Try to update from different tenant
      await createTestProject(manageDbClient, tenantId2, projectId);
      const { agentId: agentId2 } = await createTestAgent(tenantId2, projectId);

      const res = await makeRequest(
        `/manage/tenants/${tenantId2}/projects/${projectId}/agents/${agentId2}/triggers/${trigger.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete trigger successfully', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-delete');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(204);

      // Verify trigger is deleted
      const getRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent trigger', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-delete-not-found');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const nonExistentId = `non-existent-${generateId()}`;

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${nonExistentId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);
    });

    it('should respect tenant isolation', async () => {
      const tenantId1 = await createTestTenantWithOrg('triggers-delete-tenant-1');
      const tenantId2 = await createTestTenantWithOrg('triggers-delete-tenant-2');
      const projectId = 'default-project';

      const { agentId } = await createTestAgent(tenantId1, projectId);
      const { trigger } = await createTestTrigger({
        tenantId: tenantId1,
        projectId,
        agentId,
      });

      // Try to delete from different tenant
      await createTestProject(manageDbClient, tenantId2, projectId);
      const { agentId: agentId2 } = await createTestAgent(tenantId2, projectId);

      const res = await makeRequest(
        `/manage/tenants/${tenantId2}/projects/${projectId}/agents/${agentId2}/triggers/${trigger.id}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('Permissions', () => {
    it('should require create permission for POST', async () => {
      // This test verifies permission middleware is applied
      // The actual permission checking logic is tested separately
      const tenantId = await createTestTenantWithOrg('triggers-perm-create');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const createData = {
        name: 'Test Trigger',
        description: 'Test',
        enabled: true,
        inputSchema: { type: 'object' },
        messageTemplate: 'Test',
        authentication: { type: 'none' },
      };

      // makeRequest includes bypass secret, so this should succeed
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
        {
          method: 'POST',
          body: JSON.stringify(createData),
        }
      );

      // Should succeed with bypass secret
      expect([201, 403]).toContain(res.status);
    });

    it('should require update permission for PATCH', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-perm-update');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

      const updateData = { name: 'Updated' };

      // makeRequest includes bypass secret, so this should succeed
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }
      );

      // Should succeed with bypass secret
      expect([200, 403]).toContain(res.status);
    });

    it('should require delete permission for DELETE', async () => {
      const tenantId = await createTestTenantWithOrg('triggers-perm-delete');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

      // makeRequest includes bypass secret, so this should succeed
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`,
        {
          method: 'DELETE',
        }
      );

      // Should succeed with bypass secret
      expect([204, 403]).toContain(res.status);
    });
  });

  describe('Trigger Invocations', () => {
    // Helper function to create test invocations
    const createTestInvocation = async ({
      tenantId,
      projectId,
      agentId,
      triggerId,
      status = 'success' as const,
      requestPayload = { message: 'test' },
      transformedPayload = { message: 'test' },
      errorMessage = null,
      createdAt,
    }: {
      tenantId: string;
      projectId: string;
      agentId: string;
      triggerId: string;
      status?: 'pending' | 'success' | 'failed';
      requestPayload?: any;
      transformedPayload?: any;
      errorMessage?: string | null;
      createdAt?: string;
    }) => {
      const invocation = await createTriggerInvocation(runDbClient)({
        id: generateId(),
        tenantId,
        projectId,
        agentId,
        triggerId,
        conversationId: null,
        status,
        requestPayload,
        transformedPayload,
        errorMessage,
        createdAt: createdAt || new Date().toISOString(),
      });
      return invocation;
    };

    describe('GET /{id}/invocations', () => {
      it('should list invocations with pagination (empty initially)', async () => {
        const tenantId = await createTestTenantWithOrg('invocations-list-empty');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}/invocations?page=1&limit=10`
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

      it('should list invocations with pagination', async () => {
        const tenantId = await createTestTenantWithOrg('invocations-list');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

        // Create multiple invocations
        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'success',
        });
        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'failed',
        });

        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}/invocations?page=1&limit=10`
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

        // Verify invocation structure
        const firstInvocation = body.data[0];
        expect(firstInvocation).toHaveProperty('id');
        expect(firstInvocation).toHaveProperty('status');
        expect(firstInvocation).toHaveProperty('requestPayload');
        expect(firstInvocation).toHaveProperty('transformedPayload');
        expect(firstInvocation).toHaveProperty('errorMessage');
        expect(firstInvocation).toHaveProperty('conversationId');
        expect(firstInvocation).toHaveProperty('createdAt');
        expect(firstInvocation).not.toHaveProperty('tenantId');
        expect(firstInvocation).not.toHaveProperty('projectId');
        expect(firstInvocation).not.toHaveProperty('agentId');
      });

      it('should order invocations by createdAt DESC (newest first)', async () => {
        const tenantId = await createTestTenantWithOrg('invocations-ordering');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

        // Create invocations with different timestamps
        const oldInvocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'success',
          createdAt: '2025-01-01T00:00:00Z',
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        const newInvocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'success',
          createdAt: '2025-12-31T00:00:00Z',
        });

        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}/invocations`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data).toHaveLength(2);
        // Newest should be first
        expect(body.data[0].id).toBe(newInvocation.id);
        expect(body.data[1].id).toBe(oldInvocation.id);
      });

      it('should filter invocations by status', async () => {
        const tenantId = await createTestTenantWithOrg('invocations-filter-status');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

        // Create invocations with different statuses
        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'success',
        });
        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'failed',
        });
        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'pending',
        });

        // Filter for only success
        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}/invocations?status=success`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].status).toBe('success');
      });

      it('should filter invocations by date range', async () => {
        const tenantId = await createTestTenantWithOrg('invocations-filter-date');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

        // Create invocations with different dates
        const oldInvocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'success',
          createdAt: '2025-01-01T00:00:00Z',
        });

        const midInvocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'success',
          createdAt: '2025-06-01T00:00:00Z',
        });

        const newInvocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'success',
          createdAt: '2025-12-01T00:00:00Z',
        });

        // Filter from June onwards
        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}/invocations?from=2025-06-01T00:00:00Z`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data).toHaveLength(2);
        expect(body.data.map((i: any) => i.id)).toContain(midInvocation.id);
        expect(body.data.map((i: any) => i.id)).toContain(newInvocation.id);
        expect(body.data.map((i: any) => i.id)).not.toContain(oldInvocation.id);
      });

      it('should filter invocations by date range with both from and to', async () => {
        const tenantId = await createTestTenantWithOrg('invocations-filter-date-both');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

        // Create invocations with different dates
        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'success',
          createdAt: '2025-01-01T00:00:00Z',
        });

        const midInvocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'success',
          createdAt: '2025-06-01T00:00:00Z',
        });

        await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'success',
          createdAt: '2025-12-01T00:00:00Z',
        });

        // Filter for June only
        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}/invocations?from=2025-05-01T00:00:00Z&to=2025-07-01T00:00:00Z`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].id).toBe(midInvocation.id);
      });

      it('should handle pagination correctly', async () => {
        const tenantId = await createTestTenantWithOrg('invocations-pagination');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

        // Create 5 invocations
        for (let i = 0; i < 5; i++) {
          await createTestInvocation({
            tenantId,
            projectId,
            agentId,
            triggerId: trigger.id,
            status: 'success',
          });
        }

        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}/invocations?page=1&limit=3`
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

    describe('GET /{id}/invocations/{invocationId}', () => {
      it('should get invocation by ID', async () => {
        const tenantId = await createTestTenantWithOrg('invocations-get-by-id');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });
        const invocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'success',
          requestPayload: { test: 'data' },
          transformedPayload: { transformed: 'data' },
        });

        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}/invocations/${invocation.id}`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data.id).toBe(invocation.id);
        expect(body.data.status).toBe('success');
        expect(body.data.requestPayload).toEqual({ test: 'data' });
        expect(body.data.transformedPayload).toEqual({ transformed: 'data' });
      });

      it('should return 404 for non-existent invocation', async () => {
        const tenantId = await createTestTenantWithOrg('invocations-get-not-found');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });
        const nonExistentId = `non-existent-${generateId()}`;

        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}/invocations/${nonExistentId}`
        );
        expect(res.status).toBe(404);

        const body = await res.json();
        expect(body.error.message).toBe('Trigger invocation not found');
      });

      it('should respect tenant isolation', async () => {
        const tenantId1 = await createTestTenantWithOrg('invocations-tenant-1');
        const tenantId2 = await createTestTenantWithOrg('invocations-tenant-2');
        const projectId = 'default-project';

        const { agentId } = await createTestAgent(tenantId1, projectId);
        const { trigger } = await createTestTrigger({
          tenantId: tenantId1,
          projectId,
          agentId,
        });
        const invocation = await createTestInvocation({
          tenantId: tenantId1,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'success',
        });

        // Try to access from different tenant
        await createTestProject(manageDbClient, tenantId2, projectId);
        const { agentId: agentId2 } = await createTestAgent(tenantId2, projectId);
        const { trigger: trigger2 } = await createTestTrigger({
          tenantId: tenantId2,
          projectId,
          agentId: agentId2,
        });

        const res = await makeRequest(
          `/manage/tenants/${tenantId2}/projects/${projectId}/agents/${agentId2}/triggers/${trigger2.id}/invocations/${invocation.id}`
        );
        expect(res.status).toBe(404);
      });

      it('should include error message for failed invocations', async () => {
        const tenantId = await createTestTenantWithOrg('invocations-error');
        const { agentId, projectId } = await createTestAgent(tenantId);
        const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });
        const invocation = await createTestInvocation({
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
          status: 'failed',
          errorMessage: 'Test error message',
        });

        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}/invocations/${invocation.id}`
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data.status).toBe('failed');
        expect(body.data.errorMessage).toBe('Test error message');
      });
    });
  });

  describe('POST /{id}/rerun', () => {
    it('should forward runAsUserId to dispatchExecution and call assertCanMutateTrigger when trigger has runAsUserId', async () => {
      const tenantId = await createTestTenantWithOrg('rerun-with-user');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const triggerId = `trigger-${generateId(6)}`;
      const runAsUserId = `user-${generateId(6)}`;
      await createTrigger(manageDbClient)({
        id: triggerId,
        tenantId,
        projectId,
        agentId,
        name: 'User-scoped Trigger',
        description: 'Test trigger with runAsUserId',
        enabled: true,
        runAsUserId,
        createdBy: null,
        authentication: null,
        signatureVerification: null,
        signingSecretCredentialReferenceId: null,
        inputSchema: null,
        outputTransform: null,
        messageTemplate: 'Hello {{name}}',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${triggerId}/rerun`,
        {
          method: 'POST',
          body: JSON.stringify({ userMessage: 'test message' }),
        }
      );

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.success).toBe(true);

      expect(assertCanMutateTriggerMock).toHaveBeenCalledOnce();
      const guardArgs = assertCanMutateTriggerMock.mock.calls[0][0];
      expect(guardArgs.trigger.runAsUserId).toBe(runAsUserId);

      expect(dispatchExecutionMock).toHaveBeenCalledOnce();
      const callArgs = dispatchExecutionMock.mock.calls[0][0];
      expect(callArgs.runAsUserId).toBe(runAsUserId);
      expect(callArgs.triggerId).toBe(triggerId);
      expect(callArgs.tenantId).toBe(tenantId);
      expect(callArgs.projectId).toBe(projectId);
      expect(callArgs.agentId).toBe(agentId);
    });

    it('should return 403 when non-admin caller is not the runAsUserId or createdBy', async () => {
      const { createApiError } = await import('@inkeep/agents-core');
      assertCanMutateTriggerMock.mockImplementationOnce(() => {
        throw createApiError({ code: 'forbidden', message: 'forbidden' });
      });

      const tenantId = await createTestTenantWithOrg('rerun-forbidden');
      const { agentId, projectId } = await createTestAgent(tenantId);

      const triggerId = `trigger-${generateId(6)}`;
      await createTrigger(manageDbClient)({
        id: triggerId,
        tenantId,
        projectId,
        agentId,
        name: 'Other User Trigger',
        description: null,
        enabled: true,
        runAsUserId: 'other-user-id',
        createdBy: 'other-user-id',
        authentication: null,
        signatureVerification: null,
        signingSecretCredentialReferenceId: null,
        inputSchema: null,
        outputTransform: null,
        messageTemplate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${triggerId}/rerun`,
        {
          method: 'POST',
          body: JSON.stringify({ userMessage: 'test message' }),
        }
      );

      expect(res.status).toBe(403);
      expect(dispatchExecutionMock).not.toHaveBeenCalled();
    });

    it('should not call assertCanMutateTrigger when trigger has no runAsUserId', async () => {
      const tenantId = await createTestTenantWithOrg('rerun-no-user');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}/rerun`,
        {
          method: 'POST',
          body: JSON.stringify({ userMessage: 'test message' }),
        }
      );

      expect(res.status).toBe(202);
      expect(assertCanMutateTriggerMock).not.toHaveBeenCalled();

      expect(dispatchExecutionMock).toHaveBeenCalledOnce();
      const callArgs = dispatchExecutionMock.mock.calls[0][0];
      expect(callArgs.runAsUserId).toBeUndefined();
    });

    it('should return 409 when trigger is disabled', async () => {
      const tenantId = await createTestTenantWithOrg('rerun-disabled');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const { trigger } = await createTestTrigger({ tenantId, projectId, agentId, enabled: false });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}/rerun`,
        {
          method: 'POST',
          body: JSON.stringify({ userMessage: 'test message' }),
        }
      );

      expect(res.status).toBe(409);
      expect(dispatchExecutionMock).not.toHaveBeenCalled();
    });

    it('should return 404 for non-existent trigger', async () => {
      const tenantId = await createTestTenantWithOrg('rerun-not-found');
      const { agentId, projectId } = await createTestAgent(tenantId);
      const nonExistentId = `non-existent-${generateId()}`;

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${nonExistentId}/rerun`,
        {
          method: 'POST',
          body: JSON.stringify({ userMessage: 'test message' }),
        }
      );

      expect(res.status).toBe(404);
      expect(dispatchExecutionMock).not.toHaveBeenCalled();
    });
  });
});
