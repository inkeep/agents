import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInvitationInDb, getUserProvidersFromDb } from '../organizations';

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

describe('createInvitationInDb', () => {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();
  const mockLimit = vi.fn();
  const mockInsert = vi.fn();
  const mockValues = vi.fn();

  const mockDb = {
    select: mockSelect,
    insert: mockInsert,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);

    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue(undefined);
  });

  it('should throw when serviceAccountUserId is not configured', async () => {
    mockLimit.mockResolvedValue([{ serviceAccountUserId: null, preferredAuthMethod: 'auth0' }]);

    await expect(
      createInvitationInDb(mockDb as never)({
        organizationId: 'org_123',
        email: 'test@example.com',
      })
    ).rejects.toThrow('does not have a serviceAccountUserId configured');
  });

  it('should throw when preferredAuthMethod is not configured', async () => {
    mockLimit.mockResolvedValue([
      { serviceAccountUserId: 'user_sa_123', preferredAuthMethod: null },
    ]);

    await expect(
      createInvitationInDb(mockDb as never)({
        organizationId: 'org_123',
        email: 'test@example.com',
      })
    ).rejects.toThrow('does not have a preferredAuthMethod configured');
  });

  it('should throw when organization is not found', async () => {
    mockLimit.mockResolvedValue([]);

    await expect(
      createInvitationInDb(mockDb as never)({
        organizationId: 'org_nonexistent',
        email: 'test@example.com',
      })
    ).rejects.toThrow('does not have a serviceAccountUserId configured');
  });

  it('should create invitation with correct fields when org is configured', async () => {
    mockLimit.mockResolvedValue([
      { serviceAccountUserId: 'user_sa_456', preferredAuthMethod: 'auth0' },
    ]);

    const result = await createInvitationInDb(mockDb as never)({
      organizationId: 'org_configured',
      email: 'newuser@example.com',
    });

    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_configured',
        email: 'newuser@example.com',
        role: 'member',
        status: 'pending',
        inviterId: 'user_sa_456',
        authMethod: 'auth0',
      })
    );
  });

  it('should set expiration to 1 hour from now', async () => {
    mockLimit.mockResolvedValue([
      { serviceAccountUserId: 'user_sa_789', preferredAuthMethod: 'credential' },
    ]);

    const before = Date.now();
    await createInvitationInDb(mockDb as never)({
      organizationId: 'org_test',
      email: 'test@example.com',
    });
    const after = Date.now();

    const insertedValues = mockValues.mock.calls[0][0];
    const expiresAt = insertedValues.expiresAt.getTime();
    const oneHourMs = 60 * 60 * 1000;

    expect(expiresAt).toBeGreaterThanOrEqual(before + oneHourMs);
    expect(expiresAt).toBeLessThanOrEqual(after + oneHourMs);
  });
});
