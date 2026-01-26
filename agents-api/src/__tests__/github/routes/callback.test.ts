import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

const {
  isStateSigningConfiguredMock,
  getStateSigningSecretMock,
  createInstallationMock,
  getInstallationByGitHubIdMock,
  syncRepositoriesMock,
  updateInstallationStatusByGitHubIdMock,
  generateIdMock,
} = vi.hoisted(() => ({
  isStateSigningConfiguredMock: vi.fn(),
  getStateSigningSecretMock: vi.fn(),
  createInstallationMock: vi.fn(),
  getInstallationByGitHubIdMock: vi.fn(),
  syncRepositoriesMock: vi.fn(),
  updateInstallationStatusByGitHubIdMock: vi.fn(),
  generateIdMock: vi.fn(),
}));

const { envMock } = vi.hoisted(() => ({
  envMock: {
    INKEEP_AGENTS_MANAGE_UI_URL: 'https://app.example.com',
    GITHUB_APP_ID: 'test-app-id',
    GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
  },
}));

vi.mock('../../../domains/github/config', () => ({
  isStateSigningConfigured: isStateSigningConfiguredMock,
  getStateSigningSecret: getStateSigningSecretMock,
}));

vi.mock('../../../env', () => ({
  env: envMock,
}));

vi.mock('@inkeep/agents-core', () => ({
  createInstallation: () => createInstallationMock,
  getInstallationByGitHubId: () => getInstallationByGitHubIdMock,
  syncRepositories: () => syncRepositoriesMock,
  updateInstallationStatusByGitHubId: () => updateInstallationStatusByGitHubIdMock,
  generateId: generateIdMock,
}));

