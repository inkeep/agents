import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const { getLatestPasswordResetLinkMock, requestPasswordResetMock, sessionAuthMiddleware } =
  vi.hoisted(() => ({
    getLatestPasswordResetLinkMock: vi.fn(),
    requestPasswordResetMock: vi.fn(),
    sessionAuthMiddleware: vi.fn(),
  }));

// Mock @inkeep/agents-core
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...original,
    getLatestPasswordResetLink: getLatestPasswordResetLinkMock,
  };
});

// Mock env
vi.mock('../../../env.js', () => ({
  env: {
    INKEEP_AGENTS_MANAGE_UI_URL: 'https://app.example.com',
  },
}));

// Mock sessionAuth middleware
vi.mock('../../../middleware/sessionAuth.js', () => ({
  sessionAuth: () => sessionAuthMiddleware,
}));

import passwordResetLinksRoutes from '../../../domains/manage/routes/passwordResetLinks';

describe('Password Reset Links Route', () => {
  const mockAuth = {
    api: {
      requestPasswordReset: requestPasswordResetMock,
    },
  };

  const createAppWithTenantParam = () => {
    const app = new Hono();
    app.route('/tenants/:tenantId/password-reset-links', passwordResetLinksRoutes);
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requestPasswordResetMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /', () => {
    describe('Authorization', () => {
      it('should return 401 when userId is not set', async () => {
        sessionAuthMiddleware.mockImplementation(
          async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
            c.set('auth', mockAuth);
            c.set('tenantRole', 'admin');
            // userId is NOT set
            await next();
          }
        );

        const app = createAppWithTenantParam();
        const res = await app.request('/tenants/tenant-123/password-reset-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com' }),
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.message).toContain('Authentication required');
      });

      it('should return 403 when user is a member (not admin/owner)', async () => {
        sessionAuthMiddleware.mockImplementation(
          async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
            c.set('userId', 'user-123');
            c.set('auth', mockAuth);
            c.set('tenantRole', 'member');
            await next();
          }
        );

        const app = createAppWithTenantParam();
        const res = await app.request('/tenants/tenant-123/password-reset-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com' }),
        });

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error.message).toContain('Admin access required');
      });

      it('should return 403 when tenantRole is not set', async () => {
        sessionAuthMiddleware.mockImplementation(
          async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
            c.set('userId', 'user-123');
            c.set('auth', mockAuth);
            // tenantRole is NOT set
            await next();
          }
        );

        const app = createAppWithTenantParam();
        const res = await app.request('/tenants/tenant-123/password-reset-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com' }),
        });

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error.message).toContain('Admin access required');
      });

      it('should allow admin users', async () => {
        sessionAuthMiddleware.mockImplementation(
          async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
            c.set('userId', 'user-123');
            c.set('auth', mockAuth);
            c.set('tenantRole', 'admin');
            await next();
          }
        );
        getLatestPasswordResetLinkMock.mockReturnValue({
          email: 'test@example.com',
          url: 'https://example.com/reset?token=abc',
          token: 'abc',
          createdAtMs: Date.now(),
        });

        const app = createAppWithTenantParam();
        const res = await app.request('/tenants/tenant-123/password-reset-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com' }),
        });

        expect(res.status).toBe(200);
      });

      it('should allow owner users', async () => {
        sessionAuthMiddleware.mockImplementation(
          async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
            c.set('userId', 'user-123');
            c.set('auth', mockAuth);
            c.set('tenantRole', 'owner');
            await next();
          }
        );
        getLatestPasswordResetLinkMock.mockReturnValue({
          email: 'test@example.com',
          url: 'https://example.com/reset?token=abc',
          token: 'abc',
          createdAtMs: Date.now(),
        });

        const app = createAppWithTenantParam();
        const res = await app.request('/tenants/tenant-123/password-reset-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com' }),
        });

        expect(res.status).toBe(200);
      });
    });

    describe('Validation', () => {
      beforeEach(() => {
        sessionAuthMiddleware.mockImplementation(
          async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
            c.set('userId', 'user-123');
            c.set('auth', mockAuth);
            c.set('tenantRole', 'admin');
            await next();
          }
        );
      });

      it('should return 400 when email is missing', async () => {
        const app = createAppWithTenantParam();
        const res = await app.request('/tenants/tenant-123/password-reset-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.message).toContain('Email is required');
      });

      it('should return 400 when body is invalid JSON', async () => {
        const app = createAppWithTenantParam();
        const res = await app.request('/tenants/tenant-123/password-reset-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid json',
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.message).toContain('Email is required');
      });

      it('should return 500 when auth is not configured', async () => {
        sessionAuthMiddleware.mockImplementation(
          async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
            c.set('userId', 'user-123');
            c.set('tenantRole', 'admin');
            // auth is NOT set
            await next();
          }
        );

        const app = createAppWithTenantParam();
        const res = await app.request('/tenants/tenant-123/password-reset-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com' }),
        });

        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error.message).toContain('Auth not configured');
      });
    });

    describe('Successful requests', () => {
      beforeEach(() => {
        sessionAuthMiddleware.mockImplementation(
          async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
            c.set('userId', 'user-123');
            c.set('auth', mockAuth);
            c.set('tenantRole', 'admin');
            await next();
          }
        );
      });

      it('should call auth.api.requestPasswordReset with correct params', async () => {
        getLatestPasswordResetLinkMock.mockReturnValue({
          email: 'test@example.com',
          url: 'https://app.example.com/reset-password?token=abc',
          token: 'abc',
          createdAtMs: Date.now(),
        });

        const app = createAppWithTenantParam();
        await app.request('/tenants/tenant-123/password-reset-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com' }),
        });

        expect(requestPasswordResetMock).toHaveBeenCalledWith({
          body: {
            email: 'test@example.com',
            redirectTo: 'https://app.example.com/reset-password',
          },
        });
      });

      it('should return the reset link URL', async () => {
        const resetUrl = 'https://app.example.com/reset-password?token=xyz789';
        getLatestPasswordResetLinkMock.mockReturnValue({
          email: 'test@example.com',
          url: resetUrl,
          token: 'xyz789',
          createdAtMs: Date.now(),
        });

        const app = createAppWithTenantParam();
        const res = await app.request('/tenants/tenant-123/password-reset-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com' }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.url).toBe(resetUrl);
      });

      it('should return 500 when reset link is not available', async () => {
        getLatestPasswordResetLinkMock.mockReturnValue(null);

        const app = createAppWithTenantParam();
        const res = await app.request('/tenants/tenant-123/password-reset-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com' }),
        });

        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error.message).toContain('Reset link not available');
      });

      it('should call getLatestPasswordResetLink with correct email and maxAge', async () => {
        getLatestPasswordResetLinkMock.mockReturnValue({
          email: 'specific@example.com',
          url: 'https://app.example.com/reset?token=abc',
          token: 'abc',
          createdAtMs: Date.now(),
        });

        const app = createAppWithTenantParam();
        await app.request('/tenants/tenant-123/password-reset-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'specific@example.com' }),
        });

        expect(getLatestPasswordResetLinkMock).toHaveBeenCalledWith(
          'specific@example.com',
          30_000 // 30 seconds max age
        );
      });
    });

    describe('Error handling', () => {
      it('should handle auth.api.requestPasswordReset errors', async () => {
        sessionAuthMiddleware.mockImplementation(
          async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
            c.set('userId', 'user-123');
            c.set('auth', mockAuth);
            c.set('tenantRole', 'admin');
            await next();
          }
        );
        requestPasswordResetMock.mockRejectedValue(new Error('Email service unavailable'));

        const app = createAppWithTenantParam();
        const res = await app.request('/tenants/tenant-123/password-reset-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com' }),
        });

        expect(res.status).toBe(500);
      });
    });
  });
});
