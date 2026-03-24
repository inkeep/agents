import { generateId } from 'better-auth';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import {
  account,
  invitation,
  member,
  organization,
  ssoProvider,
  user,
} from '../../auth/auth-schema';
import {
  type AllowedAuthMethod,
  type MethodOption,
  type OrgAuthInfo,
  parseAllowedAuthMethods,
} from '../../auth/auth-types';
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
        authMethod: invitation.authMethod,
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
  async (data: {
    userId: string;
    organizationId: string;
    role: string;
    isServiceAccount?: boolean;
  }): Promise<void> => {
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
      if (data.isServiceAccount) {
        await db
          .update(organization)
          .set({ serviceAccountUserId: data.userId })
          .where(eq(organization.id, data.organizationId));
      }
      return;
    }

    await db.insert(member).values({
      id: `${data.userId}_${data.organizationId}`,
      userId: data.userId,
      organizationId: data.organizationId,
      role: data.role,
      createdAt: new Date(),
    });

    if (data.isServiceAccount) {
      await db
        .update(organization)
        .set({ serviceAccountUserId: data.userId })
        .where(eq(organization.id, data.organizationId));
    }
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
 * Returns which providers each user has linked (e.g., 'credential', 'google').
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

export const getAllowedAuthMethods =
  (db: AgentsRunDatabaseClient) =>
  async (organizationId: string): Promise<AllowedAuthMethod[]> => {
    const result = await db
      .select({
        allowedAuthMethods: organization.allowedAuthMethods,
      })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);

    const org = result[0];
    if (!org) return [{ method: 'email-password' }];

    return parseAllowedAuthMethods(org.allowedAuthMethods);
  };

/**
 * Create an invitation directly in db.
 * Accepts an optional explicit authMethod; defaults to email-password.
 */
