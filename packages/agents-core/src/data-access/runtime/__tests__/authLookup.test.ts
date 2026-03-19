import { describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../../__tests__/setup';
import * as authSchema from '../../../auth/auth-schema';
import { serializeAllowedAuthMethods } from '../../../auth/auth-types';
import {
  allowedMethodsToMethodOptions,
  getAuthLookupForEmail,
  getFilteredAuthMethodsForEmail,
  type SSOProviderLookupResult,
} from '../organizations';

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

async function insertOrganization(
  id: string,
  slug: string,
  opts: {
    allowedAuthMethods?: string | null;
    preferredAuthMethod?: string | null;
    serviceAccountUserId?: string | null;
  } = {}
) {
  await testRunDbClient.insert(authSchema.organization).values({
    id,
    name: `Org ${slug}`,
    slug,
    createdAt: new Date(),
    allowedAuthMethods: opts.allowedAuthMethods ?? null,
    preferredAuthMethod: opts.preferredAuthMethod ?? null,
    serviceAccountUserId: opts.serviceAccountUserId ?? null,
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

async function insertSSOProvider(
  providerId: string,
  domain: string,
  organizationId: string | null,
  opts: { oidcConfig?: string | null; samlConfig?: string | null } = {}
) {
  await testRunDbClient.insert(authSchema.ssoProvider).values({
    id: `sso_${providerId}`,
    issuer: `https://${domain}/issuer`,
    providerId,
    domain,
    organizationId,
    oidcConfig: opts.oidcConfig ?? '{}',
    samlConfig: opts.samlConfig ?? null,
  });
}

describe('allowedMethodsToMethodOptions', () => {
  it('should convert email-password method', () => {
    const result = allowedMethodsToMethodOptions([{ method: 'email-password' }], []);
    expect(result).toEqual([{ method: 'email-password' }]);
  });

  it('should convert google method', () => {
    const result = allowedMethodsToMethodOptions([{ method: 'google' }], []);
    expect(result).toEqual([{ method: 'google' }]);
  });

  it('should include SSO only when matching provider exists', () => {
    const providers: SSOProviderLookupResult[] = [
      {
        providerId: 'okta-provider',
        issuer: 'https://example.okta.com',
        domain: 'example.com',
        organizationId: 'org-1',
        providerType: 'oidc',
      },
    ];

    const result = allowedMethodsToMethodOptions(
      [
        {
          method: 'sso',
          providerId: 'okta-provider',
          displayName: 'Okta',
          autoProvision: true,
          enabled: true,
        },
      ],
      providers
    );

    expect(result).toEqual([
      {
        method: 'sso',
        providerId: 'okta-provider',
        providerType: 'oidc',
        displayName: 'Okta',
      },
    ]);
  });

  it('should exclude SSO when provider is not in the domain list', () => {
    const result = allowedMethodsToMethodOptions(
      [
        {
          method: 'sso',
          providerId: 'missing-provider',
          displayName: 'Missing',
          autoProvision: true,
          enabled: true,
        },
      ],
      []
    );
    expect(result).toEqual([]);
  });

  it('should exclude disabled SSO entries', () => {
    const providers: SSOProviderLookupResult[] = [
      {
        providerId: 'disabled-provider',
        issuer: 'https://sso.example.com',
        domain: 'example.com',
        organizationId: 'org-1',
        providerType: 'oidc',
      },
    ];

    const result = allowedMethodsToMethodOptions(
      [
        {
          method: 'sso',
          providerId: 'disabled-provider',
          displayName: 'Disabled SSO',
          autoProvision: true,
          enabled: false,
        },
      ],
      providers
    );
    expect(result).toEqual([]);
  });

  it('should detect SAML provider type', () => {
    const providers: SSOProviderLookupResult[] = [
      {
        providerId: 'saml-provider',
        issuer: 'https://saml.example.com',
        domain: 'example.com',
        organizationId: 'org-1',
        providerType: 'saml',
      },
    ];

    const result = allowedMethodsToMethodOptions(
      [
        {
          method: 'sso',
          providerId: 'saml-provider',
          displayName: 'SAML SSO',
          autoProvision: false,
          enabled: true,
        },
      ],
      providers
    );

    expect(result).toEqual([
      {
        method: 'sso',
        providerId: 'saml-provider',
        providerType: 'saml',
        displayName: 'SAML SSO',
      },
    ]);
  });

  it('should handle mixed method types', () => {
    const providers: SSOProviderLookupResult[] = [
      {
        providerId: 'okta',
        issuer: 'https://example.okta.com',
        domain: 'example.com',
        organizationId: 'org-1',
        providerType: 'oidc',
      },
    ];

    const result = allowedMethodsToMethodOptions(
      [
        { method: 'email-password' },
        { method: 'google' },
        {
          method: 'sso',
          providerId: 'okta',
          displayName: 'Okta',
          autoProvision: true,
          enabled: true,
        },
      ],
      providers
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ method: 'email-password' });
    expect(result[1]).toEqual({ method: 'google' });
    expect(result[2]).toEqual({
      method: 'sso',
      providerId: 'okta',
      providerType: 'oidc',
      displayName: 'Okta',
    });
  });
});

describe('getFilteredAuthMethodsForEmail', () => {
  it('should return empty array for email without domain', async () => {
    const result = await getFilteredAuthMethodsForEmail(testRunDbClient)('org-1', 'nodomain');
    expect(result).toEqual([]);
  });

  it('should return email-password for org with default config', async () => {
    await insertOrganization('gf-org-default', 'gf-org-default');

    const result = await getFilteredAuthMethodsForEmail(testRunDbClient)(
      'gf-org-default',
      'user@example.com'
    );
    expect(result).toEqual([{ method: 'email-password' }]);
  });

  it('should include SSO method when domain matches', async () => {
    const methods = serializeAllowedAuthMethods([
      { method: 'email-password' },
      {
        method: 'sso',
        providerId: 'gf-sso-1',
        displayName: 'Corp SSO',
        autoProvision: true,
        enabled: true,
      },
    ]);
    await insertOrganization('gf-org-sso', 'gf-org-sso', { allowedAuthMethods: methods });
    await insertSSOProvider('gf-sso-1', 'corp.com', 'gf-org-sso');

    const result = await getFilteredAuthMethodsForEmail(testRunDbClient)(
      'gf-org-sso',
      'user@corp.com'
    );

    expect(result).toEqual([
      { method: 'email-password' },
      {
        method: 'sso',
        providerId: 'gf-sso-1',
        providerType: 'oidc',
        displayName: 'Corp SSO',
      },
    ]);
  });

  it('should exclude SSO when email domain does not match', async () => {
    const methods = serializeAllowedAuthMethods([
      { method: 'email-password' },
      {
        method: 'sso',
        providerId: 'gf-sso-2',
        displayName: 'Corp SSO',
        autoProvision: true,
        enabled: true,
      },
    ]);
    await insertOrganization('gf-org-no-domain', 'gf-org-no-domain', {
      allowedAuthMethods: methods,
    });
    await insertSSOProvider('gf-sso-2', 'corp.com', 'gf-org-no-domain');

    const result = await getFilteredAuthMethodsForEmail(testRunDbClient)(
      'gf-org-no-domain',
      'user@other-domain.com'
    );

    expect(result).toEqual([{ method: 'email-password' }]);
  });

  it('should exclude SSO belonging to a different organization', async () => {
    const methods = serializeAllowedAuthMethods([
      {
        method: 'sso',
        providerId: 'gf-sso-other',
        displayName: 'Other Org SSO',
        autoProvision: true,
        enabled: true,
      },
    ]);
    await insertOrganization('gf-org-a', 'gf-org-a', { allowedAuthMethods: methods });
    await insertSSOProvider('gf-sso-other', 'shared.com', 'gf-org-b-other');

    const result = await getFilteredAuthMethodsForEmail(testRunDbClient)(
      'gf-org-a',
      'user@shared.com'
    );
    expect(result).toEqual([]);
  });
});

describe('getAuthLookupForEmail', () => {
  it('should return empty array for email without domain', async () => {
    const result = await getAuthLookupForEmail(testRunDbClient)('nodomain');
    expect(result).toEqual([]);
  });

  it('should find organizations via SSO domain match', async () => {
    const methods = serializeAllowedAuthMethods([
      { method: 'email-password' },
      {
        method: 'sso',
        providerId: 'al-sso-1',
        displayName: 'Corp SSO',
        autoProvision: true,
        enabled: true,
      },
    ]);
    await insertOrganization('al-org-sso', 'al-org-sso', { allowedAuthMethods: methods });
    await insertSSOProvider('al-sso-1', 'sso-domain.com', 'al-org-sso');

    const result = await getAuthLookupForEmail(testRunDbClient)('user@sso-domain.com');

    expect(result).toHaveLength(1);
    expect(result[0].organizationId).toBe('al-org-sso');
    expect(result[0].organizationName).toBe('Org al-org-sso');
    expect(result[0].methods).toEqual([
      { method: 'email-password' },
      {
        method: 'sso',
        providerId: 'al-sso-1',
        providerType: 'oidc',
        displayName: 'Corp SSO',
      },
    ]);
  });

  it('should find organizations via user membership', async () => {
    await insertUser('al-user-member', 'member@membership.com');
    await insertOrganization('al-org-membership', 'al-org-membership');
    await insertMember('al-user-member', 'al-org-membership');

    const result = await getAuthLookupForEmail(testRunDbClient)('member@membership.com');

    expect(result).toHaveLength(1);
    expect(result[0].organizationId).toBe('al-org-membership');
    expect(result[0].methods).toEqual([{ method: 'email-password' }]);
  });

  it('should deduplicate orgs found via both SSO and membership', async () => {
    const methods = serializeAllowedAuthMethods([
      { method: 'email-password' },
      {
        method: 'sso',
        providerId: 'al-sso-dedup',
        displayName: 'Dedup SSO',
        autoProvision: true,
        enabled: true,
      },
    ]);
    await insertUser('al-user-dedup', 'dedup@dedup-domain.com');
    await insertOrganization('al-org-dedup', 'al-org-dedup', { allowedAuthMethods: methods });
    await insertSSOProvider('al-sso-dedup', 'dedup-domain.com', 'al-org-dedup');
    await insertMember('al-user-dedup', 'al-org-dedup');

    const result = await getAuthLookupForEmail(testRunDbClient)('dedup@dedup-domain.com');

    expect(result).toHaveLength(1);
    expect(result[0].organizationId).toBe('al-org-dedup');
  });

  it('should return multiple orgs when user belongs to several', async () => {
    await insertUser('al-user-multi', 'multi@multi.com');
    await insertOrganization('al-org-multi-1', 'al-org-multi-1');
    await insertOrganization('al-org-multi-2', 'al-org-multi-2');
    await insertMember('al-user-multi', 'al-org-multi-1');
    await insertMember('al-user-multi', 'al-org-multi-2');

    const result = await getAuthLookupForEmail(testRunDbClient)('multi@multi.com');

    expect(result).toHaveLength(2);
    const orgIds = result.map((r) => r.organizationId).sort();
    expect(orgIds).toEqual(['al-org-multi-1', 'al-org-multi-2']);
  });

  it('should return empty for unknown user with no SSO domain match', async () => {
    const result = await getAuthLookupForEmail(testRunDbClient)('nobody@unknown-domain.com');
    expect(result).toEqual([]);
  });

  it('should add email-password for service account orgs', async () => {
    await insertUser('al-sa-user', 'sa@sa-domain.com');
    const ssoMethods = serializeAllowedAuthMethods([
      {
        method: 'sso',
        providerId: 'al-sso-sa',
        displayName: 'SA SSO',
        autoProvision: true,
        enabled: true,
      },
    ]);
    await insertOrganization('al-org-sa', 'al-org-sa', {
      allowedAuthMethods: ssoMethods,
      serviceAccountUserId: 'al-sa-user',
    });

    const result = await getAuthLookupForEmail(testRunDbClient)('sa@sa-domain.com');

    expect(result).toHaveLength(1);
    expect(result[0].organizationId).toBe('al-org-sa');
    expect(result[0].methods[0]).toEqual({ method: 'email-password' });
  });
});
