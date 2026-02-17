import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  isStateSigningConfiguredMock,
  getStateSigningSecretMock,
  createInstallationMock,
  getInstallationByGitHubIdMock,
  listProjectsMetadataMock,
  setProjectAccessModeMock,
  syncRepositoriesMock,
  updateInstallationStatusByGitHubIdMock,
  generateIdMock,
  createAppJwtMock,
  determineStatusMock,
  fetchInstallationDetailsMock,
  fetchInstallationRepositoriesMock,
} = vi.hoisted(() => ({
  isStateSigningConfiguredMock: vi.fn(),
  getStateSigningSecretMock: vi.fn(),
  createInstallationMock: vi.fn(),
  getInstallationByGitHubIdMock: vi.fn(),
  listProjectsMetadataMock: vi.fn(),
  setProjectAccessModeMock: vi.fn(),
  syncRepositoriesMock: vi.fn(),
  updateInstallationStatusByGitHubIdMock: vi.fn(),
  generateIdMock: vi.fn(),
  createAppJwtMock: vi.fn(),
  determineStatusMock: vi.fn(),
  fetchInstallationDetailsMock: vi.fn(),
  fetchInstallationRepositoriesMock: vi.fn(),
}));

const { envMock } = vi.hoisted(() => ({
  envMock: {
    INKEEP_AGENTS_MANAGE_UI_URL: 'https://app.example.com',
  },
}));

vi.mock('../../../github/config', () => ({
  isStateSigningConfigured: isStateSigningConfiguredMock,
  getStateSigningSecret: getStateSigningSecretMock,
}));

vi.mock('../../../github/installation', () => ({
  createAppJwt: createAppJwtMock,
  determineStatus: determineStatusMock,
  fetchInstallationDetails: fetchInstallationDetailsMock,
  fetchInstallationRepositories: fetchInstallationRepositoriesMock,
}));

vi.mock('../../../env', () => ({
  env: envMock,
}));

vi.mock('@inkeep/agents-core', () => ({
  createInstallation: () => createInstallationMock,
  getInstallationByGitHubId: () => getInstallationByGitHubIdMock,
  listProjectsMetadata: () => listProjectsMetadataMock,
  setProjectAccessMode: () => setProjectAccessModeMock,
  syncRepositories: () => syncRepositoriesMock,
  updateInstallationStatusByGitHubId: () => updateInstallationStatusByGitHubIdMock,
  generateId: generateIdMock,
}));

vi.mock('../../../db/runDbClient', () => ({
  default: {},
}));

