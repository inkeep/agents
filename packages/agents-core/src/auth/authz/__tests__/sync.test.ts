import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changeProjectRole,
  grantProjectAccess,
  removeProjectFromSpiceDb,
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
            operation: 1, // CREATE
            relationship: expect.objectContaining({
              resource: { objectType: 'project', objectId: 'project-1' },
              relation: 'organization',
            }),
          }),
          expect.objectContaining({
            operation: 1, // CREATE
            relationship: expect.objectContaining({
              resource: { objectType: 'project', objectId: 'project-1' },
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
        resourceId: 'project-1',
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
        resourceId: 'project-1',
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
          optionalResourceId: 'project-1',
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
});
