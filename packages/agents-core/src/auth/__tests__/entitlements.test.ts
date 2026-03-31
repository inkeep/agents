import { describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import { orgEntitlement } from '../../db/runtime/runtime-schema';
import * as authSchema from '../auth-schema';
import {
  countSeatsByRole,
  DEFAULT_MEMBERSHIP_LIMIT,
  enforcePerRoleSeatLimit,
  resolveEntitlement,
  resolveTotalMembershipLimit,
  roleMatchesAdminBucket,
  SEAT_RESOURCE_TYPES,
} from '../entitlements';

const ORG_ID = 'org-entitlement-test';

async function seedOrg(opts: { serviceAccountUserId?: string } = {}) {
  await testRunDbClient.insert(authSchema.organization).values({
    id: ORG_ID,
    name: 'Test Org',
    slug: `test-org-${Date.now()}`,
    createdAt: new Date(),
    serviceAccountUserId: opts.serviceAccountUserId ?? null,
  });
}

async function seedUser(id: string) {
  await testRunDbClient.insert(authSchema.user).values({
    id,
    name: id,
    email: `${id}@test.com`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function seedMember(userId: string, role: string) {
  await seedUser(userId);
  await testRunDbClient.insert(authSchema.member).values({
    id: `member-${userId}`,
    organizationId: ORG_ID,
    userId,
    role,
    createdAt: new Date(),
  });
}

async function seedInvitation(email: string, role: string, status = 'pending') {
  await testRunDbClient.insert(authSchema.invitation).values({
    id: `inv-${email}`,
    organizationId: ORG_ID,
    email,
    role,
    status,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    inviterId: 'inviter-user',
  });
}

async function seedEntitlement(resourceType: string, maxValue: number) {
  await testRunDbClient.insert(orgEntitlement).values({
    id: `ent-${ORG_ID}-${resourceType}`,
    organizationId: ORG_ID,
    resourceType,
    maxValue,
  });
}

describe('roleMatchesAdminBucket', () => {
  it('returns true for owner', () => {
    expect(roleMatchesAdminBucket('owner')).toBe(true);
  });

  it('returns true for admin', () => {
    expect(roleMatchesAdminBucket('admin')).toBe(true);
  });

  it('returns false for member', () => {
    expect(roleMatchesAdminBucket('member')).toBe(false);
  });
});

describe('resolveEntitlement', () => {
  it('returns maxValue when row exists', async () => {
    await seedOrg();
    await seedEntitlement(SEAT_RESOURCE_TYPES.ADMIN, 10);

    const result = await resolveEntitlement(testRunDbClient, ORG_ID, SEAT_RESOURCE_TYPES.ADMIN);
    expect(result).toBe(10);
  });

  it('returns null when no row exists', async () => {
    await seedOrg();

    const result = await resolveEntitlement(testRunDbClient, ORG_ID, SEAT_RESOURCE_TYPES.ADMIN);
    expect(result).toBeNull();
  });
});

describe('countSeatsByRole', () => {
  it('counts admin and owner members for admin bucket', async () => {
    await seedOrg();
    await seedUser('inviter-user');
    await seedMember('admin-1', 'admin');
    await seedMember('owner-1', 'owner');
    await seedMember('member-1', 'member');

    const count = await countSeatsByRole(testRunDbClient, ORG_ID, 'admin');
    expect(count).toBe(2);
  });

  it('counts member role for member bucket', async () => {
    await seedOrg();
    await seedUser('inviter-user');
    await seedMember('admin-1', 'admin');
    await seedMember('member-1', 'member');
    await seedMember('member-2', 'member');

    const count = await countSeatsByRole(testRunDbClient, ORG_ID, 'member');
    expect(count).toBe(2);
  });

  it('does not count pending invitations', async () => {
    await seedOrg();
    await seedUser('inviter-user');
    await seedMember('member-1', 'member');
    await seedInvitation('new@test.com', 'member', 'pending');

    const count = await countSeatsByRole(testRunDbClient, ORG_ID, 'member');
    expect(count).toBe(1);
  });

  it('excludes service account user from count', async () => {
    const serviceUserId = 'service-account';
    await seedOrg({ serviceAccountUserId: serviceUserId });
    await seedUser('inviter-user');
    await seedMember(serviceUserId, 'admin');
    await seedMember('admin-1', 'admin');

    const count = await countSeatsByRole(testRunDbClient, ORG_ID, 'admin');
    expect(count).toBe(1);
  });
});

describe('enforcePerRoleSeatLimit', () => {
  it('allows when under limit', async () => {
    await seedOrg();
    await seedUser('inviter-user');
    await seedEntitlement(SEAT_RESOURCE_TYPES.ADMIN, 10);
    await seedMember('admin-1', 'admin');

    await expect(
      enforcePerRoleSeatLimit(testRunDbClient, ORG_ID, 'admin')
    ).resolves.toBeUndefined();
  });

  it('throws when at capacity', async () => {
    await seedOrg();
    await seedUser('inviter-user');
    await seedEntitlement(SEAT_RESOURCE_TYPES.ADMIN, 1);
    await seedMember('admin-1', 'admin');

    await expect(enforcePerRoleSeatLimit(testRunDbClient, ORG_ID, 'admin')).rejects.toThrow(
      'Admin seat limit reached (1/1)'
    );
  });

  it('throws APIError with structured body when at capacity', async () => {
    await seedOrg();
    await seedUser('inviter-user');
    await seedEntitlement(SEAT_RESOURCE_TYPES.ADMIN, 1);
    await seedMember('admin-1', 'admin');

    try {
      await enforcePerRoleSeatLimit(testRunDbClient, ORG_ID, 'admin');
      expect.unreachable('should have thrown');
    } catch (error: any) {
      expect(error.status).toBe('PAYMENT_REQUIRED');
      expect(error.body.code).toBe('ENTITLEMENT_LIMIT_REACHED');
      expect(error.body.resourceType).toBe('seat:admin');
      expect(error.body.current).toBe(1);
      expect(error.body.limit).toBe(1);
    }
  });

  it('allows when no entitlement row exists (uncapped)', async () => {
    await seedOrg();
    await seedUser('inviter-user');
    await seedMember('admin-1', 'admin');

    await expect(
      enforcePerRoleSeatLimit(testRunDbClient, ORG_ID, 'admin')
    ).resolves.toBeUndefined();
  });

  it('owner counts toward admin bucket enforcement', async () => {
    await seedOrg();
    await seedUser('inviter-user');
    await seedEntitlement(SEAT_RESOURCE_TYPES.ADMIN, 1);
    await seedMember('owner-1', 'owner');

    await expect(enforcePerRoleSeatLimit(testRunDbClient, ORG_ID, 'admin')).rejects.toThrow(
      'Admin seat limit reached (1/1)'
    );
  });

  it('pending invitations do not count toward limit', async () => {
    await seedOrg();
    await seedUser('inviter-user');
    await seedEntitlement(SEAT_RESOURCE_TYPES.MEMBER, 2);
    await seedMember('member-1', 'member');
    await seedInvitation('pending@test.com', 'member', 'pending');

    await expect(
      enforcePerRoleSeatLimit(testRunDbClient, ORG_ID, 'member')
    ).resolves.toBeUndefined();
  });
});

describe('resolveTotalMembershipLimit', () => {
  it('returns 300 when no entitlements exist', async () => {
    await seedOrg();

    const result = await resolveTotalMembershipLimit(testRunDbClient, ORG_ID, false);
    expect(result).toBe(DEFAULT_MEMBERSHIP_LIMIT);
  });

  it('returns sum of seat entitlements when rows exist', async () => {
    await seedOrg();
    await seedEntitlement(SEAT_RESOURCE_TYPES.ADMIN, 10);
    await seedEntitlement(SEAT_RESOURCE_TYPES.MEMBER, 20);

    const result = await resolveTotalMembershipLimit(testRunDbClient, ORG_ID, false);
    expect(result).toBe(30);
  });

  it('adds 1 for service account', async () => {
    await seedOrg();
    await seedEntitlement(SEAT_RESOURCE_TYPES.ADMIN, 10);
    await seedEntitlement(SEAT_RESOURCE_TYPES.MEMBER, 20);

    const result = await resolveTotalMembershipLimit(testRunDbClient, ORG_ID, true);
    expect(result).toBe(31);
  });

  it('returns 301 when no entitlements and has service account', async () => {
    await seedOrg();

    const result = await resolveTotalMembershipLimit(testRunDbClient, ORG_ID, true);
    expect(result).toBe(DEFAULT_MEMBERSHIP_LIMIT + 1);
  });
});
