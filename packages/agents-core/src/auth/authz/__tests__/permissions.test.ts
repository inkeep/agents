import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canEditProject,
  canUseProject,
  canViewProject,
  listAccessibleProjectIds,
} from '../permissions';

// Mock the client module
vi.mock('../client', () => ({
  checkPermission: vi.fn(),
  lookupResources: vi.fn(),
}));

// Mock the config module
vi.mock('../config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../config')>();
  return {
    ...original,
    isAuthzEnabled: vi.fn(),
  };
});

import { checkPermission, lookupResources } from '../client';
import { isAuthzEnabled } from '../config';

describe('authz/permissions', () => {
  const mockCheckPermission = vi.mocked(checkPermission);
  const mockLookupResources = vi.mocked(lookupResources);
  const mockIsAuthzEnabled = vi.mocked(isAuthzEnabled);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('canViewProject', () => {
    it('should return true when authz is disabled', async () => {
      mockIsAuthzEnabled.mockReturnValue(false);

      const result = await canViewProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'member',
      });

      expect(result).toBe(true);
      expect(mockCheckPermission).not.toHaveBeenCalled();
    });

    it('should return true for org owner without checking SpiceDB', async () => {
      mockIsAuthzEnabled.mockReturnValue(true);

      const result = await canViewProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'owner',
      });

      expect(result).toBe(true);
      expect(mockCheckPermission).not.toHaveBeenCalled();
    });

    it('should return true for org admin without checking SpiceDB', async () => {
      mockIsAuthzEnabled.mockReturnValue(true);

      const result = await canViewProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'admin',
      });

      expect(result).toBe(true);
      expect(mockCheckPermission).not.toHaveBeenCalled();
    });

    it('should check SpiceDB for org members', async () => {
      mockIsAuthzEnabled.mockReturnValue(true);
      mockCheckPermission.mockResolvedValue(true);

      const result = await canViewProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'member',
      });

      expect(result).toBe(true);
      expect(mockCheckPermission).toHaveBeenCalledWith({
        resourceType: 'project',
        resourceId: 'project-1',
        permission: 'view',
        subjectType: 'user',
        subjectId: 'user-1',
      });
    });

    it('should return false when SpiceDB denies access', async () => {
      mockIsAuthzEnabled.mockReturnValue(true);
      mockCheckPermission.mockResolvedValue(false);

      const result = await canViewProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'member',
      });

      expect(result).toBe(false);
    });
  });

  describe('canUseProject', () => {
    it('should return true when authz is disabled', async () => {
      mockIsAuthzEnabled.mockReturnValue(false);

      expect(
        await canUseProject({
          userId: 'user-1',
          projectId: 'project-1',
          orgRole: 'member',
        })
      ).toBe(true);
    });

    it('should check SpiceDB for use permission', async () => {
      mockIsAuthzEnabled.mockReturnValue(true);
      mockCheckPermission.mockResolvedValue(true);

      const result = await canUseProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'member',
      });

      expect(result).toBe(true);
      expect(mockCheckPermission).toHaveBeenCalledWith({
        resourceType: 'project',
        resourceId: 'project-1',
        permission: 'use',
        subjectType: 'user',
        subjectId: 'user-1',
      });
    });
  });

  describe('canEditProject', () => {
    it('should only allow owner/admin when authz is disabled', async () => {
      mockIsAuthzEnabled.mockReturnValue(false);

      expect(
        await canEditProject({
          userId: 'user-1',
          projectId: 'project-1',
          orgRole: 'owner',
        })
      ).toBe(true);

      expect(
        await canEditProject({
          userId: 'user-1',
          projectId: 'project-1',
          orgRole: 'member',
        })
      ).toBe(false);
    });

    it('should check SpiceDB for edit permission', async () => {
      mockIsAuthzEnabled.mockReturnValue(true);
      mockCheckPermission.mockResolvedValue(true);

      const result = await canEditProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'member',
      });

      expect(result).toBe(true);
      expect(mockCheckPermission).toHaveBeenCalledWith({
        resourceType: 'project',
        resourceId: 'project-1',
        permission: 'edit',
        subjectType: 'user',
        subjectId: 'user-1',
      });
    });
  });

  describe('listAccessibleProjectIds', () => {
    it('should return "all" when authz is disabled', async () => {
      mockIsAuthzEnabled.mockReturnValue(false);

      const result = await listAccessibleProjectIds({
        userId: 'user-1',
        orgRole: 'member',
      });

      expect(result).toBe('all');
      expect(mockLookupResources).not.toHaveBeenCalled();
    });

    it('should return "all" for org owner/admin', async () => {
      mockIsAuthzEnabled.mockReturnValue(true);

      expect(
        await listAccessibleProjectIds({
          userId: 'user-1',
          orgRole: 'owner',
        })
      ).toBe('all');

      expect(
        await listAccessibleProjectIds({
          userId: 'user-1',
          orgRole: 'admin',
        })
      ).toBe('all');

      expect(mockLookupResources).not.toHaveBeenCalled();
    });

    it('should use lookupResources for regular members', async () => {
      mockIsAuthzEnabled.mockReturnValue(true);
      mockLookupResources.mockResolvedValue(['project-1', 'project-2']);

      const result = await listAccessibleProjectIds({
        userId: 'user-1',
        orgRole: 'member',
      });

      expect(result).toEqual(['project-1', 'project-2']);
      expect(mockLookupResources).toHaveBeenCalledWith({
        resourceType: 'project',
        permission: 'view',
        subjectType: 'user',
        subjectId: 'user-1',
      });
    });

    it('should return empty array when user has no accessible projects', async () => {
      mockIsAuthzEnabled.mockReturnValue(true);
      mockLookupResources.mockResolvedValue([]);

      const result = await listAccessibleProjectIds({
        userId: 'user-1',
        orgRole: 'member',
      });

      expect(result).toEqual([]);
    });
  });
});
