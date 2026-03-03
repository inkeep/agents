import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserProfileMock, upsertUserProfileMock } = vi.hoisted(() => ({
  getUserProfileMock: vi.fn(),
  upsertUserProfileMock: vi.fn(),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...original,
    getUserProfile: () => getUserProfileMock,
    upsertUserProfile: () => upsertUserProfileMock,
  };
});

vi.mock('../../../data/db/runDbClient.js', () => ({
  default: {},
}));

vi.mock('../../../middleware/sessionAuth.js', () => ({
  sessionAuth:
    () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      c.set('userId', 'test-user-123');
      c.set('userEmail', 'test@example.com');
      await next();
    },
}));

import userProfileRoutes from '../../../domains/manage/routes/userProfile';

const mockProfile = {
  id: 'profile-1',
  userId: 'test-user-123',
  timezone: 'America/New_York',
  attributes: { theme: 'dark' },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('User Profile Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /{userId}/profile', () => {
    describe('Authorization', () => {
      it('should return 403 when requesting a different user\'s profile', async () => {
        const res = await userProfileRoutes.request('/other-user-456/profile');

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error.message).toContain("Cannot access another user's profile");
        expect(getUserProfileMock).not.toHaveBeenCalled();
      });

      it('should allow access to own profile', async () => {
        getUserProfileMock.mockResolvedValue(mockProfile);

        const res = await userProfileRoutes.request('/test-user-123/profile');

        expect(res.status).toBe(200);
      });
    });

    describe('Auto-creation', () => {
      it('should create a profile when none exists', async () => {
        getUserProfileMock.mockResolvedValue(null);
        const newProfile = { ...mockProfile, timezone: null, attributes: {} };
        upsertUserProfileMock.mockResolvedValue(newProfile);

        const res = await userProfileRoutes.request('/test-user-123/profile');

        expect(res.status).toBe(200);
        expect(upsertUserProfileMock).toHaveBeenCalledWith('test-user-123', {
          timezone: null,
          attributes: {},
        });
        const body = await res.json();
        expect(body.userId).toBe('test-user-123');
      });
    });

    describe('Functionality', () => {
      it('should return the existing profile', async () => {
        getUserProfileMock.mockResolvedValue(mockProfile);

        const res = await userProfileRoutes.request('/test-user-123/profile');

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({
          id: 'profile-1',
          userId: 'test-user-123',
          timezone: 'America/New_York',
          attributes: { theme: 'dark' },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });
      });

      it('should default attributes to empty object when null', async () => {
        getUserProfileMock.mockResolvedValue({ ...mockProfile, attributes: null });

        const res = await userProfileRoutes.request('/test-user-123/profile');

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.attributes).toEqual({});
      });
    });
  });

  describe('PUT /{userId}/profile', () => {
    describe('Authorization', () => {
      it('should return 403 when updating a different user\'s profile', async () => {
        const res = await userProfileRoutes.request('/other-user-456/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: 'America/Chicago' }),
        });

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error.message).toContain("Cannot update another user's profile");
        expect(upsertUserProfileMock).not.toHaveBeenCalled();
      });

      it('should allow updating own profile', async () => {
        upsertUserProfileMock.mockResolvedValue(mockProfile);

        const res = await userProfileRoutes.request('/test-user-123/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: 'America/New_York' }),
        });

        expect(res.status).toBe(200);
      });
    });

    describe('Functionality', () => {
      it('should upsert with timezone', async () => {
        const updated = { ...mockProfile, timezone: 'Europe/London' };
        upsertUserProfileMock.mockResolvedValue(updated);

        const res = await userProfileRoutes.request('/test-user-123/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: 'Europe/London' }),
        });

        expect(res.status).toBe(200);
        expect(upsertUserProfileMock).toHaveBeenCalledWith('test-user-123', {
          timezone: 'Europe/London',
          attributes: {},
        });
        const body = await res.json();
        expect(body.timezone).toBe('Europe/London');
      });

      it('should upsert with attributes', async () => {
        const updated = { ...mockProfile, attributes: { lang: 'en' } };
        upsertUserProfileMock.mockResolvedValue(updated);

        const res = await userProfileRoutes.request('/test-user-123/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: 'America/New_York', attributes: { lang: 'en' } }),
        });

        expect(res.status).toBe(200);
        expect(upsertUserProfileMock).toHaveBeenCalledWith('test-user-123', {
          timezone: 'America/New_York',
          attributes: { lang: 'en' },
        });
        const body = await res.json();
        expect(body.attributes).toEqual({ lang: 'en' });
      });

      it('should default attributes to empty object when not provided', async () => {
        upsertUserProfileMock.mockResolvedValue({ ...mockProfile, attributes: {} });

        await userProfileRoutes.request('/test-user-123/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: 'America/Los_Angeles' }),
        });

        expect(upsertUserProfileMock).toHaveBeenCalledWith('test-user-123', {
          timezone: 'America/Los_Angeles',
          attributes: {},
        });
      });

      it('should default attributes to empty object when null in response', async () => {
        upsertUserProfileMock.mockResolvedValue({ ...mockProfile, attributes: null });

        const res = await userProfileRoutes.request('/test-user-123/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: 'America/Los_Angeles' }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.attributes).toEqual({});
      });
    });
  });
});
