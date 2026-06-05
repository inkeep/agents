import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    ENVIRONMENT: 'test',
    INKEEP_SENTINEL_API_KEY_ID: 'key_test123',
    INKEEP_SENTINEL_API_KEY_SECRET: 'secret-that-is-at-least-32-chars-long',
    INKEEP_SENTINEL_BASE_URL: 'https://challenges.example.com',
    INKEEP_SENTINEL_V1_API_KEY_ID: undefined as string | undefined,
    INKEEP_SENTINEL_V1_API_KEY_SECRET: undefined as string | undefined,
    INKEEP_AGENTS_MANAGE_DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    INKEEP_AGENTS_RUN_DATABASE_URL: 'postgresql://test:test@localhost:5433/test',
    INKEEP_ANON_JWT_SECRET: 'test-anon-jwt-secret-that-is-at-least-32-chars-long',
    INKEEP_ANON_SESSION_LIFETIME_SECONDS: 3600,
  },
}));

vi.mock('../../../env', () => ({ env: mocks.env }));
vi.mock('../../../data/db/runDbClient', () => ({ default: 'mock-run-db' }));
vi.mock('../../../data/db/manageDbClient', () => ({ default: 'mock-manage-db' }));
vi.mock('../../../data/db/manageDbPool', () => ({ default: 'mock-manage-db-pool' }));

vi.mock('../../../logger', () => createMockLoggerModule().module);

const mockGetAppById = vi.hoisted(() => vi.fn());
const mockValidateOrigin = vi.hoisted(() => vi.fn().mockReturnValue(true));
// verifyPoW is replaced so v1 tests can deterministically pass/fail without exercising
// altcha-lib's HMAC verification (which would require generating real challenge solutions
// against a known secret — out of scope for these tests).
const mockVerifyPoW = vi.hoisted(() => vi.fn());

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getAppById: () => mockGetAppById,
    validateOrigin: mockValidateOrigin,
    verifyPoW: mockVerifyPoW,
  };
});

import { OpenAPIHono } from '@hono/zod-openapi';
import authRoutes from '../../../domains/run/routes/auth';

function createApp() {
  const app = new OpenAPIHono();
  app.route('/run/auth', authRoutes);
  return app;
}

