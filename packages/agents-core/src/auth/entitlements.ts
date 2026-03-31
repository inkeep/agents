import { APIError } from 'better-auth/api';
import {
  dalCountMembersByRoleBucket,
  dalGetServiceAccountUserId,
  dalResolveEntitlement,
  dalSumSeatEntitlements,
} from '../data-access/runtime/entitlements';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import { getLogger } from '../utils/logger';
import { DEFAULT_MEMBERSHIP_LIMIT, SEAT_RESOURCE_TYPES } from './entitlement-constants';
import { withEntitlementLock } from './entitlement-lock';

const logger = getLogger('entitlements');

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
  return dalCountMembersByRoleBucket(db, orgId, isAdmin, serviceAccountUserId);
}

export async function enforcePerRoleSeatLimit(
  db: AgentsRunDatabaseClient,
  orgId: string,
  role: string,
  onceVerified?: () => Promise<void>
): Promise<void> {
  const resourceType = resourceTypeForRole(role);

  await withEntitlementLock(db, orgId, resourceType, async (limit, tx) => {
    if (limit !== null) {
      const current = await countSeatsByRole(tx, orgId, role);
      if (current >= limit) {
        const bucket = roleMatchesAdminBucket(role) ? 'Admin' : 'Member';
        logger.info(
          { orgId, role, bucket, currentCount: current, maxValue: limit, action: 'enforce' },
          `${bucket} seat limit reached (${current}/${limit})`
        );
        throw new APIError('PAYMENT_REQUIRED', {
          message: `${bucket} seat limit reached (${current}/${limit})`,
          code: 'ENTITLEMENT_LIMIT_REACHED',
          resourceType,
          current,
          limit,
        });
      }
    }

    if (onceVerified) {
      await onceVerified();
    }
  });
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
