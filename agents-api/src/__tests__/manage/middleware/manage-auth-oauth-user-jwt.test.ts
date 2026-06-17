import { beforeEach, describe, expect, it, vi } from 'vitest';

const { jwtVerifyMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn(),
}));

vi.mock('@inkeep/agents-core', () => ({
  validateAndGetApiKey: vi.fn(),
  isSlackUserToken: vi.fn().mockReturnValue(false),
  isInternalServiceToken: vi.fn().mockReturnValue(false),
  verifyInternalServiceAuthHeader: vi.fn(),
  verifySlackUserToken: vi.fn(),
  getInProcessFetch: () => vi.fn(),
  getLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@inkeep/agents-core/middleware', () => ({
  registerAuthzMeta: vi.fn(),
}));

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  customFetch: Symbol('customFetch'),
  jwtVerify: jwtVerifyMock,
}));

vi.mock('../../../env.js', () => ({
  env: {
    ENVIRONMENT: 'production',
    INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: undefined,
    INKEEP_AGENTS_API_URL: 'https://manage.example.com',
    COPILOT_OAUTH_CLIENT_ID: 'copilot-client-id' as string | undefined,
  },
}));

vi.mock('../../../data/db/runDbClient.js', () => ({ default: {} }));

vi.mock('../../../middleware/sessionAuth', () => ({
  sessionAuth: () =>
    vi.fn(async (_c: unknown, _next: unknown) => {
      throw new Error('session auth not mocked');
    }),
}));

import { Hono } from 'hono';
import { manageBearerAuth } from '../../../middleware/manageAuth';

const RESOURCE_AUDIENCE = 'https://manage.example.com';
const ACCEPTED_AUDIENCES = [RESOURCE_AUDIENCE, `${RESOURCE_AUDIENCE}/`, `${RESOURCE_AUDIENCE}/mcp`];
const VALID_JWT = 'eyJhbGciOiJSUzI1NiIsImtpZCI6Im1jcC1raWQifQ.payload.signature';

