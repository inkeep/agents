import { beforeEach, describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../../__tests__/setup';
import * as authSchema from '../../../auth/auth-schema';
import {
  createInvitationProjectAssignments,
  deleteInvitationProjectAssignments,
  getProjectAssignmentsForInvitation,
} from '../invitationProjectAssignments';

async function insertOrganization(id: string) {
  await testRunDbClient.insert(authSchema.organization).values({
    id,
    name: `Org ${id}`,
    slug: id,
    createdAt: new Date(),
  });
}

async function insertUser(id: string) {
  await testRunDbClient.insert(authSchema.user).values({
    id,
    name: `User ${id}`,
    email: `${id}@test.com`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function insertInvitation(id: string, organizationId: string, inviterId: string) {
  await testRunDbClient.insert(authSchema.invitation).values({
    id,
    organizationId,
    email: `${id}@invited.com`,
    role: 'member',
    status: 'pending',
    expiresAt: new Date(Date.now() + 86400000),
    inviterId,
    createdAt: new Date(),
  });
}

describe('invitationProjectAssignments', () => {
  beforeEach(async () => {
    await insertOrganization('org-1');
    await insertUser('user-1');
    await insertInvitation('inv-1', 'org-1', 'user-1');
  });

  describe('createInvitationProjectAssignments', () => {
    it('inserts all assignments in a single batch', async () => {
      await createInvitationProjectAssignments(testRunDbClient)('inv-1', [
        { projectId: 'proj-a', projectRole: 'project_member' },
        { projectId: 'proj-b', projectRole: 'project_editor' },
      ]);

      const rows = await getProjectAssignmentsForInvitation(testRunDbClient)('inv-1');
      expect(rows).toHaveLength(2);
      expect(rows).toEqual(
        expect.arrayContaining([
          { projectId: 'proj-a', projectRole: 'project_member' },
          { projectId: 'proj-b', projectRole: 'project_editor' },
        ])
      );
    });

    it('does nothing when assignments array is empty', async () => {
      await createInvitationProjectAssignments(testRunDbClient)('inv-1', []);

      const rows = await getProjectAssignmentsForInvitation(testRunDbClient)('inv-1');
      expect(rows).toHaveLength(0);
    });
  });

  describe('getProjectAssignmentsForInvitation', () => {
    it('returns empty array for invitation with no assignments', async () => {
      const rows = await getProjectAssignmentsForInvitation(testRunDbClient)('inv-1');
      expect(rows).toEqual([]);
    });

    it('returns only assignments for the specified invitation', async () => {
      await insertInvitation('inv-2', 'org-1', 'user-1');

      await createInvitationProjectAssignments(testRunDbClient)('inv-1', [
        { projectId: 'proj-a', projectRole: 'project_member' },
      ]);
      await createInvitationProjectAssignments(testRunDbClient)('inv-2', [
        { projectId: 'proj-b', projectRole: 'project_member' },
      ]);

      const rows = await getProjectAssignmentsForInvitation(testRunDbClient)('inv-1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ projectId: 'proj-a', projectRole: 'project_member' });
    });
  });

  describe('deleteInvitationProjectAssignments', () => {
    it('deletes all rows for the given invitationId', async () => {
      await createInvitationProjectAssignments(testRunDbClient)('inv-1', [
        { projectId: 'proj-a', projectRole: 'project_member' },
        { projectId: 'proj-b', projectRole: 'project_member' },
      ]);

      await deleteInvitationProjectAssignments(testRunDbClient)('inv-1');

      const rows = await getProjectAssignmentsForInvitation(testRunDbClient)('inv-1');
      expect(rows).toHaveLength(0);
    });

    it('does not affect assignments for other invitations', async () => {
      await insertInvitation('inv-2', 'org-1', 'user-1');
      await createInvitationProjectAssignments(testRunDbClient)('inv-1', [
        { projectId: 'proj-a', projectRole: 'project_member' },
      ]);
      await createInvitationProjectAssignments(testRunDbClient)('inv-2', [
        { projectId: 'proj-b', projectRole: 'project_member' },
      ]);

      await deleteInvitationProjectAssignments(testRunDbClient)('inv-1');

      const rows = await getProjectAssignmentsForInvitation(testRunDbClient)('inv-2');
      expect(rows).toHaveLength(1);
    });

    it('is safe to call when no assignments exist', async () => {
      await expect(
        deleteInvitationProjectAssignments(testRunDbClient)('inv-nonexistent')
      ).resolves.toBeUndefined();
    });
  });
});