export const createInvitationInDb =
  (db: AgentsRunDatabaseClient) =>
  async (data: {
    organizationId: string;
    email: string;
    authMethod?: string;
  }): Promise<{ id: string; authMethod: string }> => {
    const org = await db
      .select({
        serviceAccountUserId: organization.serviceAccountUserId,
        allowedAuthMethods: organization.allowedAuthMethods,
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

    const resolvedMethod = data.authMethod || orgSettings.preferredAuthMethod || 'email-password';

    const inviteId = generateId();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(invitation).values({
      id: inviteId,
      organizationId: data.organizationId,
      email: data.email,
      role: 'member',
      status: 'pending',
      expiresAt,
      inviterId: orgSettings.serviceAccountUserId,
      authMethod: resolvedMethod,
    });

    return { id: inviteId, authMethod: resolvedMethod };
  };

export interface SSOProviderLookupResult {
  providerId: string;
  issuer: string;
  domain: string;
  organizationId: string | null;
  providerType: 'oidc' | 'saml';
}

export const getSSOProvidersByDomain =
  (db: AgentsRunDatabaseClient) =>
  async (domain: string): Promise<SSOProviderLookupResult[]> => {
    const result = await db
      .select({
        providerId: ssoProvider.providerId,
        issuer: ssoProvider.issuer,
        domain: ssoProvider.domain,
        organizationId: ssoProvider.organizationId,
        oidcConfig: ssoProvider.oidcConfig,
        samlConfig: ssoProvider.samlConfig,
      })
      .from(ssoProvider)
      .where(eq(ssoProvider.domain, domain));

    return result.map((provider) => ({
      providerId: provider.providerId,
      issuer: provider.issuer,
      domain: provider.domain,
      organizationId: provider.organizationId,
      providerType: (provider.samlConfig ? 'saml' : 'oidc') as 'oidc' | 'saml',
    }));
  };

export type { MethodOption, OrgAuthInfo };

/**
 * Filters org-allowed auth methods by email domain.
 * SSO providers are only included if their domain matches the user's email domain.
 * Non-SSO methods (email-password, google) pass through unfiltered.
 */
export const getFilteredAuthMethodsForEmail =
  (db: AgentsRunDatabaseClient) =>
  async (organizationId: string, email: string): Promise<MethodOption[]> => {
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (!emailDomain) return [];

    const [allowed, domainProviders] = await Promise.all([
      getAllowedAuthMethods(db)(organizationId),
      getSSOProvidersByDomain(db)(emailDomain),
    ]);

    const orgProviders = domainProviders.filter((p) => p.organizationId === organizationId);
    return allowedMethodsToMethodOptions(allowed, orgProviders);
  };

export function allowedMethodsToMethodOptions(
  methods: AllowedAuthMethod[],
  ssoProviders: SSOProviderLookupResult[]
): MethodOption[] {
  const options: MethodOption[] = [];

  for (const m of methods) {
    if (m.method === 'email-password') {
      options.push({ method: 'email-password' });
    } else if (m.method === 'google') {
      options.push({ method: 'google' });
    } else if (m.method === 'sso') {
      if (!m.enabled) continue;
      const provider = ssoProviders.find((p) => p.providerId === m.providerId);
      if (!provider) continue;
      options.push({
        method: 'sso',
        providerId: m.providerId,
        providerType: provider.providerType,
        displayName: m.displayName,
      });
    }
  }

  return options;
}

/**
 * Main auth-lookup query for the login flow.
 * Returns org-grouped methods based on SSO domain match and/or user org membership.
 */
export const getAuthLookupForEmail =
  (db: AgentsRunDatabaseClient) =>
  async (email: string): Promise<OrgAuthInfo[]> => {
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (!emailDomain) return [];

    const orgMap = new Map<string, OrgAuthInfo>();

    const domainProviders = await getSSOProvidersByDomain(db)(emailDomain);
    const orgIdsFromSSO = [
      ...new Set(domainProviders.map((p) => p.organizationId).filter(Boolean) as string[]),
    ];

    for (const orgId of orgIdsFromSSO) {
      const orgRow = await db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          allowedAuthMethods: organization.allowedAuthMethods,
          preferredAuthMethod: organization.preferredAuthMethod,
        })
        .from(organization)
        .where(eq(organization.id, orgId))
        .limit(1);

      const org = orgRow[0];
      if (!org) continue;

      const allowed = parseAllowedAuthMethods(org.allowedAuthMethods);
      const orgSSO = domainProviders.filter((p) => p.organizationId === orgId);

      orgMap.set(orgId, {
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
        methods: allowedMethodsToMethodOptions(allowed, orgSSO),
      });
    }

    const userRow = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);

    if (userRow[0]) {
      const memberships = await db
        .select({
          organizationId: member.organizationId,
          orgName: organization.name,
          orgSlug: organization.slug,
          allowedAuthMethods: organization.allowedAuthMethods,
          preferredAuthMethod: organization.preferredAuthMethod,
        })
        .from(member)
        .innerJoin(organization, eq(member.organizationId, organization.id))
        .where(eq(member.userId, userRow[0].id));

      for (const m of memberships) {
        if (orgMap.has(m.organizationId)) continue;

        const allowed = parseAllowedAuthMethods(m.allowedAuthMethods);
        const orgSSO = domainProviders.filter((p) => p.organizationId === m.organizationId);

        orgMap.set(m.organizationId, {
          organizationId: m.organizationId,
          organizationName: m.orgName,
          organizationSlug: m.orgSlug,
          methods: allowedMethodsToMethodOptions(allowed, orgSSO),
        });
      }

      const serviceAccountOrgs = await db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        })
        .from(organization)
        .where(eq(organization.serviceAccountUserId, userRow[0].id));

      for (const org of serviceAccountOrgs) {
        const existing = orgMap.get(org.id);
        if (existing) {
          if (!existing.methods.some((m) => m.method === 'email-password')) {
            existing.methods.unshift({ method: 'email-password' });
          }
        } else {
          orgMap.set(org.id, {
            organizationId: org.id,
            organizationName: org.name,
            organizationSlug: org.slug,
            methods: [{ method: 'email-password' }],
          });
        }
      }
    }

    return [...orgMap.values()];
  };
