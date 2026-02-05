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

const {
  getInstallationsByTenantIdMock,
  getRepositoryCountsByTenantIdMock,
  getInstallationByIdMock,
  getRepositoriesByInstallationIdMock,
  deleteInstallationMock,
  disconnectInstallationMock,
  updateInstallationStatusMock,
  syncRepositoriesMock,
} = vi.hoisted(() => ({
  getInstallationsByTenantIdMock: vi.fn(),
  getRepositoryCountsByTenantIdMock: vi.fn(),
  getInstallationByIdMock: vi.fn(),
  getRepositoriesByInstallationIdMock: vi.fn(),
  deleteInstallationMock: vi.fn(),
  disconnectInstallationMock: vi.fn(),
  updateInstallationStatusMock: vi.fn(),
  syncRepositoriesMock: vi.fn(),
}));

const { createAppJwtMock, fetchInstallationRepositoriesMock } = vi.hoisted(() => ({
  createAppJwtMock: vi.fn(),
  fetchInstallationRepositoriesMock: vi.fn(),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    getInstallationsByTenantId: () => getInstallationsByTenantIdMock,
    getRepositoryCountsByTenantId: () => getRepositoryCountsByTenantIdMock,
    getInstallationById: () => getInstallationByIdMock,
    getRepositoriesByInstallationId: () => getRepositoriesByInstallationIdMock,
    deleteInstallation: () => deleteInstallationMock,
    disconnectInstallation: () => disconnectInstallationMock,
    updateInstallationStatus: () => updateInstallationStatusMock,
    syncRepositories: () => syncRepositoriesMock,
  };
});

