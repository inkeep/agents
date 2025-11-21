import { addUserToOrganization, getUserOrganizations } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../data/db/dbClient', () => ({
  default: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

const mockDb = (await import('../data/db/dbClient')).default as any;

describe('User Organizations Data Access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserOrganizations', () => {
    it('should fetch user organizations with organization information', async () => {
      const mockResult = [
        {
          id: 'member-1',
          userId: 'user-123',
          organizationId: 'org-456',
          role: 'admin',
          createdAt: new Date('2025-01-01'),
          organizationName: 'Test Organization',
          organizationSlug: 'test-org',
        },
      ];

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(mockResult),
          }),
        }),
      });

      const result = await getUserOrganizations(mockDb)('user-123');

      expect(result).toEqual(mockResult);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return empty array when user has no organizations', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await getUserOrganizations(mockDb)('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('addUserToOrganization', () => {
    it('should add user to organization', async () => {
      // Mock organization exists check
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'org-456', name: 'Test Org' }]),
          }),
        }),
      });

      // Mock member check (doesn't exist yet)
      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'org-456' }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        });

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const data = {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'admin',
      };

      await addUserToOrganization(mockDb)(data);

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw error if organization does not exist', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const data = {
        userId: 'user-123',
        organizationId: 'nonexistent-org',
        role: 'admin',
      };

      await expect(addUserToOrganization(mockDb)(data)).rejects.toThrow(
        'Organization nonexistent-org does not exist'
      );
    });

    it('should not add user if already a member', async () => {
      // Mock organization exists
      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'org-456' }]),
            }),
          }),
        })
        // Mock member already exists
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'member-1' }]),
            }),
          }),
        });

      const data = {
        userId: 'user-123',
        organizationId: 'org-456',
        role: 'admin',
      };

      await addUserToOrganization(mockDb)(data);

      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

});
