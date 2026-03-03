import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  validateAndGetApiKeyMock,
  getAppByPublicIdMock,
  extractAppPublicIdMock,
  validateOriginMock,
  validateApiKeyMock,
  updateAppLastUsedMock,
  verifyServiceTokenMock,
  isSlackUserTokenMock,
  verifySlackUserTokenMock,
  verifyTempTokenMock,
  canUseProjectStrictMock,
  validateTargetAgentMock,
} = vi.hoisted(() => ({
  validateAndGetApiKeyMock: vi.fn(),
  getAppByPublicIdMock: vi.fn(() => vi.fn()),
  extractAppPublicIdMock: vi.fn(),
  validateOriginMock: vi.fn(),
  validateApiKeyMock: vi.fn(),
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
  getAppByPublicId: getAppByPublicIdMock,
  extractAppPublicId: extractAppPublicIdMock,
  validateOrigin: validateOriginMock,
  validateApiKey: validateApiKeyMock,
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
    publicId: 'a1b2c3d4e5f6',
    keyHash: null,
    keyPrefix: null,
    agentAccessMode: 'selected',
    allowedAgentIds: ['agent-1', 'agent-2'],
    defaultAgentId: 'agent-1',
    config: {
      type: 'web_client',
      webClient: {
        allowedDomains: ['help.customer.com'],
        authMode: 'anonymous_and_authenticated',
        anonymousSessionLifetimeSeconds: 86400,
        hs256Enabled: false,
        captchaEnabled: false,
      },
    },
    ...overrides,
  };
}

function makeApiApp(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app-id-2',
    tenantId: 'tenant_1',
    projectId: 'project_1',
    type: 'api',
    enabled: true,
    publicId: 'x9y8z7w6v5u4',
    keyHash: 'hashed-secret',
    keyPrefix: 'as_x9y8z7',
    agentAccessMode: 'all',
    allowedAgentIds: [],
    defaultAgentId: 'default-agent',
    config: { type: 'api', api: {} },
    ...overrides,
  };
}

