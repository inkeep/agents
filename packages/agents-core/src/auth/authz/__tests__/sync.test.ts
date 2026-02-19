import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changeProjectRole,
  grantProjectAccess,
  removeProjectFromSpiceDb,
  revokeAllUserRelationships,
  revokeProjectAccess,
  syncOrgMemberToSpiceDb,
  syncProjectToSpiceDb,
} from '../sync';

// Mock the client module
vi.mock('../client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../client')>();
  return {
    ...original,
    getSpiceClient: vi.fn(),
    writeRelationship: vi.fn(),
    deleteRelationship: vi.fn(),
    readRelationships: vi.fn(),
  };
});

import {
  deleteRelationship,
  getSpiceClient,
  readRelationships,
  writeRelationship,
} from '../client';

describe('authz/sync', () => {
  const mockWriteRelationship = vi.mocked(writeRelationship);
  const mockDeleteRelationship = vi.mocked(deleteRelationship);
  const mockReadRelationships = vi.mocked(readRelationships);
  const mockGetSpiceClient = vi.mocked(getSpiceClient);

  const mockSpiceClient = {
    promises: {
      writeRelationships: vi.fn().mockResolvedValue({}),
      deleteRelationships: vi.fn().mockResolvedValue({}),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSpiceClient.mockReturnValue(mockSpiceClient as any);
    // Default: user has no existing org roles (not admin/owner)
    mockReadRelationships.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('syncOrgMemberToSpiceDb', () => {
    it('should write relationship when adding org member', async () => {
      await syncOrgMemberToSpiceDb({
        tenantId: 'tenant-1',
        userId: 'user-1',
        role: 'admin',
        action: 'add',
      });

      expect(mockWriteRelationship).toHaveBeenCalledWith({
        resourceType: 'organization',
        resourceId: 'tenant-1',
        relation: 'admin',
        subjectType: 'user',
        subjectId: 'user-1',
      });
    });

    it('should delete relationship when removing org member', async () => {
      await syncOrgMemberToSpiceDb({
        tenantId: 'tenant-1',
        userId: 'user-1',
        role: 'member',
        action: 'remove',
      });

      expect(mockDeleteRelationship).toHaveBeenCalledWith({
        resourceType: 'organization',
        resourceId: 'tenant-1',
        relation: 'member',
        subjectType: 'user',
        subjectId: 'user-1',
      });
    });
  });

  describe('syncProjectToSpiceDb', () => {
    it('should link project to org and grant creator project_admin role', async () => {
      await syncProjectToSpiceDb({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        creatorUserId: 'user-1',
      });

      expect(mockSpiceClient.promises.writeRelationships).toHaveBeenCalledWith({
        updates: expect.arrayContaining([
          expect.objectContaining({
            operation: 2, // TOUCH (idempotent upsert)
            relationship: expect.objectContaining({
              resource: { objectType: 'project', objectId: 'tenant-1/project-1' },
              relation: 'organization',
            }),
          }),
          expect.objectContaining({
            operation: 2, // TOUCH (idempotent upsert)
            relationship: expect.objectContaining({
              resource: { objectType: 'project', objectId: 'tenant-1/project-1' },
              relation: 'project_admin',
            }),
          }),
        ]),
        optionalPreconditions: [],
        optionalTransactionMetadata: undefined,
      });
    });
  });

  describe('grantProjectAccess', () => {
    it('should write project access relationship', async () => {
      await grantProjectAccess({
        tenantId: 'test-tenant',
        projectId: 'project-1',
        userId: 'user-1',
        role: 'project_member',
      });

      expect(mockWriteRelationship).toHaveBeenCalledWith({
        resourceType: 'project',
        resourceId: 'test-tenant/project-1',
        relation: 'project_member',
        subjectType: 'user',
        subjectId: 'user-1',
      });
    });
  });

  describe('revokeProjectAccess', () => {
    it('should delete project access relationship', async () => {
      await revokeProjectAccess({
        tenantId: 'test-tenant',
        projectId: 'project-1',
        userId: 'user-1',
        role: 'project_admin',
      });

      expect(mockDeleteRelationship).toHaveBeenCalledWith({
        resourceType: 'project',
        resourceId: 'test-tenant/project-1',
        relation: 'project_admin',
        subjectType: 'user',
        subjectId: 'user-1',
      });
    });
  });

  describe('changeProjectRole', () => {
    it('should atomically delete old role and add new role', async () => {
      await changeProjectRole({
        tenantId: 'test-tenant',
        projectId: 'project-1',
        userId: 'user-1',
        oldRole: 'project_member',
        newRole: 'project_admin',
      });

      // changeProjectRole uses writeRelationships batch, not separate calls
      expect(mockSpiceClient.promises.writeRelationships).toHaveBeenCalledWith({
        updates: expect.arrayContaining([
          expect.objectContaining({
            operation: 3, // DELETE
            relationship: expect.objectContaining({
              relation: 'project_member',
            }),
          }),
          expect.objectContaining({
            operation: 2, // TOUCH
            relationship: expect.objectContaining({
              relation: 'project_admin',
            }),
          }),
        ]),
        optionalPreconditions: [],
        optionalTransactionMetadata: undefined,
      });
    });
  });

  describe('removeProjectFromSpiceDb', () => {
    it('should delete all relationships for the project', async () => {
      await removeProjectFromSpiceDb({ tenantId: 'test-tenant', projectId: 'project-1' });

      expect(mockSpiceClient.promises.deleteRelationships).toHaveBeenCalledWith({
        relationshipFilter: {
          resourceType: 'project',
          optionalResourceId: 'test-tenant/project-1',
          optionalResourceIdPrefix: '',
          optionalRelation: '',
        },
        optionalPreconditions: [],
        optionalLimit: 0,
        optionalAllowPartialDeletions: false,
        optionalTransactionMetadata: undefined,
      });
    });
  });

  describe('revokeAllUserRelationships', () => {
    it('should delete all organization-level relationships for user', async () => {
      await revokeAllUserRelationships({
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(mockSpiceClient.promises.deleteRelationships).toHaveBeenCalledWith(
        expect.objectContaining({
          relationshipFilter: expect.objectContaining({
            resourceType: 'organization',
            optionalResourceId: 'tenant-1',
            optionalResourceIdPrefix: '',
            optionalRelation: '', // Empty = all relations
            optionalSubjectFilter: {
              subjectType: 'user',
              optionalSubjectId: 'user-1',
              optionalRelation: undefined,
            },
          }),
          optionalPreconditions: [],
          optionalLimit: 0,
          optionalAllowPartialDeletions: false,
          optionalTransactionMetadata: undefined,
        })
      );
    });

    it('should delete all project-level relationships scoped to tenant', async () => {
      await revokeAllUserRelationships({
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(mockSpiceClient.promises.deleteRelationships).toHaveBeenCalledWith(
        expect.objectContaining({
          relationshipFilter: expect.objectContaining({
            resourceType: 'project',
            optionalResourceId: '',
            optionalResourceIdPrefix: 'tenant-1/', // Tenant prefix
            optionalRelation: '', // Empty = all relations
            optionalSubjectFilter: {
              subjectType: 'user',
              optionalSubjectId: 'user-1',
              optionalRelation: undefined,
            },
          }),
          optionalPreconditions: [],
          optionalLimit: 0,
          optionalAllowPartialDeletions: false,
          optionalTransactionMetadata: undefined,
        })
      );
    });

    it('should execute both deletions in parallel', async () => {
      await revokeAllUserRelationships({
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      // Verify both organization and project deletions were called
      expect(mockSpiceClient.promises.deleteRelationships).toHaveBeenCalledTimes(2);

      // Verify they were called with different resource types
      const calls = mockSpiceClient.promises.deleteRelationships.mock.calls;
      const organizationCall = calls.find(
        (call) => call[0].relationshipFilter.resourceType === 'organization'
      );
      const projectCall = calls.find(
        (call) => call[0].relationshipFilter.resourceType === 'project'
      );

      expect(organizationCall).toBeDefined();
      expect(projectCall).toBeDefined();
    });

    it('should use correct tenant prefix for project deletions', async () => {
      await revokeAllUserRelationships({
        tenantId: 'my-org-123',
        userId: 'user-456',
      });

      const projectCall = mockSpiceClient.promises.deleteRelationships.mock.calls.find(
        (call) => call[0].relationshipFilter.resourceType === 'project'
      );

      expect(projectCall).toBeDefined();
      expect(projectCall?.[0].relationshipFilter.optionalResourceIdPrefix).toBe('my-org-123/');
    });

    it('should handle SpiceDB errors by throwing them up', async () => {
      const error = new Error('SpiceDB connection failed');
      mockSpiceClient.promises.deleteRelationships.mockRejectedValueOnce(error);

      await expect(
        revokeAllUserRelationships({
          tenantId: 'tenant-1',
          userId: 'user-1',
        })
      ).rejects.toThrow('SpiceDB connection failed');
    });

    it('should work with different tenant and user ID formats', async () => {
      await revokeAllUserRelationships({
        tenantId: 'org_abc123',
        userId: 'auth0|user456',
      });

      expect(mockSpiceClient.promises.deleteRelationships).toHaveBeenCalledWith(
        expect.objectContaining({
          relationshipFilter: expect.objectContaining({
            optionalResourceId: 'org_abc123',
            optionalSubjectFilter: expect.objectContaining({
              optionalSubjectId: 'auth0|user456',
            }),
          }),
        })
      );
    });
  });
});
