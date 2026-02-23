import { generateId } from 'better-auth';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { account, invitation, member, organization } from '../../auth/auth-schema';
import type { UserOrganization } from '../../auth/auth-validation-schemas';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';

/**
 * Organization and Member data access layer
 * All database queries for Better Auth's organization/member tables
 */

/**
 * Get all organizations for a user
 * Queries Better Auth's member and organization tables
 * Returns Date for createdAt (converted to string at API boundary)
 */
export const getUserOrganizationsFromDb =
  (db: AgentsRunDatabaseClient) =>
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
      .where(eq(member.userId, userId))
      .orderBy(desc(member.createdAt));

    return result.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt),
    }));
  };

/**
 * Get pending invitations for a user by email
 * Returns invitations with status 'pending' that haven't expired
 */
export const getPendingInvitationsByEmail =
  (db: AgentsRunDatabaseClient) => async (email: string) => {
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
      .where(and(eq(invitation.email, email), eq(invitation.status, 'pending')));

    // Filter out expired invitations
    return result.filter((inv) => new Date(inv.expiresAt) > now);
  };

/**
 * Add user to organization
 * Directly inserts into Better Auth's member table
 */
export const addUserToOrganization =
  (db: AgentsRunDatabaseClient) =>
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

export const upsertOrganization =
  (db: AgentsRunDatabaseClient) =>
  async (data: {
    organizationId: string;
    name: string;
    slug: string;
    logo?: string | null;
    metadata?: string | null;
  }): Promise<{ created: boolean }> => {
    const existingOrg = await db
      .select()
      .from(organization)
      .where(or(eq(organization.id, data.organizationId), eq(organization.slug, data.slug)))
      .limit(1);

    if (existingOrg.length > 0) {
      return { created: false };
    }

    await db.insert(organization).values({
      id: data.organizationId,
      name: data.name,
      slug: data.slug,
      createdAt: new Date(),
      logo: data.logo ?? null,
      metadata: data.metadata ?? null,
    });

    return { created: true };
  };

export interface UserProviderInfo {
  userId: string;
  providers: string[];
}

/**
 * Get authentication providers for a list of users.
 * Returns which providers each user has linked (e.g., 'credential', 'google', 'auth0').
 */
export const getUserProvidersFromDb =
  (db: AgentsRunDatabaseClient) =>
  async (userIds: string[]): Promise<UserProviderInfo[]> => {
    if (userIds.length === 0) {
      return [];
    }

    const accounts = await db
      .select({
        userId: account.userId,
        providerId: account.providerId,
      })
      .from(account)
      .where(inArray(account.userId, userIds));

    // Group providers by userId
    const providerMap = new Map<string, string[]>();
    for (const acc of accounts) {
      const existing = providerMap.get(acc.userId) || [];
      if (!existing.includes(acc.providerId)) {
        existing.push(acc.providerId);
      }
      providerMap.set(acc.userId, existing);
    }

    // Return results for all requested userIds (empty array if no accounts)
    return userIds.map((userId) => ({
      userId,
      providers: providerMap.get(userId) || [],
    }));
  };

/**
 * Create an invitation directly in db
 * Used when shouldAllowJoinFromWorkspace is enabled for a work_app_slack_workspaces
 */
export const createInvitationInDb =
  (db: AgentsRunDatabaseClient) =>
  async (data: { organizationId: string; email: string }): Promise<{ id: string }> => {
    const org = await db
      .select({
        serviceAccountUserId: organization.serviceAccountUserId,
        preferredAuthMethod: organization.preferredAuthMethod,
      })
      .from(organization)
      .where(eq(organization.id, data.organizationId))
      .limit(1);

    const orgSettings = org[0];

    if (!orgSettings?.serviceAccountUserId) {
      throw new Error(
        `Organization ${data.organizationId} does not have a serviceAccountUserId configured`
      );
    }

    if (!orgSettings?.preferredAuthMethod) {
      throw new Error(
        `Organization ${data.organizationId} does not have a preferredAuthMethod configured`
      );
    }

    const inviteId = generateId();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await db.insert(invitation).values({
      id: inviteId,
      organizationId: data.organizationId,
      email: data.email,
      role: 'member',
      status: 'pending',
      expiresAt,
      inviterId: orgSettings.serviceAccountUserId,
      authMethod: orgSettings.preferredAuthMethod,
    });

    return { id: inviteId };
  };
