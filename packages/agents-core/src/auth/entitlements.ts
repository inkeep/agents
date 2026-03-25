import { and, eq, like, or, sql } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import { orgEntitlement } from '../db/runtime/runtime-schema';
import { invitation, member, organization } from './auth-schema';
import { DEFAULT_MEMBERSHIP_LIMIT, SEAT_RESOURCE_TYPES } from './entitlement-constants';

export { DEFAULT_MEMBERSHIP_LIMIT, SEAT_RESOURCE_TYPES } from './entitlement-constants';

export function roleMatchesAdminBucket(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

function resourceTypeForRole(role: string): string {
  return roleMatchesAdminBucket(role) ? SEAT_RESOURCE_TYPES.ADMIN : SEAT_RESOURCE_TYPES.MEMBER;
}

export async function resolveEntitlement(
  db: AgentsRunDatabaseClient,
  orgId: string,
  resourceType: string
): Promise<number | null> {
  const rows = await db
    .select({ maxValue: orgEntitlement.maxValue })
    .from(orgEntitlement)
    .where(
      and(eq(orgEntitlement.organizationId, orgId), eq(orgEntitlement.resourceType, resourceType))
    );

  if (rows.length === 0) return null;
  return rows[0].maxValue;
}

export async function countSeatsByRole(
  db: AgentsRunDatabaseClient,
  orgId: string,
  role: string
): Promise<number> {
  const isAdmin = roleMatchesAdminBucket(role);

  const org = await db
    .select({ serviceAccountUserId: organization.serviceAccountUserId })
    .from(organization)
    .where(eq(organization.id, orgId));
  const serviceAccountUserId = org[0]?.serviceAccountUserId ?? null;

  const memberCondition = isAdmin
    ? or(eq(member.role, 'owner'), eq(member.role, 'admin'))
    : eq(member.role, 'member');

  const memberWhere = serviceAccountUserId
    ? and(
        eq(member.organizationId, orgId),
        memberCondition,
        sql`${member.userId} != ${serviceAccountUserId}`
      )
    : and(eq(member.organizationId, orgId), memberCondition);

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(member)
    .where(memberWhere);

  const invitationRole = isAdmin
    ? or(eq(invitation.role, 'owner'), eq(invitation.role, 'admin'))
    : eq(invitation.role, 'member');

  const [invitationCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invitation)
    .where(
      and(eq(invitation.organizationId, orgId), eq(invitation.status, 'pending'), invitationRole)
    );

  return (memberCount?.count ?? 0) + (invitationCount?.count ?? 0);
}

export async function enforcePerRoleSeatLimit(
  db: AgentsRunDatabaseClient,
  orgId: string,
  role: string
): Promise<void> {
  const resourceType = resourceTypeForRole(role);
  const limit = await resolveEntitlement(db, orgId, resourceType);
  if (limit === null) return;

  const current = await countSeatsByRole(db, orgId, role);
  if (current >= limit) {
    const bucket = roleMatchesAdminBucket(role) ? 'admin' : 'member';
    throw new Error(`${bucket} seat limit reached (${current}/${limit})`);
  }
}

export async function resolveTotalMembershipLimit(
  db: AgentsRunDatabaseClient,
  orgId: string,
  hasServiceAccount: boolean
): Promise<number> {
  const rows = await db
    .select({ maxValue: orgEntitlement.maxValue })
    .from(orgEntitlement)
    .where(
      and(eq(orgEntitlement.organizationId, orgId), like(orgEntitlement.resourceType, 'seat:%'))
    );

  const base =
    rows.length === 0 ? DEFAULT_MEMBERSHIP_LIMIT : rows.reduce((sum, r) => sum + r.maxValue, 0);
  return hasServiceAccount ? base + 1 : base;
}
