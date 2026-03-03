import { beforeEach, describe, expect, it, vi } from 'vitest';

const { validateAndGetApiKeyMock, isSlackUserTokenMock, isInternalServiceTokenMock } = vi.hoisted(
  () => ({
    validateAndGetApiKeyMock: vi.fn(),
    isSlackUserTokenMock: vi.fn().mockReturnValue(false),
    isInternalServiceTokenMock: vi.fn().mockReturnValue(false),
  })
);

vi.mock('@inkeep/agents-core', () => ({
  validateAndGetApiKey: validateAndGetApiKeyMock,
  isSlackUserToken: isSlackUserTokenMock,
  isInternalServiceToken: isInternalServiceTokenMock,
  verifyInternalServiceAuthHeader: vi.fn(),
  verifySlackUserToken: vi.fn(),
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

vi.mock('../../../env.js', () => ({
  env: {
    ENVIRONMENT: 'production',
    INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: 'test-manage-bypass',
  },
}));

vi.mock('../../../middleware/sessionAuth', () => ({
  sessionAuth: () =>
    vi.fn(async (_c: unknown, _next: unknown) => {
      throw new Error('session auth not mocked for this test');
    }),
}));

import { Hono } from 'hono';
import { manageBearerAuth } from '../../../middleware/manageAuth';

describe('Manage Auth - API Key Rejection', () => {
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

  it('should reject a valid database API key on manage endpoints', async () => {
    app.use('*', manageBearerAuth());
    app.get('/', (c) => c.text('OK'));

    const res = await app.request('/', {
      headers: {
        Authorization: 'Bearer sk_test_1234567890abcdef.verylongsecretkey',
      },
    });

    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain('Invalid Token');
    expect(validateAndGetApiKeyMock).not.toHaveBeenCalled();
  });

  it('should still accept the bypass secret', async () => {
    app.use('*', manageBearerAuth());
    app.get('/', (c) => {
      return c.json({
        userId: (c as any).get('userId'),
      });
    });

    const res = await app.request('/', {
      headers: {
        Authorization: 'Bearer test-manage-bypass',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('system');
  });
});
