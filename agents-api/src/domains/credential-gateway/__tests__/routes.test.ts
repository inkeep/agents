import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    COPILOT_GATEWAY_CLIENT_ID: 'gw_testclient123',
    COPILOT_GATEWAY_CLIENT_SECRET: 'sk_test.secretvalue',
    COPILOT_OAUTH_CLIENT_ID: 'oauth-client-id',
    INKEEP_AGENTS_MANAGE_DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    INKEEP_AGENTS_RUN_DATABASE_URL: 'postgresql://test:test@localhost:5433/test',
    ENVIRONMENT: 'test',
  },
  jwtVerify: vi.fn(),
  getAppById: vi.fn(),
  getCredentialReference: vi.fn(),
  getProjectScopedRef: vi.fn(),
  resolveRef: vi.fn(),
  withRef: vi.fn(),
  canAppReadCredential: vi.fn(),
  canUseProjectStrict: vi.fn(),
  getCredentialStoreLookupKey: vi.fn(),
}));

vi.mock('../../../env', () => ({ env: mocks.env }));
vi.mock('../../../data/db/runDbClient', () => ({ default: 'mock-run-db' }));
vi.mock('../../../data/db/manageDbClient', () => ({ default: 'mock-manage-db' }));
vi.mock('../../../data/db/manageDbPool', () => ({ default: 'mock-manage-db-pool' }));

vi.mock('../../../logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return { getLogger: () => mockLogger };
});

vi.mock('jose', () => ({
  jwtVerify: (...args: unknown[]) => mocks.jwtVerify(...args),
}));

vi.mock('../../../utils/oauthJwks', () => ({
  getOAuthJwks: () => 'mock-jwks',
  getOAuthIssuer: () => 'https://issuer.example.com',
}));

vi.mock('@inkeep/agents-core', () => ({
  getAppById: () => mocks.getAppById,
  // Curried: getCredentialReference(db)({scopes, id})
  getCredentialReference: (db: unknown) => (params: unknown) =>
    mocks.getCredentialReference(db, params),
  getProjectScopedRef: (...args: unknown[]) => mocks.getProjectScopedRef(...args),
  // Curried: resolveRef(manageDbClient)(projectRef)
  resolveRef: (db: unknown) => (ref: unknown) => mocks.resolveRef(db, ref),
  withRef: (pool: unknown, ref: unknown, cb: (db: unknown) => Promise<unknown>) =>
    mocks.withRef(pool, ref, cb),
  canAppReadCredential: (...args: unknown[]) => mocks.canAppReadCredential(...args),
  canUseProjectStrict: (...args: unknown[]) => mocks.canUseProjectStrict(...args),
  getCredentialStoreLookupKeyFromRetrievalParams: (...args: unknown[]) =>
    mocks.getCredentialStoreLookupKey(...args),
  SUPPORT_COPILOT_PLATFORMS: [],
}));

vi.mock('@inkeep/agents-core/middleware', () => ({
  createProtectedRoute: (config: Record<string, unknown>) => config,
  noAuth: () => vi.fn(),
}));

import { OpenAPIHono } from '@hono/zod-openapi';
import { credentialGatewayRoutes } from '../routes';

function createTestApp() {
  const app = new OpenAPIHono();
  const mockStore = {
    get: vi.fn(),
    type: 'nango' as const,
  };
  const mockRegistry = {
    get: vi.fn().mockReturnValue(mockStore),
  };
  app.use('*', async (c, next) => {
    c.set('credentialStores' as never, mockRegistry as never);
    await next();
  });
  app.route('/credential-gateway', credentialGatewayRoutes);
  return { app, mockStore, mockRegistry };
}

function basicAuthHeader(id: string, secret: string) {
  return `Basic ${btoa(`${id}:${secret}`)}`;
}

function formBody(overrides: Record<string, string> = {}) {
  const defaults = {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: 'valid-jwt-token',
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    audience: 'helpscout',
    inkeep_app_id: 'app_test123',
  };
  return new URLSearchParams({ ...defaults, ...overrides }).toString();
}

function makeRequest(app: OpenAPIHono, options: { auth?: string; body?: string } = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (options.auth) {
    headers.Authorization = options.auth;
  }
  return app.request('/credential-gateway/token', {
    method: 'POST',
    headers,
    body: options.body ?? formBody(),
  });
}

