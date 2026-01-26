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
} = vi.hoisted(() => ({
  isGitHubAppConfiguredMock: vi.fn(),
  validateOidcTokenMock: vi.fn(),
  lookupInstallationForRepoMock: vi.fn(),
  generateInstallationAccessTokenMock: vi.fn(),
}));

// Mock the config module
vi.mock('../../../domains/github/config', () => ({
  isGitHubAppConfigured: isGitHubAppConfiguredMock,
}));

// Mock the oidcToken module
vi.mock('../../../domains/github/oidcToken', () => ({
  validateOidcToken: validateOidcTokenMock,
}));

// Mock the installation module
vi.mock('../../../domains/github/installation', () => ({
  lookupInstallationForRepo: lookupInstallationForRepoMock,
  generateInstallationAccessToken: generateInstallationAccessTokenMock,
}));

// Import the app after mocks are set up
import app from '../../../domains/github/routes/tokenExchange';

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

  describe('POST /api/github/token-exchange', () => {
    describe('Success case (200)', () => {
      it('should return installation token for valid OIDC token', async () => {
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
        });

        expect(validateOidcTokenMock).toHaveBeenCalledWith(validToken);
        expect(lookupInstallationForRepoMock).toHaveBeenCalledWith('test-org', 'test-repo');
        expect(generateInstallationAccessTokenMock).toHaveBeenCalledWith(12345678);
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

    describe('403 Forbidden case', () => {
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
