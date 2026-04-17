import type { BaseExecutionContext } from '@inkeep/agents-core';
import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { Hono } from 'hono';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../data/db/runDbClient.js', () => ({ default: {} }));
vi.mock('../../data/db/manageDbClient.js', () => ({ default: {} }));

vi.mock('../../logger.js', () => createMockLoggerModule().module);

vi.mock('../../env.js', () => ({
  env: {
    ENVIRONMENT: 'production',
    INKEEP_AGENTS_API_URL: 'http://localhost:3000',
    INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY: undefined,
    INKEEP_AGENTS_RUN_API_BYPASS_SECRET: undefined,
    INKEEP_POW_HMAC_SECRET: undefined,
  },
}));

vi.mock('../../domains/run/routes/auth.js', () => ({
  getAnonJwtSecret: vi.fn(() => new TextEncoder().encode('test-anon-secret-for-jwt-signing-1234')),
}));

const {
  mockGetAppById,
  mockGetAgentById,
  mockValidateOrigin,
  mockVerifyPoW,
  mockCanUseProjectStrict,
} = vi.hoisted(() => ({
  mockGetAppById: vi.fn(() => vi.fn().mockResolvedValue(null)),
  mockGetAgentById: vi.fn(() => vi.fn().mockResolvedValue({ id: 'agent-1' })),
  mockValidateOrigin: vi.fn().mockReturnValue(true),
  mockVerifyPoW: vi.fn().mockResolvedValue({ ok: true }),
  mockCanUseProjectStrict: vi.fn().mockResolvedValue(true),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    validateAndGetApiKey: vi.fn().mockResolvedValue(null),
    canUseProjectStrict: mockCanUseProjectStrict,
    getAgentById: mockGetAgentById,
    getAppById: mockGetAppById,
    updateAppLastUsed: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
    validateOrigin: mockValidateOrigin,
    verifyPoW: mockVerifyPoW,
    getPoWErrorMessage: vi.fn().mockReturnValue('PoW failed'),
    isSlackUserToken: vi.fn().mockReturnValue(false),
    verifySlackUserToken: vi.fn().mockResolvedValue({ valid: false }),
  };
});

import { runApiKeyAuth } from '../../middleware/runAuth';

function createTestApp() {
  let capturedContext: BaseExecutionContext | undefined;
  const app = new Hono<{ Variables: { executionContext: BaseExecutionContext } }>();
  app.use('*', runApiKeyAuth());
  app.all('/test', (c) => {
    capturedContext = c.get('executionContext');
    return c.json({ ok: true });
  });
  return {
    app,
    getContext: () => capturedContext,
  };
}

function makeAppRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app_test123',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    type: 'web_client',
    enabled: true,
    defaultAgentId: 'agent-1',
    config: {
      type: 'web_client',
      webClient: {
        allowedDomains: ['https://example.com'],
      },
    },
    ...overrides,
  };
}

function makeAppWithAuth(
  publicKeys: Array<{ kid: string; publicKey: string; algorithm: string; addedAt: string }>,
  audience?: string,
  overrides: Record<string, unknown> = {},
  authOverrides: Record<string, unknown> = {}
) {
  return makeAppRecord({
    config: {
      type: 'web_client',
      webClient: {
        allowedDomains: ['https://example.com'],
        publicKeys,
        ...(audience !== undefined ? { audience } : {}),
        ...authOverrides,
      },
    },
    ...overrides,
  });
}

async function signJwt(
  privateKey: CryptoKey,
  alg: string,
  claims: Record<string, unknown>,
  options: { kid?: string; sub?: string; iat?: number; exp?: number; aud?: string } = {}
) {
  const now = Math.floor(Date.now() / 1000);
  const builder = new SignJWT(claims)
    .setProtectedHeader({ alg, kid: options.kid, typ: 'JWT' })
    .setIssuedAt(options.iat ?? now);

  if (options.sub) builder.setSubject(options.sub);
  if (options.exp !== undefined) {
    builder.setExpirationTime(options.exp);
  } else {
    builder.setExpirationTime(now + 3600);
  }
  if (options.aud) builder.setAudience(options.aud);

  return builder.sign(privateKey);
}

