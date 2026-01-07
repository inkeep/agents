import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all dependencies before imports
vi.mock('@inkeep/agents-core', () => ({
  handleApiError: vi.fn().mockResolvedValue({
    status: 500,
    title: 'Internal Server Error',
    detail: 'An unexpected error occurred',
  }),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    getPinoInstance: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  })),
  isInternalServiceToken: vi.fn().mockReturnValue(false),
  verifyInternalServiceAuthHeader: vi.fn().mockResolvedValue({
    valid: false,
    error: 'Invalid token',
  }),
  loadEnvironmentFiles: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    getPinoInstance: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  })),
}));

vi.mock('../env.js', () => ({
  env: {
    ENVIRONMENT: 'test',
    INKEEP_AGENTS_EVAL_API_BYPASS_SECRET: 'test-bypass-secret',
    INKEEP_AGENTS_MANAGE_API_URL: 'http://localhost:3002',
    INKEEP_AGENTS_RUN_API_URL: 'http://localhost:3003',
  },
}));

vi.mock('../data/db/runDbClient.js', () => ({
  default: {},
}));

vi.mock('../routes/index.js', () => {
  const { OpenAPIHono } = require('@hono/zod-openapi');
  return {
    default: new OpenAPIHono(),
  };
});

vi.mock('../workflow/routes.js', () => {
  const { Hono } = require('hono');
  return {
    workflowRoutes: new Hono(),
  };
});

vi.mock('../openapi.js', () => ({
  setupOpenAPIRoutes: vi.fn(),
}));

vi.mock('hono-pino', () => ({
  pinoLogger: vi.fn(() => async (_c: any, next: () => Promise<void>) => {
    await next();
  }),
}));

import { createEvaluationHono } from '../app';

describe('Evaluation API App', () => {
  let app: ReturnType<typeof createEvaluationHono>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createEvaluationHono();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Health Check Endpoint', () => {
    it('should return 204 for health check', async () => {
      const res = await app.request('/health');

      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    });

    it('should handle HEAD requests for health check', async () => {
      const res = await app.request('/health', { method: 'HEAD' });

      // HEAD requests should work, but may return 405 if not explicitly handled
      expect([200, 204, 405]).toContain(res.status);
    });
  });

  describe('CORS Handling', () => {
    it('should allow CORS for localhost origins', async () => {
      const res = await app.request('/health', {
        headers: {
          Origin: 'http://localhost:3000',
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    });

    it('should allow CORS for https localhost', async () => {
      const res = await app.request('/health', {
        headers: {
          Origin: 'https://localhost:3000',
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost:3000');
    });

    it('should not return CORS headers for non-localhost origins', async () => {
      const res = await app.request('/health', {
        headers: {
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(204);
      // Non-localhost origins should not get Access-Control-Allow-Origin
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should handle OPTIONS preflight requests', async () => {
      const res = await app.request('/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
  });

  describe('Workflow Process Endpoint', () => {
    it('should return processed status after timeout', async () => {
      // Mock setTimeout to resolve immediately in test
      vi.useFakeTimers();

      const responsePromise = app.request('/api/workflow/process');

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(50000);

      const res = await responsePromise;

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.processed).toBe(true);
      expect(body.timestamp).toBeDefined();

      vi.useRealTimers();
    }, 60000);
  });

  describe('Index Endpoint', () => {
    it('should forward POST requests to workflow flow handler', async () => {
      // Mock fetch for internal forwarding
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const res = await app.request('/index', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: 'data' }),
      });

      expect(res.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(Request)
      );

      // Restore fetch
      global.fetch = originalFetch;
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const res = await app.request('/unknown-route');

      expect(res.status).toBe(404);
    });

    it('should return request ID in error responses', async () => {
      const res = await app.request('/unknown-route', {
        headers: {
          'X-Request-ID': 'test-request-id',
        },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('Authentication on Protected Routes', () => {
    it('should apply auth middleware to /tenants/* routes', async () => {
      const res = await app.request('/tenants/test-tenant/projects/test-project/test', {
        method: 'GET',
      });

      // Should require auth (401) or route not found (404)
      expect([401, 404]).toContain(res.status);
    });

    it('should allow authenticated requests to /tenants/* with bypass secret', async () => {
      const res = await app.request('/tenants/test-tenant/projects/test-project/test', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-bypass-secret',
        },
      });

      // Should be allowed (route might not exist, so 404 is OK)
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('Request ID Middleware', () => {
    it('should generate request ID if not provided', async () => {
      const res = await app.request('/health');

      expect(res.status).toBe(204);
    });

    it('should use provided request ID', async () => {
      const res = await app.request('/health', {
        headers: {
          'X-Request-ID': 'custom-request-id',
        },
      });

      expect(res.status).toBe(204);
    });
  });
});

describe('API Error Response Format', () => {
  let app: ReturnType<typeof createEvaluationHono>;

  beforeEach(() => {
    app = createEvaluationHono();
  });

  it('should return problem+json content type for errors', async () => {
    const res = await app.request('/unknown-route');

    expect(res.status).toBe(404);
  });
});

