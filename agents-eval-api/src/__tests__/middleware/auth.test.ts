import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const { isInternalServiceTokenMock, verifyInternalServiceAuthHeaderMock } = vi.hoisted(() => ({
  isInternalServiceTokenMock: vi.fn(),
  verifyInternalServiceAuthHeaderMock: vi.fn(),
}));

// Mock dependencies before imports
vi.mock('@inkeep/agents-core', () => ({
  isInternalServiceToken: isInternalServiceTokenMock,
  verifyInternalServiceAuthHeader: verifyInternalServiceAuthHeaderMock,
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../env.js', () => ({
  env: {
    ENVIRONMENT: 'production' as string,
    INKEEP_AGENTS_EVAL_API_BYPASS_SECRET: undefined as string | undefined,
  },
}));

vi.mock('../../logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { Hono } from 'hono';
import { env } from '../../env';
import { apiKeyAuth } from '../../middleware/auth';

describe('API Key Authentication Middleware', () => {
  let app: Hono;
  const originalEnv = process.env.ENVIRONMENT;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    process.env.ENVIRONMENT = 'production';
    env.ENVIRONMENT = 'production';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.ENVIRONMENT = originalEnv;
  });

  describe('apiKeyAuth middleware', () => {
    it('should reject requests without authorization header in production', async () => {
      env.ENVIRONMENT = 'production';
      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/');

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Missing or invalid authorization header');
    });

    it('should allow requests without auth header in development', async () => {
      env.ENVIRONMENT = 'development';
      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/');

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toBe('OK');
    });

    it('should reject requests with invalid authorization header format', async () => {
      env.ENVIRONMENT = 'production';
      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Basic sometoken',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Missing or invalid authorization header');
    });

    it('should accept requests with valid bypass secret', async () => {
      env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET = 'test-bypass-secret';
      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer test-bypass-secret',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toBe('OK');
    });

    it('should accept valid internal service token', async () => {
      env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET = undefined;
      isInternalServiceTokenMock.mockReturnValue(true);
      verifyInternalServiceAuthHeaderMock.mockResolvedValue({
        valid: true,
        payload: {
          sub: 'inkeep-agents-manage-api',
          tenantId: 'test-tenant',
          projectId: 'test-project',
        },
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer internal-service-token',
        },
      });

      expect(res.status).toBe(200);
      expect(isInternalServiceTokenMock).toHaveBeenCalledWith('internal-service-token');
      expect(verifyInternalServiceAuthHeaderMock).toHaveBeenCalledWith(
        'Bearer internal-service-token'
      );
    });

    it('should reject invalid internal service token', async () => {
      env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET = undefined;
      env.ENVIRONMENT = 'production';
      isInternalServiceTokenMock.mockReturnValue(true);
      verifyInternalServiceAuthHeaderMock.mockResolvedValue({
        valid: false,
        error: 'Invalid signature',
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer invalid-internal-token',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid signature');
    });

    it('should allow invalid token in development environment', async () => {
      env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET = undefined;
      env.ENVIRONMENT = 'development';
      isInternalServiceTokenMock.mockReturnValue(false);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer random-token',
        },
      });

      expect(res.status).toBe(200);
    });

    it('should reject invalid token in production environment', async () => {
      env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET = undefined;
      env.ENVIRONMENT = 'production';
      isInternalServiceTokenMock.mockReturnValue(false);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid Token');
    });

    it('should prioritize bypass secret over internal service validation', async () => {
      env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET = 'test-bypass-secret';
      isInternalServiceTokenMock.mockReturnValue(true);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer test-bypass-secret',
        },
      });

      expect(res.status).toBe(200);
      expect(verifyInternalServiceAuthHeaderMock).not.toHaveBeenCalled();
    });
  });

  describe('authentication flow order', () => {
    it('should check bypass secret first, then internal service token', async () => {
      env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET = 'bypass-secret';
      isInternalServiceTokenMock.mockReturnValue(true);
      verifyInternalServiceAuthHeaderMock.mockResolvedValue({
        valid: true,
        payload: { sub: 'service' },
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      // Test with bypass secret
      let res = await app.request('/', {
        headers: {
          Authorization: 'Bearer bypass-secret',
        },
      });
      expect(res.status).toBe(200);
      expect(isInternalServiceTokenMock).not.toHaveBeenCalled();

      // Reset and test with internal service token
      vi.clearAllMocks();
      res = await app.request('/', {
        headers: {
          Authorization: 'Bearer internal-token',
        },
      });
      expect(res.status).toBe(200);
      expect(isInternalServiceTokenMock).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty bearer token', async () => {
      env.ENVIRONMENT = 'production';
      env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET = undefined;
      isInternalServiceTokenMock.mockReturnValue(false);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer ',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should handle whitespace-only bearer token', async () => {
      env.ENVIRONMENT = 'production';
      env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET = undefined;
      isInternalServiceTokenMock.mockReturnValue(false);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer    ',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should handle missing payload in valid internal service response', async () => {
      env.ENVIRONMENT = 'production';
      env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET = undefined;
      isInternalServiceTokenMock.mockReturnValue(true);
      verifyInternalServiceAuthHeaderMock.mockResolvedValue({
        valid: true,
        payload: null,
      });

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer token-with-null-payload',
        },
      });

      expect(res.status).toBe(401);
    });
  });
});
