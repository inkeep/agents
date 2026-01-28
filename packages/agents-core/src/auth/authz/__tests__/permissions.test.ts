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

import { checkPermission, lookupResources } from '../client';

describe('authz/permissions', () => {
  const mockCheckPermission = vi.mocked(checkPermission);
  const mockLookupResources = vi.mocked(lookupResources);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('canViewProject', () => {
    it('should return true for org owner without checking SpiceDB', async () => {
      const result = await canViewProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'owner',
      });

      expect(result).toBe(true);
      expect(mockCheckPermission).not.toHaveBeenCalled();
    });

    it('should return true for org admin without checking SpiceDB', async () => {
      const result = await canViewProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'admin',
      });

      expect(result).toBe(true);
      expect(mockCheckPermission).not.toHaveBeenCalled();
    });

    it('should check SpiceDB for org members', async () => {
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
    it('should return true for org owner without checking SpiceDB', async () => {
      const result = await canUseProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'owner',
      });

      expect(result).toBe(true);
      expect(mockCheckPermission).not.toHaveBeenCalled();
    });

    it('should check SpiceDB for use permission', async () => {
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

    it('should return false when SpiceDB denies use permission', async () => {
      mockCheckPermission.mockResolvedValue(false);

      const result = await canUseProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'member',
      });

      expect(result).toBe(false);
    });
  });

  describe('canEditProject', () => {
    it('should return true for org owner without checking SpiceDB', async () => {
      const result = await canEditProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'owner',
      });

      expect(result).toBe(true);
      expect(mockCheckPermission).not.toHaveBeenCalled();
    });

    it('should return true for org admin without checking SpiceDB', async () => {
      const result = await canEditProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'admin',
      });

      expect(result).toBe(true);
      expect(mockCheckPermission).not.toHaveBeenCalled();
    });

    it('should check SpiceDB for edit permission', async () => {
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

    it('should return false when SpiceDB denies edit permission', async () => {
      mockCheckPermission.mockResolvedValue(false);

      const result = await canEditProject({
        userId: 'user-1',
        projectId: 'project-1',
        orgRole: 'member',
      });

      expect(result).toBe(false);
    });
  });

  describe('listAccessibleProjectIds', () => {
    it('should return "all" for org owner', async () => {
      const result = await listAccessibleProjectIds({
        userId: 'user-1',
        orgRole: 'owner',
      });

      expect(result).toBe('all');
      expect(mockLookupResources).not.toHaveBeenCalled();
    });

    it('should return "all" for org admin', async () => {
      const result = await listAccessibleProjectIds({
        userId: 'user-1',
        orgRole: 'admin',
      });

      expect(result).toBe('all');
      expect(mockLookupResources).not.toHaveBeenCalled();
    });

    it('should use lookupResources for regular members', async () => {
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
      mockLookupResources.mockResolvedValue([]);

      const result = await listAccessibleProjectIds({
        userId: 'user-1',
        orgRole: 'member',
      });

      expect(result).toEqual([]);
    });
  });
});