describe('Sentinel proxy routes', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: MockInstance<any>;

  const PROXY_APP_ID = 'app_proxytest';
  const PROXY_ORIGIN = 'https://help.customer.com';

  // App record used by all proxy-route tests. The proxy looks the app up via
  // getAppById and validates Origin against allowedDomains before forwarding.
  function setupProxyApp() {
    mockGetAppById.mockResolvedValue({
      id: PROXY_APP_ID,
      tenantId: 'tenant_test',
      projectId: 'project_test',
      type: 'web_client',
      enabled: true,
      config: {
        type: 'web_client',
        webClient: { allowedDomains: [new URL(PROXY_ORIGIN).hostname] },
      },
    });
  }

  const proxyHeaders = { Origin: PROXY_ORIGIN } as const;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    mockValidateOrigin.mockReturnValue(true);
    mockGetAppById.mockReset();
    mockVerifyPoW.mockReset();
    setupProxyApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mocks.env.INKEEP_SENTINEL_API_KEY_ID = 'key_test123';
    mocks.env.INKEEP_SENTINEL_BASE_URL = 'https://challenges.example.com';
    mocks.env.INKEEP_SENTINEL_V1_API_KEY_ID = undefined;
    mocks.env.INKEEP_SENTINEL_V1_API_KEY_SECRET = undefined;
  });

  describe('GET /run/auth/sentinel/challenge', () => {
    it('should return 404 when Sentinel is not configured', async () => {
      mocks.env.INKEEP_SENTINEL_API_KEY_ID = '' as typeof mocks.env.INKEEP_SENTINEL_API_KEY_ID;
      const app = createApp();

      const res = await app.request(`/run/auth/sentinel/challenge?appId=${PROXY_APP_ID}`, {
        headers: proxyHeaders,
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.detail).toBe('Sentinel is not enabled');
    });

    it('should proxy challenge request and rewrite verifyUrl', async () => {
      const sentinelResponse = {
        challenge: 'abc123',
        algorithm: 'SHA-256',
        salt: 'somesalt',
        signature: 'sig',
        configuration: {
          verifyUrl: '/v1/verify',
          otherField: true,
        },
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(sentinelResponse), { status: 200 })
      );

      const app = createApp();
      const res = await app.request(`/run/auth/sentinel/challenge?appId=${PROXY_APP_ID}`, {
        headers: proxyHeaders,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // The rewrite preserves the appId so downstream calls can re-validate origin.
      expect(body.configuration.verifyUrl).toBe(`/run/auth/sentinel/verify?appId=${PROXY_APP_ID}`);
      expect(body.challenge).toBe('abc123');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://challenges.example.com/v1/challenge?apiKey=key_test123',
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('should forward endpointClass as X-Inkeep-Endpoint-Class header', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ challenge: 'test' }), { status: 200 })
      );

      const app = createApp();
      await app.request(`/run/auth/sentinel/challenge?appId=${PROXY_APP_ID}&endpointClass=chat`, {
        headers: proxyHeaders,
      });

      const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
      const calledHeaders = callArgs[1].headers as Record<string, string>;
      expect(calledHeaders['x-inkeep-endpoint-class']).toBe('chat');
    });

    it('should return 403 when Origin is not in the app allowedDomains', async () => {
      mockValidateOrigin.mockReturnValueOnce(false);
      const app = createApp();
      const res = await app.request(`/run/auth/sentinel/challenge?appId=${PROXY_APP_ID}`, {
        headers: { Origin: 'https://evil.attacker.com' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.detail).toBe('Origin not allowed');
    });

    it('should preserve upstream rate limits as 429', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));

      const app = createApp();
      const res = await app.request(`/run/auth/sentinel/challenge?appId=${PROXY_APP_ID}`, {
        headers: proxyHeaders,
      });

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.detail).toBe('Challenge service rate limit exceeded');
    });
  });

  describe('POST /run/auth/sentinel/verify', () => {
    it('should return 404 when Sentinel is not configured', async () => {
      mocks.env.INKEEP_SENTINEL_API_KEY_ID = '' as typeof mocks.env.INKEEP_SENTINEL_API_KEY_ID;
      const app = createApp();

      const res = await app.request(`/run/auth/sentinel/verify?appId=${PROXY_APP_ID}`, {
        method: 'POST',
        headers: proxyHeaders,
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.detail).toBe('Sentinel is not enabled');
    });

    it('should proxy verify request to Sentinel', async () => {
      const sentinelVerifyResponse = {
        verified: true,
        classification: 'GOOD',
        score: 0.95,
        verificationId: 'ver_123',
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(sentinelVerifyResponse), { status: 200 })
      );

      const app = createApp();
      const res = await app.request(`/run/auth/sentinel/verify?appId=${PROXY_APP_ID}`, {
        method: 'POST',
        headers: { ...proxyHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ payload: 'sentinel-payload-data' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.verified).toBe(true);
      expect(body.classification).toBe('GOOD');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://challenges.example.com/v1/verify?apiKey=key_test123',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should preserve upstream rate limits as 429', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));

      const app = createApp();
      const res = await app.request(`/run/auth/sentinel/verify?appId=${PROXY_APP_ID}`, {
        method: 'POST',
        headers: { ...proxyHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ payload: 'sentinel-payload-data' }),
      });

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.detail).toBe('Challenge service rate limit exceeded');
    });
  });

  describe('POST /run/auth/sentinel/challenge (HIS)', () => {
    it('should proxy POST challenge and rewrite verifyUrl', async () => {
      const sentinelResponse = {
        challenge: 'his123',
        algorithm: 'SHA-256',
        salt: 'somesalt',
        signature: 'sig',
        configuration: {
          verifyUrl: '/v1/verify',
        },
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(sentinelResponse), { status: 200 })
      );

      const app = createApp();
      const res = await app.request(`/run/auth/sentinel/challenge?appId=${PROXY_APP_ID}`, {
        method: 'POST',
        headers: { ...proxyHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ his: 'interaction-payload' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.configuration.verifyUrl).toBe(`/run/auth/sentinel/verify?appId=${PROXY_APP_ID}`);
      expect(body.challenge).toBe('his123');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://challenges.example.com/v1/challenge?apiKey=key_test123',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should rewrite his.url so subsequent HIS rounds route through the proxy', async () => {
      const sentinelResponse = {
        challenge: 'his456',
        algorithm: 'SHA-256',
        salt: 'somesalt',
        signature: 'sig',
        configuration: { verifyUrl: '/v1/verify' },
        his: { url: 'https://challenges.example.com/v1/challenge' },
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(sentinelResponse), { status: 200 })
      );

      const app = createApp();
      const res = await app.request(`/run/auth/sentinel/challenge?appId=${PROXY_APP_ID}`, {
        method: 'POST',
        headers: { ...proxyHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ his: 'interaction-payload' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.his.url).toBe(`/run/auth/sentinel/challenge?appId=${PROXY_APP_ID}`);
      expect(body.configuration.verifyUrl).toBe(`/run/auth/sentinel/verify?appId=${PROXY_APP_ID}`);
    });

    it('should return 404 when Sentinel is not configured', async () => {
      mocks.env.INKEEP_SENTINEL_API_KEY_ID = '' as typeof mocks.env.INKEEP_SENTINEL_API_KEY_ID;
      const app = createApp();

      const res = await app.request(`/run/auth/sentinel/challenge?appId=${PROXY_APP_ID}`, {
        method: 'POST',
        headers: proxyHeaders,
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.detail).toBe('Sentinel is not enabled');
    });

    it('should preserve upstream rate limits as 429', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));

      const app = createApp();
      const res = await app.request(`/run/auth/sentinel/challenge?appId=${PROXY_APP_ID}`, {
        method: 'POST',
        headers: { ...proxyHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ his: 'interaction-payload' }),
      });

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.detail).toBe('Challenge service rate limit exceeded');
    });
  });

  describe('POST /run/auth/apps/{appId}/anonymous-session — Sentinel verification', () => {
    const APP_ID = 'app_abcdef123456';
    const ALLOWED_ORIGIN = 'https://help.customer.com';

    function makeChallengeHeader(payload: string = 'sentinel-payload') {
      return btoa(JSON.stringify({ payload }));
    }

    beforeEach(() => {
      mockGetAppById.mockResolvedValue({
        id: APP_ID,
        tenantId: 'tenant_test',
        projectId: 'project_test',
        type: 'web_client',
        enabled: true,
        config: {
          type: 'web_client',
          webClient: { allowedDomains: [new URL(ALLOWED_ORIGIN).hostname], allowAnonymous: true },
        },
      });
    });

    it('should return 400 when Sentinel is enabled and challenge header is missing', async () => {
      const app = createApp();
      const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
        method: 'POST',
        headers: { Origin: ALLOWED_ORIGIN, 'content-type': 'application/json' },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toBe('Bot protection challenge solution is required.');
    });

    it('should return 400 when challenge header is malformed', async () => {
      const app = createApp();
      const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
        method: 'POST',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'content-type': 'application/json',
          'x-inkeep-challenge-solution': 'not-base64-json',
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('bad_request');
    });

    it('should return 403 when Sentinel verification fails (bot detected)', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ verified: false, reason: 'bot_detected' }), { status: 200 })
      );

      const app = createApp();
      const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
        method: 'POST',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'content-type': 'application/json',
          'x-inkeep-challenge-solution': makeChallengeHeader(),
        },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.message).toBe('Bot protection verification failed');
    });

    it('should issue session token when Sentinel verification succeeds', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            verified: true,
            classification: 'GOOD',
            score: 0.95,
            verificationId: 'ver_abc',
          }),
          { status: 200 }
        )
      );

      const app = createApp();
      const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
        method: 'POST',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'content-type': 'application/json',
          'x-inkeep-challenge-solution': makeChallengeHeader(),
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(body.expiresAt).toBeDefined();
    });

    it('should return 400 when challenge header is valid JSON but missing payload field', async () => {
      const app = createApp();
      const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
        method: 'POST',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'content-type': 'application/json',
          // Structurally valid base64 JSON but no `payload` field — must be rejected.
          'x-inkeep-challenge-solution': btoa(JSON.stringify({ notPayload: 'anything' })),
        },
      });

      expect(res.status).toBe(400);
      // No upstream Sentinel call when header is malformed.
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should fail open and issue token when Sentinel upstream is unreachable', async () => {
      // Sentinel verify fetch throws (network down, DNS error, timeout).
      fetchSpy.mockRejectedValueOnce(new Error('fetch failed'));

      const app = createApp();
      const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
        method: 'POST',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'content-type': 'application/json',
          'x-inkeep-challenge-solution': makeChallengeHeader(),
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
    });

    it('should fail closed (403) when Sentinel returns a non-JSON 5xx response', async () => {
      // Non-JSON 5xx must NOT fail open — otherwise an attacker who can trigger an HTML
      // error page from Sentinel/Cloudflare/ALB would bypass bot protection. The fail-
      // open/closed decision must not depend on the upstream error body's content type.
      fetchSpy.mockResolvedValueOnce(
        new Response('<html>503 Service Unavailable</html>', { status: 503 })
      );

      const app = createApp();
      const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
        method: 'POST',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'content-type': 'application/json',
          'x-inkeep-challenge-solution': makeChallengeHeader(),
        },
      });

      expect(res.status).toBe(403);
    });

    it('should fail open (200) when Sentinel returns a 200 with malformed body', async () => {
      // The narrow case where fail-open still applies: Sentinel itself returns a
      // protocol-violating 200 with an unparseable body. Legitimate users shouldn't
      // be blocked when Sentinel is misbehaving but didn't explicitly reject.
      fetchSpy.mockResolvedValueOnce(new Response('definitely-not-json', { status: 200 }));

      const app = createApp();
      const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
        method: 'POST',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'content-type': 'application/json',
          'x-inkeep-challenge-solution': makeChallengeHeader(),
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
    });

    it('should fail closed (403) when Sentinel returns structured verify-failed', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'bad_signature' }), { status: 400 })
      );

      const app = createApp();
      const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
        method: 'POST',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'content-type': 'application/json',
          'x-inkeep-challenge-solution': makeChallengeHeader(),
        },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /run/auth/pow/challenge (legacy PoW v1 compatibility)', () => {
    beforeEach(() => {
      // Each test opts in by setting v1 env vars explicitly.
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_ID = undefined;
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_SECRET = undefined;
    });

    it('should return 404 when v1 is not configured', async () => {
      const app = createApp();
      const res = await app.request('/run/auth/pow/challenge');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.detail).toBe('Legacy PoW is not enabled');
      // Don't even hit Sentinel when v1 is disabled.
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should return 404 when v1 key is set but base URL is missing', async () => {
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_ID = 'v1_key_abc';
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_SECRET = 'v1-secret-that-is-at-least-32-chars-long';
      mocks.env.INKEEP_SENTINEL_BASE_URL = '' as typeof mocks.env.INKEEP_SENTINEL_BASE_URL;

      const app = createApp();
      const res = await app.request('/run/auth/pow/challenge');

      expect(res.status).toBe(404);
    });

    it('should proxy upstream challenge using the v1 API key', async () => {
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_ID = 'v1_key_abc';
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_SECRET = 'v1-secret-that-is-at-least-32-chars-long';

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            algorithm: 'SHA-256',
            challenge: 'legacy-challenge',
            salt: 'somesalt?expires=1700000000',
            signature: 'sig',
          }),
          { status: 200 }
        )
      );

      const app = createApp();
      const res = await app.request('/run/auth/pow/challenge');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.challenge).toBe('legacy-challenge');
      // expiresAt added from the salt's ?expires= (seconds) → ms.
      expect(body.expiresAt).toBe(1700000000 * 1000);

      // Upstream must use the v1 key, NOT the v2 key.
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://challenges.example.com/v1/challenge?apiKey=v1_key_abc',
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('should omit expiresAt when the salt has a non-numeric expires param', async () => {
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_ID = 'v1_key_abc';
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_SECRET = 'v1-secret-that-is-at-least-32-chars-long';

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            algorithm: 'SHA-256',
            challenge: 'legacy-challenge',
            salt: 'somesalt?expires=not-a-number',
            signature: 'sig',
          }),
          { status: 200 }
        )
      );

      const app = createApp();
      const res = await app.request('/run/auth/pow/challenge');

      expect(res.status).toBe(200);
      const body = await res.json();
      // Non-finite numbers must not surface as `null` (JSON.stringify(NaN) === 'null').
      expect(body.expiresAt).toBeUndefined();
    });

    it('should omit expiresAt when the salt has no expires param', async () => {
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_ID = 'v1_key_abc';
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_SECRET = 'v1-secret-that-is-at-least-32-chars-long';

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            algorithm: 'SHA-256',
            challenge: 'legacy-challenge',
            salt: 'somesalt-without-query',
            signature: 'sig',
          }),
          { status: 200 }
        )
      );

      const app = createApp();
      const res = await app.request('/run/auth/pow/challenge');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.expiresAt).toBeUndefined();
    });

    it('should return 502 when the upstream challenge returns non-2xx', async () => {
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_ID = 'v1_key_abc';
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_SECRET = 'v1-secret-that-is-at-least-32-chars-long';

      fetchSpy.mockResolvedValueOnce(new Response('upstream error', { status: 500 }));

      const app = createApp();
      const res = await app.request('/run/auth/pow/challenge');

      expect(res.status).toBe(502);
    });

    it('should preserve upstream rate limits as 429', async () => {
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_ID = 'v1_key_abc';
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_SECRET = 'v1-secret-that-is-at-least-32-chars-long';

      fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));

      const app = createApp();
      const res = await app.request('/run/auth/pow/challenge');

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.detail).toBe('Challenge service rate limit exceeded');
    });

    it('should return 502 when the upstream fetch throws', async () => {
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_ID = 'v1_key_abc';
      mocks.env.INKEEP_SENTINEL_V1_API_KEY_SECRET = 'v1-secret-that-is-at-least-32-chars-long';

      fetchSpy.mockRejectedValueOnce(new Error('network down'));

      const app = createApp();
      const res = await app.request('/run/auth/pow/challenge');

      expect(res.status).toBe(502);
    });
  });

  describe('POST /run/auth/apps/{appId}/anonymous-session — dual-path discriminator', () => {
    const APP_ID = 'app_dualpath123456';
    const ALLOWED_ORIGIN = 'https://help.customer.com';

    function v2Header(payload: string = 'sentinel-payload') {
      // v2 envelope: btoa(JSON.stringify({ payload: <string> })).
      return btoa(JSON.stringify({ payload }));
    }

    function v1Header() {
      // v1 envelope: btoa(JSON.stringify(<raw ALTCHA solution>)) — no `payload` field.
      // The contents don't matter for these tests because verifyPoW is mocked.
      return btoa(
        JSON.stringify({
          algorithm: 'SHA-256',
          challenge: 'abc',
          number: 1234,
          salt: 'somesalt',
          signature: 'sig',
        })
      );
    }

    beforeEach(() => {
      mockGetAppById.mockResolvedValue({
        id: APP_ID,
        tenantId: 'tenant_test',
        projectId: 'project_test',
        type: 'web_client',
        enabled: true,
        config: {
          type: 'web_client',
          webClient: { allowedDomains: [new URL(ALLOWED_ORIGIN).hostname], allowAnonymous: true },
        },
      });
    });

    describe('v1-only mode (only INKEEP_SENTINEL_V1_* set)', () => {
      beforeEach(() => {
        mocks.env.INKEEP_SENTINEL_API_KEY_ID = '' as typeof mocks.env.INKEEP_SENTINEL_API_KEY_ID;
        mocks.env.INKEEP_SENTINEL_API_KEY_SECRET =
          '' as typeof mocks.env.INKEEP_SENTINEL_API_KEY_SECRET;
        mocks.env.INKEEP_SENTINEL_V1_API_KEY_ID = 'v1_key_abc';
        mocks.env.INKEEP_SENTINEL_V1_API_KEY_SECRET = 'v1-secret-that-is-at-least-32-chars-long';
      });

      it('routes v1-shaped header to verifyPoW and issues a session on success', async () => {
        mockVerifyPoW.mockResolvedValueOnce({ ok: true });

        const app = createApp();
        const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
          method: 'POST',
          headers: {
            Origin: ALLOWED_ORIGIN,
            'content-type': 'application/json',
            'x-inkeep-challenge-solution': v1Header(),
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.token).toBeDefined();
        expect(mockVerifyPoW).toHaveBeenCalledTimes(1);
        // No Sentinel fetch on the v1 path — verification is local HMAC.
        expect(fetchSpy).not.toHaveBeenCalled();
      });

      it('rejects with 400 when v1 verification fails', async () => {
        mockVerifyPoW.mockResolvedValueOnce({ ok: false, error: 'pow_invalid' });

        const app = createApp();
        const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
          method: 'POST',
          headers: {
            Origin: ALLOWED_ORIGIN,
            'content-type': 'application/json',
            'x-inkeep-challenge-solution': v1Header(),
          },
        });

        expect(res.status).toBe(400);
      });

      it('rejects a v2-shaped header (because v2 is disabled)', async () => {
        const app = createApp();
        const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
          method: 'POST',
          headers: {
            Origin: ALLOWED_ORIGIN,
            'content-type': 'application/json',
            'x-inkeep-challenge-solution': v2Header(),
          },
        });

        expect(res.status).toBe(400);
        // Don't fall through to v1 verification when the client sent a v2 envelope.
        expect(mockVerifyPoW).not.toHaveBeenCalled();
        // Don't call Sentinel either — v2 is disabled.
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    });

    describe('dual-enabled mode (v1 + v2 both set)', () => {
      beforeEach(() => {
        mocks.env.INKEEP_SENTINEL_API_KEY_ID = 'key_test123';
        mocks.env.INKEEP_SENTINEL_API_KEY_SECRET = 'secret-that-is-at-least-32-chars-long';
        mocks.env.INKEEP_SENTINEL_V1_API_KEY_ID = 'v1_key_abc';
        mocks.env.INKEEP_SENTINEL_V1_API_KEY_SECRET = 'v1-secret-that-is-at-least-32-chars-long';
      });

      it('routes v2-shaped header to Sentinel HIS verification', async () => {
        fetchSpy.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              verified: true,
              classification: 'GOOD',
              score: 0.95,
              verificationId: 'ver_abc',
            }),
            { status: 200 }
          )
        );

        const app = createApp();
        const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
          method: 'POST',
          headers: {
            Origin: ALLOWED_ORIGIN,
            'content-type': 'application/json',
            'x-inkeep-challenge-solution': v2Header(),
          },
        });

        expect(res.status).toBe(200);
        // The v2 path must call Sentinel; v1 verifyPoW must NOT be invoked.
        expect(fetchSpy).toHaveBeenCalled();
        expect(mockVerifyPoW).not.toHaveBeenCalled();
      });

      it('routes v1-shaped header to verifyPoW (legacy path remains available)', async () => {
        mockVerifyPoW.mockResolvedValueOnce({ ok: true });

        const app = createApp();
        const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
          method: 'POST',
          headers: {
            Origin: ALLOWED_ORIGIN,
            'content-type': 'application/json',
            'x-inkeep-challenge-solution': v1Header(),
          },
        });

        expect(res.status).toBe(200);
        expect(mockVerifyPoW).toHaveBeenCalledTimes(1);
        expect(fetchSpy).not.toHaveBeenCalled();
      });

      it('rejects a structurally invalid envelope (not base64 JSON)', async () => {
        const app = createApp();
        const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
          method: 'POST',
          headers: {
            Origin: ALLOWED_ORIGIN,
            'content-type': 'application/json',
            'x-inkeep-challenge-solution': '!!!not-base64-json!!!',
          },
        });

        expect(res.status).toBe(400);
        expect(mockVerifyPoW).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    });

    describe('both disabled (no bot protection)', () => {
      beforeEach(() => {
        mocks.env.INKEEP_SENTINEL_API_KEY_ID = '' as typeof mocks.env.INKEEP_SENTINEL_API_KEY_ID;
        mocks.env.INKEEP_SENTINEL_API_KEY_SECRET =
          '' as typeof mocks.env.INKEEP_SENTINEL_API_KEY_SECRET;
        mocks.env.INKEEP_SENTINEL_V1_API_KEY_ID = undefined;
        mocks.env.INKEEP_SENTINEL_V1_API_KEY_SECRET = undefined;
      });

      it('issues a session without inspecting any challenge header', async () => {
        const app = createApp();
        const res = await app.request(`/run/auth/apps/${APP_ID}/anonymous-session`, {
          method: 'POST',
          headers: {
            Origin: ALLOWED_ORIGIN,
            'content-type': 'application/json',
            // A header is present but it should be ignored entirely.
            'x-inkeep-challenge-solution': 'whatever',
          },
        });

        expect(res.status).toBe(200);
        expect(mockVerifyPoW).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    });
  });
});
