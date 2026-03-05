import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserProfile, upsertUserProfile } from '../userProfiles';

describe('getUserProfile', () => {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();
  const mockLimit = vi.fn();

  const mockDb = {
    select: mockSelect,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  });

  it('returns null when no profile exists', async () => {
    mockLimit.mockResolvedValue([]);

    const result = await getUserProfile(mockDb as never)('user-1');

    expect(result).toBeNull();
  });

  it('returns profile when it exists', async () => {
    const profile = {
      id: 'profile-1',
      userId: 'user-1',
      timezone: 'America/New_York',
      attributes: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockLimit.mockResolvedValue([profile]);

    const result = await getUserProfile(mockDb as never)('user-1');

    expect(result).toEqual(profile);
  });

  it('queries by userId', async () => {
    await getUserProfile(mockDb as never)('user-abc');

    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(1);
  });
});

describe('upsertUserProfile', () => {
  const mockInsert = vi.fn();
  const mockValues = vi.fn();
  const mockOnConflictDoUpdate = vi.fn();
  const mockReturning = vi.fn();

  const mockDb = {
    insert: mockInsert,
  };

  const profileResult = {
    id: 'profile-1',
    userId: 'user-1',
    timezone: 'America/New_York',
    attributes: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockOnConflictDoUpdate.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([profileResult]);
  });

  it('creates new profile', async () => {
    const result = await upsertUserProfile(mockDb as never)('user-1', {
      timezone: 'America/New_York',
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        timezone: 'America/New_York',
      })
    );
    expect(result).toEqual(profileResult);
  });

  it('updates existing profile via onConflictDoUpdate', async () => {
    await upsertUserProfile(mockDb as never)('user-1', { timezone: 'Europe/London' });

    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ timezone: 'Europe/London' }),
      })
    );
  });

  it('creates profile with null timezone when none provided', async () => {
    await upsertUserProfile(mockDb as never)('user-1', {});

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        timezone: null,
      })
    );
  });

  it('includes attributes in upsert when provided', async () => {
    const attributes = { theme: 'dark' };
    await upsertUserProfile(mockDb as never)('user-1', { attributes });

    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ attributes }));
  });
});
