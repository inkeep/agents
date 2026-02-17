/**
 * Tests for Slack install route server-side authorization.
 *
 * Verifies that GET /install requires:
 * - Authentication (userId set in context)
 * - Organization admin or owner role
 * - tenant_id query param matches session tenant (when provided)
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { OrgRoles } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import oauthRouter from '../../slack/routes/oauth';
import type { WorkAppsVariables } from '../../slack/types';

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    getUserOrganizationsFromDb: vi.fn(() => async () => []),
    createWorkAppSlackWorkspace: vi.fn(() => async () => ({})),
  };
});

vi.mock('../../env', () => ({
  env: {
    SLACK_CLIENT_ID: 'test-client-id',
    SLACK_CLIENT_SECRET: 'test-client-secret',
    SLACK_SIGNING_SECRET: 'test-signing-secret',
    SLACK_APP_URL: 'https://test.example.com',
    INKEEP_AGENTS_MANAGE_UI_URL: 'http://localhost:3000',
    ENVIRONMENT: 'test',
  },
}));

vi.mock('../../slack/services/nango', () => ({
  getSlackNango: vi.fn(() => ({
    listConnections: vi.fn(async () => ({ connections: [] })),
    getConnection: vi.fn(async () => ({})),
  })),
  getSlackIntegrationId: vi.fn(() => 'slack'),
  findWorkspaceConnectionByTeamId: vi.fn(async () => null),
  listWorkspaceInstallations: vi.fn(async () => []),
  storeWorkspaceInstallation: vi.fn(async () => ({ connectionId: 'test', success: true })),
  deleteWorkspaceInstallation: vi.fn(async () => true),
  getWorkspaceDefaultAgentFromNango: vi.fn(async () => null),
  computeWorkspaceConnectionId: vi.fn(() => 'E:E123:T:T123'),
  clearWorkspaceConnectionCache: vi.fn(),
}));

vi.mock('../../slack/services/client', () => ({
  getSlackClient: vi.fn(),
  getSlackTeamInfo: vi.fn(),
  getSlackUserInfo: vi.fn(),
  setBotTokenForTeam: vi.fn(),
  getBotTokenForTeam: vi.fn(),
  checkUserIsChannelMember: vi.fn(),
}));

vi.mock('../../db/runDbClient', () => ({
  default: {},
}));

function createTestApp(contextOverrides: Record<string, unknown> = {}) {
  const testApp = new OpenAPIHono<{ Variables: WorkAppsVariables }>();
  testApp.use('*', async (c, next) => {
    for (const [key, value] of Object.entries(contextOverrides)) {
      c.set(key as never, value as never);
    }
    await next();
  });
  testApp.route('/', oauthRouter);
  return testApp;
}

describe('Slack Install Route Authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENVIRONMENT = 'test';
  });

  describe('when x-test-bypass-auth header is set', () => {
    it('should bypass auth checks and redirect to Slack OAuth', async () => {
      const app = createTestApp();
      const response = await app.request('/install?tenant_id=tenant-1', {
        method: 'GET',
        headers: { 'x-test-bypass-auth': 'true' },
      });

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('slack.com/oauth/v2/authorize');
    });
  });

  describe('when user is not authenticated', () => {
    it('should return 401 when no userId in context', async () => {
      const app = createTestApp();
      const response = await app.request('/install?tenant_id=tenant-1', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('when user has no organization context', () => {
    it('should return 401 when userId set but no tenantId', async () => {
      const app = createTestApp({ userId: 'user_123' });
      const response = await app.request('/install?tenant_id=tenant-1', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('when tenant_id query param does not match session tenant', () => {
    it('should return 403 for tenant ID mismatch', async () => {
      const app = createTestApp({
        userId: 'user_123',
        tenantId: 'my-tenant',
      });
      const response = await app.request('/install?tenant_id=other-tenant', {
        method: 'GET',
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.detail).toContain('Tenant ID mismatch');
    });
  });

  describe('when user is not an org admin', () => {
    it('should return 403 when user has member role', async () => {
      const { getUserOrganizationsFromDb } = await import('@inkeep/agents-core');
      vi.mocked(getUserOrganizationsFromDb).mockReturnValue(() =>
        Promise.resolve([
          {
            id: 'mem_1',
            organizationId: 'tenant-1',
            role: OrgRoles.MEMBER,
            userId: 'user_123',
            createdAt: new Date(),
            organizationName: 'Test Org',
            organizationSlug: 'test-org',
          },
        ])
      );

      const app = createTestApp({
        userId: 'user_123',
        tenantId: 'tenant-1',
      });
      const response = await app.request('/install?tenant_id=tenant-1', {
        method: 'GET',
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.detail).toContain('Only organization administrators');
    });

    it('should return 403 when user has no org membership', async () => {
      const { getUserOrganizationsFromDb } = await import('@inkeep/agents-core');
      vi.mocked(getUserOrganizationsFromDb).mockReturnValue(() => Promise.resolve([]));

      const app = createTestApp({
        userId: 'user_123',
        tenantId: 'tenant-1',
      });
      const response = await app.request('/install?tenant_id=tenant-1', {
        method: 'GET',
      });

      expect(response.status).toBe(403);
    });
  });

  describe('when user is an org admin', () => {
    it('should redirect to Slack OAuth for admin role', async () => {
      const { getUserOrganizationsFromDb } = await import('@inkeep/agents-core');
      vi.mocked(getUserOrganizationsFromDb).mockReturnValue(() =>
        Promise.resolve([
          {
            id: 'mem_2',
            organizationId: 'tenant-1',
            role: OrgRoles.ADMIN,
            userId: 'user_123',
            createdAt: new Date(),
            organizationName: 'Test Org',
            organizationSlug: 'test-org',
          },
        ])
      );

      const app = createTestApp({
        userId: 'user_123',
        tenantId: 'tenant-1',
      });
      const response = await app.request('/install?tenant_id=tenant-1', {
        method: 'GET',
      });

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('slack.com/oauth/v2/authorize');
      expect(location).toContain('client_id=test-client-id');
    });

    it('should redirect to Slack OAuth for owner role', async () => {
      const { getUserOrganizationsFromDb } = await import('@inkeep/agents-core');
      vi.mocked(getUserOrganizationsFromDb).mockReturnValue(() =>
        Promise.resolve([
          {
            id: 'mem_3',
            organizationId: 'tenant-1',
            role: OrgRoles.OWNER,
            userId: 'user_123',
            createdAt: new Date(),
            organizationName: 'Test Org',
            organizationSlug: 'test-org',
          },
        ])
      );

      const app = createTestApp({
        userId: 'user_123',
        tenantId: 'tenant-1',
      });
      const response = await app.request('/install?tenant_id=tenant-1', {
        method: 'GET',
      });

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('slack.com/oauth/v2/authorize');
    });

    it('should work without tenant_id query param when session has tenantId', async () => {
      const { getUserOrganizationsFromDb } = await import('@inkeep/agents-core');
      vi.mocked(getUserOrganizationsFromDb).mockReturnValue(() =>
        Promise.resolve([
          {
            id: 'mem_4',
            organizationId: 'tenant-1',
            role: OrgRoles.OWNER,
            userId: 'user_123',
            createdAt: new Date(),
            organizationName: 'Test Org',
            organizationSlug: 'test-org',
          },
        ])
      );

      const app = createTestApp({
        userId: 'user_123',
        tenantId: 'tenant-1',
      });
      const response = await app.request('/install', {
        method: 'GET',
      });

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('slack.com/oauth/v2/authorize');
    });
  });

  describe('system and API key users', () => {
    it('should allow system user to bypass admin check', async () => {
      const app = createTestApp({
        userId: 'system',
        tenantId: 'tenant-1',
      });
      const response = await app.request('/install?tenant_id=tenant-1', {
        method: 'GET',
      });

      expect(response.status).toBe(302);
    });

    it('should allow API key user to bypass admin check', async () => {
      const app = createTestApp({
        userId: 'apikey:key_123',
        tenantId: 'tenant-1',
      });
      const response = await app.request('/install?tenant_id=tenant-1', {
        method: 'GET',
      });

      expect(response.status).toBe(302);
    });
  });

  describe('OAuth redirect (callback) remains accessible', () => {
    it('should not require auth for oauth_redirect', async () => {
      const app = createTestApp();
      const response = await app.request('/oauth_redirect?error=access_denied&state=dummy', {
        method: 'GET',
      });

      expect(response.status).toBe(302);
    });
  });
});