vi.mock('../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import app from '../../../github/routes/setup';

const TEST_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
const STATE_JWT_ISSUER = 'inkeep-agents-api';
const STATE_JWT_AUDIENCE = 'github-app-install';

async function createValidStateToken(tenantId: string): Promise<string> {
  const secretKey = new TextEncoder().encode(TEST_SECRET);
  const jwt = await new SignJWT({ tenantId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(STATE_JWT_ISSUER)
    .setAudience(STATE_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secretKey);
  return jwt;
}

async function createExpiredStateToken(tenantId: string): Promise<string> {
  const secretKey = new TextEncoder().encode(TEST_SECRET);
  const jwt = await new SignJWT({ tenantId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(STATE_JWT_ISSUER)
    .setAudience(STATE_JWT_AUDIENCE)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 1200) // 20 minutes ago
    .setExpirationTime(Math.floor(Date.now() / 1000) - 600) // expired 10 minutes ago
    .sign(secretKey);
  return jwt;
}

describe('GitHub Setup Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isStateSigningConfiguredMock.mockReturnValue(true);
    getStateSigningSecretMock.mockReturnValue(TEST_SECRET);
    generateIdMock.mockReturnValue('test-generated-id');

    createAppJwtMock.mockResolvedValue('test-jwt-token');
    determineStatusMock.mockImplementation((action: string) =>
      action === 'request' ? 'pending' : 'active'
    );
    fetchInstallationDetailsMock.mockResolvedValue({
      success: true,
      installation: {
        id: 12345,
        account: { login: 'test-org', id: 67890, type: 'Organization' },
      },
    });
    fetchInstallationRepositoriesMock.mockResolvedValue({
      success: true,
      repositories: [],
    });

    createInstallationMock.mockResolvedValue({
      id: 'test-installation-id',
      tenantId: 'test-tenant',
      installationId: '12345',
      accountLogin: 'test-org',
      accountId: '67890',
      accountType: 'Organization',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    getInstallationByGitHubIdMock.mockResolvedValue(null);
    listProjectsMetadataMock.mockResolvedValue([]);
    setProjectAccessModeMock.mockResolvedValue(undefined);
    syncRepositoriesMock.mockResolvedValue({ added: 0, removed: 0, updated: 0 });
    updateInstallationStatusByGitHubIdMock.mockResolvedValue({
      id: 'test-installation-id',
      status: 'active',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /', () => {
    it('should redirect with error for missing query parameters', async () => {
      const response = await app.request('/', { method: 'GET' });

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('/github/setup-error');
      expect(location).toContain('message=');
    });

    it('should redirect with error for missing installation_id', async () => {
      const state = await createValidStateToken('tenant-123');
      const response = await app.request(
        `/?setup_action=install&state=${encodeURIComponent(state)}`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('/github/setup-error');
    });

    it('should redirect with error for missing setup_action', async () => {
      const state = await createValidStateToken('tenant-123');
      const response = await app.request(
        `/?installation_id=12345&state=${encodeURIComponent(state)}`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('/github/setup-error');
    });

    it('should redirect with error for missing state', async () => {
      const response = await app.request('/?installation_id=12345&setup_action=install', {
        method: 'GET',
      });

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('/github/setup-error');
    });

    it('should redirect with error for expired state token', async () => {
      const state = await createExpiredStateToken('tenant-123');
      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('/github/setup-error');
      expect(location).toMatch(/expired/i);
    });

    it('should redirect with error for invalid state signature', async () => {
      const wrongSecret = new TextEncoder().encode('wrong-secret-that-is-at-least-32-chars');
      const jwt = await new SignJWT({ tenantId: 'tenant-123' })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer(STATE_JWT_ISSUER)
        .setAudience(STATE_JWT_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(wrongSecret);

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(jwt)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('/github/setup-error');
    });

    it('should redirect with error when state signing is not configured', async () => {
      isStateSigningConfiguredMock.mockReturnValue(false);

      const state = await createValidStateToken('tenant-123');
      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('/github/setup-error');
      expect(location).toMatch(/not.+configured/i);
    });

    it('should redirect with error for invalid setup_action', async () => {
      const state = await createValidStateToken('tenant-123');
      const response = await app.request(
        `/?installation_id=12345&setup_action=invalid&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('/github/setup-error');
    });

    it('should handle setup_action=request as pending status', async () => {
      const state = await createValidStateToken('tenant-123');

      const response = await app.request(
        `/?installation_id=12345&setup_action=request&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      expect(determineStatusMock).toHaveBeenCalledWith('request');
      expect(createInstallationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
        })
      );
    });
  });

  describe('Redirect URL construction', () => {
    it('should redirect to configured MANAGE_UI_URL with tenant ID on success', async () => {
      const state = await createValidStateToken('tenant-123');

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('https://app.example.com');
      expect(location).toContain('/tenant-123/work-apps/github');
      expect(location).toContain('status=success');
    });

    it('should include installation_id in success redirect', async () => {
      const state = await createValidStateToken('tenant-123');

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('installation_id=');
    });
  });

  describe('Installation creation', () => {
    it('should create new installation when none exists', async () => {
      const state = await createValidStateToken('tenant-123');
      getInstallationByGitHubIdMock.mockResolvedValue(null);

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      expect(createInstallationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          installationId: '12345',
          accountLogin: 'test-org',
          accountId: '67890',
          accountType: 'Organization',
          status: 'active',
        })
      );
    });

    it('should update existing installation when one exists', async () => {
      const state = await createValidStateToken('tenant-123');
      getInstallationByGitHubIdMock.mockResolvedValue({
        id: 'existing-id',
        tenantId: 'tenant-123',
        installationId: '12345',
        status: 'pending',
      });

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      expect(updateInstallationStatusByGitHubIdMock).toHaveBeenCalledWith({
        gitHubInstallationId: '12345',
        status: 'active',
      });
      expect(createInstallationMock).not.toHaveBeenCalled();
    });

    it('should set access mode to "all" for all existing projects when creating new installation', async () => {
      const state = await createValidStateToken('tenant-123');
      getInstallationByGitHubIdMock.mockResolvedValue(null);
      listProjectsMetadataMock.mockResolvedValue([
        { id: 'project-1', tenantId: 'tenant-123', mainBranchName: 'main' },
        { id: 'project-2', tenantId: 'tenant-123', mainBranchName: 'main' },
        { id: 'project-3', tenantId: 'tenant-123', mainBranchName: 'main' },
      ]);

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      expect(listProjectsMetadataMock).toHaveBeenCalledWith({ tenantId: 'tenant-123' });
      expect(setProjectAccessModeMock).toHaveBeenCalledTimes(3);
      expect(setProjectAccessModeMock).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        projectId: 'project-1',
        mode: 'all',
      });
      expect(setProjectAccessModeMock).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        projectId: 'project-2',
        mode: 'all',
      });
      expect(setProjectAccessModeMock).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        projectId: 'project-3',
        mode: 'all',
      });
    });

    it('should not set access mode when updating existing installation', async () => {
      const state = await createValidStateToken('tenant-123');
      getInstallationByGitHubIdMock.mockResolvedValue({
        id: 'existing-id',
        tenantId: 'tenant-123',
        installationId: '12345',
        status: 'pending',
      });
      listProjectsMetadataMock.mockResolvedValue([
        { id: 'project-1', tenantId: 'tenant-123', mainBranchName: 'main' },
      ]);

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      expect(listProjectsMetadataMock).not.toHaveBeenCalled();
      expect(setProjectAccessModeMock).not.toHaveBeenCalled();
    });

    it('should not call setProjectAccessMode when no projects exist', async () => {
      const state = await createValidStateToken('tenant-123');
      getInstallationByGitHubIdMock.mockResolvedValue(null);
      listProjectsMetadataMock.mockResolvedValue([]);

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      expect(listProjectsMetadataMock).toHaveBeenCalledWith({ tenantId: 'tenant-123' });
      expect(setProjectAccessModeMock).not.toHaveBeenCalled();
    });
  });

  describe('Repository syncing', () => {
    it('should sync repositories after installation', async () => {
      const state = await createValidStateToken('tenant-123');

      fetchInstallationRepositoriesMock.mockResolvedValue({
        success: true,
        repositories: [
          { id: 1, name: 'repo1', full_name: 'test-org/repo1', private: false },
          { id: 2, name: 'repo2', full_name: 'test-org/repo2', private: true },
        ],
      });

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      expect(syncRepositoriesMock).toHaveBeenCalledWith({
        installationId: expect.any(String),
        repositories: [
          {
            repositoryId: '1',
            repositoryName: 'repo1',
            repositoryFullName: 'test-org/repo1',
            private: false,
          },
          {
            repositoryId: '2',
            repositoryName: 'repo2',
            repositoryFullName: 'test-org/repo2',
            private: true,
          },
        ],
      });
    });

    it('should handle empty repository list', async () => {
      const state = await createValidStateToken('tenant-123');

      fetchInstallationRepositoriesMock.mockResolvedValue({
        success: true,
        repositories: [],
      });

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      expect(syncRepositoriesMock).not.toHaveBeenCalled();
    });
  });

  describe('GitHub API error handling', () => {
    it('should redirect with error when GitHub installation lookup fails', async () => {
      const state = await createValidStateToken('tenant-123');

      fetchInstallationDetailsMock.mockResolvedValue({
        success: false,
        error: 'Not found',
      });

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('/tenant-123/work-apps/github');
      expect(location).toContain('status=error');
    });

    it('should continue without repos if repository fetch fails', async () => {
      const state = await createValidStateToken('tenant-123');

      fetchInstallationRepositoriesMock.mockResolvedValue({
        success: false,
        error: 'Unauthorized',
      });

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('status=success');
      expect(syncRepositoriesMock).not.toHaveBeenCalled();
    });
  });
});
