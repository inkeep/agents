import { createConversation } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../data/db/manageDbClient';
import runDbClient from '../../../data/db/runDbClient';
import { getAnonJwtSecret } from '../../../domains/run/routes/auth';
import app from '../../../index';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantWithOrg } from '../../utils/testTenant';

const createTestWebClientApp = async ({
  tenantId,
  projectId,
  allowedDomains = ['help.customer.com'],
}: {
  tenantId: string;
  projectId: string;
  allowedDomains?: string[];
}) => {
  const createRes = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/apps`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Web Client',
      type: 'web_client',
      config: {
        type: 'web_client',
        webClient: {
          allowedDomains,

          captchaEnabled: false,
        },
      },
    }),
  });

  expect(createRes.status).toBe(201);
  const body = await createRes.json();
  return body.data.app;
};

const getAnonymousSessionToken = async (appId: string, origin: string) => {
  const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.token as string;
};

const createTestConversation = async ({
  tenantId,
  projectId,
  userId,
  title,
  agentId = 'test-agent',
}: {
  tenantId: string;
  projectId: string;
  userId?: string;
  title?: string;
  agentId?: string;
}) => {
  const id = `conv-${crypto.randomUUID()}`;
  return createConversation(runDbClient)({
    id,
    tenantId,
    projectId,
    userId,
    agentId,
    title,
    activeSubAgentId: 'sub-agent-1',
    ref: { type: 'branch', name: 'main', hash: 'abc123' },
  });
};

describe('Run API - End-User Conversation History', () => {
  describe('GET /run/v1/conversations', () => {
    it('should return 401 when using bypass auth (no endUserId)', async () => {
      const res = await makeRequest('/run/v1/conversations');

      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain('End-user authentication required');
    });

    it('should return conversations scoped to the end user', async () => {
      const tenantId = await createTestTenantWithOrg('conv-list-scoped');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');

      const secret = getAnonJwtSecret();
      const { payload } = await jwtVerify(token, secret);
      const anonUserId = payload.sub as string;

      await createTestConversation({
        tenantId,
        projectId,
        userId: anonUserId,
        title: 'My conversation',
      });
      await createTestConversation({
        tenantId,
        projectId,
        userId: anonUserId,
        title: 'My second conversation',
      });
      await createTestConversation({
        tenantId,
        projectId,
        userId: 'other-user',
        title: 'Other user conversation',
      });

      const res = await app.request('/run/v1/conversations', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': appId,
          'x-inkeep-agent-id': 'test-agent',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.conversations).toHaveLength(2);
      expect(body.data.pagination.total).toBe(2);
      expect(body.data.conversations.every((c: any) => c.title !== 'Other user conversation')).toBe(
        true
      );
    });

    it('should support pagination', async () => {
      const tenantId = await createTestTenantWithOrg('conv-list-paginated');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');

      const secret = getAnonJwtSecret();
      const { payload } = await jwtVerify(token, secret);
      const anonUserId = payload.sub as string;

      for (let i = 0; i < 5; i++) {
        await createTestConversation({
          tenantId,
          projectId,
          userId: anonUserId,
          title: `Conversation ${i}`,
        });
      }

      const res = await app.request('/run/v1/conversations?page=1&limit=2', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': appId,
          'x-inkeep-agent-id': 'test-agent',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.conversations).toHaveLength(2);
      expect(body.data.pagination.total).toBe(5);
      expect(body.data.pagination.hasMore).toBe(true);
      expect(body.data.pagination.page).toBe(1);
      expect(body.data.pagination.limit).toBe(2);
    });

    it('should return empty list when user has no conversations', async () => {
      const tenantId = await createTestTenantWithOrg('conv-list-empty');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');

      const res = await app.request('/run/v1/conversations', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': appId,
          'x-inkeep-agent-id': 'test-agent',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.conversations).toHaveLength(0);
      expect(body.data.pagination.total).toBe(0);
      expect(body.data.pagination.hasMore).toBe(false);
    });

    it('should return conversation fields correctly', async () => {
      const tenantId = await createTestTenantWithOrg('conv-list-fields');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');

      const secret = getAnonJwtSecret();
      const { payload } = await jwtVerify(token, secret);
      const anonUserId = payload.sub as string;

      await createTestConversation({
        tenantId,
        projectId,
        userId: anonUserId,
        title: 'Detailed conversation',
        agentId: 'support-agent',
      });

      const res = await app.request('/run/v1/conversations', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': appId,
          'x-inkeep-agent-id': 'test-agent',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const conv = body.data.conversations[0];
      expect(conv.id).toBeDefined();
      expect(conv.agentId).toBe('support-agent');
      expect(conv.title).toBe('Detailed conversation');
      expect(conv.createdAt).toBeDefined();
      expect(conv.updatedAt).toBeDefined();
    });
  });
});
