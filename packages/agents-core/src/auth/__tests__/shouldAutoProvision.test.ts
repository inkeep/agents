import { describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import { shouldAutoProvision } from '../auth-config-utils';
import * as authSchema from '../auth-schema';
import { serializeAllowedAuthMethods } from '../auth-types';

async function insertUser(id: string, email: string) {
  await testRunDbClient.insert(authSchema.user).values({
    id,
    name: email.split('@')[0],
    email,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function insertOrganization(id: string, slug: string, allowedAuthMethods?: string | null) {
  await testRunDbClient.insert(authSchema.organization).values({
    id,
    name: `Org ${slug}`,
    slug,
    createdAt: new Date(),
    allowedAuthMethods: allowedAuthMethods ?? null,
  });
}

async function insertMember(userId: string, organizationId: string) {
  await testRunDbClient.insert(authSchema.member).values({
    id: `${userId}_${organizationId}`,
    userId,
    organizationId,
    role: 'member',
    createdAt: new Date(),
  });
}

async function insertInvitation(
  email: string,
  organizationId: string,
  status: string,
  inviterId: string
) {
  await testRunDbClient.insert(authSchema.invitation).values({
    id: `inv_${email}_${organizationId}`,
    email,
    organizationId,
    role: 'member',
    status,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    inviterId,
  });
}

function ssoAllowedMethods(providerId: string, { autoProvision = true, enabled = true } = {}) {
  return serializeAllowedAuthMethods([
    { method: 'email-password' },
    {
      method: 'sso',
      providerId,
      displayName: 'Test SSO',
      autoProvision,
      enabled,
    },
  ]);
}

describe('shouldAutoProvision', () => {
  it('should return false when providerId is missing', async () => {
    const result = await shouldAutoProvision(
      testRunDbClient,
      { id: 'user-1', email: 'user@test.com' },
      { organizationId: 'org-1' }
    );
    expect(result).toBe(false);
  });

  it('should return false when organizationId is missing', async () => {
    const result = await shouldAutoProvision(
      testRunDbClient,
      { id: 'user-1', email: 'user@test.com' },
      { providerId: 'provider-1' }
    );
    expect(result).toBe(false);
  });

  it('should return false when organizationId is null', async () => {
    const result = await shouldAutoProvision(
      testRunDbClient,
      { id: 'user-1', email: 'user@test.com' },
      { organizationId: null, providerId: 'provider-1' }
    );
    expect(result).toBe(false);
  });

  it('should return false when organization does not exist in DB', async () => {
    await insertUser('ap-user-1', 'user@test.com');

    const result = await shouldAutoProvision(
      testRunDbClient,
      { id: 'ap-user-1', email: 'user@test.com' },
      { organizationId: 'nonexistent-org', providerId: 'provider-1' }
    );
    expect(result).toBe(false);
  });

  it('should return false when allowedAuthMethods has no matching SSO entry', async () => {
    await insertUser('ap-user-2', 'user2@test.com');
    await insertOrganization(
      'ap-org-no-match',
      'org-no-match',
      serializeAllowedAuthMethods([{ method: 'email-password' }])
    );

    const result = await shouldAutoProvision(
      testRunDbClient,
      { id: 'ap-user-2', email: 'user2@test.com' },
      { organizationId: 'ap-org-no-match', providerId: 'provider-1' }
    );
    expect(result).toBe(false);
  });

  it('should return false when SSO entry exists but is disabled', async () => {
    await insertUser('ap-user-3', 'user3@test.com');
    await insertOrganization(
      'ap-org-disabled',
      'org-disabled',
      ssoAllowedMethods('provider-1', { enabled: false })
    );

    const result = await shouldAutoProvision(
      testRunDbClient,
      { id: 'ap-user-3', email: 'user3@test.com' },
      { organizationId: 'ap-org-disabled', providerId: 'provider-1' }
    );
    expect(result).toBe(false);
  });

  it('should return false when SSO entry has autoProvision disabled', async () => {
    await insertUser('ap-user-4', 'user4@test.com');
    await insertOrganization(
      'ap-org-no-auto',
      'org-no-auto',
      ssoAllowedMethods('provider-1', { autoProvision: false })
    );

    const result = await shouldAutoProvision(
      testRunDbClient,
      { id: 'ap-user-4', email: 'user4@test.com' },
      { organizationId: 'ap-org-no-auto', providerId: 'provider-1' }
    );
    expect(result).toBe(false);
  });

  it('should return false when user is already a member', async () => {
    await insertUser('ap-user-5', 'user5@test.com');
    await insertOrganization('ap-org-member', 'org-member', ssoAllowedMethods('provider-1'));
    await insertMember('ap-user-5', 'ap-org-member');

    const result = await shouldAutoProvision(
      testRunDbClient,
      { id: 'ap-user-5', email: 'user5@test.com' },
      { organizationId: 'ap-org-member', providerId: 'provider-1' }
    );
    expect(result).toBe(false);
  });

  it('should return false when user has a pending invitation (invitation takes precedence)', async () => {
    await insertUser('ap-user-inv', 'invited@test.com');
    await insertOrganization('ap-org-inv', 'org-inv', ssoAllowedMethods('provider-1'));
    await insertInvitation('invited@test.com', 'ap-org-inv', 'pending', 'ap-user-inv');

    const result = await shouldAutoProvision(
      testRunDbClient,
      { id: 'ap-user-inv', email: 'invited@test.com' },
      { organizationId: 'ap-org-inv', providerId: 'provider-1' }
    );
    expect(result).toBe(false);
  });

  it('should return true when all conditions are met', async () => {
    await insertUser('ap-user-6', 'user6@test.com');
    await insertOrganization('ap-org-ok', 'org-ok', ssoAllowedMethods('provider-1'));

    const result = await shouldAutoProvision(
      testRunDbClient,
      { id: 'ap-user-6', email: 'user6@test.com' },
      { organizationId: 'ap-org-ok', providerId: 'provider-1' }
    );
    expect(result).toBe(true);
  });

  it('should return true when invitation exists but is not pending (e.g. accepted)', async () => {
    await insertUser('ap-user-7', 'accepted@test.com');
    await insertOrganization('ap-org-accepted', 'org-accepted', ssoAllowedMethods('provider-1'));
    await insertInvitation('accepted@test.com', 'ap-org-accepted', 'accepted', 'ap-user-7');

    const result = await shouldAutoProvision(
      testRunDbClient,
      { id: 'ap-user-7', email: 'accepted@test.com' },
      { organizationId: 'ap-org-accepted', providerId: 'provider-1' }
    );
    expect(result).toBe(true);
  });

  it('should return false when SSO provider ID does not match', async () => {
    await insertUser('ap-user-8', 'user8@test.com');
    await insertOrganization(
      'ap-org-wrong-provider',
      'org-wrong-provider',
      ssoAllowedMethods('provider-different')
    );

    const result = await shouldAutoProvision(
      testRunDbClient,
      { id: 'ap-user-8', email: 'user8@test.com' },
      { organizationId: 'ap-org-wrong-provider', providerId: 'provider-1' }
    );
    expect(result).toBe(false);
  });

  it('should return false when allowedAuthMethods is null (defaults to email-password only)', async () => {
    await insertUser('ap-user-9', 'user9@test.com');
    await insertOrganization('ap-org-null', 'org-null', null);

    const result = await shouldAutoProvision(
      testRunDbClient,
      { id: 'ap-user-9', email: 'user9@test.com' },
      { organizationId: 'ap-org-null', providerId: 'provider-1' }
    );
    expect(result).toBe(false);
  });
});
