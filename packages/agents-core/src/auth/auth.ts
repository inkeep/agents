import { sso } from '@better-auth/sso';
import { type BetterAuthAdvancedOptions, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous, bearer, deviceAuthorization, oAuthProxy, organization } from 'better-auth/plugins';
import type { GoogleOptions } from 'better-auth/social-providers';
import { eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import { env } from '../env';
import { generateId } from '../utils';
import * as authSchema from './auth-schema';
import { ac, adminRole, memberRole, ownerRole } from './permissions';

/**
 * Get the user's initial organization for a new session.
 * Returns the oldest organization the user is a member of.
 * See: https://www.better-auth.com/docs/plugins/organization#active-organization
 */
async function getInitialOrganization(
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

export interface OIDCProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksEndpoint?: string;
  discoveryEndpoint?: string;
  scopes?: string[];
  pkce?: boolean;
  mapping?: {
    id?: string;
    email?: string;
    emailVerified?: string;
    name?: string;
    image?: string;
    extraFields?: Record<string, string>;
  };
}

export interface SAMLProviderConfig {
  entryPoint: string;
  cert: string;
  callbackUrl: string;
  audience?: string;
  wantAssertionsSigned?: boolean;
  signatureAlgorithm?: string;
  digestAlgorithm?: string;
  identifierFormat?: string;
  mapping?: {
    id?: string;
    email?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    emailVerified?: string;
    extraFields?: Record<string, string>;
  };
}

export interface SSOProviderConfig {
  providerId: string;
  issuer: string;
  domain: string;
  organizationId?: string;
  oidcConfig?: OIDCProviderConfig;
  samlConfig?: SAMLProviderConfig;
}

export interface BetterAuthConfig {
  baseURL: string;
  secret: string;
  dbClient: AgentsRunDatabaseClient;
  ssoProviders?: SSOProviderConfig[];
  socialProviders?: {
    google?: GoogleOptions;
  };
  advanced?: BetterAuthAdvancedOptions;
}

export interface UserAuthConfig {
  ssoProviders?: SSOProviderConfig[];
  socialProviders?: {
    google?: GoogleOptions;
  };
  advanced?: BetterAuthAdvancedOptions;
}

/**
 * Extracts the root domain from a URL for cross-subdomain cookie sharing.
 * For example:
 * - https://manage-api.pilot.inkeep.com -> .pilot.inkeep.com
 * - https://pilot.inkeep.com -> .pilot.inkeep.com
 * - http://localhost:3002 -> undefined (no domain for localhost)
 *
 * The logic extracts the parent domain that can be shared across subdomains.
 * For domains with 3+ parts, it takes everything except the first part.
 * For domains with exactly 2 parts, it takes both parts.
 */
function extractCookieDomain(baseURL: string): string | undefined {
  try {
    const url = new URL(baseURL);
    const hostname = url.hostname;

    // Don't set domain for localhost or IP addresses
    if (hostname === 'localhost' || hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return undefined;
    }

    // Split hostname into parts
    const parts = hostname.split('.');

    // We need at least 2 parts to form a domain (e.g., inkeep.com)
    if (parts.length < 2) {
      return undefined;
    }

    // Extract the parent domain that can be shared across subdomains
    // Examples:
    // - pilot.inkeep.com (3 parts) -> take all 3 parts -> .pilot.inkeep.com
    // - manage-api.pilot.inkeep.com (4 parts) -> take last 3 parts -> .pilot.inkeep.com
    // - inkeep.com (2 parts) -> take both parts -> .inkeep.com

    let domainParts: string[];
    if (parts.length === 3) {
      // For 3-part domains like pilot.inkeep.com, take all parts
      domainParts = parts;
    } else if (parts.length > 3) {
      // For 4+ part domains like manage-api.pilot.inkeep.com, take everything except first
      domainParts = parts.slice(1);
    } else {
      // For 2-part domains like inkeep.com, take both parts
      domainParts = parts;
    }

    return `.${domainParts.join('.')}`;
  } catch {
    return undefined;
  }
}

async function registerSSOProvider(
  dbClient: AgentsRunDatabaseClient,
  provider: SSOProviderConfig
): Promise<void> {
  try {
    const existing = await dbClient
      .select()
      .from(authSchema.ssoProvider)
      .where(eq(authSchema.ssoProvider.providerId, provider.providerId))
      .limit(1);

    if (existing.length > 0) {
      return;
    }

    if (!provider.domain) {
      throw new Error(`SSO provider '${provider.providerId}' must have a domain`);
    }

    await dbClient.insert(authSchema.ssoProvider).values({
      id: generateId(),
      providerId: provider.providerId,
      issuer: provider.issuer,
      domain: provider.domain,
      oidcConfig: provider.oidcConfig ? JSON.stringify(provider.oidcConfig) : null,
      samlConfig: provider.samlConfig ? JSON.stringify(provider.samlConfig) : null,
      userId: null,
      organizationId: provider.organizationId || null,
    });
  } catch (error) {
    console.error(`❌ Failed to register SSO provider '${provider.providerId}':`, error);
  }
}

export function createAuth(config: BetterAuthConfig) {
  // Extract cookie domain from baseURL for cross-subdomain cookie sharing
  const cookieDomain = extractCookieDomain(config.baseURL);

  const auth = betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(config.dbClient, {
      provider: 'pg',
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      autoSignIn: true,
    },
    // Automatically set user's first organization as active when session is created
    // See: https://www.better-auth.com/docs/plugins/organization#active-organization
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const organization = await getInitialOrganization(config.dbClient, session.userId);
            return {
              data: {
                ...session,
                activeOrganizationId: organization?.id ?? null,
              },
            };
          },
        },
      },
    },
    socialProviders: config.socialProviders?.google && {
      google: {
        ...config.socialProviders.google,
        // For local/preview env, redirect to production URL registered in Google Console
        ...(env.OAUTH_PROXY_PRODUCTION_URL && {
          redirectURI: `${env.OAUTH_PROXY_PRODUCTION_URL}/api/auth/callback/google`,
        }),
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: 'compact',
      },
    },
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
        ...(cookieDomain && { domain: cookieDomain }),
      },
      defaultCookieAttributes: {
        sameSite: 'none',
        secure: true,
        httpOnly: true,
        partitioned: true,
        ...(cookieDomain && { domain: cookieDomain }),
      },
      ...config.advanced,
    },
    trustedOrigins: [
      'http://localhost:3000',
      'http://localhost:3002',
      env.INKEEP_AGENTS_MANAGE_UI_URL,
      env.INKEEP_AGENTS_MANAGE_API_URL,
      env.TRUSTED_ORIGIN,
    ].filter((origin): origin is string => typeof origin === 'string' && origin.length > 0),
    plugins: [
      anonymous(),
      bearer(),
      sso(),
      oAuthProxy({
        productionURL: env.OAUTH_PROXY_PRODUCTION_URL || config.baseURL,
      }),
      organization({
        allowUserToCreateOrganization: true,
        ac,
        roles: {
          member: memberRole,
          admin: adminRole,
          owner: ownerRole,
        },
        membershipLimit: 300,
        invitationLimit: 300,
        invitationExpiresIn: 7 * 24 * 60 * 60, // 7 days (in seconds)
        async sendInvitationEmail(data) {
          console.log('📧 Invitation created:', {
            email: data.email,
            invitedBy: data.inviter.user.name || data.inviter.user.email,
            organization: data.organization.name,
            invitationId: data.id,
          });

          // Note: The invitation link is displayed in the UI with a copy button.
          // If you want to send actual emails, configure an email provider:
          // - Resend: await resend.emails.send({ ... })
          // - SendGrid: await sgMail.send({ ... })
          // - AWS SES: await ses.sendEmail({ ... })
          // - Postmark: await postmark.sendEmail({ ... })
        },
      }),
      deviceAuthorization({
        verificationUri: '/device',
        expiresIn: '60m', // 30 minutes
        interval: '5s', // 5 second polling interval
        userCodeLength: 8, // e.g., "ABCD-EFGH"
      }),
    ],
  });

  if (config.ssoProviders?.length) {
    const providers = config.ssoProviders;
    setTimeout(async () => {
      for (const provider of providers) {
        await registerSSOProvider(config.dbClient, provider);
      }
    }, 1000);
  }

  return auth;
}

// Type placeholder for type inference in consuming code (e.g., app.ts AppVariables)
// Actual auth instances should be created using createAuth() with a real database client
// This is cast as any to avoid instantiation while preserving type information
export const auth = null as any as ReturnType<typeof createAuth>;
