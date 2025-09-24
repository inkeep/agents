import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const { validateAndGetApiKeyMock, updateApiKeyLastUsedMock } = vi.hoisted(() => ({
  validateAndGetApiKeyMock: vi.fn(),
  updateApiKeyLastUsedMock: vi.fn(),
}));

// Mock the dependencies before imports
vi.mock('@inkeep/agents-core', () => ({
  validateAndGetApiKey: validateAndGetApiKeyMock,
  updateApiKeyLastUsed: updateApiKeyLastUsedMock,
  getLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { type ApiKeySelect, validateAndGetApiKey } from '@inkeep/agents-core';
import { Hono } from 'hono';
import { env } from '../../env';
import { apiKeyAuth, optionalAuth } from '../../middleware/api-key-auth';

vi.mock('../../data/db/dbClient.js', () => ({
  default: {},
}));

vi.mock('../../env.js', () => ({
  env: {
    INKEEP_AGENTS_RUN_API_BYPASS_SECRET: undefined as string | undefined,
  },
}));

describe('API Key Authentication Middleware', () => {
  let app: Hono;
  const originalEnv = process.env.ENVIRONMENT;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    // Override the test environment to allow proper testing
    process.env.ENVIRONMENT = 'production';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore the original environment
    process.env.ENVIRONMENT = originalEnv;
  });

  describe('apiKeyAuth middleware', () => {
    it('should reject requests without authorization header', async () => {
      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/');

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Missing or invalid authorization header');
    });

    it('should reject requests with invalid authorization header format', async () => {
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

    it('should reject requests with short API key', async () => {
      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer short',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid API key format');
    });

    it('should reject invalid or expired API keys', async () => {
      vi.mocked(validateAndGetApiKey).mockResolvedValueOnce(null);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer sk_test_1234567890abcdef.verylongsecretkey',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid or expired API key');
      expect(validateAndGetApiKeyMock).toHaveBeenCalledWith(
        'sk_test_1234567890abcdef.verylongsecretkey',
        expect.any(Object)
      );
    });

    it('should accept valid API keys and set execution context', async () => {
      const mockApiKey: ApiKeySelect = {
        id: 'key_123',
        name: 'test-api-key',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        graphId: 'graph_123',
        publicId: 'pub_123',
        keyHash: 'hash_123',
        keyPrefix: 'sk_test_',
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      validateAndGetApiKeyMock.mockResolvedValueOnce(mockApiKey);
      updateApiKeyLastUsedMock.mockReturnValue(vi.fn().mockResolvedValue(undefined));

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer sk_test_1234567890abcdef.verylongsecretkey',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        apiKey: 'sk_test_1234567890abcdef.verylongsecretkey',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        graphId: 'graph_123',
        apiKeyId: 'key_123',
        baseUrl: expect.stringContaining('http'),
      });
      expect(validateAndGetApiKeyMock).toHaveBeenCalledWith(
        'sk_test_1234567890abcdef.verylongsecretkey',
        expect.any(Object)
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      vi.mocked(validateAndGetApiKey).mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer sk_test_1234567890abcdef.verylongsecretkey',
        },
      });

      expect(res.status).toBe(500);
      const body = await res.text();
      expect(body).toContain('Authentication failed');
    });
  });

  describe('apiKeyAuth middleware with bypass secret', () => {
    beforeEach(() => {
      // Set the bypass secret
      env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET = 'test-bypass-secret';
    });

    afterEach(() => {
      // Clear the bypass secret
      env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET = undefined;
    });

    it('should accept requests with valid bypass secret', async () => {
      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer test-bypass-secret',
          'x-inkeep-tenant-id': 'tenant-123',
          'x-inkeep-project-id': 'project-456',
          'x-inkeep-graph-id': 'graph-789',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        apiKey: 'test-bypass-secret',
        tenantId: 'tenant-123',
        projectId: 'project-456',
        graphId: 'graph-789',
        apiKeyId: 'bypass',
        baseUrl: expect.stringContaining('http'),
      });
    });

    it('should validate API key against database when token does not match bypass secret', async () => {
      const mockApiKey: ApiKeySelect = {
        id: 'key_456',
        name: 'test-api-key',
        tenantId: 'tenant_456',
        projectId: 'project_456',
        graphId: 'graph_456',
        publicId: 'pub_456',
        keyHash: 'hash_456',
        keyPrefix: 'sk_prod_',
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      validateAndGetApiKeyMock.mockResolvedValueOnce(mockApiKey);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json(executionContext);
      });

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer sk_prod_differentkey123456.verylongsecretkey',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        apiKey: 'sk_prod_differentkey123456.verylongsecretkey',
        tenantId: 'tenant_456',
        projectId: 'project_456',
        graphId: 'graph_456',
        apiKeyId: 'key_456',
      });
      expect(validateAndGetApiKey).toHaveBeenCalledWith(
        'sk_prod_differentkey123456.verylongsecretkey',
        expect.any(Object)
      );
    });

    it('should reject invalid API key when bypass secret is set but key does not match', async () => {
      vi.mocked(validateAndGetApiKey).mockResolvedValueOnce(null);

      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer invalid_key_not_matching_bypass',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid or expired API key');
      expect(validateAndGetApiKey).toHaveBeenCalledWith(
        'invalid_key_not_matching_bypass',
        expect.any(Object)
      );
    });

    it('should reject bypass secret without required headers', async () => {
      app.use('*', apiKeyAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer test-bypass-secret',
          // Missing x-inkeep-tenant-id, x-inkeep-project-id, x-inkeep-graph-id
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Missing or invalid tenant, project, or graph ID');
    });
  });

  describe('optionalAuth middleware', () => {
    it('should continue without auth when no header is present', async () => {
      app.use('*', optionalAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json({ hasAuth: !!executionContext });
      });

      const res = await app.request('/');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.hasAuth).toBe(false);
    });

    it('should validate API key when header is present', async () => {
      const mockApiKey: ApiKeySelect = {
        id: 'key_123',
        name: 'test-api-key',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        graphId: 'graph_123',
        publicId: 'pub_123',
        keyHash: 'hash_123',
        keyPrefix: 'sk_test_',
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      validateAndGetApiKeyMock.mockResolvedValueOnce(mockApiKey);
      updateApiKeyLastUsedMock.mockReturnValue(vi.fn().mockResolvedValue(undefined));

      app.use('*', optionalAuth());
      app.get('/', (c) => {
        const executionContext = (c as any).get('executionContext');
        return c.json({
          hasAuth: !!executionContext,
          context: executionContext,
        });
      });

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer sk_test_1234567890abcdef.verylongsecretkey',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.hasAuth).toBe(true);
      expect(body.context).toMatchObject({
        apiKey: 'sk_test_1234567890abcdef.verylongsecretkey',
        tenantId: 'tenant_123',
        projectId: 'project_123',
        graphId: 'graph_123',
        apiKeyId: 'key_123',
        baseUrl: expect.stringContaining('http'),
      });
    });

    it('should reject invalid API key when header is present', async () => {
      vi.mocked(validateAndGetApiKey).mockResolvedValueOnce(null);

      app.use('*', optionalAuth());
      app.get('/', (c) => c.text('OK'));

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer invalid_key',
        },
      });

      expect(res.status).toBe(401);
      const body = await res.text();
      expect(body).toContain('Invalid API key format');
    });
  });
});
