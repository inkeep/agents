import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMalformedToken,
  createTestOidcToken,
  createTokenWithDifferentKey,
  generateTestKeyPair,
} from '../../utils/testJwt';

// Hoist mocks for module dependencies
const {
  isGitHubAppConfiguredMock,
  validateOidcTokenMock,
  lookupInstallationForRepoMock,
  generateInstallationAccessTokenMock,
  getInstallationByGitHubIdMock,
  checkProjectRepositoryAccessMock,
} = vi.hoisted(() => ({
  isGitHubAppConfiguredMock: vi.fn(),
  validateOidcTokenMock: vi.fn(),
  lookupInstallationForRepoMock: vi.fn(),
  generateInstallationAccessTokenMock: vi.fn(),
  getInstallationByGitHubIdMock: vi.fn(),
  checkProjectRepositoryAccessMock: vi.fn(),
}));

// Mock the config module
vi.mock('../../../github/config', () => ({
  isGitHubAppConfigured: isGitHubAppConfiguredMock,
}));

// Mock the oidcToken module
vi.mock('../../../github/oidcToken', () => ({
  validateOidcToken: validateOidcTokenMock,
}));

// Mock the installation module
vi.mock('../../../github/installation', () => ({
  lookupInstallationForRepo: lookupInstallationForRepoMock,
  generateInstallationAccessToken: generateInstallationAccessTokenMock,
}));

// Mock the data access layer
vi.mock('@inkeep/agents-core', () => ({
  getInstallationByGitHubId: () => getInstallationByGitHubIdMock,
  checkProjectRepositoryAccess: () => checkProjectRepositoryAccessMock,
}));

// Mock the database client
vi.mock('../../../db/runDbClient', () => ({
  default: {},
}));

// Import the app after mocks are set up
import app from '../../../github/routes/tokenExchange';

