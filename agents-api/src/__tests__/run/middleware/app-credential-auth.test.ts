import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  validateAndGetApiKeyMock,
  getAppByIdMock,
  validateOriginMock,
  updateAppLastUsedMock,
  verifyServiceTokenMock,
  isSlackUserTokenMock,
  verifySlackUserTokenMock,
  verifyTempTokenMock,
  canUseProjectStrictMock,
  validateTargetAgentMock,
} = vi.hoisted(() => ({
  validateAndGetApiKeyMock: vi.fn(),
  getAppByIdMock: vi.fn(() => vi.fn()),
  validateOriginMock: vi.fn(),
  updateAppLastUsedMock: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
  verifyServiceTokenMock: vi.fn().mockResolvedValue({ valid: false, error: 'Invalid token' }),
  isSlackUserTokenMock: vi.fn().mockReturnValue(false),
  verifySlackUserTokenMock: vi.fn(),
  verifyTempTokenMock: vi.fn(),
  canUseProjectStrictMock: vi.fn(),
  validateTargetAgentMock: vi.fn(),
}));

const { jwtVerifyMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn(),
}));

const { getAnonJwtSecretMock } = vi.hoisted(() => ({
  getAnonJwtSecretMock: vi.fn().mockReturnValue(new TextEncoder().encode('test-anon-secret')),
}));

vi.mock('@inkeep/agents-core', () => ({
  validateAndGetApiKey: validateAndGetApiKeyMock,
  getAppById: getAppByIdMock,
  validateOrigin: validateOriginMock,
  updateAppLastUsed: updateAppLastUsedMock,
  verifyServiceToken: verifyServiceTokenMock,
  isSlackUserToken: isSlackUserTokenMock,
  verifySlackUserToken: verifySlackUserTokenMock,
  verifyTempToken: verifyTempTokenMock,
  canUseProjectStrict: canUseProjectStrictMock,
  validateTargetAgent: validateTargetAgentMock,
  getLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('jose', () => ({
  jwtVerify: jwtVerifyMock,
  errors: {
    JWTExpired: class JWTExpired extends Error {},
    JWSSignatureVerificationFailed: class JWSSignatureVerificationFailed extends Error {},
  },
}));

vi.mock('../../../domains/run/routes/auth', () => ({
  getAnonJwtSecret: getAnonJwtSecretMock,
}));

vi.mock('../../../data/db/runDbClient', () => ({
  default: {},
}));

vi.mock('../../../env.js', () => ({
  env: {
    INKEEP_AGENTS_RUN_API_BYPASS_SECRET: undefined as string | undefined,
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
  },
}));

import { Hono } from 'hono';
import { runApiKeyAuth as apiKeyAuth } from '../../../middleware/runAuth';

function makeWebClientApp(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app-id-1',
    tenantId: 'tenant_1',
    projectId: 'project_1',
    type: 'web_client',
    enabled: true,
    defaultAgentId: 'agent-1',
    config: {
      type: 'web_client',
      webClient: {
        allowedDomains: ['help.customer.com'],

        captchaEnabled: false,
      },
    },
    ...overrides,
  };
}

const VALID_ANON_JWT = 'eyJhbGciOiJIUzI1NiJ9.valid-anon-token-content-padding-here-abcdef';

describe('App Credential Authentication', () => {
  let app: Hono;
  const originalEnv = process.env.ENVIRONMENT;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('db' as never, {});
      await next();
    });
    process.env.ENVIRONMENT = 'production';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.ENVIRONMENT = originalEnv;
  });

  describe('web_client app with anonymous JWT', () => {
    it('should authenticate successfully with valid anonymous JWT', async () => {
      const appRecord = makeWebClientApp();
      getAppByIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateOriginMock.mockReturnValue(true);
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'anon_test-uuid',
          app: 'app-id-1',
          tid: 'tenant_1',
          pid: 'project_1',
          type: 'anonymous',
        },
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const ctx = (c as any).get('executionContext');
        return c.json(ctx);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app-id-1',
          'x-inkeep-agent-id': 'agent-1',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        tenantId: 'tenant_1',
        projectId: 'project_1',
        agentId: 'agent-1',
        apiKeyId: 'app:app-id-1',
        metadata: {
          endUserId: 'anon_test-uuid',
          authMethod: 'app_credential_web_client',
        },
      });
    });

    it('should reject when origin is not allowed', async () => {
      const appRecord = makeWebClientApp();
      getAppByIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateOriginMock.mockReturnValue(false);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app-id-1',
          Origin: 'https://evil.com',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Origin not allowed for this app');
    });

    it('should reject when JWT app claim does not match', async () => {
      const appRecord = makeWebClientApp();
      getAppByIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateOriginMock.mockReturnValue(true);
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'anon_test-uuid',
          app: 'different-app-id',
          type: 'anonymous',
        },
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app-id-1',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('JWT app claim does not match');
    });

    it('should reject when JWT is invalid and HS256 is not enabled', async () => {
      const appRecord = makeWebClientApp();
      getAppByIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateOriginMock.mockReturnValue(true);
      jwtVerifyMock.mockRejectedValueOnce(new Error('invalid signature'));

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app-id-1',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid end-user JWT');
    });
  });

  describe('app lookup failures', () => {
    it('should reject when app is not found', async () => {
      getAppByIdMock.mockReturnValue(vi.fn().mockResolvedValue(null));

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'nonexistent-app',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('App not found');
    });

    it('should reject when app is disabled', async () => {
      const appRecord = makeWebClientApp({ enabled: false });
      getAppByIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app-id-1',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('App is disabled');
    });
  });

  describe('backward compatibility', () => {
    it('should still authenticate with regular API keys when no app ID header', async () => {
      const mockApiKey = {
        id: 'key_123',
        name: 'test-api-key',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        agentId: 'agent_123',
        publicId: 'pub_123',
        keyHash: 'hash_123',
        keyPrefix: 'sk_test_',
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      validateAndGetApiKeyMock.mockResolvedValueOnce(mockApiKey);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const ctx = (c as any).get('executionContext');
        return c.json(ctx);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer sk_test_1234567890abcdef.verylongsecretkey',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.apiKeyId).toBe('key_123');
      expect(body.agentId).toBe('agent_123');
    });
  });

  describe('lastUsedAt update', () => {
    it('should fire-and-forget update lastUsedAt on successful auth (sampled)', async () => {
      const updateFn = vi.fn().mockResolvedValue(undefined);
      updateAppLastUsedMock.mockReturnValue(updateFn);

      const appRecord = makeWebClientApp();
      getAppByIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateOriginMock.mockReturnValue(true);
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'anon_test-uuid',
          app: 'app-id-1',
          tid: 'tenant_1',
          pid: 'project_1',
          type: 'anonymous',
        },
      });

      const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.05);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app-id-1',
          'x-inkeep-agent-id': 'agent-1',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(200);
      expect(updateAppLastUsedMock).toHaveBeenCalled();
      expect(updateFn).toHaveBeenCalledWith('app-id-1');

      mathRandomSpy.mockRestore();
    });
  });
});
