import { generateId } from '@inkeep/agents-core';
import { agents } from '@inkeep/agents-core/db/manage-schema';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/webhook-url-security', async () => {
  const actual = await vi.importActual<typeof import('../../../../utils/webhook-url-security')>(
    '../../../../utils/webhook-url-security'
  );
  return {
    ...actual,
    fetchWithSsrfProtection: vi.fn(),
  };
});

import manageDbClient from '../../../../data/db/manageDbClient';
import {
  fetchWithSsrfProtection,
  WebhookUrlSecurityError,
} from '../../../../utils/webhook-url-security';
import { makeRequest } from '../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

const mockSsrfFetch = fetchWithSsrfProtection as ReturnType<typeof vi.fn>;

describe('Webhook Destination CRUD Routes - Integration Tests', () => {
  const createTestProjectForWebhooks = async (tenantId: string, projectId = 'default-project') => {
    await createTestProject(manageDbClient, tenantId, projectId);
    return { projectId };
  };

  const basePath = (tenantId: string, projectId: string) =>
    `/manage/tenants/${tenantId}/projects/${projectId}/webhook-destinations`;

  const createTestWebhookDestination = async ({
    tenantId,
    projectId,
    name = 'Test Webhook',
    url = 'https://example.com/webhook',
    eventTypes = ['conversation.created', 'conversation.updated'],
    enabled = true,
    headers,
  }: {
    tenantId: string;
    projectId: string;
    name?: string;
    url?: string;
    eventTypes?: string[];
    enabled?: boolean;
    headers?: Record<string, string>;
  }) => {
    const createData: Record<string, unknown> = {
      name,
      url,
      eventTypes,
      enabled,
    };
    if (headers !== undefined) {
      createData.headers = headers;
    }

    const createRes = await makeRequest(basePath(tenantId, projectId), {
      method: 'POST',
      body: JSON.stringify(createData),
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return {
      createData,
      webhookDestination: createBody.data,
    };
  };

  describe('GET /', () => {
    it('should list webhook destinations with pagination (empty initially)', async () => {
      const tenantId = await createTestTenantWithOrg('wh-list-empty');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const res = await makeRequest(`${basePath(tenantId, projectId)}?page=1&limit=10`);
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

    it('should list created webhook destinations', async () => {
      const tenantId = await createTestTenantWithOrg('wh-list');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      await createTestWebhookDestination({ tenantId, projectId, name: 'Hook 1' });
      await createTestWebhookDestination({ tenantId, projectId, name: 'Hook 2' });

      const res = await makeRequest(`${basePath(tenantId, projectId)}?page=1&limit=10`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });

    it('should paginate results', async () => {
      const tenantId = await createTestTenantWithOrg('wh-paginate');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      for (let i = 0; i < 3; i++) {
        await createTestWebhookDestination({
          tenantId,
          projectId,
          name: `Hook ${i}`,
        });
      }

      const page1Res = await makeRequest(`${basePath(tenantId, projectId)}?page=1&limit=2`);
      const page1Body = await page1Res.json();
      expect(page1Body.data).toHaveLength(2);
      expect(page1Body.pagination.pages).toBe(2);

      const page2Res = await makeRequest(`${basePath(tenantId, projectId)}?page=2&limit=2`);
      const page2Body = await page2Res.json();
      expect(page2Body.data).toHaveLength(1);
    });

    it('should not return scope fields (tenantId, projectId) in response', async () => {
      const tenantId = await createTestTenantWithOrg('wh-no-scope');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      await createTestWebhookDestination({ tenantId, projectId });

      const res = await makeRequest(`${basePath(tenantId, projectId)}?page=1&limit=10`);
      const body = await res.json();

      for (const dest of body.data) {
        expect(dest.tenantId).toBeUndefined();
        expect(dest.projectId).toBeUndefined();
      }
    });
  });

  describe('GET /{id}', () => {
    it('should return a webhook destination by id', async () => {
      const tenantId = await createTestTenantWithOrg('wh-get');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const { webhookDestination } = await createTestWebhookDestination({
        tenantId,
        projectId,
        name: 'Get Test',
        url: 'https://get-test.example.com/hook',
        eventTypes: ['conversation.created', 'conversation.updated'],
      });

      const res = await makeRequest(`${basePath(tenantId, projectId)}/${webhookDestination.id}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.id).toBe(webhookDestination.id);
      expect(body.data.name).toBe('Get Test');
      expect(body.data.url).toBe('https://get-test.example.com/hook');
      expect(body.data.eventTypes).toEqual(['conversation.created', 'conversation.updated']);
    });

    it('should return 404 for non-existent webhook destination', async () => {
      const tenantId = await createTestTenantWithOrg('wh-get-404');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const res = await makeRequest(`${basePath(tenantId, projectId)}/non-existent-id`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should create a webhook destination', async () => {
      const tenantId = await createTestTenantWithOrg('wh-create');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const res = await makeRequest(basePath(tenantId, projectId), {
        method: 'POST',
        body: JSON.stringify({
          name: 'New Hook',
          url: 'https://new-hook.example.com',
          eventTypes: ['conversation.created', 'conversation.updated'],
        }),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data.name).toBe('New Hook');
      expect(body.data.url).toBe('https://new-hook.example.com');
      expect(body.data.eventTypes).toEqual(['conversation.created', 'conversation.updated']);
      expect(body.data.enabled).toBe(true);
      expect(body.data.id).toBeDefined();
    });

    it('should create a disabled webhook destination', async () => {
      const tenantId = await createTestTenantWithOrg('wh-create-disabled');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const res = await makeRequest(basePath(tenantId, projectId), {
        method: 'POST',
        body: JSON.stringify({
          name: 'Disabled Hook',
          url: 'https://disabled.example.com',
          eventTypes: ['conversation.created', 'conversation.updated'],
          enabled: false,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.enabled).toBe(false);
    });

    it('should accept a custom id', async () => {
      const tenantId = await createTestTenantWithOrg('wh-create-custom-id');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const customId = `custom-${generateId(6)}`;
      const res = await makeRequest(basePath(tenantId, projectId), {
        method: 'POST',
        body: JSON.stringify({
          id: customId,
          name: 'Custom ID Hook',
          url: 'https://custom.example.com',
          eventTypes: ['conversation.created', 'conversation.updated'],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.id).toBe(customId);
    });

    it('should reject ftp:// URLs (SSRF protection)', async () => {
      const tenantId = await createTestTenantWithOrg('wh-create-bad-proto');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const res = await makeRequest(basePath(tenantId, projectId), {
        method: 'POST',
        body: JSON.stringify({
          name: 'Bad Protocol',
          url: 'ftp://evil.example.com/loot',
          eventTypes: ['conversation.created'],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject URLs with embedded credentials', async () => {
      const tenantId = await createTestTenantWithOrg('wh-create-bad-creds');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const res = await makeRequest(basePath(tenantId, projectId), {
        method: 'POST',
        body: JSON.stringify({
          name: 'Embedded Creds',
          url: 'https://user:pass@example.com/hook',
          eventTypes: ['conversation.created'],
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /{id}', () => {
    it('should update webhook destination name', async () => {
      const tenantId = await createTestTenantWithOrg('wh-update-name');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const { webhookDestination } = await createTestWebhookDestination({
        tenantId,
        projectId,
      });

      const res = await makeRequest(`${basePath(tenantId, projectId)}/${webhookDestination.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe('Updated Name');
    });

    it('should update webhook destination url', async () => {
      const tenantId = await createTestTenantWithOrg('wh-update-url');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const { webhookDestination } = await createTestWebhookDestination({
        tenantId,
        projectId,
      });

      const res = await makeRequest(`${basePath(tenantId, projectId)}/${webhookDestination.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ url: 'https://updated-url.example.com' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.url).toBe('https://updated-url.example.com');
    });

    it('should toggle enabled flag', async () => {
      const tenantId = await createTestTenantWithOrg('wh-toggle');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const { webhookDestination } = await createTestWebhookDestination({
        tenantId,
        projectId,
        enabled: true,
      });

      const res = await makeRequest(`${basePath(tenantId, projectId)}/${webhookDestination.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: false }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.enabled).toBe(false);
    });

    it('should update eventTypes', async () => {
      const tenantId = await createTestTenantWithOrg('wh-update-events');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const { webhookDestination } = await createTestWebhookDestination({
        tenantId,
        projectId,
        eventTypes: ['conversation.created'],
      });

      const res = await makeRequest(`${basePath(tenantId, projectId)}/${webhookDestination.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          eventTypes: ['conversation.created', 'conversation.updated'],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.eventTypes).toEqual(['conversation.created', 'conversation.updated']);
    });

    it('should return 404 for non-existent webhook destination', async () => {
      const tenantId = await createTestTenantWithOrg('wh-update-404');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const res = await makeRequest(`${basePath(tenantId, projectId)}/non-existent-id`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Ghost' }),
      });

      expect(res.status).toBe(404);
    });

    it('should return 200 with unchanged resource when no update fields are provided', async () => {
      const tenantId = await createTestTenantWithOrg('wh-update-empty');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const { webhookDestination } = await createTestWebhookDestination({
        tenantId,
        projectId,
      });

      const res = await makeRequest(`${basePath(tenantId, projectId)}/${webhookDestination.id}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(webhookDestination.id);
    });

    it('should reject ftp:// URLs on update (SSRF protection)', async () => {
      const tenantId = await createTestTenantWithOrg('wh-update-bad-proto');
      const { projectId } = await createTestProjectForWebhooks(tenantId);
      const { webhookDestination } = await createTestWebhookDestination({ tenantId, projectId });

      const res = await makeRequest(`${basePath(tenantId, projectId)}/${webhookDestination.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ url: 'ftp://evil.example.com/loot' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject URLs with embedded credentials on update', async () => {
      const tenantId = await createTestTenantWithOrg('wh-update-bad-creds');
      const { projectId } = await createTestProjectForWebhooks(tenantId);
      const { webhookDestination } = await createTestWebhookDestination({ tenantId, projectId });

      const res = await makeRequest(`${basePath(tenantId, projectId)}/${webhookDestination.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ url: 'https://user:pass@example.com/hook' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete a webhook destination', async () => {
      const tenantId = await createTestTenantWithOrg('wh-delete');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const { webhookDestination } = await createTestWebhookDestination({
        tenantId,
        projectId,
      });

      const deleteRes = await makeRequest(
        `${basePath(tenantId, projectId)}/${webhookDestination.id}`,
        {
          method: 'DELETE',
        }
      );

      expect(deleteRes.status).toBe(204);

      const getRes = await makeRequest(`${basePath(tenantId, projectId)}/${webhookDestination.id}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent webhook destination', async () => {
      const tenantId = await createTestTenantWithOrg('wh-delete-404');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const res = await makeRequest(`${basePath(tenantId, projectId)}/non-existent-id`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });

  describe('Tenant isolation', () => {
    it('should not return webhook destinations from other tenants', async () => {
      const tenantId1 = await createTestTenantWithOrg('wh-iso-1');
      const tenantId2 = await createTestTenantWithOrg('wh-iso-2');

      const project1 = await createTestProjectForWebhooks(tenantId1);
      const project2 = await createTestProjectForWebhooks(tenantId2);

      await createTestWebhookDestination({
        tenantId: tenantId1,
        projectId: project1.projectId,
        name: 'Tenant 1 Hook',
      });

      await createTestWebhookDestination({
        tenantId: tenantId2,
        projectId: project2.projectId,
        name: 'Tenant 2 Hook',
      });

      const res1 = await makeRequest(`${basePath(tenantId1, project1.projectId)}?page=1&limit=10`);
      const body1 = await res1.json();
      expect(body1.data).toHaveLength(1);
      expect(body1.data[0].name).toBe('Tenant 1 Hook');

      const res2 = await makeRequest(`${basePath(tenantId2, project2.projectId)}?page=1&limit=10`);
      const body2 = await res2.json();
      expect(body2.data).toHaveLength(1);
      expect(body2.data[0].name).toBe('Tenant 2 Hook');
    });
  });

  describe('Agent scoping', () => {
    const ensureAgent = async (tenantId: string, projectId: string, agentId: string) => {
      await manageDbClient
        .insert(agents)
        .values({ tenantId, projectId, id: agentId, name: `Agent ${agentId}` })
        .onConflictDoNothing();
    };

    it('should create a webhook destination with agentIds', async () => {
      const tenantId = await createTestTenantWithOrg('wh-agent-create');
      const { projectId } = await createTestProjectForWebhooks(tenantId);
      await ensureAgent(tenantId, projectId, 'agent-a');
      await ensureAgent(tenantId, projectId, 'agent-b');

      const res = await makeRequest(basePath(tenantId, projectId), {
        method: 'POST',
        body: JSON.stringify({
          name: 'Agent Scoped Hook',
          url: 'https://agent-scoped.example.com',
          eventTypes: ['conversation.created'],
          agentIds: ['agent-a', 'agent-b'],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.agentIds.sort()).toEqual(['agent-a', 'agent-b']);
    });

    it('should create a webhook destination without agentIds (all agents)', async () => {
      const tenantId = await createTestTenantWithOrg('wh-agent-all');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const res = await makeRequest(basePath(tenantId, projectId), {
        method: 'POST',
        body: JSON.stringify({
          name: 'All Agents Hook',
          url: 'https://all-agents.example.com',
          eventTypes: ['conversation.updated'],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.agentIds).toEqual([]);
    });

    it('should update agentIds on PATCH', async () => {
      const tenantId = await createTestTenantWithOrg('wh-agent-update');
      const { projectId } = await createTestProjectForWebhooks(tenantId);
      await ensureAgent(tenantId, projectId, 'agent-x');

      const { webhookDestination } = await createTestWebhookDestination({
        tenantId,
        projectId,
      });

      const patchRes = await makeRequest(
        `${basePath(tenantId, projectId)}/${webhookDestination.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ agentIds: ['agent-x'] }),
        }
      );

      expect(patchRes.status).toBe(200);
      const patchBody = await patchRes.json();
      expect(patchBody.data.agentIds).toEqual(['agent-x']);

      const getRes = await makeRequest(`${basePath(tenantId, projectId)}/${webhookDestination.id}`);
      const getBody = await getRes.json();
      expect(getBody.data.agentIds).toEqual(['agent-x']);
    });
  });

  describe('Custom headers', () => {
    it('should create a webhook destination with custom headers', async () => {
      const tenantId = await createTestTenantWithOrg('wh-headers-create');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const headers = { 'X-Api-Key': 'secret-123', 'X-Custom': 'value' };
      const { webhookDestination } = await createTestWebhookDestination({
        tenantId,
        projectId,
        headers,
      });

      expect(webhookDestination.headers).toEqual(headers);
    });

    it('should round-trip headers through create and get', async () => {
      const tenantId = await createTestTenantWithOrg('wh-headers-roundtrip');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const headers = { Authorization: 'Bearer tok-123', 'X-Trace-Id': 'abc' };
      const { webhookDestination } = await createTestWebhookDestination({
        tenantId,
        projectId,
        headers,
      });

      const getRes = await makeRequest(`${basePath(tenantId, projectId)}/${webhookDestination.id}`);
      expect(getRes.status).toBe(200);
      const { data: fetched } = await getRes.json();
      expect(fetched.headers).toEqual(headers);
    });

    it('should update headers via PATCH', async () => {
      const tenantId = await createTestTenantWithOrg('wh-headers-update');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const { webhookDestination } = await createTestWebhookDestination({
        tenantId,
        projectId,
        headers: { 'X-Old': 'old-value' },
      });

      const patchRes = await makeRequest(
        `${basePath(tenantId, projectId)}/${webhookDestination.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ headers: { 'X-New': 'new-value' } }),
        }
      );

      expect(patchRes.status).toBe(200);
      const { data: updated } = await patchRes.json();
      expect(updated.headers).toEqual({ 'X-New': 'new-value' });
    });

    it('should create a webhook destination without headers (null by default)', async () => {
      const tenantId = await createTestTenantWithOrg('wh-headers-null');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const { webhookDestination } = await createTestWebhookDestination({
        tenantId,
        projectId,
      });

      expect(webhookDestination.headers).toBeNull();
    });

    it('should include custom headers in test delivery', async () => {
      const tenantId = await createTestTenantWithOrg('wh-headers-test-delivery');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const headers = { 'X-Webhook-Secret': 'my-secret' };
      const { webhookDestination } = await createTestWebhookDestination({
        tenantId,
        projectId,
        headers,
      });

      mockSsrfFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const res = await makeRequest(
        `${basePath(tenantId, projectId)}/${webhookDestination.id}/test`,
        { method: 'POST' }
      );

      expect(res.status).toBe(200);
      expect(mockSsrfFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Secret': 'my-secret',
            'Content-Type': 'application/json',
            'User-Agent': 'Inkeep-Webhooks/1.0',
          }),
        })
      );
    });
  });

  describe('CRUD round-trip', () => {
    it('should create, read, update, and delete a webhook destination', async () => {
      const tenantId = await createTestTenantWithOrg('wh-roundtrip');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const createRes = await makeRequest(basePath(tenantId, projectId), {
        method: 'POST',
        body: JSON.stringify({
          name: 'Roundtrip Hook',
          url: 'https://roundtrip.example.com',
          eventTypes: ['conversation.created', 'conversation.updated'],
        }),
      });
      expect(createRes.status).toBe(201);
      const { data: created } = await createRes.json();

      const getRes = await makeRequest(`${basePath(tenantId, projectId)}/${created.id}`);
      expect(getRes.status).toBe(200);
      const { data: fetched } = await getRes.json();
      expect(fetched.name).toBe('Roundtrip Hook');

      const updateRes = await makeRequest(`${basePath(tenantId, projectId)}/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Updated Roundtrip',
          eventTypes: ['conversation.created', 'conversation.updated'],
        }),
      });
      expect(updateRes.status).toBe(200);
      const { data: updated } = await updateRes.json();
      expect(updated.name).toBe('Updated Roundtrip');
      expect(updated.eventTypes).toEqual(['conversation.created', 'conversation.updated']);

      const deleteRes = await makeRequest(`${basePath(tenantId, projectId)}/${created.id}`, {
        method: 'DELETE',
      });
      expect(deleteRes.status).toBe(204);

      const finalGetRes = await makeRequest(`${basePath(tenantId, projectId)}/${created.id}`);
      expect(finalGetRes.status).toBe(404);
    });
  });

  describe('POST /{id}/test', () => {
    beforeEach(() => {
      mockSsrfFetch.mockReset();
    });

    it('should return 200 with success+statusCode on a 2xx delivery', async () => {
      const tenantId = await createTestTenantWithOrg('wh-test-success');
      const { projectId } = await createTestProjectForWebhooks(tenantId);
      const { webhookDestination } = await createTestWebhookDestination({ tenantId, projectId });

      mockSsrfFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const res = await makeRequest(
        `${basePath(tenantId, projectId)}/${webhookDestination.id}/test`,
        { method: 'POST' }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true, statusCode: 200 });
    });

    it('should return success:false on non-2xx delivery', async () => {
      const tenantId = await createTestTenantWithOrg('wh-test-non-2xx');
      const { projectId } = await createTestProjectForWebhooks(tenantId);
      const { webhookDestination } = await createTestWebhookDestination({ tenantId, projectId });

      mockSsrfFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const res = await makeRequest(
        `${basePath(tenantId, projectId)}/${webhookDestination.id}/test`,
        { method: 'POST' }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: false, statusCode: 500 });
    });

    it('should return success:false with generic error on network failure', async () => {
      const tenantId = await createTestTenantWithOrg('wh-test-network-err');
      const { projectId } = await createTestProjectForWebhooks(tenantId);
      const { webhookDestination } = await createTestWebhookDestination({ tenantId, projectId });

      mockSsrfFetch.mockRejectedValueOnce(new Error('connection refused'));

      const res = await makeRequest(
        `${basePath(tenantId, projectId)}/${webhookDestination.id}/test`,
        { method: 'POST' }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('should return 400 bad_request when SSRF protection blocks the URL', async () => {
      const tenantId = await createTestTenantWithOrg('wh-test-ssrf');
      const { projectId } = await createTestProjectForWebhooks(tenantId);
      const { webhookDestination } = await createTestWebhookDestination({ tenantId, projectId });

      mockSsrfFetch.mockRejectedValueOnce(
        new WebhookUrlSecurityError('URL resolves to private IP')
      );

      const res = await makeRequest(
        `${basePath(tenantId, projectId)}/${webhookDestination.id}/test`,
        { method: 'POST' }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('bad_request');
    });

    it('should return 404 when destination does not exist', async () => {
      const tenantId = await createTestTenantWithOrg('wh-test-missing');
      const { projectId } = await createTestProjectForWebhooks(tenantId);

      const res = await makeRequest(`${basePath(tenantId, projectId)}/nonexistent-id/test`, {
        method: 'POST',
      });

      expect(res.status).toBe(404);
      expect(mockSsrfFetch).not.toHaveBeenCalled();
    });
  });
});
