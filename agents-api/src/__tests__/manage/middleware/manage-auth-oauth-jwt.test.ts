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
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
    COPILOT_OAUTH_CLIENT_ID: 'copilot-client-id',
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

const VALID_JWT = 'eyJhbGciOiJFZERTQSJ9.payload.signature';

describe('Manage Auth - OAuth JWT', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('auth' as never, {
        api: { getSession: vi.fn().mockResolvedValue(null) },
      });
      await next();
    });
  });

  it('should authenticate with valid OAuth JWT and set context claims', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'user-123',
        azp: 'copilot-client-id',
        'https://inkeep.com/tenantId': 'tenant_1',
        'https://inkeep.com/email': 'user@example.com',
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
    const body = await res.json();
    expect(body).toEqual({
      userId: 'user-123',
      userEmail: 'user@example.com',
      tenantId: 'tenant_1',
    });
  });

  it('should reject when azp does not match COPILOT_OAUTH_CLIENT_ID', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'user-123',
        azp: 'wrong-client-id',
        'https://inkeep.com/tenantId': 'tenant_1',
      },
    });

    app.use('*', manageBearerAuth());
    app.get('/', (c) => c.text('OK'));

    const res = await app.request('/', {
      headers: { Authorization: `Bearer ${VALID_JWT}` },
    });

    expect(res.status).toBe(401);
  });

  it('should skip OAuth path for non-JWT tokens (falls through to other auth)', async () => {
    app.use('*', manageBearerAuth());
    app.get('/', (c) => c.text('OK'));

    const res = await app.request('/', {
      headers: { Authorization: 'Bearer plain-opaque-token' },
    });

    expect(res.status).toBe(401);
    expect(jwtVerifyMock).not.toHaveBeenCalled();
  });

  it('should fall through when JWT signature verification fails', async () => {
    jwtVerifyMock.mockRejectedValue(new Error('signature invalid'));

    app.use('*', manageBearerAuth());
    app.get('/', (c) => c.text('OK'));

    const res = await app.request('/', {
      headers: { Authorization: `Bearer ${VALID_JWT}` },
    });

    expect(res.status).toBe(401);
  });

  it('should fall through when JWT missing sub claim', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        azp: 'copilot-client-id',
        'https://inkeep.com/tenantId': 'tenant_1',
      },
    });

    app.use('*', manageBearerAuth());
    app.get('/', (c) => c.text('OK'));

    const res = await app.request('/', {
      headers: { Authorization: `Bearer ${VALID_JWT}` },
    });

    expect(res.status).toBe(401);
  });
});
