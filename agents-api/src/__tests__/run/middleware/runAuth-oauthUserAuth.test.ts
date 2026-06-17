import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  validateAndGetApiKeyMock,
  getAgentByIdMock,
  getAppByIdMock,
  validateOriginMock,
  updateAppLastUsedMock,
  verifyServiceTokenMock,
  isSlackUserTokenMock,
  verifySlackUserTokenMock,
  canUseProjectStrictMock,
  validateTargetAgentMock,
} = vi.hoisted(() => ({
  validateAndGetApiKeyMock: vi.fn(),
  getAgentByIdMock: vi.fn(() => vi.fn().mockResolvedValue({ id: 'agent-1' })),
  getAppByIdMock: vi.fn(() => vi.fn().mockResolvedValue(null)),
  validateOriginMock: vi.fn().mockReturnValue(true),
  updateAppLastUsedMock: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
  verifyServiceTokenMock: vi.fn().mockResolvedValue({ valid: false, error: 'Invalid token' }),
  isSlackUserTokenMock: vi.fn().mockReturnValue(false),
  verifySlackUserTokenMock: vi.fn().mockResolvedValue({ valid: false }),
  canUseProjectStrictMock: vi.fn(),
  validateTargetAgentMock: vi.fn(),
}));

const { jwtVerifyMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn(),
}));

vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual<typeof import('@inkeep/agents-core')>('@inkeep/agents-core');
  return {
    createApiError: actual.createApiError,
    validateAndGetApiKey: validateAndGetApiKeyMock,
    getAgentById: getAgentByIdMock,
    getAppById: getAppByIdMock,
    validateOrigin: validateOriginMock,
    updateAppLastUsed: updateAppLastUsedMock,
    verifyServiceToken: verifyServiceTokenMock,
    isSlackUserToken: isSlackUserTokenMock,
    verifySlackUserToken: verifySlackUserTokenMock,
    canUseProjectStrict: canUseProjectStrictMock,
    validateTargetAgent: validateTargetAgentMock,
    getInProcessFetch: () => vi.fn(),
    getLogger: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  };
});

vi.mock('jose', () => ({
  jwtVerify: jwtVerifyMock,
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  customFetch: Symbol('customFetch'),
  decodeProtectedHeader: vi.fn(),
  importSPKI: vi.fn(),
  errors: {
    JWTExpired: class JWTExpired extends Error {},
    JWSSignatureVerificationFailed: class JWSSignatureVerificationFailed extends Error {},
    JWTClaimValidationFailed: class JWTClaimValidationFailed extends Error {},
  },
}));

vi.mock('../../../domains/run/routes/auth', () => ({
  getAnonJwtSecret: vi.fn().mockReturnValue(new TextEncoder().encode('test-anon-secret')),
}));

vi.mock('../../../data/db/runDbClient', () => ({
  default: {},
}));

vi.mock('../../../data/db/manageDbClient', () => ({
  default: {},
}));

vi.mock('../../../env.js', () => ({
  env: {
    INKEEP_AGENTS_RUN_API_BYPASS_SECRET: undefined as string | undefined,
    INKEEP_AGENTS_API_URL: 'https://api.example.com',
  },
}));

import { Hono } from 'hono';
import { runApiKeyAuth as apiKeyAuth } from '../../../middleware/runAuth';

const RESOURCE_AUDIENCE = 'https://api.example.com';
const ACCEPTED_AUDIENCES = [RESOURCE_AUDIENCE, `${RESOURCE_AUDIENCE}/`, `${RESOURCE_AUDIENCE}/mcp`];
const ISSUER = 'https://api.example.com/api/auth';

const VALID_3SEG_TOKEN =
  'eyJhbGciOiJSUzI1NiIsImtpZCI6Im1jcC1raWQifQ.eyJzdWIiOiJ1c2VyXzEifQ.fake-signature-padding-1234567890';
const TWO_SEG_API_KEY = 'sk_test_abcdef0123456789';

function buildApp() {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db' as never, {});
    await next();
  });
  app.use('*', apiKeyAuth());
  app.get('/', (c) => {
    const ctx = (c as any).get('executionContext');
    return c.json(ctx);
  });
  return app;
}

