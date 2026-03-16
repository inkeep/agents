import { and, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import { env } from '../env';
import * as authSchema from './auth-schema';
import type { AllowedAuthMethod } from './auth-types';
import { parseAllowedAuthMethods } from './auth-types';

/**
 * Get the user's initial organization for a new session.
 * Returns the oldest organization the user is a member of.
 * See: https://www.better-auth.com/docs/plugins/organization#active-organization
 */
export async function getInitialOrganization(
  dbClient: AgentsRunDatabaseClient,
  userId: string
): Promise<{ id: string } | null> {
  const [membership] = await dbClient
    .select({ organizationId: authSchema.member.organizationId })
    .from(authSchema.member)
    .where(eq(authSchema.member.userId, userId))
    .orderBy(authSchema.member.createdAt)
    .limit(1);

  return membership ? { id: membership.organizationId } : null;
}

/**
 * Build the list of trusted origins for Better Auth.
 * Includes static origins from env, SSO provider issuers from the DB,
 * and (for /sso/register POST requests) the issuer from the request body
 * so OIDC discovery is trusted before the provider is persisted.
 */
export async function getTrustedOrigins(
  dbClient: AgentsRunDatabaseClient,
  request: Request | undefined
): Promise<string[]> {
  const staticOrigins = [
    'http://localhost:3000',
    'http://localhost:3002',
    env.INKEEP_AGENTS_MANAGE_UI_URL,
    env.INKEEP_AGENTS_API_URL,
    env.TRUSTED_ORIGIN,
  ].filter((origin): origin is string => typeof origin === 'string' && origin.length > 0);

  const dynamicOrigins: string[] = [];

  if (
    (request?.url?.includes('/sso/register') || request?.url?.includes('/sso-provider/create')) &&
    request?.method === 'POST'
  ) {
    try {
      const cloned = request.clone();
      const body = await cloned.json();
      const rawUrl = body.issuer || body.oidcConfig?.discoveryUrl || body.oidcConfig?.issuer;
      if (rawUrl) {
        const issuerOrigin = new URL(rawUrl).origin;
        dynamicOrigins.push(issuerOrigin);

        const discoveryOrigins = await fetchOidcDiscoveryOrigins(rawUrl);
        dynamicOrigins.push(...discoveryOrigins);
      }
    } catch {
      // ignore parse errors
    }
  }

  try {
    const providers = await dbClient
      .select({ issuer: authSchema.ssoProvider.issuer })
      .from(authSchema.ssoProvider);

    const issuerOrigins = providers
      .map((p) => {
        try {
          return new URL(p.issuer).origin;
        } catch {
          return null;
        }
      })
      .filter((origin): origin is string => origin !== null);

    const discoveryResults = await Promise.all(
      providers.map((p) => fetchOidcDiscoveryOrigins(p.issuer))
    );

    return [...staticOrigins, ...dynamicOrigins, ...issuerOrigins, ...discoveryResults.flat()];
  } catch {
    return [...staticOrigins, ...dynamicOrigins];
  }
}

async function fetchOidcDiscoveryOrigins(issuer: string): Promise<string[]> {
  try {
    const discoveryUrl = issuer.endsWith('/')
      ? `${issuer}.well-known/openid-configuration`
      : `${issuer}/.well-known/openid-configuration`;

    const res = await fetch(discoveryUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];

    const doc = await res.json();
    const endpointKeys = [
      'authorization_endpoint',
      'token_endpoint',
      'userinfo_endpoint',
      'jwks_uri',
      'revocation_endpoint',
      'introspection_endpoint',
    ];

    const origins: string[] = [];
    for (const key of endpointKeys) {
      if (typeof doc[key] === 'string') {
        try {
          origins.push(new URL(doc[key]).origin);
        } catch {
          // skip malformed URLs
        }
      }
    }
    return [...new Set(origins)];
  } catch {
    return [];
  }
}

/**
 * Extracts the root domain from a URL for cross-subdomain cookie sharing.
 *
 * When the API and UI share a common 3-part parent (e.g., api.pilot.inkeep.com
 * and pilot.inkeep.com both share .pilot.inkeep.com), the function auto-computes
 * the shared parent. When domains don't share a 3-part parent (e.g.,
 * api.agents.inkeep.com and app.inkeep.com), set AUTH_COOKIE_DOMAIN explicitly.
 *
 * Examples (auto-computed from baseURL):
 * - https://api.pilot.inkeep.com -> .pilot.inkeep.com
 * - https://pilot.inkeep.com -> .pilot.inkeep.com
 * - http://localhost:3002 -> undefined (no domain for localhost)
 *
 * With AUTH_COOKIE_DOMAIN=.inkeep.com:
 * - Any *.inkeep.com URL -> .inkeep.com
 */
export function extractCookieDomain(baseURL: string, explicitDomain?: string): string | undefined {
  if (explicitDomain) {
    return explicitDomain.startsWith('.') ? explicitDomain : `.${explicitDomain}`;
  }

  try {
    const url = new URL(baseURL);
    const hostname = url.hostname;

    if (hostname === 'localhost' || hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return undefined;
    }

    const parts = hostname.split('.');

    if (parts.length < 2) {
      return undefined;
    }

    let domainParts: string[];
    if (parts.length === 3) {
      domainParts = parts;
    } else if (parts.length > 3) {
      domainParts = parts.slice(1);
    } else {
      domainParts = parts;
    }

    return `.${domainParts.join('.')}`;
  } catch {
    return undefined;
  }
}

export async function hasCredentialAccount(
  dbClient: AgentsRunDatabaseClient,
  userId: string
): Promise<boolean> {
  const [row] = await dbClient
    .select({ id: authSchema.account.id })
    .from(authSchema.account)
    .where(
      and(eq(authSchema.account.userId, userId), eq(authSchema.account.providerId, 'credential'))
    )
    .limit(1);

  return !!row;
}

/**
 * Checks whether an SSO user should be auto-provisioned into an organization.
 * Reads the per-provider `autoProvision` flag from `allowedAuthMethods` JSON.
 * Returns false if:
 * - The provider has no organizationId or providerId
 * - The organization doesn't exist
 * - The SSO provider entry has autoProvision disabled (or is missing)
 * - The user is already a member
 */
export async function shouldAutoProvision(
  dbClient: AgentsRunDatabaseClient,
  user: { id: string; email: string },
  provider: { organizationId?: string | null; providerId?: string }
): Promise<boolean> {
  if (!provider.organizationId || !provider.providerId) {
    return false;
  }

  const [org] = await dbClient
    .select({ allowedAuthMethods: authSchema.organization.allowedAuthMethods })
    .from(authSchema.organization)
    .where(eq(authSchema.organization.id, provider.organizationId))
    .limit(1);

  if (!org) {
    return false;
  }

  const methods = parseAllowedAuthMethods(org.allowedAuthMethods);
  const ssoEntry = methods.find(
    (m): m is Extract<AllowedAuthMethod, { method: 'sso' }> =>
      m.method === 'sso' && m.providerId === provider.providerId
  );

  if (!ssoEntry || !ssoEntry.enabled || !ssoEntry.autoProvision) {
    return false;
  }

  const existingMember = await dbClient
    .select({ id: authSchema.member.id })
    .from(authSchema.member)
    .where(
      and(
        eq(authSchema.member.userId, user.id),
        eq(authSchema.member.organizationId, provider.organizationId)
      )
    )
    .limit(1);

  if (existingMember.length > 0) {
    return false;
  }

  const pendingInvitation = await dbClient
    .select({ id: authSchema.invitation.id, role: authSchema.invitation.role })
    .from(authSchema.invitation)
    .where(
      and(
        eq(authSchema.invitation.email, user.email),
        eq(authSchema.invitation.organizationId, provider.organizationId),
        eq(authSchema.invitation.status, 'pending')
      )
    )
    .limit(1);

  if (pendingInvitation.length > 0) {
    return false;
  }

  return true;
}
