import { OpenAPIHono } from '@hono/zod-openapi';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  isStateSigningConfiguredMock,
  isGitHubAppNameConfiguredMock,
  getStateSigningSecretMock,
  getGitHubAppNameMock,
} = vi.hoisted(() => ({
  isStateSigningConfiguredMock: vi.fn(),
  isGitHubAppNameConfiguredMock: vi.fn(),
  getStateSigningSecretMock: vi.fn(),
  getGitHubAppNameMock: vi.fn(),
}));

const { getInstallationsByTenantIdMock, getRepositoryCountsByInstallationIdsMock } = vi.hoisted(
  () => ({
    getInstallationsByTenantIdMock: vi.fn(),
    getRepositoryCountsByInstallationIdsMock: vi.fn(),
  })
);

vi.mock('../../../domains/github/config', () => ({
  isStateSigningConfigured: isStateSigningConfiguredMock,
  isGitHubAppNameConfigured: isGitHubAppNameConfiguredMock,
  getStateSigningSecret: getStateSigningSecretMock,
  getGitHubAppName: getGitHubAppNameMock,
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    getInstallationsByTenantId: () => getInstallationsByTenantIdMock,
    getRepositoryCountsByInstallationIds: () => getRepositoryCountsByInstallationIdsMock,
  };
});

vi.mock('../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import githubRoutes, {
  STATE_JWT_AUDIENCE,
  STATE_JWT_ISSUER,
  signStateToken,
} from '../../../domains/manage/routes/github';

const TEST_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
const TEST_APP_NAME = 'test-github-app';
const TEST_TENANT_ID = 'test-tenant-123';

/**
 * Create a test app that mounts the github routes with tenant path param.
 * This simulates how the routes are mounted in production at /tenants/:tenantId/github.
 */
function createTestApp() {
  const app = new OpenAPIHono();
  app.route('/:tenantId', githubRoutes);
  return app;
}

const app = createTestApp();

