import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const { getPendingInvitationsByEmailMock, listUserInvitationsMock } = vi.hoisted(() => ({
  getPendingInvitationsByEmailMock: vi.fn(),
  listUserInvitationsMock: vi.fn(),
}));

// Mock @inkeep/agents-core
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...original,
    getPendingInvitationsByEmail: () => getPendingInvitationsByEmailMock,
    createApiError: original.createApiError,
  };
});

// Mock the database client
vi.mock('../../../data/db/runDbClient.js', () => ({
  default: {},
}));

import invitationsRoutes from '../../../domains/manage/routes/invitations';

describe('Invitations Route', () => {
  const mockAuth = {
    api: {
      listUserInvitations: listUserInvitationsMock,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /verify', () => {
    it('should return 400 when email is missing', async () => {
      const res = await invitationsRoutes.request('/verify?id=inv-123');

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('Email parameter is required');
    });

    it('should return 400 when invitation ID is missing', async () => {
      const res = await invitationsRoutes.request('/verify?email=test@example.com');

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('Invitation ID parameter is required');
    });

    it('should return 500 when auth is not configured', async () => {
      const res = await invitationsRoutes.request('/verify?email=test@example.com&id=inv-123');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toContain('Auth not configured');
    });

    describe('with auth configured', () => {
      const makeRequestWithAuth = async (url: string, invitations: unknown[] = []) => {
        listUserInvitationsMock.mockResolvedValue(invitations);

        // We need to set up auth in context - this requires using the app with middleware
        // For this test, we'll create a custom test app that sets auth
        const { Hono } = await import('hono');
        type TestVariables = { auth: typeof mockAuth };
        const app = new Hono<{ Variables: TestVariables }>();

        // Middleware to inject auth
        app.use('*', async (c, next) => {
          c.set('auth', mockAuth);
          await next();
        });

        // Mount the invitations routes
        app.route('/', invitationsRoutes);

        return app.request(url);
      };

      it('should return 404 when invitation is not found', async () => {
        const res = await makeRequestWithAuth(
          '/verify?email=test@example.com&id=inv-123',
          [] // No invitations returned
        );

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error.message).toContain('Invitation not found');
      });

      it('should return 404 when invitation exists but has wrong id', async () => {
        const res = await makeRequestWithAuth('/verify?email=test@example.com&id=wrong-id', [
          {
            id: 'inv-123',
            email: 'test@example.com',
            status: 'pending',
            expiresAt: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
            organizationId: 'org-123',
            organizationName: 'Test Org',
            role: 'member',
          },
        ]);

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error.message).toContain('Invitation not found');
      });

      it('should return 404 when invitation is not pending', async () => {
        const res = await makeRequestWithAuth('/verify?email=test@example.com&id=inv-123', [
          {
            id: 'inv-123',
            email: 'test@example.com',
            status: 'accepted', // Not pending
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            organizationId: 'org-123',
            organizationName: 'Test Org',
            role: 'member',
          },
        ]);

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error.message).toContain('Invitation is no longer valid');
      });

      it('should return 404 when invitation has expired', async () => {
        const res = await makeRequestWithAuth('/verify?email=test@example.com&id=inv-123', [
          {
            id: 'inv-123',
            email: 'test@example.com',
            status: 'pending',
            expiresAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago (expired)
            organizationId: 'org-123',
            organizationName: 'Test Org',
            role: 'member',
          },
        ]);

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error.message).toContain('Invitation has expired');
      });

      it('should return valid invitation info for pending, non-expired invitation', async () => {
        const futureDate = new Date(Date.now() + 86400000).toISOString();
        const res = await makeRequestWithAuth('/verify?email=test@example.com&id=inv-123', [
          {
            id: 'inv-123',
            email: 'test@example.com',
            status: 'pending',
            expiresAt: futureDate,
            organizationId: 'org-123',
            organizationName: 'Test Org',
            role: 'member',
          },
        ]);

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.valid).toBe(true);
        expect(body.email).toBe('test@example.com');
        expect(body.organizationName).toBe('Test Org');
        expect(body.organizationId).toBe('org-123');
        expect(body.role).toBe('member');
        expect(body.expiresAt).toBe(futureDate);
      });

      it('should handle invitation with no organizationName', async () => {
        const futureDate = new Date(Date.now() + 86400000).toISOString();
        const res = await makeRequestWithAuth('/verify?email=test@example.com&id=inv-123', [
          {
            id: 'inv-123',
            email: 'test@example.com',
            status: 'pending',
            expiresAt: futureDate,
            organizationId: 'org-123',
            // organizationName is missing
            role: 'admin',
          },
        ]);

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.valid).toBe(true);
        expect(body.organizationName).toBeNull();
      });

      it('should verify auth listUserInvitations is called with correct email', async () => {
        const futureDate = new Date(Date.now() + 86400000).toISOString();
        await makeRequestWithAuth('/verify?email=specific@example.com&id=inv-123', [
          {
            id: 'inv-123',
            email: 'specific@example.com',
            status: 'pending',
            expiresAt: futureDate,
            organizationId: 'org-123',
            organizationName: 'Test Org',
            role: 'member',
          },
        ]);

        expect(listUserInvitationsMock).toHaveBeenCalledWith({
          query: { email: 'specific@example.com' },
        });
      });

      it('should handle auth API errors gracefully', async () => {
        listUserInvitationsMock.mockRejectedValue(new Error('Auth service unavailable'));

        const { Hono } = await import('hono');
        type TestVariables = { auth: typeof mockAuth };
        const app = new Hono<{ Variables: TestVariables }>();
        app.use('*', async (c, next) => {
          c.set('auth', mockAuth);
          await next();
        });
        app.route('/', invitationsRoutes);

        const res = await app.request('/verify?email=test@example.com&id=inv-123');

        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error.message).toContain('Failed to validate invitation');
      });
    });
  });

  describe('GET /pending', () => {
    describe('without authentication', () => {
      it('should return 401 when not authenticated', async () => {
        const res = await invitationsRoutes.request('/pending?email=test@example.com');

        expect(res.status).toBe(401);
      });
    });
  });
});