describe('POST /credential-gateway/token', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.jwtVerify.mockResolvedValue({
      payload: {
        sub: 'user-123',
        azp: 'oauth-client-id',
        'https://inkeep.com/tenantId': 'tenant-abc',
      },
    });

    mocks.getAppById.mockResolvedValue({
      id: 'app_test123',
      tenantId: 'tenant-abc',
      projectId: 'project-xyz',
      enabled: true,
      type: 'support_copilot',
      config: {
        type: 'support_copilot',
        supportCopilot: {
          platform: 'helpscout',
          credentialReferenceId: 'cred_ref_1',
        },
      },
    });

    mocks.canUseProjectStrict.mockResolvedValue(true);
    mocks.canAppReadCredential.mockResolvedValue(true);

    mocks.getProjectScopedRef.mockReturnValue('mock-project-ref');
    mocks.resolveRef.mockResolvedValue('mock-resolved-ref');
    // Default: invoke the withRef callback against a stub db handle so Step 6
    // flows through to getCredentialReference.
    mocks.withRef.mockImplementation(
      async (_pool: unknown, _ref: unknown, cb: (db: unknown) => Promise<unknown>) =>
        cb('mock-branch-scoped-db')
    );
    mocks.getCredentialReference.mockResolvedValue({
      id: 'cred_ref_1',
      credentialStoreId: 'nango-main',
      retrievalParams: { connectionId: 'conn-1', providerConfigKey: 'helpscout-oauth' },
    });

    mocks.getCredentialStoreLookupKey.mockReturnValue(
      JSON.stringify({ connectionId: 'conn-1', providerConfigKey: 'helpscout-oauth' })
    );
  });

  describe('happy path', () => {
    it('should return access_token on valid request', async () => {
      const { app, mockStore } = createTestApp();
      mockStore.get.mockResolvedValue(
        JSON.stringify({ access_token: 'hs_token_abc', expires_in: 3600 })
      );

      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        access_token: 'hs_token_abc',
        token_type: 'Bearer',
        expires_in: 3600,
        issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      });
    });

    it('should not include refresh_token in response', async () => {
      const { app, mockStore } = createTestApp();
      mockStore.get.mockResolvedValue(
        JSON.stringify({
          access_token: 'hs_token_abc',
          refresh_token: 'rt_secret',
          expires_in: 3600,
          id_token: 'id_token_val',
          scope: 'read write',
        })
      );

      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.refresh_token).toBeUndefined();
      expect(body.id_token).toBeUndefined();
      expect(body.scope).toBeUndefined();
      expect(body.access_token).toBe('hs_token_abc');
    });
  });

  describe('Step 1: Basic Auth validation', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const { app } = createTestApp();
      const res = await makeRequest(app, { auth: undefined });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('invalid_client');
    });

    it('should return 401 when Authorization header is not Basic', async () => {
      const { app } = createTestApp();
      const res = await makeRequest(app, { auth: 'Bearer some-token' });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('invalid_client');
    });

    it('should return 401 when client_id does not match', async () => {
      const { app } = createTestApp();
      const res = await makeRequest(app, {
        auth: basicAuthHeader('wrong_id', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('invalid_client');
    });

    it('should return 401 when client_secret does not match', async () => {
      const { app } = createTestApp();
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'wrong_secret'),
      });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('invalid_client');
    });
  });

  describe('Gateway configuration', () => {
    it('should return 401 when COPILOT_GATEWAY_CLIENT_ID is not configured', async () => {
      const original = mocks.env.COPILOT_GATEWAY_CLIENT_ID;
      mocks.env.COPILOT_GATEWAY_CLIENT_ID = '';
      try {
        const { app } = createTestApp();
        const res = await makeRequest(app, {
          auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
        });
        expect(res.status).toBe(401);
        expect((await res.json()).error).toBe('invalid_client');
      } finally {
        mocks.env.COPILOT_GATEWAY_CLIENT_ID = original;
      }
    });

    it('should return 401 when COPILOT_GATEWAY_CLIENT_SECRET is not configured', async () => {
      const original = mocks.env.COPILOT_GATEWAY_CLIENT_SECRET;
      mocks.env.COPILOT_GATEWAY_CLIENT_SECRET = '';
      try {
        const { app } = createTestApp();
        const res = await makeRequest(app, {
          auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
        });
        expect(res.status).toBe(401);
        expect((await res.json()).error).toBe('invalid_client');
      } finally {
        mocks.env.COPILOT_GATEWAY_CLIENT_SECRET = original;
      }
    });
  });

  describe('Step 2: JWT validation', () => {
    it('should return 401 when JWT verification fails', async () => {
      const { app } = createTestApp();
      mocks.jwtVerify.mockRejectedValue(new Error('Invalid signature'));
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('invalid_grant');
    });

    it('should return 401 when JWT is missing sub claim', async () => {
      const { app } = createTestApp();
      mocks.jwtVerify.mockResolvedValue({
        payload: { azp: 'oauth-client-id', 'https://inkeep.com/tenantId': 'tenant-abc' },
      });
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('invalid_grant');
    });

    it('should return 401 when JWT is missing tenantId claim', async () => {
      const { app } = createTestApp();
      mocks.jwtVerify.mockResolvedValue({
        payload: { sub: 'user-123', azp: 'oauth-client-id' },
      });
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('invalid_grant');
    });

    it('should return 401 when azp does not match COPILOT_OAUTH_CLIENT_ID', async () => {
      const { app } = createTestApp();
      mocks.jwtVerify.mockResolvedValue({
        payload: {
          sub: 'user-123',
          azp: 'wrong-client-id',
          'https://inkeep.com/tenantId': 'tenant-abc',
        },
      });
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('invalid_grant');
    });
  });

  describe('Step 3: App validation', () => {
    it('should return 403 when app is not found', async () => {
      const { app } = createTestApp();
      mocks.getAppById.mockResolvedValue(null);
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('access_denied');
    });

    it('should return 403 when app tenant does not match JWT tenant', async () => {
      const { app } = createTestApp();
      mocks.getAppById.mockResolvedValue({
        id: 'app_test123',
        tenantId: 'different-tenant',
        projectId: 'project-xyz',
        enabled: true,
        type: 'support_copilot',
      });
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('access_denied');
    });

    it('should return 403 when app is disabled', async () => {
      const { app } = createTestApp();
      mocks.getAppById.mockResolvedValue({
        id: 'app_test123',
        tenantId: 'tenant-abc',
        projectId: 'project-xyz',
        enabled: false,
        type: 'support_copilot',
      });
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('access_denied');
    });

    it('should return 403 when app type is not support_copilot', async () => {
      const { app } = createTestApp();
      mocks.getAppById.mockResolvedValue({
        id: 'app_test123',
        tenantId: 'tenant-abc',
        projectId: 'project-xyz',
        enabled: true,
        type: 'web_client',
      });
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('access_denied');
    });
  });

  describe('Step 4: Project membership', () => {
    it('should return 403 when user cannot use project', async () => {
      const { app } = createTestApp();
      mocks.canUseProjectStrict.mockResolvedValue(false);
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('access_denied');
    });
  });

  describe('Step 5: Credential grant resolution', () => {
    it('should return 403 when no credential grants exist', async () => {
      const { app } = createTestApp();
      mocks.canAppReadCredential.mockResolvedValue(false);
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('access_denied');
    });

    it("should return 400 invalid_target when audience does not match the app's platform", async () => {
      const { app } = createTestApp();
      // Default app is configured for helpscout; client requests salesforce.
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
        body: formBody({ audience: 'salesforce' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('invalid_target');
    });

    it('should return 403 when app config is missing credentialReferenceId', async () => {
      const { app } = createTestApp();
      mocks.getAppById.mockResolvedValue({
        id: 'app_test123',
        tenantId: 'tenant-abc',
        projectId: 'project-xyz',
        enabled: true,
        type: 'support_copilot',
        config: {
          type: 'support_copilot',
          supportCopilot: { platform: 'helpscout' },
        },
      });
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('access_denied');
    });

    it('should return 403 when app config is missing platform', async () => {
      const { app } = createTestApp();
      mocks.getAppById.mockResolvedValue({
        id: 'app_test123',
        tenantId: 'tenant-abc',
        projectId: 'project-xyz',
        enabled: true,
        type: 'support_copilot',
        config: {
          type: 'support_copilot',
          supportCopilot: { credentialReferenceId: 'cred_ref_1' },
        },
      });
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('access_denied');
    });
  });

  describe('Step 6: Nango credential fetch', () => {
    it('should return 502 when credential store throws', async () => {
      const { app, mockStore } = createTestApp();
      mockStore.get.mockRejectedValue(new Error('Nango connection failed'));
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toBe('server_error');
    });

    it('should return 502 when credential store returns null', async () => {
      const { app, mockStore } = createTestApp();
      mockStore.get.mockResolvedValue(null);
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toBe('server_error');
    });

    it('should return 502 when resolveRef returns null (project branch missing)', async () => {
      const { app } = createTestApp();
      mocks.resolveRef.mockResolvedValue(null);
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toBe('server_error');
    });

    it('should return 502 when credential reference is not found', async () => {
      const { app } = createTestApp();
      mocks.getCredentialReference.mockResolvedValue(null);
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toBe('server_error');
    });

    it('should return 502 when credential JSON is malformed', async () => {
      const { app, mockStore } = createTestApp();
      mockStore.get.mockResolvedValue('not-valid-json{{{');
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toBe('server_error');
    });

    it('should return 502 when credential is missing access_token field', async () => {
      const { app, mockStore } = createTestApp();
      mockStore.get.mockResolvedValue(JSON.stringify({ expires_in: 3600 }));
      const res = await makeRequest(app, {
        auth: basicAuthHeader('gw_testclient123', 'sk_test.secretvalue'),
      });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toBe('server_error');
    });
  });
});

describe('GET /credential-gateway/.well-known/platforms', () => {
  it('should return 200 with platform catalog and Cache-Control header', async () => {
    const { app } = createTestApp();
    const res = await app.request('/credential-gateway/.well-known/platforms');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    const body = await res.json();
    expect(body).toHaveProperty('platforms');
    expect(Array.isArray(body.platforms)).toBe(true);
  });
});