vi.mock('@inkeep/agents-work-apps/github', () => ({
  isStateSigningConfigured: isStateSigningConfiguredMock,
  isGitHubAppNameConfigured: isGitHubAppNameConfiguredMock,
  getStateSigningSecret: getStateSigningSecretMock,
  getGitHubAppName: getGitHubAppNameMock,
  createAppJwt: createAppJwtMock,
  fetchInstallationRepositories: fetchInstallationRepositoriesMock,
}));

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

      const state = decodeURIComponent(stateParam ?? '');
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
      getRepositoryCountsByTenantIdMock.mockResolvedValue(
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
        includeDisconnected: false,
      });
    });

    it('should include disconnected installations when includeDisconnected=true', async () => {
      const response = await app.request(
        `/${TEST_TENANT_ID}/installations?includeDisconnected=true`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(200);
      expect(getInstallationsByTenantIdMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        includeDisconnected: true,
      });
    });

    it('should not include disconnected installations by default', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/installations`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(getInstallationsByTenantIdMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        includeDisconnected: false,
      });
    });

    it('should return empty array when no disconnected installations exist', async () => {
      getInstallationsByTenantIdMock.mockResolvedValue([]);

      const response = await app.request(`/${TEST_TENANT_ID}/installations`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.installations).toEqual([]);
    });

    it('should fetch repository count for each installation', async () => {
      getRepositoryCountsByTenantIdMock.mockResolvedValue(
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

    it('should ignore invalid includeDisconnected values', async () => {
      const response = await app.request(
        `/${TEST_TENANT_ID}/installations?includeDisconnected=invalid`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(200);
      expect(getInstallationsByTenantIdMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        includeDisconnected: false,
      });
    });
  });

  describe('GET /installations/:installationId', () => {
    const mockInstallation = {
      id: 'inst-1',
      tenantId: TEST_TENANT_ID,
      installationId: '12345',
      accountLogin: 'my-org',
      accountId: '1001',
      accountType: 'Organization',
      status: 'active',
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    const mockRepositories = [
      {
        id: 'repo-1',
        installationId: 'inst-1',
        repositoryId: '100001',
        repositoryName: 'my-repo',
        repositoryFullName: 'my-org/my-repo',
        private: false,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
      {
        id: 'repo-2',
        installationId: 'inst-1',
        repositoryId: '100002',
        repositoryName: 'private-repo',
        repositoryFullName: 'my-org/private-repo',
        private: true,
        createdAt: '2024-01-15T11:00:00.000Z',
        updatedAt: '2024-01-15T11:00:00.000Z',
      },
    ];

    beforeEach(() => {
      getInstallationByIdMock.mockResolvedValue(mockInstallation);
      getRepositoriesByInstallationIdMock.mockResolvedValue(mockRepositories);
    });

    it('should return installation details with repositories', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.installation).toEqual({
        id: 'inst-1',
        installationId: '12345',
        accountLogin: 'my-org',
        accountId: '1001',
        accountType: 'Organization',
        status: 'active',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      });

      expect(body.repositories).toHaveLength(2);
      expect(body.repositories[0]).toEqual(mockRepositories[0]);
      expect(body.repositories[1]).toEqual(mockRepositories[1]);

      expect(getInstallationByIdMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        id: 'inst-1',
      });
      expect(getRepositoriesByInstallationIdMock).toHaveBeenCalledWith('inst-1');
    });

    it('should return 404 when installation not found', async () => {
      getInstallationByIdMock.mockResolvedValue(null);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/nonexistent`, {
        method: 'GET',
      });

      expect(response.status).toBe(404);
      const body = await response.json();

      expect(body.status).toBe(404);
      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toBe('Installation not found');
    });

    it('should return 404 when installation belongs to different tenant', async () => {
      getInstallationByIdMock.mockResolvedValue(null);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/other-tenant-inst`, {
        method: 'GET',
      });

      expect(response.status).toBe(404);
      const body = await response.json();

      expect(body.status).toBe(404);
      expect(body.error.code).toBe('not_found');
    });

    it('should return empty repositories array when installation has no repos', async () => {
      getRepositoriesByInstallationIdMock.mockResolvedValue([]);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.installation).toBeDefined();
      expect(body.repositories).toEqual([]);
    });

    it('should handle different installation statuses', async () => {
      const pendingInstallation = { ...mockInstallation, status: 'pending' };
      getInstallationByIdMock.mockResolvedValue(pendingInstallation);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.installation.status).toBe('pending');
    });

    it('should handle User account type', async () => {
      const userInstallation = {
        ...mockInstallation,
        accountType: 'User',
        accountLogin: 'my-user',
      };
      getInstallationByIdMock.mockResolvedValue(userInstallation);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.installation.accountType).toBe('User');
      expect(body.installation.accountLogin).toBe('my-user');
    });

    it('should not include tenantId in the response', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.installation.tenantId).toBeUndefined();
    });

    it('should include all repository fields', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      const repo = body.repositories[0];
      expect(repo).toHaveProperty('id');
      expect(repo).toHaveProperty('installationId');
      expect(repo).toHaveProperty('repositoryId');
      expect(repo).toHaveProperty('repositoryName');
      expect(repo).toHaveProperty('repositoryFullName');
      expect(repo).toHaveProperty('private');
      expect(repo).toHaveProperty('createdAt');
      expect(repo).toHaveProperty('updatedAt');
    });
  });

  describe('POST /installations/:installationId/disconnect', () => {
    const mockInstallation = {
      id: 'inst-1',
      tenantId: TEST_TENANT_ID,
      installationId: '12345',
      accountLogin: 'my-org',
      accountId: '1001',
      accountType: 'Organization',
      status: 'active',
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    beforeEach(() => {
      getInstallationByIdMock.mockResolvedValue(mockInstallation);
      disconnectInstallationMock.mockResolvedValue(true);
    });

    it('should disconnect installation successfully', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/disconnect`, {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(getInstallationByIdMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        id: 'inst-1',
      });
      expect(disconnectInstallationMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        id: 'inst-1',
      });
    });

    it('should return 404 when installation not found', async () => {
      getInstallationByIdMock.mockResolvedValue(null);

      const response = await app.request(
        `/${TEST_TENANT_ID}/installations/nonexistent/disconnect`,
        {
          method: 'POST',
        }
      );

      expect(response.status).toBe(404);
      const body = await response.json();

      expect(body.status).toBe(404);
      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toBe('Installation not found');
      expect(disconnectInstallationMock).not.toHaveBeenCalled();
    });

    it('should return 400 when installation is already disconnected', async () => {
      const disconnectedInstallation = { ...mockInstallation, status: 'disconnected' };
      getInstallationByIdMock.mockResolvedValue(disconnectedInstallation);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/disconnect`, {
        method: 'POST',
      });

      expect(response.status).toBe(400);
      const body = await response.json();

      expect(body.status).toBe(400);
      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toBe('Installation is already disconnected');
      expect(disconnectInstallationMock).not.toHaveBeenCalled();
    });

    it('should return 500 when disconnect operation fails', async () => {
      disconnectInstallationMock.mockResolvedValue(false);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/disconnect`, {
        method: 'POST',
      });

      expect(response.status).toBe(500);
      const body = await response.json();

      expect(body.status).toBe(500);
      expect(body.error.code).toBe('internal_server_error');
      expect(body.error.message).toBe('Failed to disconnect installation');
    });

    it('should disconnect installation with pending status', async () => {
      const pendingInstallation = { ...mockInstallation, status: 'pending' };
      getInstallationByIdMock.mockResolvedValue(pendingInstallation);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/disconnect`, {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
    });

    it('should disconnect installation with suspended status', async () => {
      const suspendedInstallation = { ...mockInstallation, status: 'suspended' };
      getInstallationByIdMock.mockResolvedValue(suspendedInstallation);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/disconnect`, {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
    });
  });

  describe('POST /installations/:installationId/reconnect', () => {
    const mockDisconnectedInstallation = {
      id: 'inst-1',
      tenantId: TEST_TENANT_ID,
      installationId: '12345',
      accountLogin: 'my-org',
      accountId: '1001',
      accountType: 'Organization',
      status: 'disconnected',
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    const mockGitHubRepos = [
      { id: 101, name: 'repo-1', full_name: 'my-org/repo-1', private: false },
      { id: 102, name: 'repo-2', full_name: 'my-org/repo-2', private: true },
    ];

    beforeEach(() => {
      getInstallationByIdMock.mockResolvedValue(mockDisconnectedInstallation);
      updateInstallationStatusMock.mockResolvedValue({
        ...mockDisconnectedInstallation,
        status: 'active',
      });
      createAppJwtMock.mockResolvedValue('mock-jwt-token');
      fetchInstallationRepositoriesMock.mockResolvedValue({
        success: true,
        repositories: mockGitHubRepos,
      });
      syncRepositoriesMock.mockResolvedValue({ added: 2, removed: 0, updated: 0 });
    });

    it('should reconnect a disconnected installation and sync repositories', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/reconnect`, {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.syncResult).toEqual({ added: 2, removed: 0, updated: 0 });
      expect(getInstallationByIdMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        id: 'inst-1',
      });
      expect(updateInstallationStatusMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        id: 'inst-1',
        status: 'active',
      });
      expect(createAppJwtMock).toHaveBeenCalled();
      expect(fetchInstallationRepositoriesMock).toHaveBeenCalledWith('12345', 'mock-jwt-token');
      expect(syncRepositoriesMock).toHaveBeenCalledWith({
        installationId: 'inst-1',
        repositories: [
          {
            repositoryId: '101',
            repositoryName: 'repo-1',
            repositoryFullName: 'my-org/repo-1',
            private: false,
          },
          {
            repositoryId: '102',
            repositoryName: 'repo-2',
            repositoryFullName: 'my-org/repo-2',
            private: true,
          },
        ],
      });
    });

    it('should return 404 when installation not found', async () => {
      getInstallationByIdMock.mockResolvedValue(null);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/nonexistent/reconnect`, {
        method: 'POST',
      });

      expect(response.status).toBe(404);
      const body = await response.json();

      expect(body.status).toBe(404);
      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toBe('Installation not found');
      expect(updateInstallationStatusMock).not.toHaveBeenCalled();
    });

    it('should return 400 when installation is not disconnected', async () => {
      const activeInstallation = { ...mockDisconnectedInstallation, status: 'active' };
      getInstallationByIdMock.mockResolvedValue(activeInstallation);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/reconnect`, {
        method: 'POST',
      });

      expect(response.status).toBe(400);
      const body = await response.json();

      expect(body.status).toBe(400);
      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toBe('Installation is not disconnected');
      expect(updateInstallationStatusMock).not.toHaveBeenCalled();
    });

    it('should return 500 when reconnect operation fails', async () => {
      updateInstallationStatusMock.mockResolvedValue(null);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/reconnect`, {
        method: 'POST',
      });

      expect(response.status).toBe(500);
      const body = await response.json();

      expect(body.status).toBe(500);
      expect(body.error.code).toBe('internal_server_error');
      expect(body.error.message).toBe('Failed to reconnect installation');
    });

    it('should return 503 when GitHub App JWT creation fails', async () => {
      createAppJwtMock.mockRejectedValue(new Error('JWT creation failed'));

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/reconnect`, {
        method: 'POST',
      });

      expect(response.status).toBe(503);
      const body = await response.json();

      expect(body.status).toBe(503);
      expect(body.code).toBe('service_unavailable');
    });

    it('should return 503 when fetching repositories from GitHub fails', async () => {
      fetchInstallationRepositoriesMock.mockResolvedValue({
        success: false,
        error: 'GitHub API error',
      });

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/reconnect`, {
        method: 'POST',
      });

      expect(response.status).toBe(503);
      const body = await response.json();

      expect(body.status).toBe(503);
      expect(body.code).toBe('service_unavailable');
    });
  });

  describe('DELETE /installations/:installationId', () => {
    const mockInstallation = {
      id: 'inst-1',
      tenantId: TEST_TENANT_ID,
      installationId: '12345',
      accountLogin: 'my-org',
      accountId: '1001',
      accountType: 'Organization',
      status: 'active',
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    beforeEach(() => {
      // deleteInstallation now returns the deleted record or null
      deleteInstallationMock.mockResolvedValue(mockInstallation);
    });

    it('should delete installation permanently', async () => {
      // deleteInstallation now returns the deleted record
      deleteInstallationMock.mockResolvedValue(mockInstallation);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(deleteInstallationMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        id: 'inst-1',
      });
    });

    it('should return 404 when installation not found', async () => {
      // deleteInstallation returns null when not found
      deleteInstallationMock.mockResolvedValue(null);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/nonexistent`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);
      const body = await response.json();

      expect(body.status).toBe(404);
      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toBe('Installation not found');
    });

    it('should delete disconnected installation', async () => {
      const disconnectedInstallation = { ...mockInstallation, status: 'disconnected' };
      deleteInstallationMock.mockResolvedValue(disconnectedInstallation);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.success).toBe(true);
    });
  });

  describe('POST /installations/:installationId/sync', () => {
    const mockInstallation = {
      id: 'inst-1',
      tenantId: TEST_TENANT_ID,
      installationId: '12345',
      accountLogin: 'my-org',
      accountId: '1001',
      accountType: 'Organization',
      status: 'active',
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    const mockGitHubRepositories = [
      { id: 100001, name: 'repo-1', full_name: 'my-org/repo-1', private: false },
      { id: 100002, name: 'repo-2', full_name: 'my-org/repo-2', private: true },
      { id: 100003, name: 'repo-3', full_name: 'my-org/repo-3', private: false },
    ];

    const mockDbRepositories = [
      {
        id: 'repo-db-1',
        installationId: 'inst-1',
        repositoryId: '100001',
        repositoryName: 'repo-1',
        repositoryFullName: 'my-org/repo-1',
        private: false,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
      {
        id: 'repo-db-2',
        installationId: 'inst-1',
        repositoryId: '100002',
        repositoryName: 'repo-2',
        repositoryFullName: 'my-org/repo-2',
        private: true,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
      {
        id: 'repo-db-3',
        installationId: 'inst-1',
        repositoryId: '100003',
        repositoryName: 'repo-3',
        repositoryFullName: 'my-org/repo-3',
        private: false,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ];

    beforeEach(() => {
      getInstallationByIdMock.mockResolvedValue(mockInstallation);
      createAppJwtMock.mockResolvedValue('mock-app-jwt');
      fetchInstallationRepositoriesMock.mockResolvedValue({
        success: true,
        repositories: mockGitHubRepositories,
      });
      syncRepositoriesMock.mockResolvedValue({ added: 1, removed: 0, updated: 2 });
      getRepositoriesByInstallationIdMock.mockResolvedValue(mockDbRepositories);
    });

    it('should sync repositories successfully', async () => {
      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/sync`, {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.repositories).toHaveLength(3);
      expect(body.syncResult).toEqual({
        added: 1,
        removed: 0,
        updated: 2,
      });

      expect(getInstallationByIdMock).toHaveBeenCalledWith({
        tenantId: TEST_TENANT_ID,
        id: 'inst-1',
      });
      expect(createAppJwtMock).toHaveBeenCalled();
      expect(fetchInstallationRepositoriesMock).toHaveBeenCalledWith('12345', 'mock-app-jwt');
      expect(syncRepositoriesMock).toHaveBeenCalledWith({
        installationId: 'inst-1',
        repositories: [
          {
            repositoryId: '100001',
            repositoryName: 'repo-1',
            repositoryFullName: 'my-org/repo-1',
            private: false,
          },
          {
            repositoryId: '100002',
            repositoryName: 'repo-2',
            repositoryFullName: 'my-org/repo-2',
            private: true,
          },
          {
            repositoryId: '100003',
            repositoryName: 'repo-3',
            repositoryFullName: 'my-org/repo-3',
            private: false,
          },
        ],
      });
      expect(getRepositoriesByInstallationIdMock).toHaveBeenCalledWith('inst-1');
    });

    it('should return 404 when installation not found', async () => {
      getInstallationByIdMock.mockResolvedValue(null);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/nonexistent/sync`, {
        method: 'POST',
      });

      expect(response.status).toBe(404);
      const body = await response.json();

      expect(body.status).toBe(404);
      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toBe('Installation not found');
      expect(createAppJwtMock).not.toHaveBeenCalled();
    });

    it('should return 404 when installation belongs to different tenant', async () => {
      getInstallationByIdMock.mockResolvedValue(null);

      const response = await app.request(
        `/${TEST_TENANT_ID}/installations/other-tenant-inst/sync`,
        {
          method: 'POST',
        }
      );

      expect(response.status).toBe(404);
      const body = await response.json();

      expect(body.status).toBe(404);
      expect(body.error.code).toBe('not_found');
    });

    it('should return 503 when GitHub App JWT creation fails', async () => {
      createAppJwtMock.mockRejectedValue(new Error('Private key not configured'));

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/sync`, {
        method: 'POST',
      });

      expect(response.status).toBe(503);
      const body = await response.json();

      expect(body.status).toBe(503);
      expect(body.code).toBe('service_unavailable');
      expect(body.error.message).toBe('GitHub App not configured properly');
      expect(fetchInstallationRepositoriesMock).not.toHaveBeenCalled();
    });

    it('should return 503 when fetching repositories from GitHub fails', async () => {
      fetchInstallationRepositoriesMock.mockResolvedValue({
        success: false,
        error: 'Failed to connect to GitHub API',
      });

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/sync`, {
        method: 'POST',
      });

      expect(response.status).toBe(503);
      const body = await response.json();

      expect(body.status).toBe(503);
      expect(body.code).toBe('service_unavailable');
      expect(body.error.message).toBe('Failed to fetch repositories from GitHub API');
      expect(syncRepositoriesMock).not.toHaveBeenCalled();
    });

    it('should handle empty repository list from GitHub', async () => {
      fetchInstallationRepositoriesMock.mockResolvedValue({
        success: true,
        repositories: [],
      });
      syncRepositoriesMock.mockResolvedValue({ added: 0, removed: 5, updated: 0 });
      getRepositoriesByInstallationIdMock.mockResolvedValue([]);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/sync`, {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.repositories).toEqual([]);
      expect(body.syncResult).toEqual({
        added: 0,
        removed: 5,
        updated: 0,
      });
    });

    it('should sync repositories for User account type', async () => {
      const userInstallation = {
        ...mockInstallation,
        accountType: 'User',
        accountLogin: 'my-user',
      };
      getInstallationByIdMock.mockResolvedValue(userInstallation);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/sync`, {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.repositories).toBeDefined();
      expect(body.syncResult).toBeDefined();
    });

    it('should sync repositories for pending installation', async () => {
      const pendingInstallation = { ...mockInstallation, status: 'pending' };
      getInstallationByIdMock.mockResolvedValue(pendingInstallation);

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/sync`, {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.repositories).toBeDefined();
      expect(body.syncResult).toBeDefined();
    });

    it('should include all sync result fields', async () => {
      syncRepositoriesMock.mockResolvedValue({ added: 3, removed: 2, updated: 5 });

      const response = await app.request(`/${TEST_TENANT_ID}/installations/inst-1/sync`, {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.syncResult).toHaveProperty('added', 3);
      expect(body.syncResult).toHaveProperty('removed', 2);
      expect(body.syncResult).toHaveProperty('updated', 5);
    });
  });
});
