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
  verifyPoWMock,
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
  verifyPoWMock: vi.fn().mockResolvedValue({ ok: true }),
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
  verifyPoW: verifyPoWMock,
  getPoWErrorMessage: (error: string) => {
    const messages: Record<string, string> = {
      pow_expired: 'Proof-of-work challenge has expired.',
      pow_required: 'Proof-of-work challenge solution is required.',
      pow_invalid: 'Proof-of-work challenge solution is invalid.',
    };
    return messages[error] ?? 'Unknown PoW error';
  },
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

import type { ApiKeySelect } from '@inkeep/agents-core';
import { Hono } from 'hono';
import { runApiKeyAuth as apiKeyAuth } from '../../../middleware/runAuth';

function makeApiKey(overrides: Partial<ApiKeySelect> = {}): ApiKeySelect {
  return {
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
    ...overrides,
  };
}

const VALID_ANON_JWT = 'eyJhbGciOiJIUzI1NiJ9.valid-anon-token-content-padding-here-abcdef';

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
      webClient: { allowedDomains: ['help.customer.com'] },
    },
    prompt: null,
    ...overrides,
  };
}

describe('x-inkeep-app-prompt header → executionContext.metadata.appPrompt', () => {
  let app: Hono;
  const originalEnv = process.env.ENVIRONMENT;

  beforeEach(() => {
    vi.clearAllMocks();
    verifyServiceTokenMock.mockResolvedValue({ valid: false, error: 'Invalid token' });
    verifyPoWMock.mockResolvedValue({ ok: true });
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

  describe('API key auth (production path)', () => {
    it('should set metadata.appPrompt from x-inkeep-app-prompt header', async () => {
      validateAndGetApiKeyMock.mockResolvedValueOnce(makeApiKey());

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.json((c as any).get('executionContext')));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer sk_test_1234567890abcdef.verylongsecretkey',
          'x-inkeep-app-prompt': 'Be concise and link to documentation pages.',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata.appPrompt).toBe('Be concise and link to documentation pages.');
    });

    it('should not set metadata.appPrompt when header is absent', async () => {
      validateAndGetApiKeyMock.mockResolvedValueOnce(makeApiKey());

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.json((c as any).get('executionContext')));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer sk_test_1234567890abcdef.verylongsecretkey',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata?.appPrompt).toBeUndefined();
    });
  });

  describe('app credential auth (appPrompt from DB takes precedence)', () => {
    it('should not override DB-sourced appPrompt with header value', async () => {
      const appRecord = makeWebClientApp({ prompt: 'Prompt from database' });
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
      app.get('/', (c) => c.json((c as any).get('executionContext')));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app-id-1',
          'x-inkeep-agent-id': 'agent-1',
          Origin: 'https://help.customer.com',
          'x-inkeep-app-prompt': 'Header prompt that should be ignored',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata.appPrompt).toBe('Prompt from database');
    });

    it('should use header appPrompt when app has no prompt in DB', async () => {
      const appRecord = makeWebClientApp({ prompt: null });
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
      app.get('/', (c) => c.json((c as any).get('executionContext')));

      const res = await app.request('/', {
        headers: {
          Authorization: `Bearer ${VALID_ANON_JWT}`,
          'x-inkeep-app-id': 'app-id-1',
          'x-inkeep-agent-id': 'agent-1',
          Origin: 'https://help.customer.com',
          'x-inkeep-app-prompt': 'Forwarded from parent agent',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata.appPrompt).toBe('Forwarded from parent agent');
    });
  });
});
