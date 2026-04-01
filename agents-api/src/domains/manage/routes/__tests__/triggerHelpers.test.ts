import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core', () => ({
  canUseProjectStrict: vi.fn(),
  createApiError: vi.fn(({ code, message }: { code: string; message: string }) => {
    const err = new Error(message) as Error & { code: string };
    err.code = code;
    return err;
  }),
  getOrganizationMemberByUserId: vi.fn(),
  OrgRoles: { OWNER: 'owner', ADMIN: 'admin', MEMBER: 'member' },
}));

vi.mock('../../../../data/db/runDbClient', () => ({
  default: 'mock-run-client',
}));

vi.mock('../../../../utils/entityDiff', () => ({
  isEntityChanged: vi.fn(() => true),
}));

import {
  canUseProjectStrict,
  getOrganizationMemberByUserId,
  type OrgRole,
} from '@inkeep/agents-core';
import {
  assertCanMutateTrigger,
  validateRunAsUserId,
  validateRunAsUserIds,
} from '../triggerHelpers';

const mockGetOrgMember = getOrganizationMemberByUserId as ReturnType<typeof vi.fn>;
const mockCanUseProject = canUseProjectStrict as ReturnType<typeof vi.fn>;

describe('triggerHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgMember.mockReturnValue(() => Promise.resolve({ userId: 'user-1' }));
    mockCanUseProject.mockResolvedValue(true);
  });

  describe('validateRunAsUserIds', () => {
    const baseParams = {
      callerId: 'caller-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      tenantRole: 'admin' as OrgRole,
    };

    it('allows admin to set multiple user IDs', async () => {
      await expect(
        validateRunAsUserIds({ ...baseParams, runAsUserIds: ['user-1', 'user-2'] })
      ).resolves.toBeUndefined();

      expect(mockGetOrgMember).toHaveBeenCalledTimes(2);
      expect(mockCanUseProject).toHaveBeenCalledTimes(2);
    });

    it('rejects system identifiers', async () => {
      await expect(
        validateRunAsUserIds({ ...baseParams, runAsUserIds: ['system'] })
      ).rejects.toThrow('system identifiers');
    });

    it('rejects apikey: prefixed IDs', async () => {
      await expect(
        validateRunAsUserIds({ ...baseParams, runAsUserIds: ['apikey:abc123'] })
      ).rejects.toThrow('system identifiers');
    });

    it('non-admin cannot include other users', async () => {
      await expect(
        validateRunAsUserIds({
          ...baseParams,
          tenantRole: 'member' as OrgRole,
          runAsUserIds: ['caller-1', 'other-user'],
        })
      ).rejects.toThrow('Only org admins or owners');
    });

    it('non-admin can include only self', async () => {
      await expect(
        validateRunAsUserIds({
          ...baseParams,
          tenantRole: 'member' as OrgRole,
          runAsUserIds: ['caller-1'],
        })
      ).resolves.toBeUndefined();
    });

    it('rejects user not in org', async () => {
      mockGetOrgMember.mockReturnValue(() => Promise.resolve(null));

      await expect(
        validateRunAsUserIds({ ...baseParams, runAsUserIds: ['unknown-user'] })
      ).rejects.toThrow('not found');
    });

    it('rejects user without project access', async () => {
      mockCanUseProject.mockResolvedValue(false);

      await expect(
        validateRunAsUserIds({ ...baseParams, runAsUserIds: ['user-1'] })
      ).rejects.toThrow('does not have permission');
    });
  });

  describe('validateRunAsUserId', () => {
    const baseParams = {
      callerId: 'caller-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      tenantRole: 'admin' as OrgRole,
    };

    it('allows admin to set any user', async () => {
      await expect(
        validateRunAsUserId({ ...baseParams, runAsUserId: 'other-user' })
      ).resolves.toBeUndefined();
    });

    it('non-admin can only set self', async () => {
      await expect(
        validateRunAsUserId({
          ...baseParams,
          tenantRole: 'member' as OrgRole,
          runAsUserId: 'other-user',
        })
      ).rejects.toThrow('Only org admins or owners');
    });

    it('non-admin can set self', async () => {
      await expect(
        validateRunAsUserId({
          ...baseParams,
          tenantRole: 'member' as OrgRole,
          runAsUserId: 'caller-1',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('assertCanMutateTrigger', () => {
    it('allows admin to mutate any trigger', () => {
      expect(() =>
        assertCanMutateTrigger({
          trigger: { createdBy: 'someone-else', runAsUserId: 'another' },
          callerId: 'admin-user',
          tenantRole: 'admin' as OrgRole,
        })
      ).not.toThrow();
    });

    it('allows owner to mutate any trigger', () => {
      expect(() =>
        assertCanMutateTrigger({
          trigger: { createdBy: 'someone-else', runAsUserId: 'another' },
          callerId: 'owner-user',
          tenantRole: 'owner' as OrgRole,
        })
      ).not.toThrow();
    });

    it('allows non-admin to mutate trigger they created', () => {
      expect(() =>
        assertCanMutateTrigger({
          trigger: { createdBy: 'member-user', runAsUserId: 'another' },
          callerId: 'member-user',
          tenantRole: 'member' as OrgRole,
        })
      ).not.toThrow();
    });

    it('allows non-admin to mutate trigger that runs as them', () => {
      expect(() =>
        assertCanMutateTrigger({
          trigger: { createdBy: 'someone-else', runAsUserId: 'member-user' },
          callerId: 'member-user',
          tenantRole: 'member' as OrgRole,
        })
      ).not.toThrow();
    });

    it('blocks non-admin from mutating unrelated trigger', () => {
      expect(() =>
        assertCanMutateTrigger({
          trigger: { createdBy: 'someone-else', runAsUserId: 'another' },
          callerId: 'member-user',
          tenantRole: 'member' as OrgRole,
        })
      ).toThrow('only modify triggers');
    });
  });
});