vi.mock('../../../data/db/runDbClient', () => ({
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

const fetchMock = vi.fn();
global.fetch = fetchMock;

import app from '../../../domains/github/routes/callback';

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

describe('GitHub Callback Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isStateSigningConfiguredMock.mockReturnValue(true);
    getStateSigningSecretMock.mockReturnValue(TEST_SECRET);
    generateIdMock.mockReturnValue('test-generated-id');
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
      expect(location).toContain('/settings/github');
      expect(location).toContain('status=error');
      expect(location).toContain('message=');
    });

    it('should redirect with error for missing installation_id', async () => {
      const state = await createValidStateToken('tenant-123');
      const response = await app.request(`/?setup_action=install&state=${encodeURIComponent(state)}`, {
        method: 'GET',
      });

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('status=error');
    });

    it('should redirect with error for missing setup_action', async () => {
      const state = await createValidStateToken('tenant-123');
      const response = await app.request(`/?installation_id=12345&state=${encodeURIComponent(state)}`, {
        method: 'GET',
      });

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('status=error');
    });

    it('should redirect with error for missing state', async () => {
      const response = await app.request('/?installation_id=12345&setup_action=install', {
        method: 'GET',
      });

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('status=error');
    });

    it('should redirect with error for expired state token', async () => {
      const state = await createExpiredStateToken('tenant-123');
      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('status=error');
      expect(location).toContain('expired');
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
      expect(location).toContain('status=error');
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
      expect(location).toContain('status=error');
      expect(location).toContain('not%20configured');
    });

    it('should redirect with error for invalid setup_action', async () => {
      const state = await createValidStateToken('tenant-123');
      const response = await app.request(
        `/?installation_id=12345&setup_action=invalid&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('status=error');
    });

    it('should handle setup_action=request as pending status', async () => {
      const state = await createValidStateToken('tenant-123');

      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/app/installations/12345')) {
          return new Response(JSON.stringify({
            id: 12345,
            account: { login: 'test-org', id: 67890, type: 'Organization' },
          }), { status: 200 });
        }
        if (url.includes('/access_tokens')) {
          return new Response(JSON.stringify({ token: 'ghs_test_token' }), { status: 200 });
        }
        if (url.includes('/installation/repositories')) {
          return new Response(JSON.stringify({ total_count: 0, repositories: [] }), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      });

      const response = await app.request(
        `/?installation_id=12345&setup_action=request&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);

      expect(createInstallationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
        })
      );
    });
  });

  describe('Redirect URL construction', () => {
    it('should redirect to configured MANAGE_UI_URL on success', async () => {
      const state = await createValidStateToken('tenant-123');

      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/app/installations/12345')) {
          return new Response(JSON.stringify({
            id: 12345,
            account: { login: 'test-org', id: 67890, type: 'Organization' },
          }), { status: 200 });
        }
        if (url.includes('/access_tokens')) {
          return new Response(JSON.stringify({ token: 'ghs_test_token' }), { status: 200 });
        }
        if (url.includes('/installation/repositories')) {
          return new Response(JSON.stringify({ total_count: 0, repositories: [] }), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      });

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('https://app.example.com');
      expect(location).toContain('/settings/github');
      expect(location).toContain('status=success');
    });

    it('should include installation_id in success redirect', async () => {
      const state = await createValidStateToken('tenant-123');

      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/app/installations/12345')) {
          return new Response(JSON.stringify({
            id: 12345,
            account: { login: 'test-org', id: 67890, type: 'Organization' },
          }), { status: 200 });
        }
        if (url.includes('/access_tokens')) {
          return new Response(JSON.stringify({ token: 'ghs_test_token' }), { status: 200 });
        }
        if (url.includes('/installation/repositories')) {
          return new Response(JSON.stringify({ total_count: 0, repositories: [] }), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      });

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

      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/app/installations/12345')) {
          return new Response(JSON.stringify({
            id: 12345,
            account: { login: 'test-org', id: 67890, type: 'Organization' },
          }), { status: 200 });
        }
        if (url.includes('/access_tokens')) {
          return new Response(JSON.stringify({ token: 'ghs_test_token' }), { status: 200 });
        }
        if (url.includes('/installation/repositories')) {
          return new Response(JSON.stringify({ total_count: 0, repositories: [] }), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      });

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

      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/app/installations/12345')) {
          return new Response(JSON.stringify({
            id: 12345,
            account: { login: 'test-org', id: 67890, type: 'Organization' },
          }), { status: 200 });
        }
        if (url.includes('/access_tokens')) {
          return new Response(JSON.stringify({ token: 'ghs_test_token' }), { status: 200 });
        }
        if (url.includes('/installation/repositories')) {
          return new Response(JSON.stringify({ total_count: 0, repositories: [] }), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
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
  });

  describe('Repository syncing', () => {
    it('should sync repositories after installation', async () => {
      const state = await createValidStateToken('tenant-123');

      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/app/installations/12345')) {
          return new Response(JSON.stringify({
            id: 12345,
            account: { login: 'test-org', id: 67890, type: 'Organization' },
          }), { status: 200 });
        }
        if (url.includes('/access_tokens')) {
          return new Response(JSON.stringify({ token: 'ghs_test_token' }), { status: 200 });
        }
        if (url.includes('/installation/repositories')) {
          return new Response(JSON.stringify({
            total_count: 2,
            repositories: [
              { id: 1, name: 'repo1', full_name: 'test-org/repo1', private: false },
              { id: 2, name: 'repo2', full_name: 'test-org/repo2', private: true },
            ],
          }), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      });

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      expect(syncRepositoriesMock).toHaveBeenCalledWith({
        installationId: expect.any(String),
        repositories: [
          { repositoryId: '1', repositoryName: 'repo1', repositoryFullName: 'test-org/repo1', private: false },
          { repositoryId: '2', repositoryName: 'repo2', repositoryFullName: 'test-org/repo2', private: true },
        ],
      });
    });

    it('should handle empty repository list', async () => {
      const state = await createValidStateToken('tenant-123');

      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/app/installations/12345')) {
          return new Response(JSON.stringify({
            id: 12345,
            account: { login: 'test-org', id: 67890, type: 'Organization' },
          }), { status: 200 });
        }
        if (url.includes('/access_tokens')) {
          return new Response(JSON.stringify({ token: 'ghs_test_token' }), { status: 200 });
        }
        if (url.includes('/installation/repositories')) {
          return new Response(JSON.stringify({ total_count: 0, repositories: [] }), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
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

      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/app/installations/12345')) {
          return new Response('Not Found', { status: 404 });
        }
        return new Response('Not Found', { status: 404 });
      });

      const response = await app.request(
        `/?installation_id=12345&setup_action=install&state=${encodeURIComponent(state)}`,
        { method: 'GET' }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('status=error');
    });

    it('should continue without repos if repository fetch fails', async () => {
      const state = await createValidStateToken('tenant-123');

      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/app/installations/12345')) {
          return new Response(JSON.stringify({
            id: 12345,
            account: { login: 'test-org', id: 67890, type: 'Organization' },
          }), { status: 200 });
        }
        if (url.includes('/access_tokens')) {
          return new Response('Unauthorized', { status: 401 });
        }
        return new Response('Not Found', { status: 404 });
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
