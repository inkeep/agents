import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import {
  createInvitationProjectAssignments,
  deleteInvitationProjectAssignments,
  getProjectAssignmentsForInvitation,
} from '../../data-access/runtime/invitationProjectAssignments';
import * as authSchema from '../auth-schema';
import type { ProjectRole } from '../authz/types';
import { OrgRoles } from '../authz/types';

vi.mock('../authz/sync', () => ({
  grantProjectAccess: vi.fn().mockResolvedValue(undefined),
  syncOrgMemberToSpiceDb: vi.fn().mockResolvedValue(undefined),
}));

async function seedOrg(id: string) {
  await testRunDbClient.insert(authSchema.organization).values({
    id,
    name: `Org ${id}`,
    slug: id,
    createdAt: new Date(),
  });
}

async function seedUser(id: string) {
  await testRunDbClient.insert(authSchema.user).values({
    id,
    name: `User ${id}`,
    email: `${id}@test.com`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function seedInvitation(id: string, orgId: string, inviterId: string, role: string) {
  await testRunDbClient.insert(authSchema.invitation).values({
    id,
    organizationId: orgId,
    email: `${id}@invited.com`,
    role,
    status: 'pending',
    expiresAt: new Date(Date.now() + 86400000),
    inviterId,
    createdAt: new Date(),
  });
}

async function simulateBeforeAcceptInvitationProjectGrants(params: {
  invitationId: string;
  invitationRole: string;
  userId: string;
  orgId: string;
}) {
  const { grantProjectAccess } = await import('../authz/sync');

  if (params.invitationRole !== OrgRoles.ADMIN && params.invitationRole !== OrgRoles.OWNER) {
    const assignments = await getProjectAssignmentsForInvitation(testRunDbClient)(
      params.invitationId
    );

    if (assignments.length > 0) {
      const results = await Promise.allSettled(
        assignments.map((a) =>
          grantProjectAccess({
            tenantId: params.orgId,
            projectId: a.projectId,
            userId: params.userId,
            role: a.projectRole as ProjectRole,
          })
        )
      );
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          console.warn(
            `[test] Failed to grant project access for project ${assignments[i]?.projectId}:`,
            result.reason
          );
        }
      });
    }

    await deleteInvitationProjectAssignments(testRunDbClient)(params.invitationId);
  }
}

describe('beforeAcceptInvitation project grant hook', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await seedOrg('org-1');
    await seedUser('inviter-1');
    await seedUser('invitee-1');
  });

  it('grants project access for each assignment when role is member', async () => {
    const { grantProjectAccess } = await import('../authz/sync');

    await seedInvitation('inv-1', 'org-1', 'inviter-1', OrgRoles.MEMBER);
    await createInvitationProjectAssignments(testRunDbClient)('inv-1', [
      { projectId: 'proj-a', projectRole: 'project_member' },
      { projectId: 'proj-b', projectRole: 'project_admin' },
    ]);

    await simulateBeforeAcceptInvitationProjectGrants({
      invitationId: 'inv-1',
      invitationRole: OrgRoles.MEMBER,
      userId: 'invitee-1',
      orgId: 'org-1',
    });

    expect(grantProjectAccess).toHaveBeenCalledTimes(2);
    expect(grantProjectAccess).toHaveBeenCalledWith({
      tenantId: 'org-1',
      projectId: 'proj-a',
      userId: 'invitee-1',
      role: 'project_member',
    });
    expect(grantProjectAccess).toHaveBeenCalledWith({
      tenantId: 'org-1',
      projectId: 'proj-b',
      userId: 'invitee-1',
      role: 'project_admin',
    });
  });

  it('deletes assignment rows after granting access', async () => {
    await seedInvitation('inv-1', 'org-1', 'inviter-1', OrgRoles.MEMBER);
    await createInvitationProjectAssignments(testRunDbClient)('inv-1', [
      { projectId: 'proj-a', projectRole: 'project_member' },
    ]);

    await simulateBeforeAcceptInvitationProjectGrants({
      invitationId: 'inv-1',
      invitationRole: OrgRoles.MEMBER,
      userId: 'invitee-1',
      orgId: 'org-1',
    });

    const remaining = await getProjectAssignmentsForInvitation(testRunDbClient)('inv-1');
    expect(remaining).toHaveLength(0);
  });

  it('skips project grants for admin role', async () => {
    const { grantProjectAccess } = await import('../authz/sync');

    await seedInvitation('inv-1', 'org-1', 'inviter-1', OrgRoles.ADMIN);
    await createInvitationProjectAssignments(testRunDbClient)('inv-1', [
      { projectId: 'proj-a', projectRole: 'project_member' },
    ]);

    await simulateBeforeAcceptInvitationProjectGrants({
      invitationId: 'inv-1',
      invitationRole: OrgRoles.ADMIN,
      userId: 'invitee-1',
      orgId: 'org-1',
    });

    expect(grantProjectAccess).not.toHaveBeenCalled();
    const remaining = await getProjectAssignmentsForInvitation(testRunDbClient)('inv-1');
    expect(remaining).toHaveLength(1);
  });

  it('skips project grants for owner role', async () => {
    const { grantProjectAccess } = await import('../authz/sync');

    await seedInvitation('inv-1', 'org-1', 'inviter-1', OrgRoles.OWNER);

    await simulateBeforeAcceptInvitationProjectGrants({
      invitationId: 'inv-1',
      invitationRole: OrgRoles.OWNER,
      userId: 'invitee-1',
      orgId: 'org-1',
    });

    expect(grantProjectAccess).not.toHaveBeenCalled();
  });

  it('still cleans up rows even when grantProjectAccess fails', async () => {
    const { grantProjectAccess } = await import('../authz/sync');
    vi.mocked(grantProjectAccess).mockRejectedValueOnce(new Error('SpiceDB unavailable'));

    await seedInvitation('inv-1', 'org-1', 'inviter-1', OrgRoles.MEMBER);
    await createInvitationProjectAssignments(testRunDbClient)('inv-1', [
      { projectId: 'proj-a', projectRole: 'project_member' },
    ]);

    await simulateBeforeAcceptInvitationProjectGrants({
      invitationId: 'inv-1',
      invitationRole: OrgRoles.MEMBER,
      userId: 'invitee-1',
      orgId: 'org-1',
    });

    const remaining = await getProjectAssignmentsForInvitation(testRunDbClient)('inv-1');
    expect(remaining).toHaveLength(0);
  });

  it('works with no project assignments', async () => {
    const { grantProjectAccess } = await import('../authz/sync');

    await seedInvitation('inv-1', 'org-1', 'inviter-1', OrgRoles.MEMBER);

    await simulateBeforeAcceptInvitationProjectGrants({
      invitationId: 'inv-1',
      invitationRole: OrgRoles.MEMBER,
      userId: 'invitee-1',
      orgId: 'org-1',
    });

    expect(grantProjectAccess).not.toHaveBeenCalled();
  });
});
