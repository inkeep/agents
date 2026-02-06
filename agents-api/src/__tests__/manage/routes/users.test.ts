import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const { getUserOrganizationsFromDbMock, getUserProvidersFromDbMock } = vi.hoisted(() => ({
  getUserOrganizationsFromDbMock: vi.fn(),
  getUserProvidersFromDbMock: vi.fn(),
}));

// Mock @inkeep/agents-core
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...original,
    getUserOrganizationsFromDb: () => getUserOrganizationsFromDbMock,
    getUserProvidersFromDb: () => getUserProvidersFromDbMock,
  };
});

// Mock the database client
vi.mock('../../../data/db/runDbClient.js', () => ({
  default: {},
}));

// Mock session auth
vi.mock('../../../middleware/sessionAuth.js', () => ({
  sessionAuth:
    () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      // Default: authenticated user
      c.set('userId', 'test-user-123');
      c.set('userEmail', 'test@example.com');
      await next();
    },
}));

import usersRoutes from '../../../domains/manage/routes/users';

describe('Users Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /:userId/organizations', () => {
    it('should return organizations for the authenticated user', async () => {
      const mockOrgs = [
        {
          id: 'member-1',
          userId: 'test-user-123',
          organizationId: 'org-1',
          role: 'member',
          createdAt: new Date('2024-01-01'),
          organizationName: 'Org One',
          organizationSlug: 'org-one',
        },
        {
          id: 'member-2',
          userId: 'test-user-123',
          organizationId: 'org-2',
          role: 'admin',
          createdAt: new Date('2024-01-02'),
          organizationName: 'Org Two',
          organizationSlug: 'org-two',
        },
      ];
      getUserOrganizationsFromDbMock.mockResolvedValue(mockOrgs);

      const res = await usersRoutes.request('/test-user-123/organizations');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0].organizationName).toBe('Org One');
      expect(body[0].role).toBe('member');
      expect(body[1].organizationName).toBe('Org Two');
      expect(body[1].role).toBe('admin');
      // Dates should be converted to ISO strings
      expect(body[0].createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should return 403 when requesting organizations for a different user', async () => {
      const res = await usersRoutes.request('/different-user-456/organizations');

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.message).toContain("Cannot access another user's organizations");
    });

    it('should return empty array when user has no organizations', async () => {
      getUserOrganizationsFromDbMock.mockResolvedValue([]);

      const res = await usersRoutes.request('/test-user-123/organizations');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('should call getUserOrganizationsFromDb with correct userId', async () => {
      getUserOrganizationsFromDbMock.mockResolvedValue([]);

      await usersRoutes.request('/test-user-123/organizations');

      expect(getUserOrganizationsFromDbMock).toHaveBeenCalledWith('test-user-123');
    });
  });

  describe('POST /providers', () => {
    const orgId = 'org-123';

    const mockAdminOrgAccess = [{ organizationId: orgId, role: 'admin', userId: 'test-user-123' }];

    const mockOwnerOrgAccess = [{ organizationId: orgId, role: 'owner', userId: 'test-user-123' }];

    const mockMemberOrgAccess = [
      { organizationId: orgId, role: 'member', userId: 'test-user-123' },
    ];

    describe('Authorization', () => {
      it('should return 400 when organizationId is missing', async () => {
        const res = await usersRoutes.request('/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: ['user-1'] }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.message).toContain('organizationId is required');
      });

      it('should return 403 when user is not a member of the organization', async () => {
        getUserOrganizationsFromDbMock.mockResolvedValue([]);

        const res = await usersRoutes.request('/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: ['user-1'], organizationId: orgId }),
        });

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error.message).toContain('Access denied to this organization');
      });

      it('should return 403 when user is a member (not admin/owner)', async () => {
        getUserOrganizationsFromDbMock.mockResolvedValue(mockMemberOrgAccess);

        const res = await usersRoutes.request('/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: ['user-1'], organizationId: orgId }),
        });

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error.message).toContain('Admin access required');
      });

      it('should allow admin users', async () => {
        getUserOrganizationsFromDbMock.mockResolvedValue(mockAdminOrgAccess);
        getUserProvidersFromDbMock.mockResolvedValue([]);

        const res = await usersRoutes.request('/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: ['user-1'], organizationId: orgId }),
        });

        expect(res.status).toBe(200);
      });

      it('should allow owner users', async () => {
        getUserOrganizationsFromDbMock.mockResolvedValue(mockOwnerOrgAccess);
        getUserProvidersFromDbMock.mockResolvedValue([]);

        const res = await usersRoutes.request('/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: ['user-1'], organizationId: orgId }),
        });

        expect(res.status).toBe(200);
      });
    });

    describe('Functionality', () => {
      beforeEach(() => {
        getUserOrganizationsFromDbMock.mockResolvedValue(mockAdminOrgAccess);
      });

      it('should return providers for requested user IDs', async () => {
        const mockProviders = [
          { userId: 'user-1', providers: ['credential', 'google'] },
          { userId: 'user-2', providers: ['credential'] },
        ];
        getUserProvidersFromDbMock.mockResolvedValue(mockProviders);

        const res = await usersRoutes.request('/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: ['user-1', 'user-2'], organizationId: orgId }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual(mockProviders);
      });

      it('should return 400 when userIds is missing', async () => {
        const res = await usersRoutes.request('/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId: orgId }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.message).toContain('userIds array is required');
      });

      it('should return 400 when userIds is not an array', async () => {
        const res = await usersRoutes.request('/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: 'not-an-array', organizationId: orgId }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.message).toContain('userIds array is required');
      });

      it('should return empty array when userIds is empty', async () => {
        const res = await usersRoutes.request('/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: [], organizationId: orgId }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual([]);
        expect(getUserProvidersFromDbMock).not.toHaveBeenCalled();
      });

      it('should call getUserProvidersFromDb with correct userIds', async () => {
        getUserProvidersFromDbMock.mockResolvedValue([]);

        await usersRoutes.request('/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: ['user-1', 'user-2', 'user-3'], organizationId: orgId }),
        });

        expect(getUserProvidersFromDbMock).toHaveBeenCalledWith(['user-1', 'user-2', 'user-3']);
      });

      it('should handle database errors gracefully', async () => {
        getUserProvidersFromDbMock.mockRejectedValue(new Error('Database connection failed'));

        const res = await usersRoutes.request('/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: ['user-1'], organizationId: orgId }),
        });

        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error.message).toContain('Failed to fetch user providers');
      });

      it('should handle single user request', async () => {
        const mockProviders = [{ userId: 'user-1', providers: ['credential'] }];
        getUserProvidersFromDbMock.mockResolvedValue(mockProviders);

        const res = await usersRoutes.request('/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: ['user-1'], organizationId: orgId }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual(mockProviders);
      });

      it('should handle users with no providers', async () => {
        const mockProviders = [
          { userId: 'user-1', providers: [] },
          { userId: 'user-2', providers: [] },
        ];
        getUserProvidersFromDbMock.mockResolvedValue(mockProviders);

        const res = await usersRoutes.request('/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: ['user-1', 'user-2'], organizationId: orgId }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body[0].providers).toEqual([]);
        expect(body[1].providers).toEqual([]);
      });
    });
  });
});
