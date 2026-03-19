import { and, eq } from 'drizzle-orm';
import * as authSchema from '../../auth/auth-schema';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';

export const getInitialOrganization =
  (db: AgentsRunDatabaseClient) =>
  async (userId: string): Promise<{ id: string } | null> => {
    const [membership] = await db
      .select({ organizationId: authSchema.member.organizationId })
      .from(authSchema.member)
      .where(eq(authSchema.member.userId, userId))
      .orderBy(authSchema.member.createdAt)
      .limit(1);

    return membership ? { id: membership.organizationId } : null;
  };

export const queryHasCredentialAccount =
  (db: AgentsRunDatabaseClient) =>
  async (userId: string): Promise<boolean> => {
    const [row] = await db
      .select({ id: authSchema.account.id })
      .from(authSchema.account)
      .where(
        and(eq(authSchema.account.userId, userId), eq(authSchema.account.providerId, 'credential'))
      )
      .limit(1);

    return !!row;
  };

export const querySsoProviderIssuers =
  (db: AgentsRunDatabaseClient) => async (): Promise<{ issuer: string }[]> => {
    return db.select({ issuer: authSchema.ssoProvider.issuer }).from(authSchema.ssoProvider);
  };

export const querySsoProviderIds = (db: AgentsRunDatabaseClient) => async (): Promise<string[]> => {
  const rows = await db
    .select({ providerId: authSchema.ssoProvider.providerId })
    .from(authSchema.ssoProvider);
  return rows.map((r) => r.providerId);
};

export const queryOrgAllowedAuthMethods =
  (db: AgentsRunDatabaseClient) =>
  async (orgId: string): Promise<{ allowedAuthMethods: string | null } | undefined> => {
    const [org] = await db
      .select({ allowedAuthMethods: authSchema.organization.allowedAuthMethods })
      .from(authSchema.organization)
      .where(eq(authSchema.organization.id, orgId))
      .limit(1);
    return org;
  };

export const queryMemberExists =
  (db: AgentsRunDatabaseClient) =>
  async (userId: string, organizationId: string): Promise<boolean> => {
    const [row] = await db
      .select({ id: authSchema.member.id })
      .from(authSchema.member)
      .where(
        and(
          eq(authSchema.member.userId, userId),
          eq(authSchema.member.organizationId, organizationId)
        )
      )
      .limit(1);
    return !!row;
  };

export const queryPendingInvitationExists =
  (db: AgentsRunDatabaseClient) =>
  async (email: string, organizationId: string): Promise<boolean> => {
    const [row] = await db
      .select({ id: authSchema.invitation.id })
      .from(authSchema.invitation)
      .where(
        and(
          eq(authSchema.invitation.email, email),
          eq(authSchema.invitation.organizationId, organizationId),
          eq(authSchema.invitation.status, 'pending')
        )
      )
      .limit(1);
    return !!row;
  };
