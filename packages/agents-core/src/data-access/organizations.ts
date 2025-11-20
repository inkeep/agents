import { and, eq } from 'drizzle-orm';
import { invitation, member, organization } from '../auth/auth-schema';
import type { UserOrganization } from '../auth/auth-validation-schemas';
import type { DatabaseClient } from '../db/client';

/**
 * Organization and Member data access layer
 * All database queries for Better Auth's organization/member tables
 */

/**
 * Get all organizations for a user
 * Queries Better Auth's member and organization tables
 * Returns Date for createdAt (converted to string at API boundary)
 */
export const getUserOrganizations =
  (db: DatabaseClient) =>
  async (
    userId: string
  ): Promise<Array<Omit<UserOrganization, 'createdAt'> & { createdAt: Date }>> => {
    const result = await db
      .select({
        id: member.id,
        userId: member.userId,
        organizationId: member.organizationId,
        role: member.role,
        createdAt: member.createdAt,
        organizationName: organization.name,
        organizationSlug: organization.slug,
      })
      .from(member)
      .leftJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, userId));

    return result.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt),
    }));
  };

/**
 * Get pending invitations for a user by email
 * Returns invitations with status 'pending' that haven't expired
 */
export const getPendingInvitationsByEmail = (db: DatabaseClient) => async (email: string) => {
  const now = new Date();

  const result = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      organizationId: invitation.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      inviterId: invitation.inviterId,
    })
    .from(invitation)
    .leftJoin(organization, eq(invitation.organizationId, organization.id))
    .where(
      and(
        eq(invitation.email, email),
        eq(invitation.status, 'pending')
      )
    );

  // Filter out expired invitations
  return result.filter((inv) => new Date(inv.expiresAt) > now);
};

/**
 * Add user to organization
 * Directly inserts into Better Auth's member table
 */
export const addUserToOrganization =
  (db: DatabaseClient) =>
  async (data: { userId: string; organizationId: string; role: string }): Promise<void> => {
    // Check if organization exists
    const existingOrg = await db
      .select()
      .from(organization)
      .where(eq(organization.id, data.organizationId))
      .limit(1);

    if (existingOrg.length === 0) {
      throw new Error(`Organization ${data.organizationId} does not exist`);
    }

    // Check if membership already exists
    const existingMember = await db
      .select()
      .from(member)
      .where(and(eq(member.userId, data.userId), eq(member.organizationId, data.organizationId)))
      .limit(1);

    if (existingMember.length > 0) {
      return;
    }

    // Add user as member
    await db.insert(member).values({
      id: `${data.userId}_${data.organizationId}`,
      userId: data.userId,
      organizationId: data.organizationId,
      role: data.role,
      createdAt: new Date(),
    });
  };
