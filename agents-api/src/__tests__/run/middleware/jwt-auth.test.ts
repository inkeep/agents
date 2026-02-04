import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const {
  canUseProjectStrictMock,
  verifyTempTokenMock,
  validateAndGetApiKeyMock,
  verifyServiceTokenMock,
} = vi.hoisted(() => ({
  canUseProjectStrictMock: vi.fn(),
  verifyTempTokenMock: vi.fn(),
  validateAndGetApiKeyMock: vi.fn(),
  verifyServiceTokenMock: vi.fn(),
}));

// Mock the dependencies before imports
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...original,
    canUseProjectStrict: canUseProjectStrictMock,
    verifyTempToken: verifyTempTokenMock,
    validateAndGetApiKey: validateAndGetApiKeyMock,
    verifyServiceToken: verifyServiceTokenMock,
    getLogger: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  };
});

vi.mock('../../../env.js', () => ({
  env: {
    INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY: 'dGVzdC1wdWJsaWMta2V5', // base64 encoded test key
    INKEEP_AGENTS_RUN_API_BYPASS_SECRET: 'test-bypass-secret',
  },
}));

import { Hono } from 'hono';
import { runApiKeyAuth } from '../../../middleware/runAuth';
import type { AppVariables } from '../../../types/app';

describe('JWT + SpiceDB Authorization', () => {
  let app: Hono<{ Variables: AppVariables }>;
  const originalEnv = process.env.ENVIRONMENT;

  // Sample JWT-like token (starts with eyJ)
  const mockJwtToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0ZXN0IjoidG9rZW4ifQ.signature';

  // Sample verified payload
  const mockVerifiedPayload = {
    tenantId: 'test-tenant',
    projectId: 'test-project',
    agentId: 'test-agent',
    type: 'temporary' as const,
    initiatedBy: { type: 'user' as const, id: 'user-123' },
    sub: 'user-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono<{ Variables: AppVariables }>();
    process.env.ENVIRONMENT = 'production';

    // Default: JWT verification succeeds
    verifyTempTokenMock.mockResolvedValue(mockVerifiedPayload);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.ENVIRONMENT = originalEnv;
  });

  describe('JWT with SpiceDB permission check', () => {
    it('should allow access when user has use permission on project', async () => {
      // SpiceDB returns true - user has permission
      canUseProjectStrictMock.mockResolvedValue(true);

      app.use('*', runApiKeyAuth());
      app.get('/test', (c) => {
        const ctx = c.get('executionContext' as never) as Record<string, unknown>;
        return c.json({
          success: true,
          tenantId: ctx.tenantId,
          projectId: ctx.projectId,
          userId: (ctx.metadata as { initiatedBy?: { id: string } })?.initiatedBy?.id,
        });
      });

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${mockJwtToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.tenantId).toBe('test-tenant');
      expect(body.projectId).toBe('test-project');
      expect(body.userId).toBe('user-123');

      // Verify SpiceDB was called with correct params
      expect(canUseProjectStrictMock).toHaveBeenCalledWith({
        userId: 'user-123',
        projectId: 'test-project',
      });
    });

    it('should deny access with 403 when user lacks use permission', async () => {
      // SpiceDB returns false - user does NOT have permission
      canUseProjectStrictMock.mockResolvedValue(false);

      app.use('*', runApiKeyAuth());
      app.get('/test', (c) => c.text('OK'));

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${mockJwtToken}`,
        },
      });

      expect(res.status).toBe(403);
      const body = await res.text();
      expect(body).toContain('Access denied');
      expect(body).toContain('insufficient permissions');

      // SpiceDB should have been called
      expect(canUseProjectStrictMock).toHaveBeenCalledWith({
        userId: 'user-123',
        projectId: 'test-project',
      });
    });

    it('should deny access with 403 when user has view-only permission (no use)', async () => {
      // Simulate a user with view permission but not use permission
      const viewOnlyUser = {
        ...mockVerifiedPayload,
        sub: 'viewer-user-456',
        initiatedBy: { type: 'user' as const, id: 'viewer-user-456' },
      };
      verifyTempTokenMock.mockResolvedValue(viewOnlyUser);
      canUseProjectStrictMock.mockResolvedValue(false);

      app.use('*', runApiKeyAuth());
      app.get('/test', (c) => c.text('OK'));

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${mockJwtToken}`,
        },
      });

      expect(res.status).toBe(403);

      // SpiceDB should check for the viewer user
      expect(canUseProjectStrictMock).toHaveBeenCalledWith({
        userId: 'viewer-user-456',
        projectId: 'test-project',
      });
    });
  });

  describe('JWT with missing required fields', () => {
    it('should return 400 when JWT is missing projectId', async () => {
      const incompletePayload = {
        tenantId: 'test-tenant',
        agentId: 'test-agent',
        type: 'temporary' as const,
        initiatedBy: { type: 'user' as const, id: 'user-123' },
        sub: 'user-123',
        // Note: no projectId
      };
      verifyTempTokenMock.mockResolvedValue(incompletePayload);

      app.use('*', runApiKeyAuth());
      app.get('/test', (c) => c.text('OK'));

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${mockJwtToken}`,
        },
      });

      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toContain('missing projectId or agentId');

      // SpiceDB should NOT be called (validation failed first)
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
    });

    it('should return 400 when JWT is missing agentId', async () => {
      const incompletePayload = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        type: 'temporary' as const,
        initiatedBy: { type: 'user' as const, id: 'user-123' },
        sub: 'user-123',
        // Note: no agentId
      };
      verifyTempTokenMock.mockResolvedValue(incompletePayload);

      app.use('*', runApiKeyAuth());
      app.get('/test', (c) => c.text('OK'));

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${mockJwtToken}`,
        },
      });

      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toContain('missing projectId or agentId');

      // SpiceDB should NOT be called (validation failed first)
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
    });
  });

  describe('JWT verification failures (fallback to other auth)', () => {
    it('should try other auth methods when JWT verification fails', async () => {
      // JWT verification throws an error (bad signature, expired, etc.)
      verifyTempTokenMock.mockRejectedValue(new Error('Invalid signature'));

      // API key auth also fails
      validateAndGetApiKeyMock.mockResolvedValue(null);

      // Team agent token also fails
      verifyServiceTokenMock.mockResolvedValue({
        valid: false,
        error: 'Invalid token',
      });

      app.use('*', runApiKeyAuth());
      app.get('/test', (c) => c.text('OK'));

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${mockJwtToken}`,
        },
      });

      // Should get 401 after all auth methods fail
      expect(res.status).toBe(401);

      // SpiceDB should NOT have been called (JWT verification failed first)
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
    });

    it('should return 401 for expired JWT tokens', async () => {
      verifyTempTokenMock.mockRejectedValue(new Error('Token has expired'));
      validateAndGetApiKeyMock.mockResolvedValue(null);
      verifyServiceTokenMock.mockResolvedValue({ valid: false, error: 'Invalid' });

      app.use('*', runApiKeyAuth());
      app.get('/test', (c) => c.text('OK'));

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${mockJwtToken}`,
        },
      });

      expect(res.status).toBe(401);
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
    });

    it('should return 401 for malformed JWT tokens', async () => {
      verifyTempTokenMock.mockRejectedValue(new Error('Malformed token'));
      validateAndGetApiKeyMock.mockResolvedValue(null);
      verifyServiceTokenMock.mockResolvedValue({ valid: false, error: 'Invalid' });

      app.use('*', runApiKeyAuth());
      app.get('/test', (c) => c.text('OK'));

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${mockJwtToken}`,
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Backward compatibility - Regular API keys', () => {
    it('should allow access with valid API key (no SpiceDB check)', async () => {
      const regularApiKey = 'sk_test_1234567890abcdef1234567890';

      // JWT verification should not be attempted (doesn't start with eyJ)
      // API key validation succeeds
      validateAndGetApiKeyMock.mockResolvedValue({
        id: 'key-123',
        key: regularApiKey,
        tenantId: 'api-key-tenant',
        projectId: 'api-key-project',
        agentId: 'api-key-agent',
      });

      app.use('*', runApiKeyAuth());
      app.get('/test', (c) => {
        const ctx = c.get('executionContext' as never) as Record<string, unknown>;
        return c.json({
          success: true,
          tenantId: ctx.tenantId,
          apiKeyId: ctx.apiKeyId,
        });
      });

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${regularApiKey}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.tenantId).toBe('api-key-tenant');
      expect(body.apiKeyId).toBe('key-123');

      // SpiceDB should NOT be called for API key auth
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();

      // JWT verification should NOT be called (token doesn't start with eyJ)
      expect(verifyTempTokenMock).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should return 500 when SpiceDB is unavailable', async () => {
      // SpiceDB throws an error (e.g., connection failed)
      canUseProjectStrictMock.mockRejectedValue(new Error('SpiceDB connection failed'));

      app.use('*', runApiKeyAuth());
      app.get('/test', (c) => c.text('OK'));

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${mockJwtToken}`,
        },
      });

      // SpiceDB errors are infrastructure failures, not auth failures
      // Should return 503 Service Unavailable
      expect(res.status).toBe(503);
    });

    it('should deny access when JWT is valid but sub claim is missing', async () => {
      // JWT payload missing sub claim
      verifyTempTokenMock.mockRejectedValue(new Error('Invalid token: missing subject claim'));
      validateAndGetApiKeyMock.mockResolvedValue(null);
      verifyServiceTokenMock.mockResolvedValue({ valid: false, error: 'Invalid' });

      app.use('*', runApiKeyAuth());
      app.get('/test', (c) => c.text('OK'));

      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${mockJwtToken}`,
        },
      });

      expect(res.status).toBe(401);
      expect(canUseProjectStrictMock).not.toHaveBeenCalled();
    });
  });
});
