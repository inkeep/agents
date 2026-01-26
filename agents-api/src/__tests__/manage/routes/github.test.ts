import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jwtVerify } from 'jose';

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

vi.mock('../../../domains/github/config', () => ({
  isStateSigningConfigured: isStateSigningConfiguredMock,
  isGitHubAppNameConfigured: isGitHubAppNameConfiguredMock,
  getStateSigningSecret: getStateSigningSecretMock,
  getGitHubAppName: getGitHubAppNameMock,
}));

vi.mock('../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import app, { signStateToken, STATE_JWT_ISSUER, STATE_JWT_AUDIENCE } from '../../../domains/manage/routes/github';

const TEST_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
const TEST_APP_NAME = 'test-github-app';

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
      const response = await app.request('/install-url', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.url).toMatch(/^https:\/\/github\.com\/apps\/test-github-app\/installations\/new\?state=/);
      expect(body.url).toContain('state=');
    });

    it('should include a valid JWT state in the URL', async () => {
      const response = await app.request('/install-url', {
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

      expect(payload.tenantId).toBeDefined();
    });

    it('should return 500 when state signing secret is not configured', async () => {
      isStateSigningConfiguredMock.mockReturnValue(false);

      const response = await app.request('/install-url', {
        method: 'GET',
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.status).toBe(500);
      expect(body.error).toContain('not configured');
    });

    it('should return 500 when GitHub App name is not configured', async () => {
      isGitHubAppNameConfiguredMock.mockReturnValue(false);

      const response = await app.request('/install-url', {
        method: 'GET',
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.status).toBe(500);
      expect(body.error).toContain('not configured');
    });

    it('should URL-encode the state parameter', async () => {
      const response = await app.request('/install-url', {
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
});
