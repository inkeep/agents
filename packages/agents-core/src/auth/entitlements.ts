import {
  dalCountMembersByRoleBucket,
  dalCountPendingInvitationsByRoleBucket,
  dalGetServiceAccountUserId,
  dalResolveEntitlement,
  dalSumSeatEntitlements,
} from '../data-access/runtime/entitlements';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';
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
  return dalResolveEntitlement(db, orgId, resourceType);
}

export async function countSeatsByRole(
  db: AgentsRunDatabaseClient,
  orgId: string,
  role: string
): Promise<number> {
  const isAdmin = roleMatchesAdminBucket(role);
  const serviceAccountUserId = await dalGetServiceAccountUserId(db, orgId);
  const memberCount = await dalCountMembersByRoleBucket(db, orgId, isAdmin, serviceAccountUserId);
  const invitationCount = await dalCountPendingInvitationsByRoleBucket(db, orgId, isAdmin);
  return memberCount + invitationCount;
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
  const sum = await dalSumSeatEntitlements(db, orgId);
  const base = sum === null ? DEFAULT_MEMBERSHIP_LIMIT : sum;
  return hasServiceAccount ? base + 1 : base;
}
