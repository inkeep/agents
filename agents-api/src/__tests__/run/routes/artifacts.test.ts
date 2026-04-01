import { addLedgerArtifacts, createConversation } from '@inkeep/agents-core';
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
          allowAnonymous: true,
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
  agentId = 'test-agent',
}: {
  tenantId: string;
  projectId: string;
  userId?: string;
  agentId?: string;
}) => {
  const id = `conv-${crypto.randomUUID()}`;
  return createConversation(runDbClient)({
    id,
    tenantId,
    projectId,
    userId,
    agentId,
    title: 'Test conversation',
    activeSubAgentId: 'sub-agent-1',
    ref: { type: 'branch', name: 'main', hash: 'abc123' },
  });
};

const createTestArtifact = async ({
  tenantId,
  projectId,
  conversationId,
  name,
  artifactId,
}: {
  tenantId: string;
  projectId: string;
  conversationId: string;
  name: string;
  artifactId?: string;
}) => {
  const id = artifactId ?? `artifact-${crypto.randomUUID()}`;
  await addLedgerArtifacts(runDbClient)({
    scopes: { tenantId, projectId },
    contextId: conversationId,
    taskId: `task-${crypto.randomUUID()}`,
    toolCallId: `call-${crypto.randomUUID()}`,
    artifacts: [
      {
        artifactId: id,
        type: 'source',
        name,
        description: `Description for ${name}`,
        parts: [{ kind: 'text' as const, text: `Content of ${name}` }],
        metadata: {},
        createdAt: new Date().toISOString(),
      },
    ],
  });
  return id;
};

const makeAuthHeaders = (token: string, appId: string) => ({
  Authorization: `Bearer ${token}`,
  'x-inkeep-app-id': appId,
  'x-inkeep-agent-id': 'test-agent',
  Origin: 'https://help.customer.com',
});

describe('Run API - End-User Artifacts', () => {
  let originalPowSecret: string | undefined;

  beforeEach(() => {
    originalPowSecret = env.INKEEP_POW_HMAC_SECRET;
    (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = undefined;
  });

  afterEach(() => {
    (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = originalPowSecret;
  });

  describe('GET /run/v1/artifacts', () => {
    it('should return 401 when using bypass auth (no endUserId)', async () => {
      const res = await makeRequest('/run/v1/artifacts');

      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain('End-user authentication required');
    });

    it('should return artifacts scoped to the end user', async () => {
      const tenantId = await createTestTenantWithOrg('art-list-scoped');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');
      const secret = getAnonJwtSecret();
      const { payload } = await jwtVerify(token, secret);
      const anonUserId = payload.sub as string;

      const myConv = await createTestConversation({ tenantId, projectId, userId: anonUserId });
      const otherConv = await createTestConversation({ tenantId, projectId, userId: 'other-user' });

      await createTestArtifact({
        tenantId,
        projectId,
        conversationId: myConv.id,
        name: 'My Artifact',
      });
      await createTestArtifact({
        tenantId,
        projectId,
        conversationId: otherConv.id,
        name: 'Other Artifact',
      });

      const res = await app.request('/run/v1/artifacts', {
        headers: makeAuthHeaders(token, appId),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('My Artifact');
      expect(body.pagination.total).toBe(1);
    });

    it('should filter by conversationId', async () => {
      const tenantId = await createTestTenantWithOrg('art-list-conv-filter');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');
      const secret = getAnonJwtSecret();
      const { payload } = await jwtVerify(token, secret);
      const anonUserId = payload.sub as string;

      const conv1 = await createTestConversation({ tenantId, projectId, userId: anonUserId });
      const conv2 = await createTestConversation({ tenantId, projectId, userId: anonUserId });

      await createTestArtifact({
        tenantId,
        projectId,
        conversationId: conv1.id,
        name: 'Conv1 Art',
      });
      await createTestArtifact({
        tenantId,
        projectId,
        conversationId: conv2.id,
        name: 'Conv2 Art',
      });

      const res = await app.request(`/run/v1/artifacts?conversationId=${conv1.id}`, {
        headers: makeAuthHeaders(token, appId),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Conv1 Art');
    });

    it('should support pagination', async () => {
      const tenantId = await createTestTenantWithOrg('art-list-paginated');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');
      const secret = getAnonJwtSecret();
      const { payload } = await jwtVerify(token, secret);
      const anonUserId = payload.sub as string;

      const conv = await createTestConversation({ tenantId, projectId, userId: anonUserId });
      for (let i = 0; i < 5; i++) {
        await createTestArtifact({
          tenantId,
          projectId,
          conversationId: conv.id,
          name: `Art ${i}`,
        });
      }

      const res = await app.request('/run/v1/artifacts?page=1&limit=2', {
        headers: makeAuthHeaders(token, appId),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(5);
      expect(body.pagination.pages).toBe(3);
    });

    it('should return empty list when user has no artifacts', async () => {
      const tenantId = await createTestTenantWithOrg('art-list-empty');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');

      const res = await app.request('/run/v1/artifacts', {
        headers: makeAuthHeaders(token, appId),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });

    it('should not include parts in list response', async () => {
      const tenantId = await createTestTenantWithOrg('art-list-no-parts');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');
      const secret = getAnonJwtSecret();
      const { payload } = await jwtVerify(token, secret);
      const anonUserId = payload.sub as string;

      const conv = await createTestConversation({ tenantId, projectId, userId: anonUserId });
      await createTestArtifact({
        tenantId,
        projectId,
        conversationId: conv.id,
        name: 'No Parts Art',
      });

      const res = await app.request('/run/v1/artifacts', {
        headers: makeAuthHeaders(token, appId),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const artifact = body.data[0];
      expect(artifact.name).toBe('No Parts Art');
      expect(artifact).not.toHaveProperty('parts');
      expect(artifact).not.toHaveProperty('metadata');
    });
  });

  describe('GET /run/v1/artifacts/{artifactId}', () => {
    it('should return full artifact including parts', async () => {
      const tenantId = await createTestTenantWithOrg('art-detail');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');
      const secret = getAnonJwtSecret();
      const { payload } = await jwtVerify(token, secret);
      const anonUserId = payload.sub as string;

      const conv = await createTestConversation({ tenantId, projectId, userId: anonUserId });
      const artifactId = await createTestArtifact({
        tenantId,
        projectId,
        conversationId: conv.id,
        name: 'Detail Art',
      });

      const res = await app.request(`/run/v1/artifacts/${artifactId}`, {
        headers: makeAuthHeaders(token, appId),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(artifactId);
      expect(body.data.name).toBe('Detail Art');
      expect(body.data.parts).toBeDefined();
      expect(body.data.parts).toHaveLength(1);
      expect(body.data.parts[0].text).toBe('Content of Detail Art');
    });

    it('should return 404 for another users artifact', async () => {
      const tenantId = await createTestTenantWithOrg('art-cross-user');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const otherConv = await createTestConversation({ tenantId, projectId, userId: 'other-user' });
      const artifactId = await createTestArtifact({
        tenantId,
        projectId,
        conversationId: otherConv.id,
        name: 'Other Art',
      });

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');

      const res = await app.request(`/run/v1/artifacts/${artifactId}`, {
        headers: makeAuthHeaders(token, appId),
      });

      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent artifact', async () => {
      const tenantId = await createTestTenantWithOrg('art-not-found');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const token = await getAnonymousSessionToken(appId, 'https://help.customer.com');

      const res = await app.request('/run/v1/artifacts/nonexistent-id', {
        headers: makeAuthHeaders(token, appId),
      });

      expect(res.status).toBe(404);
    });
  });
});
