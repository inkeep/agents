import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserProvidersFromDb } from '../organizations';

describe('getUserProvidersFromDb', () => {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();

  const mockDb = {
    select: mockSelect,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup the mock chain: db.select().from().where()
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
  });

  it('should return empty array when given empty userIds array', async () => {
    const result = await getUserProvidersFromDb(mockDb as never)([]);

    expect(result).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('should query accounts table and return providers grouped by userId', async () => {
    const mockAccounts = [
      { userId: 'user-1', providerId: 'credential' },
      { userId: 'user-1', providerId: 'google' },
      { userId: 'user-2', providerId: 'credential' },
    ];
    mockWhere.mockResolvedValue(mockAccounts);

    const result = await getUserProvidersFromDb(mockDb as never)(['user-1', 'user-2']);

    expect(result).toEqual([
      { userId: 'user-1', providers: ['credential', 'google'] },
      { userId: 'user-2', providers: ['credential'] },
    ]);
  });

  it('should return empty providers array for users with no accounts', async () => {
    mockWhere.mockResolvedValue([]);

    const result = await getUserProvidersFromDb(mockDb as never)(['user-1', 'user-2']);

    expect(result).toEqual([
      { userId: 'user-1', providers: [] },
      { userId: 'user-2', providers: [] },
    ]);
  });

  it('should deduplicate providers for the same user', async () => {
    const mockAccounts = [
      { userId: 'user-1', providerId: 'credential' },
      { userId: 'user-1', providerId: 'credential' }, // duplicate
      { userId: 'user-1', providerId: 'google' },
    ];
    mockWhere.mockResolvedValue(mockAccounts);

    const result = await getUserProvidersFromDb(mockDb as never)(['user-1']);

    expect(result).toEqual([{ userId: 'user-1', providers: ['credential', 'google'] }]);
  });

  it('should handle single user request', async () => {
    const mockAccounts = [{ userId: 'user-1', providerId: 'auth0' }];
    mockWhere.mockResolvedValue(mockAccounts);

    const result = await getUserProvidersFromDb(mockDb as never)(['user-1']);

    expect(result).toEqual([{ userId: 'user-1', providers: ['auth0'] }]);
  });

  it('should preserve order of requested userIds in the response', async () => {
    const mockAccounts = [
      { userId: 'user-3', providerId: 'google' },
      { userId: 'user-1', providerId: 'credential' },
    ];
    mockWhere.mockResolvedValue(mockAccounts);

    const result = await getUserProvidersFromDb(mockDb as never)(['user-1', 'user-2', 'user-3']);

    expect(result[0].userId).toBe('user-1');
    expect(result[1].userId).toBe('user-2');
    expect(result[2].userId).toBe('user-3');
    expect(result).toHaveLength(3);
  });

  it('should handle users with multiple different providers', async () => {
    const mockAccounts = [
      { userId: 'user-1', providerId: 'credential' },
      { userId: 'user-1', providerId: 'google' },
      { userId: 'user-1', providerId: 'auth0' },
      { userId: 'user-1', providerId: 'github' },
    ];
    mockWhere.mockResolvedValue(mockAccounts);

    const result = await getUserProvidersFromDb(mockDb as never)(['user-1']);

    expect(result).toEqual([
      { userId: 'user-1', providers: ['credential', 'google', 'auth0', 'github'] },
    ]);
  });

  it('should handle mix of users with and without providers', async () => {
    const mockAccounts = [
      { userId: 'user-2', providerId: 'credential' },
      { userId: 'user-2', providerId: 'google' },
    ];
    mockWhere.mockResolvedValue(mockAccounts);

    const result = await getUserProvidersFromDb(mockDb as never)(['user-1', 'user-2', 'user-3']);

    expect(result).toEqual([
      { userId: 'user-1', providers: [] },
      { userId: 'user-2', providers: ['credential', 'google'] },
      { userId: 'user-3', providers: [] },
    ]);
  });
});