describe('Manage Auth — OAuth user JWT strategy (audience-bound)', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    jwtVerifyMock.mockReset();
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('auth' as never, {
        api: { getSession: vi.fn().mockResolvedValue(null) },
      });
      await next();
    });
  });

  describe('successful authentication', () => {
    it('authenticates an audience-bound user JWT and sets userId / userEmail / tenantId / oauthClientId', async () => {
      jwtVerifyMock.mockResolvedValue({
        payload: {
          sub: 'user-mcp',
          aud: RESOURCE_AUDIENCE,
          'https://inkeep.com/tenantId': 'tenant-mcp',
          'https://inkeep.com/email': 'mcp@example.com',
          azp: 'dcr-client-abc',
        },
      });

      app.use('*', manageBearerAuth());
      app.get('/', (c) =>
        c.json({
          userId: (c as any).get('userId'),
          userEmail: (c as any).get('userEmail'),
          tenantId: (c as any).get('tenantId'),
          oauthClientId: (c as any).get('oauthClientId') ?? null,
        })
      );

      const res = await app.request('/', {
        headers: { Authorization: `Bearer ${VALID_JWT}` },
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        userId: 'user-mcp',
        userEmail: 'mcp@example.com',
        tenantId: 'tenant-mcp',
        // F3: the DCR client_id must be captured for incident-response audit.
        oauthClientId: 'dcr-client-abc',
      });
      expect(jwtVerifyMock).toHaveBeenCalledWith(
        VALID_JWT,
        expect.anything(),
        expect.objectContaining({ audience: ACCEPTED_AUDIENCES })
      );
    });

    it('accepts an array-form aud claim that includes this resource', async () => {
      jwtVerifyMock.mockResolvedValue({
        payload: {
          sub: 'user-multi-aud',
          aud: ['https://other-resource.example.com', RESOURCE_AUDIENCE],
          'https://inkeep.com/tenantId': 'tenant-multi',
        },
      });

      app.use('*', manageBearerAuth());
      app.get('/', (c) =>
        c.json({
          userId: (c as any).get('userId'),
          tenantId: (c as any).get('tenantId'),
        })
      );

      const res = await app.request('/', {
        headers: { Authorization: `Bearer ${VALID_JWT}` },
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        userId: 'user-multi-aud',
        tenantId: 'tenant-multi',
      });
    });

    it('authenticates without userEmail when the email claim is absent', async () => {
      jwtVerifyMock.mockResolvedValue({
        payload: {
          sub: 'user-no-email',
          aud: RESOURCE_AUDIENCE,
          'https://inkeep.com/tenantId': 'tenant-1',
        },
      });

      app.use('*', manageBearerAuth());
      app.get('/', (c) =>
        c.json({
          userId: (c as any).get('userId'),
          userEmail: (c as any).get('userEmail') ?? null,
          tenantId: (c as any).get('tenantId'),
        })
      );

      const res = await app.request('/', {
        headers: { Authorization: `Bearer ${VALID_JWT}` },
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        userId: 'user-no-email',
        userEmail: null,
        tenantId: 'tenant-1',
      });
    });
  });

  describe('fall-through cases (the token is not for this strategy)', () => {
    it('falls through a non-JWT bearer (fewer than three dot-segments) without calling jwtVerify', async () => {
      app.use('*', manageBearerAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: { Authorization: 'Bearer plain-opaque-token' },
      });

      expect(res.status).toBe(401);
      expect(jwtVerifyMock).not.toHaveBeenCalled();
    });

    it('falls through cleanly to the copilot path when the verified token has no `aud` claim', async () => {
      // A copilot-shape token never carries `aud` (the client never sends `resource`).
      // In production, jose's `audience` option causes jwtVerify to throw
      // JWTClaimValidationFailed for tokens with no `aud` — the OAuth-user catch path
      // then returns null and the copilot path retries jwtVerify WITHOUT the audience
      // option, succeeding. Models that two-call flow with distinct mock returns so the
      // test would catch a regression that removed the audience option from the first call.
      jwtVerifyMock.mockRejectedValueOnce(new Error('JWT audience invalid'));
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'copilot-user-456',
          azp: 'copilot-client-id',
          'https://inkeep.com/tenantId': 'tenant-copilot',
          'https://inkeep.com/email': 'copilot@example.com',
        },
      });

      app.use('*', manageBearerAuth());
      app.get('/', (c) =>
        c.json({
          userId: (c as any).get('userId'),
          userEmail: (c as any).get('userEmail'),
          tenantId: (c as any).get('tenantId'),
        })
      );

      const res = await app.request('/', {
        headers: { Authorization: `Bearer ${VALID_JWT}` },
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        userId: 'copilot-user-456',
        userEmail: 'copilot@example.com',
        tenantId: 'tenant-copilot',
      });
      // First call (OAuth-user) requested an audience option; second (copilot) did not.
      expect(jwtVerifyMock).toHaveBeenCalledTimes(2);
      expect(jwtVerifyMock).toHaveBeenNthCalledWith(
        1,
        VALID_JWT,
        expect.anything(),
        expect.objectContaining({ audience: ACCEPTED_AUDIENCES })
      );
      expect(jwtVerifyMock).toHaveBeenNthCalledWith(
        2,
        VALID_JWT,
        expect.anything(),
        expect.not.objectContaining({ audience: expect.anything() })
      );
    });

    it('rejects when the verified token has a wrong `aud` claim (falls through to no other strategy)', async () => {
      jwtVerifyMock.mockResolvedValue({
        payload: {
          sub: 'user-wrong-aud',
          aud: 'https://some-other-resource.example.com',
          azp: 'dcr-client-abc',
          'https://inkeep.com/tenantId': 'tenant-x',
        },
      });

      app.use('*', manageBearerAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: { Authorization: `Bearer ${VALID_JWT}` },
      });

      // OAuth-user rejects (wrong aud) → copilot path rejects (azp mismatch) → 401.
      expect(res.status).toBe(401);
    });

    it('falls through when jwtVerify rejects (signature or issuer mismatch)', async () => {
      jwtVerifyMock.mockRejectedValue(new Error('signature verification failed'));

      app.use('*', manageBearerAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: { Authorization: `Bearer ${VALID_JWT}` },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('verified-but-incomplete cases (short-circuit to 401)', () => {
    it('short-circuits when the verified audience-bound token has no sub claim', async () => {
      // First call: OAuth-user path verifies and audMatches passes; sub missing → commit 401.
      // The copilot fallthrough path is configured to ACCEPT (azp matches, would set context),
      // but the short-circuit means it is never reached.
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          aud: RESOURCE_AUDIENCE,
          azp: 'copilot-client-id',
          'https://inkeep.com/tenantId': 'tenant-1',
        },
      });
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          // Sub IS present here — copilot path would authenticate if reached.
          sub: 'copilot-fallthrough-user',
          azp: 'copilot-client-id',
          'https://inkeep.com/tenantId': 'tenant-1',
        },
      });

      app.use('*', manageBearerAuth());
      app.get('/', (c) =>
        c.json({
          userId: (c as any).get('userId') ?? null,
        })
      );

      const res = await app.request('/', {
        headers: { Authorization: `Bearer ${VALID_JWT}` },
      });

      expect(res.status).toBe(401);
      // Copilot path must NOT be reached (jwtVerify called exactly once for OAuth-user).
      expect(jwtVerifyMock).toHaveBeenCalledTimes(1);
    });

    it('short-circuits when the verified audience-bound token has no tenant claim', async () => {
      // Payload models the bug: a verified, audience-bound token whose owner is a DCR'd
      // client with a copilot-shaped azp, but missing the tenant claim. If we fell through
      // instead of short-circuiting, the copilot path would authenticate (azp matches, sub
      // exists) with no tenantId — wrong strategy, missing claim.
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'attacker-user',
          aud: RESOURCE_AUDIENCE,
          azp: 'copilot-client-id',
        },
      });
      // Configure a successful copilot verify in case fall-through happens — the assertion
      // that this is NEVER reached proves the short-circuit.
      jwtVerifyMock.mockResolvedValueOnce({
        payload: {
          sub: 'attacker-user',
          azp: 'copilot-client-id',
          'https://inkeep.com/tenantId': 'tenant-1',
        },
      });

      app.use('*', manageBearerAuth());
      app.get('/', (c) =>
        c.json({
          userId: (c as any).get('userId') ?? null,
        })
      );

      const res = await app.request('/', {
        headers: { Authorization: `Bearer ${VALID_JWT}` },
      });

      expect(res.status).toBe(401);
      // Critical: copilot jwtVerify is NOT called — the OAuth-user committed-failure
      // pins this token to its strategy and refuses to let copilot retry it.
      expect(jwtVerifyMock).toHaveBeenCalledTimes(1);
    });
  });
});