describe('runAuth — OAuth user JWT strategy (tryOAuthUserAuth)', () => {
  const originalEnv = process.env.ENVIRONMENT;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENVIRONMENT = 'production';
    isSlackUserTokenMock.mockReturnValue(false);
    verifySlackUserTokenMock.mockResolvedValue({ valid: false });
    validateAndGetApiKeyMock.mockResolvedValue(null);
    verifyServiceTokenMock.mockResolvedValue({ valid: false, error: 'Invalid token' });
    getAppByIdMock.mockReturnValue(vi.fn().mockResolvedValue(null));
  });

  afterEach(() => {
    process.env.ENVIRONMENT = originalEnv;
  });

  describe('successful authentication', () => {
    it('authenticates an audience-bound user JWT whose user is SpiceDB-permitted', async () => {
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'user-abc',
          iss: ISSUER,
          aud: RESOURCE_AUDIENCE,
          'https://inkeep.com/tenantId': 'tenant-1',
        },
      });
      canUseProjectStrictMock.mockResolvedValue(true);

      const res = await buildApp().request('/', {
        headers: {
          Authorization: `Bearer ${VALID_3SEG_TOKEN}`,
          'x-inkeep-project-id': 'project-1',
          'x-inkeep-agent-id': 'agent-1',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        apiKeyId: 'oauth-user-token',
        metadata: {
          initiatedBy: { type: 'user', id: 'user-abc' },
        },
      });
      expect(jwtVerifyMock).toHaveBeenCalledWith(
        VALID_3SEG_TOKEN,
        expect.anything(),
        expect.objectContaining({ issuer: ISSUER, audience: ACCEPTED_AUDIENCES })
      );
      expect(canUseProjectStrictMock).toHaveBeenCalledWith({
        userId: 'user-abc',
        tenantId: 'tenant-1',
        projectId: 'project-1',
      });
    });

    it('captures the DCR client_id (azp) in execution-context metadata for audit', async () => {
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'user-abc',
          iss: ISSUER,
          aud: RESOURCE_AUDIENCE,
          azp: 'dcr-mcp-client-xyz',
          'https://inkeep.com/tenantId': 'tenant-1',
        },
      });
      canUseProjectStrictMock.mockResolvedValue(true);

      const res = await buildApp().request('/', {
        headers: {
          Authorization: `Bearer ${VALID_3SEG_TOKEN}`,
          'x-inkeep-project-id': 'project-1',
          'x-inkeep-agent-id': 'agent-1',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata).toMatchObject({
        initiatedBy: { type: 'user', id: 'user-abc' },
        oauthClientId: 'dcr-mcp-client-xyz',
      });
    });
  });

  describe('fall-through cases (token is not for this strategy)', () => {
    it('falls through a non-JWT bearer (less than three segments) without calling jwtVerify', async () => {
      const res = await buildApp().request('/', {
        headers: {
          Authorization: `Bearer ${TWO_SEG_API_KEY}`,
          'x-inkeep-project-id': 'project-1',
          'x-inkeep-agent-id': 'agent-1',
        },
      });

      // No strategy authenticated → 401 from the middleware.
      expect(res.status).toBe(401);
      expect(jwtVerifyMock).not.toHaveBeenCalled();
      // Confirms the chain fell through to the api-key strategy.
      expect(validateAndGetApiKeyMock).toHaveBeenCalledWith(TWO_SEG_API_KEY, expect.anything());
    });

    it('falls through when audience does not match (jwtVerify throws)', async () => {
      // Simulating jose's behavior when `audience` option doesn't match the token claim.
      jwtVerifyMock.mockRejectedValueOnce(new Error('JWT audience invalid'));

      const res = await buildApp().request('/', {
        headers: {
          Authorization: `Bearer ${VALID_3SEG_TOKEN}`,
          'x-inkeep-project-id': 'project-1',
          'x-inkeep-agent-id': 'agent-1',
        },
      });

      expect(res.status).toBe(401);
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
      // Falls through to api-key check (api key returns null → final 401).
      expect(validateAndGetApiKeyMock).toHaveBeenCalled();
    });

    it('falls through when token has no aud claim (jwtVerify throws with audience option set)', async () => {
      jwtVerifyMock.mockRejectedValueOnce(new Error('JWT audience missing'));

      const res = await buildApp().request('/', {
        headers: {
          Authorization: `Bearer ${VALID_3SEG_TOKEN}`,
          'x-inkeep-project-id': 'project-1',
          'x-inkeep-agent-id': 'agent-1',
        },
      });

      expect(res.status).toBe(401);
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
      expect(validateAndGetApiKeyMock).toHaveBeenCalled();
    });

    it('falls through on signature verification failure', async () => {
      jwtVerifyMock.mockRejectedValueOnce(new Error('signature verification failed'));

      const res = await buildApp().request('/', {
        headers: {
          Authorization: `Bearer ${VALID_3SEG_TOKEN}`,
          'x-inkeep-project-id': 'project-1',
          'x-inkeep-agent-id': 'agent-1',
        },
      });

      expect(res.status).toBe(401);
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
      expect(validateAndGetApiKeyMock).toHaveBeenCalled();
    });
  });

  describe('committed-failure cases (jwt verified, but rejected post-verification)', () => {
    it('short-circuits when the verified JWT has no sub claim', async () => {
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          iss: ISSUER,
          aud: RESOURCE_AUDIENCE,
          'https://inkeep.com/tenantId': 'tenant-1',
        },
      });

      const res = await buildApp().request('/', {
        headers: {
          Authorization: `Bearer ${VALID_3SEG_TOKEN}`,
          'x-inkeep-project-id': 'project-1',
          'x-inkeep-agent-id': 'agent-1',
        },
      });

      expect(res.status).toBe(401);
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
      // Short-circuit: do not let later strategies try the same bearer.
      expect(validateAndGetApiKeyMock).not.toHaveBeenCalled();
    });

    it('short-circuits when the verified JWT has no tenant claim', async () => {
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'user-abc',
          iss: ISSUER,
          aud: RESOURCE_AUDIENCE,
        },
      });

      const res = await buildApp().request('/', {
        headers: {
          Authorization: `Bearer ${VALID_3SEG_TOKEN}`,
          'x-inkeep-project-id': 'project-1',
          'x-inkeep-agent-id': 'agent-1',
        },
      });

      expect(res.status).toBe(401);
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
      expect(validateAndGetApiKeyMock).not.toHaveBeenCalled();
    });

    it('short-circuits when x-inkeep-project-id header is missing', async () => {
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'user-abc',
          iss: ISSUER,
          aud: RESOURCE_AUDIENCE,
          'https://inkeep.com/tenantId': 'tenant-1',
        },
      });

      const res = await buildApp().request('/', {
        headers: {
          Authorization: `Bearer ${VALID_3SEG_TOKEN}`,
          'x-inkeep-agent-id': 'agent-1',
        },
      });

      expect(res.status).toBe(401);
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
      expect(validateAndGetApiKeyMock).not.toHaveBeenCalled();
    });

    it('short-circuits when x-inkeep-agent-id header is missing', async () => {
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'user-abc',
          iss: ISSUER,
          aud: RESOURCE_AUDIENCE,
          'https://inkeep.com/tenantId': 'tenant-1',
        },
      });

      const res = await buildApp().request('/', {
        headers: {
          Authorization: `Bearer ${VALID_3SEG_TOKEN}`,
          'x-inkeep-project-id': 'project-1',
        },
      });

      expect(res.status).toBe(401);
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
      expect(validateAndGetApiKeyMock).not.toHaveBeenCalled();
    });
  });

  describe('SpiceDB authorization', () => {
    it('denies access when canUseProjectStrict returns false', async () => {
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'user-denied',
          iss: ISSUER,
          aud: RESOURCE_AUDIENCE,
          'https://inkeep.com/tenantId': 'tenant-1',
        },
      });
      canUseProjectStrictMock.mockResolvedValue(false);

      const res = await buildApp().request('/', {
        headers: {
          Authorization: `Bearer ${VALID_3SEG_TOKEN}`,
          'x-inkeep-project-id': 'project-1',
          'x-inkeep-agent-id': 'agent-1',
        },
      });

      expect(res.status).toBe(401);
      expect(canUseProjectStrictMock).toHaveBeenCalledWith({
        userId: 'user-denied',
        tenantId: 'tenant-1',
        projectId: 'project-1',
      });
      // SpiceDB-denied: definitive failure, do not let api-key/team strategies retry.
      expect(validateAndGetApiKeyMock).not.toHaveBeenCalled();
    });

    it('returns 503 when SpiceDB is unavailable', async () => {
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'user-abc',
          iss: ISSUER,
          aud: RESOURCE_AUDIENCE,
          'https://inkeep.com/tenantId': 'tenant-1',
        },
      });
      canUseProjectStrictMock.mockRejectedValue(new Error('SpiceDB unreachable'));

      const res = await buildApp().request('/', {
        headers: {
          Authorization: `Bearer ${VALID_3SEG_TOKEN}`,
          'x-inkeep-project-id': 'project-1',
          'x-inkeep-agent-id': 'agent-1',
        },
      });

      expect(res.status).toBe(503);
      const body = await res.text();
      expect(body).toContain('Authorization service temporarily unavailable');
    });
  });

  describe('strategy isolation', () => {
    it('does not affect the support-copilot path (x-inkeep-app-id branch is separate)', async () => {
      // With x-inkeep-app-id present and no matching app, the chain takes the
      // app-credential branch — tryOAuthUserAuth is NEVER invoked. This pins the
      // separation between the run-domain chain and the app-credential branch.
      getAppByIdMock.mockReturnValue(vi.fn().mockResolvedValue(null));

      const res = await buildApp().request('/', {
        headers: {
          Authorization: `Bearer ${VALID_3SEG_TOKEN}`,
          'x-inkeep-app-id': 'app_does_not_exist',
          'x-inkeep-project-id': 'project-1',
          'x-inkeep-agent-id': 'agent-1',
        },
      });

      expect(res.status).toBe(401);
      expect(jwtVerifyMock).not.toHaveBeenCalled();
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
    });
  });
});
