import { createConversation, createMessage } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import manageDbClient from '../../../data/db/manageDbClient';
import runDbClient from '../../../data/db/runDbClient';
import { getAnonJwtSecret } from '../../../domains/run/routes/auth';
import { env } from '../../../env';
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
  let originalPowSecret: string | undefined;

  beforeEach(() => {
    originalPowSecret = env.INKEEP_POW_HMAC_SECRET;
    (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = undefined;
  });

  afterEach(() => {
    (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = originalPowSecret;
  });

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
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
      expect(body.data.every((c: any) => c.title !== 'Other user conversation')).toBe(true);
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
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(5);
      expect(body.pagination.pages).toBe(3);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(2);
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
      expect(body.data).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
      expect(body.pagination.pages).toBe(0);
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
      const conv = body.data[0];
      expect(conv.id).toBeDefined();
      expect(conv.agentId).toBe('support-agent');
      expect(conv.title).toBe('Detailed conversation');
      expect(conv.createdAt).toBeDefined();
      expect(conv.updatedAt).toBeDefined();
    });
  });

  describe('GET /run/v1/conversations/:conversationId', () => {
    const setupConversationWithMessages = async (tenantSuffix: string) => {
      const tenantId = await createTestTenantWithOrg(tenantSuffix);
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');
      const secret = getAnonJwtSecret();
      const { payload } = await jwtVerify(token, secret);
      const anonUserId = payload.sub as string;

      const conv = await createTestConversation({
        tenantId,
        projectId,
        userId: anonUserId,
        title: 'Test conversation',
      });

      await createMessage(runDbClient)({
        id: `msg-${crypto.randomUUID()}`,
        tenantId,
        projectId,
        conversationId: conv.id,
        role: 'user',
        content: { text: 'Hello, I need help' },
        visibility: 'user-facing',
        messageType: 'chat',
      });
      await createMessage(runDbClient)({
        id: `msg-${crypto.randomUUID()}`,
        tenantId,
        projectId,
        conversationId: conv.id,
        role: 'agent',
        content: { text: 'Sure, how can I help?' },
        visibility: 'user-facing',
        messageType: 'chat',
      });
      await createMessage(runDbClient)({
        id: `msg-${crypto.randomUUID()}`,
        tenantId,
        projectId,
        conversationId: conv.id,
        role: 'system',
        content: { text: 'Internal routing note' },
        visibility: 'internal',
        messageType: 'chat',
      });

      return { tenantId, projectId, appId, token, anonUserId, conv };
    };

    const makeAuthHeaders = (token: string, appId: string) => ({
      Authorization: `Bearer ${token}`,
      'x-inkeep-app-id': appId,
      'x-inkeep-agent-id': 'test-agent',
      Origin: 'https://help.customer.com',
    });

    it('should return conversation with user-facing messages', async () => {
      const { appId, token, conv } = await setupConversationWithMessages('conv-get-basic');

      const res = await app.request(`/run/v1/conversations/${conv.id}`, {
        headers: makeAuthHeaders(token, appId),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(conv.id);
      expect(body.data.title).toBe('Test conversation');
      expect(body.data.agentId).toBe('test-agent');
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
      expect(body.data.messages).toHaveLength(2);
      expect(body.data.messages[0].role).toBe('user');
      expect(body.data.messages[0].content).toBe('Hello, I need help');
      expect(body.data.messages[0].parts).toEqual([{ type: 'text', text: 'Hello, I need help' }]);
      expect(body.data.messages[1].role).toBe('agent');
    });

    it('should not include internal messages', async () => {
      const { appId, token, conv } = await setupConversationWithMessages('conv-get-no-internal');

      const res = await app.request(`/run/v1/conversations/${conv.id}`, {
        headers: makeAuthHeaders(token, appId),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const roles = body.data.messages.map((m: any) => m.role);
      expect(roles).not.toContain('system');
      expect(body.data.messages.every((m: any) => m.content.text !== 'Internal routing note')).toBe(
        true
      );
    });

    it('should return 404 for another users conversation', async () => {
      const tenantId = await createTestTenantWithOrg('conv-get-cross-user');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const otherUserConv = await createTestConversation({
        tenantId,
        projectId,
        userId: 'other-user-id',
        title: 'Other user conv',
      });

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');

      const res = await app.request(`/run/v1/conversations/${otherUserConv.id}`, {
        headers: makeAuthHeaders(token, appId),
      });

      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent conversation', async () => {
      const tenantId = await createTestTenantWithOrg('conv-get-not-found');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');

      const res = await app.request('/run/v1/conversations/nonexistent-conv-id', {
        headers: makeAuthHeaders(token, appId),
      });

      expect(res.status).toBe(404);
    });

    it('should return 401 without end-user auth', async () => {
      const res = await makeRequest('/run/v1/conversations/some-conv-id');

      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain('End-user authentication required');
    });

    it('should use first user message as title when title is null', async () => {
      const tenantId = await createTestTenantWithOrg('conv-get-title-fallback');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');
      const secret = getAnonJwtSecret();
      const { payload } = await jwtVerify(token, secret);
      const anonUserId = payload.sub as string;

      const conv = await createTestConversation({
        tenantId,
        projectId,
        userId: anonUserId,
      });

      await createMessage(runDbClient)({
        id: `msg-${crypto.randomUUID()}`,
        tenantId,
        projectId,
        conversationId: conv.id,
        role: 'user',
        content: { text: 'What is the weather like today?' },
        visibility: 'user-facing',
        messageType: 'chat',
      });

      const res = await app.request(`/run/v1/conversations/${conv.id}`, {
        headers: makeAuthHeaders(token, appId),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.title).toBe('What is the weather like today?');
    });
  });
});