describe('GitHub Token Exchange Route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Generate test key pair for JWT tests
    await generateTestKeyPair();
    // Default: GitHub App is configured
    isGitHubAppConfiguredMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /work-apps/github/token-exchange', () => {
    describe('Success case (200)', () => {
      it('should return installation token for valid OIDC token with tenant_id', async () => {
        const validToken = await createTestOidcToken();

        validateOidcTokenMock.mockResolvedValue({
          success: true,
          claims: {
            repository: 'test-org/test-repo',
            repository_owner: 'test-org',
            repository_id: '123456789',
            workflow: 'CI',
            actor: 'test-user',
            ref: 'refs/heads/main',
          },
        });

        lookupInstallationForRepoMock.mockResolvedValue({
          success: true,
          installation: {
            installationId: 12345678,
            appId: 98765,
          },
        });

        getInstallationByGitHubIdMock.mockResolvedValue({
          id: 'inst_123',
          tenantId: 'tenant_abc123',
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '99999',
          accountType: 'Organization',
          status: 'active',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });

        generateInstallationAccessTokenMock.mockResolvedValue({
          success: true,
          accessToken: {
            token: 'ghs_test_installation_token_abc123',
            expiresAt: '2026-01-23T17:00:00Z',
          },
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: validToken }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
          token: 'ghs_test_installation_token_abc123',
          expires_at: '2026-01-23T17:00:00Z',
          repository: 'test-org/test-repo',
          installation_id: 12345678,
          tenant_id: 'tenant_abc123',
        });

        expect(validateOidcTokenMock).toHaveBeenCalledWith(validToken);
        expect(lookupInstallationForRepoMock).toHaveBeenCalledWith('test-org', 'test-repo');
        expect(getInstallationByGitHubIdMock).toHaveBeenCalledWith('12345678');
        expect(generateInstallationAccessTokenMock).toHaveBeenCalledWith(12345678);
      });

      it('should return installation token with project_id when project has access', async () => {
        const validToken = await createTestOidcToken();

        validateOidcTokenMock.mockResolvedValue({
          success: true,
          claims: {
            repository: 'test-org/test-repo',
            repository_owner: 'test-org',
            repository_id: '123456789',
            workflow: 'CI',
            actor: 'test-user',
            ref: 'refs/heads/main',
          },
        });

        lookupInstallationForRepoMock.mockResolvedValue({
          success: true,
          installation: {
            installationId: 12345678,
            appId: 98765,
          },
        });

        getInstallationByGitHubIdMock.mockResolvedValue({
          id: 'inst_123',
          tenantId: 'tenant_abc123',
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '99999',
          accountType: 'Organization',
          status: 'active',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });

        checkProjectRepositoryAccessMock.mockResolvedValue({
          hasAccess: true,
          reason: 'Project has access to all repositories',
        });

        generateInstallationAccessTokenMock.mockResolvedValue({
          success: true,
          accessToken: {
            token: 'ghs_test_installation_token_abc123',
            expiresAt: '2026-01-23T17:00:00Z',
          },
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: validToken, project_id: 'proj_test123' }),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
          token: 'ghs_test_installation_token_abc123',
          expires_at: '2026-01-23T17:00:00Z',
          repository: 'test-org/test-repo',
          installation_id: 12345678,
          tenant_id: 'tenant_abc123',
        });

        expect(checkProjectRepositoryAccessMock).toHaveBeenCalledWith({
          projectId: 'proj_test123',
          repositoryFullName: 'test-org/test-repo',
          tenantId: 'tenant_abc123',
        });
      });
    });

    describe('400 Bad Request cases', () => {
      it('should return 400 when oidc_token is missing', async () => {
        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.status).toBe(400);
        expect(body.title).toBe('Bad Request');
        expect(body.error).toContain('oidc_token');
      });

      it('should return 400 when oidc_token is not a string', async () => {
        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: 12345 }),
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.status).toBe(400);
        expect(body.error).toBeDefined();
      });

      it('should return 400 for malformed JWT (not-jwt)', async () => {
        const malformedToken = createMalformedToken('not-jwt');

        validateOidcTokenMock.mockResolvedValue({
          success: false,
          errorType: 'malformed',
          message: 'Invalid JWT format: unable to decode token header',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: malformedToken }),
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.status).toBe(400);
        expect(body.title).toBe('Bad Request');
        expect(body.error).toContain('Invalid JWT format');
      });

      it('should return 400 for empty token', async () => {
        const emptyToken = createMalformedToken('empty');

        validateOidcTokenMock.mockResolvedValue({
          success: false,
          errorType: 'malformed',
          message: 'Invalid JWT format: unable to decode token header',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: emptyToken }),
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.status).toBe(400);
      });
    });

    describe('401 Unauthorized cases', () => {
      it('should return 401 for invalid JWT signature', async () => {
        const { token } = await createTokenWithDifferentKey();

        validateOidcTokenMock.mockResolvedValue({
          success: false,
          errorType: 'invalid_signature',
          message: 'Invalid token signature',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: token }),
        });

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.status).toBe(401);
        expect(body.title).toBe('Token Validation Failed');
        expect(body.error).toContain('Invalid token signature');
      });

      it('should return 401 for wrong issuer', async () => {
        const wrongIssuerToken = await createTestOidcToken({
          issuer: 'https://wrong.issuer.com',
        });

        validateOidcTokenMock.mockResolvedValue({
          success: false,
          errorType: 'wrong_issuer',
          message: 'Invalid token issuer: expected https://token.actions.githubusercontent.com',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: wrongIssuerToken }),
        });

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.status).toBe(401);
        expect(body.error).toContain('Invalid token issuer');
      });

      it('should return 401 for wrong audience', async () => {
        const wrongAudienceToken = await createTestOidcToken({
          audience: 'wrong-audience',
        });

        validateOidcTokenMock.mockResolvedValue({
          success: false,
          errorType: 'wrong_audience',
          message: 'Invalid token audience: expected inkeep-agents-action',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: wrongAudienceToken }),
        });

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.status).toBe(401);
        expect(body.error).toContain('Invalid token audience');
      });

      it('should return 401 for expired token', async () => {
        const expiredToken = await createTestOidcToken({
          expired: true,
        });

        validateOidcTokenMock.mockResolvedValue({
          success: false,
          errorType: 'expired',
          message: 'OIDC token has expired',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: expiredToken }),
        });

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.status).toBe(401);
        expect(body.error).toContain('expired');
      });
    });

    describe('403 Forbidden cases', () => {
      it('should return 403 when GitHub App is not installed on repository', async () => {
        const validToken = await createTestOidcToken();

        validateOidcTokenMock.mockResolvedValue({
          success: true,
          claims: {
            repository: 'test-org/test-repo',
            repository_owner: 'test-org',
            repository_id: '123456789',
            workflow: 'CI',
            actor: 'test-user',
            ref: 'refs/heads/main',
          },
        });

        lookupInstallationForRepoMock.mockResolvedValue({
          success: false,
          errorType: 'not_installed',
          message:
            'Inkeep GitHub App is not installed on repository test-org/test-repo. Please install the app from https://github.com/apps/inkeep-agents',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: validToken }),
        });

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.status).toBe(403);
        expect(body.title).toBe('GitHub App Not Installed');
        expect(body.error).toContain('not installed');
      });

      it('should return 403 when installation is not registered in database', async () => {
        const validToken = await createTestOidcToken();

        validateOidcTokenMock.mockResolvedValue({
          success: true,
          claims: {
            repository: 'test-org/test-repo',
            repository_owner: 'test-org',
            repository_id: '123456789',
            workflow: 'CI',
            actor: 'test-user',
            ref: 'refs/heads/main',
          },
        });

        lookupInstallationForRepoMock.mockResolvedValue({
          success: true,
          installation: {
            installationId: 12345678,
            appId: 98765,
          },
        });

        getInstallationByGitHubIdMock.mockResolvedValue(null);

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: validToken }),
        });

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.status).toBe(403);
        expect(body.title).toBe('Installation Not Registered');
        expect(body.error).toContain('not registered');
        expect(body.error).toContain('Inkeep dashboard');
      });

      it('should return 403 when installation status is pending', async () => {
        const validToken = await createTestOidcToken();

        validateOidcTokenMock.mockResolvedValue({
          success: true,
          claims: {
            repository: 'test-org/test-repo',
            repository_owner: 'test-org',
            repository_id: '123456789',
            workflow: 'CI',
            actor: 'test-user',
            ref: 'refs/heads/main',
          },
        });

        lookupInstallationForRepoMock.mockResolvedValue({
          success: true,
          installation: {
            installationId: 12345678,
            appId: 98765,
          },
        });

        getInstallationByGitHubIdMock.mockResolvedValue({
          id: 'inst_123',
          tenantId: 'tenant_abc123',
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '99999',
          accountType: 'Organization',
          status: 'pending',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: validToken }),
        });

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.status).toBe(403);
        expect(body.title).toBe('Installation Pending');
        expect(body.error).toContain('pending organization admin approval');
      });

      it('should return 403 when installation status is suspended', async () => {
        const validToken = await createTestOidcToken();

        validateOidcTokenMock.mockResolvedValue({
          success: true,
          claims: {
            repository: 'test-org/test-repo',
            repository_owner: 'test-org',
            repository_id: '123456789',
            workflow: 'CI',
            actor: 'test-user',
            ref: 'refs/heads/main',
          },
        });

        lookupInstallationForRepoMock.mockResolvedValue({
          success: true,
          installation: {
            installationId: 12345678,
            appId: 98765,
          },
        });

        getInstallationByGitHubIdMock.mockResolvedValue({
          id: 'inst_123',
          tenantId: 'tenant_abc123',
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '99999',
          accountType: 'Organization',
          status: 'suspended',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: validToken }),
        });

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.status).toBe(403);
        expect(body.title).toBe('Installation Suspended');
        expect(body.error).toContain('suspended');
      });

      it('should return 403 when installation status is deleted', async () => {
        const validToken = await createTestOidcToken();

        validateOidcTokenMock.mockResolvedValue({
          success: true,
          claims: {
            repository: 'test-org/test-repo',
            repository_owner: 'test-org',
            repository_id: '123456789',
            workflow: 'CI',
            actor: 'test-user',
            ref: 'refs/heads/main',
          },
        });

        lookupInstallationForRepoMock.mockResolvedValue({
          success: true,
          installation: {
            installationId: 12345678,
            appId: 98765,
          },
        });

        getInstallationByGitHubIdMock.mockResolvedValue({
          id: 'inst_123',
          tenantId: 'tenant_abc123',
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '99999',
          accountType: 'Organization',
          status: 'deleted',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: validToken }),
        });

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.status).toBe(403);
        expect(body.title).toBe('Installation Disconnected');
        expect(body.error).toContain('disconnected');
      });

      it('should return 403 when project does not have access to repository', async () => {
        const validToken = await createTestOidcToken();

        validateOidcTokenMock.mockResolvedValue({
          success: true,
          claims: {
            repository: 'test-org/test-repo',
            repository_owner: 'test-org',
            repository_id: '123456789',
            workflow: 'CI',
            actor: 'test-user',
            ref: 'refs/heads/main',
          },
        });

        lookupInstallationForRepoMock.mockResolvedValue({
          success: true,
          installation: {
            installationId: 12345678,
            appId: 98765,
          },
        });

        getInstallationByGitHubIdMock.mockResolvedValue({
          id: 'inst_123',
          tenantId: 'tenant_abc123',
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '99999',
          accountType: 'Organization',
          status: 'active',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });

        checkProjectRepositoryAccessMock.mockResolvedValue({
          hasAccess: false,
          reason: 'Repository not in project access list',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: validToken, project_id: 'proj_restricted' }),
        });

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.status).toBe(403);
        expect(body.title).toBe('Repository Access Denied');
        expect(body.error).toContain('does not have access to repository');
        expect(body.error).toContain('test-org/test-repo');
      });
    });

    describe('500 Internal Server Error cases', () => {
      it('should return 500 when GitHub App credentials are not configured', async () => {
        isGitHubAppConfiguredMock.mockReturnValue(false);

        const validToken = await createTestOidcToken();

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: validToken }),
        });

        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.status).toBe(500);
        expect(body.title).toBe('GitHub App Not Configured');
        expect(body.error).toContain('credentials are not configured');
      });

      it('should return 500 when GitHub API fails during installation lookup', async () => {
        const validToken = await createTestOidcToken();

        validateOidcTokenMock.mockResolvedValue({
          success: true,
          claims: {
            repository: 'test-org/test-repo',
            repository_owner: 'test-org',
            repository_id: '123456789',
            workflow: 'CI',
            actor: 'test-user',
            ref: 'refs/heads/main',
          },
        });

        lookupInstallationForRepoMock.mockResolvedValue({
          success: false,
          errorType: 'api_error',
          message: 'Failed to fetch installation: GitHub API returned 503',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: validToken }),
        });

        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.status).toBe(500);
        expect(body.title).toBe('Installation Lookup Failed');
        expect(body.error).toContain('Failed to fetch installation');
      });

      it('should return 500 when token generation fails', async () => {
        const validToken = await createTestOidcToken();

        validateOidcTokenMock.mockResolvedValue({
          success: true,
          claims: {
            repository: 'test-org/test-repo',
            repository_owner: 'test-org',
            repository_id: '123456789',
            workflow: 'CI',
            actor: 'test-user',
            ref: 'refs/heads/main',
          },
        });

        lookupInstallationForRepoMock.mockResolvedValue({
          success: true,
          installation: {
            installationId: 12345678,
            appId: 98765,
          },
        });

        getInstallationByGitHubIdMock.mockResolvedValue({
          id: 'inst_123',
          tenantId: 'tenant_abc123',
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '99999',
          accountType: 'Organization',
          status: 'active',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });

        generateInstallationAccessTokenMock.mockResolvedValue({
          success: false,
          errorType: 'api_error',
          message: 'Failed to generate access token: GitHub API returned 500',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: validToken }),
        });

        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.status).toBe(500);
        expect(body.title).toBe('Token Generation Failed');
        expect(body.error).toContain('Failed to generate access token');
      });

      it('should return 500 when JWT creation fails during installation lookup', async () => {
        const validToken = await createTestOidcToken();

        validateOidcTokenMock.mockResolvedValue({
          success: true,
          claims: {
            repository: 'test-org/test-repo',
            repository_owner: 'test-org',
            repository_id: '123456789',
            workflow: 'CI',
            actor: 'test-user',
            ref: 'refs/heads/main',
          },
        });

        lookupInstallationForRepoMock.mockResolvedValue({
          success: false,
          errorType: 'jwt_error',
          message: 'Failed to create App JWT: Invalid private key format',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: validToken }),
        });

        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.status).toBe(500);
        expect(body.error).toContain('Failed to create App JWT');
      });
    });

    describe('JWKS error case', () => {
      it('should return 401 when JWKS fetch fails', async () => {
        const validToken = await createTestOidcToken();

        validateOidcTokenMock.mockResolvedValue({
          success: false,
          errorType: 'jwks_error',
          message: 'Failed to fetch GitHub OIDC JWKS: Network error',
        });

        const response = await app.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oidc_token: validToken }),
        });

        // JWKS errors should return 401 (auth infrastructure failed)
        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.error).toContain('Failed to fetch GitHub OIDC JWKS');
      });
    });
  });
});
