import { and, eq, like, or, sql } from 'drizzle-orm';
import { member, organization } from '../../auth/auth-schema';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { orgEntitlement } from '../../db/runtime/runtime-schema';

export const listOrgEntitlements =
  (db: AgentsRunDatabaseClient) =>
  async (orgId: string): Promise<Array<{ resourceType: string; maxValue: number }>> => {
    const rows = await db
      .select({
        resourceType: orgEntitlement.resourceType,
        maxValue: orgEntitlement.maxValue,
      })
      .from(orgEntitlement)
      .where(eq(orgEntitlement.organizationId, orgId));

    return rows;
  };

export async function dalResolveEntitlement(
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

export async function dalSelectEntitlementForUpdate(
  tx: AgentsRunDatabaseClient,
  orgId: string,
  resourceType: string
): Promise<number | null> {
  const rows = await tx
    .select({ maxValue: orgEntitlement.maxValue })
    .from(orgEntitlement)
    .where(
      and(eq(orgEntitlement.organizationId, orgId), eq(orgEntitlement.resourceType, resourceType))
    )
    .for('update');

  return rows.length === 0 ? null : rows[0].maxValue;
}

export async function dalGetServiceAccountUserId(
  db: AgentsRunDatabaseClient,
  orgId: string
): Promise<string | null> {
  const org = await db
    .select({ serviceAccountUserId: organization.serviceAccountUserId })
    .from(organization)
    .where(eq(organization.id, orgId));
  return org[0]?.serviceAccountUserId ?? null;
}

export async function dalCountMembersByRoleBucket(
  db: AgentsRunDatabaseClient,
  orgId: string,
  isAdminBucket: boolean,
  serviceAccountUserId: string | null
): Promise<number> {
  const memberCondition = isAdminBucket
    ? or(eq(member.role, 'owner'), eq(member.role, 'admin'))
    : eq(member.role, 'member');

  const memberWhere = serviceAccountUserId
    ? and(
        eq(member.organizationId, orgId),
        memberCondition,
        sql`${member.userId} != ${serviceAccountUserId}`
      )
    : and(eq(member.organizationId, orgId), memberCondition);

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(member)
    .where(memberWhere);

  return result?.count ?? 0;
}

export async function dalSumSeatEntitlements(
  db: AgentsRunDatabaseClient,
  orgId: string
): Promise<number | null> {
  const rows = await db
    .select({ maxValue: orgEntitlement.maxValue })
    .from(orgEntitlement)
    .where(
      and(eq(orgEntitlement.organizationId, orgId), like(orgEntitlement.resourceType, 'seat:%'))
    );

  if (rows.length === 0) return null;
  return rows.reduce((sum, r) => sum + r.maxValue, 0);
}