const VALID_ANON_JWT = 'eyJhbGciOiJIUzI1NiJ9.valid-anon-token-content-padding-here-abcdef';
const VALID_APP_SECRET = 'as_x9y8z7w6v5u4.a-very-long-secret-value-here-for-testing-1234';

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

    extractAppPublicIdMock.mockImplementation((appId: string) => {
      if (!appId.startsWith('app_')) return null;
      const pid = appId.slice(4);
      return pid.length === 12 ? pid : null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.ENVIRONMENT = originalEnv;
  });

  describe('web_client app with anonymous JWT', () => {
    it('should authenticate successfully with valid anonymous JWT', async () => {
      const appRecord = makeWebClientApp();
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateOriginMock.mockReturnValue(true);
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'anon_test-uuid',
          app: 'app_a1b2c3d4e5f6',
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
          'x-inkeep-app-id': 'app_a1b2c3d4e5f6',
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
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateOriginMock.mockReturnValue(false);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app_a1b2c3d4e5f6',
          Origin: 'https://evil.com',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Origin not allowed for this app');
    });

    it('should reject when JWT app claim does not match', async () => {
      const appRecord = makeWebClientApp();
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateOriginMock.mockReturnValue(true);
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'anon_test-uuid',
          app: 'app_different_app',
          type: 'anonymous',
        },
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app_a1b2c3d4e5f6',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('JWT app claim does not match');
    });

    it('should reject when JWT is invalid and HS256 is not enabled', async () => {
      const appRecord = makeWebClientApp();
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateOriginMock.mockReturnValue(true);
      jwtVerifyMock.mockRejectedValueOnce(new Error('invalid signature'));

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app_a1b2c3d4e5f6',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid end-user JWT');
    });

    it('should fall back to customer HS256 JWT when anonymous JWT fails', async () => {
      const appRecord = makeWebClientApp({
        config: {
          type: 'web_client',
          webClient: {
            allowedDomains: ['help.customer.com'],
            authMode: 'anonymous_and_authenticated',
            anonymousSessionLifetimeSeconds: 86400,
            hs256Enabled: true,
            hs256Secret: 'customer-secret-key',
            captchaEnabled: false,
          },
        },
      });
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateOriginMock.mockReturnValue(true);
      jwtVerifyMock.mockRejectedValueOnce(new Error('invalid signature')).mockResolvedValueOnce({
        payload: {
          sub: 'user_123',
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'user@customer.com',
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
          'x-inkeep-app-id': 'app_a1b2c3d4e5f6',
          'x-inkeep-agent-id': 'agent-1',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata.endUserId).toBe('user_123');
      expect(body.metadata.authMethod).toBe('app_credential_web_client');
    });
  });

  describe('api app with secret', () => {
    it('should authenticate successfully with valid app secret', async () => {
      const appRecord = makeApiApp();
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateApiKeyMock.mockResolvedValue(true);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const ctx = (c as any).get('executionContext');
        return c.json(ctx);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_APP_SECRET}`,
          'x-inkeep-app-id': 'app_x9y8z7w6v5u4',
          'x-inkeep-agent-id': 'my-agent',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        tenantId: 'tenant_1',
        projectId: 'project_1',
        agentId: 'my-agent',
        apiKeyId: 'app:app-id-2',
        metadata: {
          authMethod: 'app_credential_api',
        },
      });
      expect(body.metadata.endUserId).toBeUndefined();
    });

    it('should reject with invalid app secret', async () => {
      const appRecord = makeApiApp();
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateApiKeyMock.mockResolvedValue(false);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_APP_SECRET}`,
          'x-inkeep-app-id': 'app_x9y8z7w6v5u4',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid app secret');
    });

    it('should use defaultAgentId when agentAccessMode is all and no agent header', async () => {
      const appRecord = makeApiApp();
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateApiKeyMock.mockResolvedValue(true);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const ctx = (c as any).get('executionContext');
        return c.json(ctx);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_APP_SECRET}`,
          'x-inkeep-app-id': 'app_x9y8z7w6v5u4',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.agentId).toBe('default-agent');
    });
  });

  describe('app lookup failures', () => {
    it('should reject when app is not found', async () => {
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(null));

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app_a1b2c3d4e5f6',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('App not found');
    });

    it('should reject when app is disabled', async () => {
      const appRecord = makeWebClientApp({ enabled: false });
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app_a1b2c3d4e5f6',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('App is disabled');
    });

    it('should reject when app ID format is invalid', async () => {
      extractAppPublicIdMock.mockReturnValue(null);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'bad-format',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid app ID format');
    });
  });

  describe('agent access resolution', () => {
    it('should accept allowed agent in selected mode', async () => {
      const appRecord = makeWebClientApp();
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateOriginMock.mockReturnValue(true);
      jwtVerifyMock.mockResolvedValueOnce({
        payload: { sub: 'anon_uuid', app: 'app_a1b2c3d4e5f6', type: 'anonymous' },
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const ctx = (c as any).get('executionContext');
        return c.json(ctx);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app_a1b2c3d4e5f6',
          'x-inkeep-agent-id': 'agent-2',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.agentId).toBe('agent-2');
    });

    it('should reject disallowed agent in selected mode', async () => {
      const appRecord = makeWebClientApp();
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateOriginMock.mockReturnValue(true);
      jwtVerifyMock.mockResolvedValueOnce({
        payload: { sub: 'anon_uuid', app: 'app_a1b2c3d4e5f6', type: 'anonymous' },
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app_a1b2c3d4e5f6',
          'x-inkeep-agent-id': 'not-allowed-agent',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain("Agent 'not-allowed-agent' is not allowed");
    });

    it('should use defaultAgentId when no agent header in selected mode', async () => {
      const appRecord = makeWebClientApp();
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateOriginMock.mockReturnValue(true);
      jwtVerifyMock.mockResolvedValueOnce({
        payload: { sub: 'anon_uuid', app: 'app_a1b2c3d4e5f6', type: 'anonymous' },
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const ctx = (c as any).get('executionContext');
        return c.json(ctx);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app_a1b2c3d4e5f6',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.agentId).toBe('agent-1');
    });

    it('should accept any agent when agentAccessMode is all', async () => {
      const appRecord = makeApiApp({ agentAccessMode: 'all' });
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateApiKeyMock.mockResolvedValue(true);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const ctx = (c as any).get('executionContext');
        return c.json(ctx);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_APP_SECRET}`,
          'x-inkeep-app-id': 'app_x9y8z7w6v5u4',
          'x-inkeep-agent-id': 'any-agent-name',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.agentId).toBe('any-agent-name');
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
    it('should fire-and-forget update lastUsedAt on successful auth', async () => {
      const updateFn = vi.fn().mockResolvedValue(undefined);
      updateAppLastUsedMock.mockReturnValue(updateFn);

      const appRecord = makeApiApp();
      getAppByPublicIdMock.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      validateApiKeyMock.mockResolvedValue(true);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_APP_SECRET}`,
          'x-inkeep-app-id': 'app_x9y8z7w6v5u4',
          'x-inkeep-agent-id': 'default-agent',
        },
      });

      expect(res.status).toBe(200);
      expect(updateAppLastUsedMock).toHaveBeenCalled();
      expect(updateFn).toHaveBeenCalledWith('app-id-2');
    });
  });
});