describe('GitHub Manage Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isStateSigningConfiguredMock.mockReturnValue(true);
    isGitHubAppNameConfiguredMock.mockReturnValue(true);
    getStateSigningSecretMock.mockReturnValue(TEST_SECRET);
    getGitHubAppNameMock.mockReturnValue(TEST_APP_NAME);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('signStateToken', () => {
    it('should generate a valid JWT with tenantId claim', async () => {
      const tenantId = 'test-tenant-123';
      const token = await signStateToken(tenantId);

      const secret = new TextEncoder().encode(TEST_SECRET);
      const { payload } = await jwtVerify(token, secret, {
        issuer: STATE_JWT_ISSUER,
        audience: STATE_JWT_AUDIENCE,
      });

      expect(payload.tenantId).toBe(tenantId);
      expect(payload.iss).toBe(STATE_JWT_ISSUER);
      expect(payload.aud).toBe(STATE_JWT_AUDIENCE);
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    it('should set expiration to approximately 10 minutes', async () => {
      const tenantId = 'test-tenant-123';
      const token = await signStateToken(tenantId);

      const secret = new TextEncoder().encode(TEST_SECRET);
      const { payload } = await jwtVerify(token, secret, {
        issuer: STATE_JWT_ISSUER,
        audience: STATE_JWT_AUDIENCE,
      });

      const exp = payload.exp as number;
      const iat = payload.iat as number;
      const expiresInSeconds = exp - iat;

      expect(expiresInSeconds).toBe(600);
    });
  });

  describe('GET /install-url', () => {
    it('should return installation URL with state parameter', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/install-url`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.url).toMatch(
        /^https:\/\/github\.com\/apps\/test-github-app\/installations\/new\?state=/
      );
      expect(body.url).toContain('state=');
    });

    it('should include a valid JWT state in the URL', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/install-url`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      const url = new URL(body.url);
      const stateParam = url.searchParams.get('state');
      expect(stateParam).toBeTruthy();

      const state = decodeURIComponent(stateParam!);
      const secret = new TextEncoder().encode(TEST_SECRET);
      const { payload } = await jwtVerify(state, secret, {
        issuer: STATE_JWT_ISSUER,
        audience: STATE_JWT_AUDIENCE,
      });

      expect(payload.tenantId).toBe(TEST_TENANT_ID);
    });

    it('should return 500 when state signing secret is not configured', async () => {
      isStateSigningConfiguredMock.mockReturnValue(false);

      const response = await app.request(`/${TEST_TENANT_ID}/install-url`, {
        method: 'GET',
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.status).toBe(500);
      expect(body.error.message).toContain('not configured');
    });

    it('should return 500 when GitHub App name is not configured', async () => {
      isGitHubAppNameConfiguredMock.mockReturnValue(false);

      const response = await app.request(`/${TEST_TENANT_ID}/install-url`, {
        method: 'GET',
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.status).toBe(500);
      expect(body.error.message).toContain('not configured');
    });

    it('should URL-encode the state parameter', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/install-url`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.url).not.toContain(' ');
      expect(body.url).not.toContain('+');

      const url = new URL(body.url);
      const stateParam = url.searchParams.get('state');
      expect(stateParam).toBeTruthy();
    });
  });

  describe('JWT constants', () => {
    it('should have correct issuer constant', () => {
      expect(STATE_JWT_ISSUER).toBe('inkeep-agents-api');
    });

    it('should have correct audience constant', () => {
      expect(STATE_JWT_AUDIENCE).toBe('github-app-install');
    });
  });

  describe('GET /installations', () => {
    const mockInstallations = [
      {
        id: 'inst-1',
        tenantId: TEST_TENANT_ID,
        installationId: '12345',
        accountLogin: 'my-org',
        accountId: '1001',
        accountType: 'Organization',
        status: 'active',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
      {
        id: 'inst-2',
        tenantId: TEST_TENANT_ID,
        installationId: '12346',
        accountLogin: 'another-org',
        accountId: '1002',
        accountType: 'Organization',
        status: 'suspended',
        createdAt: '2024-01-16T10:00:00.000Z',
        updatedAt: '2024-01-16T12:00:00.000Z',
      },
    ];

    beforeEach(() => {
      getInstallationsByTenantIdMock.mockResolvedValue(mockInstallations);
      getRepositoryCountsByInstallationIdsMock.mockResolvedValue(
        new Map([
          ['inst-1', 5],
          ['inst-2', 5],
        ])
      );
    });

    it('should return list of installations with repository counts', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/installations`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.installations).toHaveLength(2);
      expect(body.installations[0]).toEqual({
        id: 'inst-1',
        installationId: '12345',
        accountLogin: 'my-org',
        accountId: '1001',
        accountType: 'Organization',
        status: 'active',
        repositoryCount: 5,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      });

      expect(getInstallationsByTenantIdMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        includeDeleted: false,
      });
    });

    it('should include deleted installations when includeDeleted=true', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/installations?includeDeleted=true`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(getInstallationsByTenantIdMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        includeDeleted: true,
      });
    });

    it('should not include deleted installations by default', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/installations`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(getInstallationsByTenantIdMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        includeDeleted: false,
      });
    });

    it('should return empty array when no installations exist', async () => {
      getInstallationsByTenantIdMock.mockResolvedValue([]);

      const response = await app.request(`/${TEST_TENANT_ID}/installations`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.installations).toEqual([]);
    });

    it('should fetch repository count for each installation', async () => {
      getRepositoryCountsByInstallationIdsMock.mockResolvedValue(
        new Map([
          ['inst-1', 10],
          ['inst-2', 3],
        ])
      );

      const response = await app.request(`/${TEST_TENANT_ID}/installations`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.installations[0].repositoryCount).toBe(10);
      expect(body.installations[1].repositoryCount).toBe(3);
    });

    it('should handle installations with different statuses', async () => {
      const installationsWithStatus = [
        { ...mockInstallations[0], status: 'active' },
        { ...mockInstallations[1], status: 'pending' },
      ];
      getInstallationsByTenantIdMock.mockResolvedValue(installationsWithStatus);

      const response = await app.request(`/${TEST_TENANT_ID}/installations`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.installations[0].status).toBe('active');
      expect(body.installations[1].status).toBe('pending');
    });

    it('should handle User account type', async () => {
      const userInstallation = [
        {
          ...mockInstallations[0],
          accountType: 'User',
          accountLogin: 'my-user',
        },
      ];
      getInstallationsByTenantIdMock.mockResolvedValue(userInstallation);

      const response = await app.request(`/${TEST_TENANT_ID}/installations`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.installations[0].accountType).toBe('User');
      expect(body.installations[0].accountLogin).toBe('my-user');
    });

    it('should ignore invalid includeDeleted values', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/installations?includeDeleted=invalid`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(getInstallationsByTenantIdMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        includeDeleted: false,
      });
    });
  });
});