describe('runAuth middleware - app credential asymmetric JWT auth', () => {
  let rsaPublicKeyPem: string;
  let rsaPrivateKey: CryptoKey;
  let ecPublicKeyPem: string;
  let ecPrivateKey: CryptoKey;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockValidateOrigin.mockReturnValue(true);
    mockVerifyPoW.mockResolvedValue({ ok: true });
    mockCanUseProjectStrict.mockResolvedValue(true);

    const rsaPair = await generateKeyPair('RS256', { extractable: true });
    rsaPublicKeyPem = await exportSPKI(rsaPair.publicKey);
    rsaPrivateKey = rsaPair.privateKey;

    const ecPair = await generateKeyPair('ES256', { extractable: true });
    ecPublicKeyPem = await exportSPKI(ecPair.publicKey);
    ecPrivateKey = ecPair.privateKey;
  });

  describe('successful authentication', () => {
    it('should verify RS256 JWT and set authenticated auth method', async () => {
      const app = makeAppWithAuth([
        {
          kid: 'key-1',
          publicKey: rsaPublicKeyPem,
          algorithm: 'RS256',
          addedAt: new Date().toISOString(),
        },
      ]);
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const token = await signJwt(rsaPrivateKey, 'RS256', {}, { kid: 'key-1', sub: 'user_123' });

      const { app: testApp, getContext } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(200);
      const ctx = getContext();
      expect(ctx?.metadata?.endUserId).toBe('user_123');
      expect(ctx?.metadata?.authMethod).toBe('app_credential_web_client_authenticated');
      expect(ctx?.apiKeyId).toBe('app:app_test123');
      expect(ctx?.tenantId).toBe('tenant-1');
      expect(ctx?.projectId).toBe('project-1');
    });

    it('should verify ES256 JWT', async () => {
      const app = makeAppWithAuth([
        {
          kid: 'ec-key',
          publicKey: ecPublicKeyPem,
          algorithm: 'ES256',
          addedAt: new Date().toISOString(),
        },
      ]);
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const token = await signJwt(ecPrivateKey, 'ES256', {}, { kid: 'ec-key', sub: 'user_456' });

      const { app: testApp, getContext } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(200);
      expect(getContext()?.metadata?.endUserId).toBe('user_456');
      expect(getContext()?.metadata?.authMethod).toBe('app_credential_web_client_authenticated');
    });

    it('should select correct key when multiple keys configured', async () => {
      const app = makeAppWithAuth([
        {
          kid: 'key-1',
          publicKey: rsaPublicKeyPem,
          algorithm: 'RS256',
          addedAt: new Date().toISOString(),
        },
        {
          kid: 'key-2',
          publicKey: ecPublicKeyPem,
          algorithm: 'ES256',
          addedAt: new Date().toISOString(),
        },
      ]);
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const token = await signJwt(ecPrivateKey, 'ES256', {}, { kid: 'key-2', sub: 'user_multi' });

      const { app: testApp, getContext } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(200);
      expect(getContext()?.metadata?.endUserId).toBe('user_multi');
    });

    it('should validate audience when configured', async () => {
      const app = makeAppWithAuth(
        [
          {
            kid: 'key-1',
            publicKey: rsaPublicKeyPem,
            algorithm: 'RS256',
            addedAt: new Date().toISOString(),
          },
        ],
        'https://api.example.com'
      );
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const token = await signJwt(
        rsaPrivateKey,
        'RS256',
        {},
        { kid: 'key-1', sub: 'user_aud', aud: 'https://api.example.com' }
      );

      const { app: testApp, getContext } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(200);
      expect(getContext()?.metadata?.endUserId).toBe('user_aud');
    });
  });

  describe('rejection cases', () => {
    it('should return 401 when kid is missing from JWT header', async () => {
      const app = makeAppWithAuth([
        {
          kid: 'key-1',
          publicKey: rsaPublicKeyPem,
          algorithm: 'RS256',
          addedAt: new Date().toISOString(),
        },
      ]);
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const now = Math.floor(Date.now() / 1000);
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setSubject('user_123')
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(rsaPrivateKey);

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should return 401 when kid is not found on app', async () => {
      const app = makeAppWithAuth([
        {
          kid: 'key-1',
          publicKey: rsaPublicKeyPem,
          algorithm: 'RS256',
          addedAt: new Date().toISOString(),
        },
      ]);
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const token = await signJwt(
        rsaPrivateKey,
        'RS256',
        {},
        { kid: 'unknown-key', sub: 'user_123' }
      );

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should return 401 when sub claim is missing', async () => {
      const app = makeAppWithAuth([
        {
          kid: 'key-1',
          publicKey: rsaPublicKeyPem,
          algorithm: 'RS256',
          addedAt: new Date().toISOString(),
        },
      ]);
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const now = Math.floor(Date.now() / 1000);
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: 'key-1', typ: 'JWT' })
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(rsaPrivateKey);

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should return 401 when iat claim is missing', async () => {
      const app = makeAppWithAuth([
        {
          kid: 'key-1',
          publicKey: rsaPublicKeyPem,
          algorithm: 'RS256',
          addedAt: new Date().toISOString(),
        },
      ]);
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const now = Math.floor(Date.now() / 1000);
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: 'key-1', typ: 'JWT' })
        .setSubject('user_123')
        .setExpirationTime(now + 3600)
        .sign(rsaPrivateKey);

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should return 401 when token is expired', async () => {
      const app = makeAppWithAuth([
        {
          kid: 'key-1',
          publicKey: rsaPublicKeyPem,
          algorithm: 'RS256',
          addedAt: new Date().toISOString(),
        },
      ]);
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const past = Math.floor(Date.now() / 1000) - 7200;
      const token = await signJwt(
        rsaPrivateKey,
        'RS256',
        {},
        { kid: 'key-1', sub: 'user_123', iat: past, exp: past + 3600 }
      );

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should return 401 when token lifetime exceeds 24 hours', async () => {
      const app = makeAppWithAuth([
        {
          kid: 'key-1',
          publicKey: rsaPublicKeyPem,
          algorithm: 'RS256',
          addedAt: new Date().toISOString(),
        },
      ]);
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const now = Math.floor(Date.now() / 1000);
      const token = await signJwt(
        rsaPrivateKey,
        'RS256',
        {},
        { kid: 'key-1', sub: 'user_123', iat: now, exp: now + 86401 }
      );

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should return 401 when audience does not match', async () => {
      const app = makeAppWithAuth(
        [
          {
            kid: 'key-1',
            publicKey: rsaPublicKeyPem,
            algorithm: 'RS256',
            addedAt: new Date().toISOString(),
          },
        ],
        'https://api.example.com'
      );
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const token = await signJwt(
        rsaPrivateKey,
        'RS256',
        {},
        { kid: 'key-1', sub: 'user_123', aud: 'https://wrong.example.com' }
      );

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should return 401 when signature is invalid (wrong key)', async () => {
      const app = makeAppWithAuth([
        {
          kid: 'key-1',
          publicKey: rsaPublicKeyPem,
          algorithm: 'RS256',
          addedAt: new Date().toISOString(),
        },
      ]);
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const otherPair = await generateKeyPair('RS256', { extractable: true });
      const token = await signJwt(
        otherPair.privateKey,
        'RS256',
        {},
        { kid: 'key-1', sub: 'user_123' }
      );

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('fallback to anonymous JWT when no auth configured', () => {
    it('should fall through to anonymous HS256 verification when no public keys configured', async () => {
      const app = makeAppRecord();
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const { getAnonJwtSecret } = await import('../../domains/run/routes/auth');
      const secret = (getAnonJwtSecret as ReturnType<typeof vi.fn>)();

      const now = Math.floor(Date.now() / 1000);
      const token = await new SignJWT({ app: 'app_test123', type: 'anonymous' })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('anon_user_1')
        .setIssuer('inkeep')
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(secret);

      const { app: testApp, getContext } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(200);
      const ctx = getContext();
      expect(ctx?.metadata?.authMethod).toBe('app_credential_web_client');
      expect(ctx?.metadata?.endUserId).toBe('anon_user_1');
    });
  });

  describe('global app (tenantId null)', () => {
    it('should extract tid/pid from token claims and validate via canUseProjectStrict', async () => {
      const app = makeAppWithAuth(
        [
          {
            kid: 'key-1',
            publicKey: rsaPublicKeyPem,
            algorithm: 'RS256',
            addedAt: new Date().toISOString(),
          },
        ],
        undefined,
        { tenantId: null, projectId: null, defaultAgentId: 'agent-g' }
      );
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));
      mockCanUseProjectStrict.mockResolvedValue(true);

      const token = await signJwt(
        rsaPrivateKey,
        'RS256',
        { tid: 'tenant-g', pid: 'project-g', agentId: 'agent-g' },
        { kid: 'key-1', sub: 'user_global' }
      );

      const { app: testApp, getContext } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(200);
      const ctx = getContext();
      expect(ctx?.tenantId).toBe('tenant-g');
      expect(ctx?.projectId).toBe('project-g');
      expect(ctx?.agentId).toBe('agent-g');
      expect(ctx?.metadata?.endUserId).toBe('user_global');
      expect(mockCanUseProjectStrict).toHaveBeenCalledWith({
        userId: 'user_global',
        tenantId: 'tenant-g',
        projectId: 'project-g',
      });
    });

    it('should return 401 when global app token is missing tid/pid claims', async () => {
      const app = makeAppWithAuth(
        [
          {
            kid: 'key-1',
            publicKey: rsaPublicKeyPem,
            algorithm: 'RS256',
            addedAt: new Date().toISOString(),
          },
        ],
        undefined,
        { tenantId: null, projectId: null }
      );
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const token = await signJwt(rsaPrivateKey, 'RS256', {}, { kid: 'key-1', sub: 'user_global' });

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should return 403 when canUseProjectStrict denies access for global app', async () => {
      const app = makeAppWithAuth(
        [
          {
            kid: 'key-1',
            publicKey: rsaPublicKeyPem,
            algorithm: 'RS256',
            addedAt: new Date().toISOString(),
          },
        ],
        undefined,
        { tenantId: null, projectId: null }
      );
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));
      mockCanUseProjectStrict.mockResolvedValue(false);

      const token = await signJwt(
        rsaPrivateKey,
        'RS256',
        { tid: 'tenant-g', pid: 'project-g' },
        { kid: 'key-1', sub: 'user_denied' }
      );

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('clock skew tolerance', () => {
    it('should accept tokens with exp slightly in the past (within 60s skew)', async () => {
      const app = makeAppWithAuth([
        {
          kid: 'key-1',
          publicKey: rsaPublicKeyPem,
          algorithm: 'RS256',
          addedAt: new Date().toISOString(),
        },
      ]);
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(app));

      const now = Math.floor(Date.now() / 1000);
      const token = await signJwt(
        rsaPrivateKey,
        'RS256',
        {},
        { kid: 'key-1', sub: 'user_skew', iat: now - 3660, exp: now - 30 }
      );

      const { app: testApp, getContext } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(200);
      expect(getContext()?.metadata?.endUserId).toBe('user_skew');
    });
  });

  describe('dual mode: anonymous and authenticated on same app', () => {
    it('should fall back to anonymous when auth keys configured but token is anonymous JWT (allowAnonymous default)', async () => {
      const anonSecret = new TextEncoder().encode('test-anon-secret-for-jwt-signing-1234');
      const anonToken = await new SignJWT({ app: 'app_test123', type: 'anonymous' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('anon_test_user')
        .setIssuer('inkeep')
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
        .sign(anonSecret);

      const appRecord = makeAppWithAuth([
        {
          kid: 'key-1',
          publicKey: rsaPublicKeyPem,
          algorithm: 'RS256',
          addedAt: new Date().toISOString(),
        },
      ]);
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(appRecord));

      const { app: testApp, getContext } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${anonToken}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(200);
      expect(getContext()?.metadata?.authMethod).toBe('app_credential_web_client');
      expect(getContext()?.metadata?.endUserId).toBe('anon_test_user');
    });

    it('should reject anonymous token when allowAnonymous is false', async () => {
      const anonSecret = new TextEncoder().encode('test-anon-secret-for-jwt-signing-1234');
      const anonToken = await new SignJWT({ app: 'app_test123', type: 'anonymous' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('anon_test_user')
        .setIssuer('inkeep')
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
        .sign(anonSecret);

      const appRecord = makeAppWithAuth(
        [
          {
            kid: 'key-1',
            publicKey: rsaPublicKeyPem,
            algorithm: 'RS256',
            addedAt: new Date().toISOString(),
          },
        ],
        undefined,
        {},
        { allowAnonymous: false }
      );
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(appRecord));

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${anonToken}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should accept authenticated token on app with allowAnonymous true', async () => {
      const token = await signJwt(
        rsaPrivateKey,
        'RS256',
        { email: 'user@example.com' },
        {
          kid: 'key-1',
          sub: 'user_authenticated',
        }
      );

      const appRecord = makeAppWithAuth([
        {
          kid: 'key-1',
          publicKey: rsaPublicKeyPem,
          algorithm: 'RS256',
          addedAt: new Date().toISOString(),
        },
      ]);
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(appRecord));

      const { app: testApp, getContext } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(200);
      expect(getContext()?.metadata?.authMethod).toBe('app_credential_web_client_authenticated');
      expect(getContext()?.metadata?.endUserId).toBe('user_authenticated');
    });
  });

  describe('misconfiguration guard', () => {
    it('should return 401 when allowAnonymous is false but no public keys configured', async () => {
      const anonSecret = new TextEncoder().encode('test-anon-secret-for-jwt-signing-1234');
      const anonToken = await new SignJWT({ app: 'app_test123', type: 'anonymous' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('anon_test_user')
        .setIssuer('inkeep')
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
        .sign(anonSecret);

      const appRecord = makeAppWithAuth([], undefined, {}, { allowAnonymous: false });
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(appRecord));

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${anonToken}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.detail).toContain('no public keys are configured');
    });
  });

  describe('error response formatting', () => {
    it('should return unauthorized code (not internal_server_error) for auth failures', async () => {
      const token = await signJwt(rsaPrivateKey, 'RS256', {}, { kid: 'wrong-kid', sub: 'user_1' });

      const appRecord = makeAppWithAuth(
        [
          {
            kid: 'key-1',
            publicKey: rsaPublicKeyPem,
            algorithm: 'RS256',
            addedAt: new Date().toISOString(),
          },
        ],
        undefined,
        {},
        { allowAnonymous: false }
      );
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(appRecord));

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error?.code).toBe('unauthorized');
    });
  });

  describe('enforceAppDefaultAgent', () => {
    async function makeAnonToken() {
      const { getAnonJwtSecret } = await import('../../domains/run/routes/auth');
      const secret = (getAnonJwtSecret as ReturnType<typeof vi.fn>)();
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({ app: 'app_test123', type: 'anonymous' })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('anon_user_1')
        .setIssuer('inkeep')
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(secret);
    }

    it('should return 500 when tenant-scoped app has no defaultAgentId', async () => {
      const appRecord = makeAppRecord({ defaultAgentId: null });
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      const token = await makeAnonToken();

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(500);
    });

    it('should use defaultAgentId when no agent is requested', async () => {
      const appRecord = makeAppRecord({ defaultAgentId: 'default-agent' });
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      const token = await makeAnonToken();

      const { app: testApp, getContext } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(200);
      expect(getContext()?.agentId).toBe('default-agent');
    });

    it('should succeed when requested agent matches defaultAgentId', async () => {
      const appRecord = makeAppRecord({ defaultAgentId: 'agent-1' });
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      const token = await makeAnonToken();

      const { app: testApp, getContext } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          'x-inkeep-agent-id': 'agent-1',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(200);
      expect(getContext()?.agentId).toBe('agent-1');
    });

    it('should return 403 when requested agent does not match defaultAgentId', async () => {
      const appRecord = makeAppRecord({ defaultAgentId: 'agent-1' });
      mockGetAppById.mockReturnValue(vi.fn().mockResolvedValue(appRecord));
      const token = await makeAnonToken();

      const { app: testApp } = createTestApp();
      const res = await testApp.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-inkeep-app-id': 'app_test123',
          'x-inkeep-agent-id': 'wrong-agent',
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.detail).toContain('not authorized for this app');
    });
  });
});
