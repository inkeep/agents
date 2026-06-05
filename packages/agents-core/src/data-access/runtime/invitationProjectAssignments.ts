import { eq } from 'drizzle-orm';
import type { ProjectRole } from '../../auth/authz/types';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { invitationProjectAssignment } from '../../db/runtime/runtime-schema';

export interface InvitationProjectAssignmentInput {
  projectId: string;
  projectRole: ProjectRole;
}

export const createInvitationProjectAssignments =
  (db: AgentsRunDatabaseClient) =>
  async (invitationId: string, assignments: InvitationProjectAssignmentInput[]): Promise<void> => {
    if (assignments.length === 0) return;

    await db.insert(invitationProjectAssignment).values(
      assignments.map((a) => ({
        id: crypto.randomUUID(),
        invitationId,
        projectId: a.projectId,
        projectRole: a.projectRole,
      }))
    );
  };

export const getProjectAssignmentsForInvitation =
  (db: AgentsRunDatabaseClient) =>
  async (invitationId: string): Promise<Array<{ projectId: string; projectRole: ProjectRole }>> => {
    const rows = await db
      .select({
        projectId: invitationProjectAssignment.projectId,
        projectRole: invitationProjectAssignment.projectRole,
      })
      .from(invitationProjectAssignment)
      .where(eq(invitationProjectAssignment.invitationId, invitationId));

    return rows as Array<{ projectId: string; projectRole: ProjectRole }>;
  };

export const deleteInvitationProjectAssignments =
  (db: AgentsRunDatabaseClient) =>
  async (invitationId: string): Promise<void> => {
    await db
      .delete(invitationProjectAssignment)
      .where(eq(invitationProjectAssignment.invitationId, invitationId));
  };
