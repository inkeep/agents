import { oauthProvider } from '@better-auth/oauth-provider';
import { sso } from '@better-auth/sso';
import { type BetterAuthAdvancedOptions, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, deviceAuthorization, jwt, oAuthProxy, organization } from 'better-auth/plugins';
import type { GoogleOptions } from 'better-auth/social-providers';
import { eq } from 'drizzle-orm';
import { type AgentsRunDatabaseClient, createAgentsRunDatabaseClient } from '../db/runtime/runtime-client';
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
 * - https://api.pilot.inkeep.com -> .pilot.inkeep.com
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
    // - api.pilot.inkeep.com (4 parts) -> take last 3 parts -> .pilot.inkeep.com
    // - inkeep.com (2 parts) -> take both parts -> .inkeep.com

    let domainParts: string[];
    if (parts.length === 3) {
      // For 3-part domains like pilot.inkeep.com, take all parts
      domainParts = parts;
    } else if (parts.length > 3) {
      // For 4+ part domains like api.pilot.inkeep.com, take everything except first
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

  // Debug: Log validAudiences at startup
  const validAudiences = [env.INKEEP_AGENTS_API_URL].filter(
    (url): url is string => typeof url === 'string' && url.length > 0
  );
  console.log('[OAuth Provider] validAudiences:', validAudiences);
  console.log('[OAuth Provider] INKEEP_AGENTS_API_URL:', env.INKEEP_AGENTS_API_URL);

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
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['auth0', 'google', 'email-password'],
      },
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
      storeSessionInDatabase: true,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: 'compact',
      },
    },
    disabledPaths: ['/token'],
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
      env.INKEEP_AGENTS_API_URL,
      env.TRUSTED_ORIGIN,
    ].filter((origin): origin is string => typeof origin === 'string' && origin.length > 0),
    plugins: [
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
        organizationHooks: {
          afterAcceptInvitation: async ({ member, user, organization: org }) => {
            try {
              const { syncOrgMemberToSpiceDb } = await import('./authz/sync');
              await syncOrgMemberToSpiceDb({
                tenantId: org.id,
                userId: user.id,
                role: member.role as 'owner' | 'admin' | 'member',
                action: 'add',
              });
              console.log(
                `🔐 SpiceDB: Synced member ${user.email} as ${member.role} to org ${org.name}`
              );
            } catch (error) {
              // Log error but don't fail the invitation acceptance
              console.error('❌ SpiceDB sync failed for new member:', error);
            }
          },
          afterUpdateMemberRole: async ({ member, organization: org, previousRole }) => {
            try {
              const { changeOrgRole } = await import('./authz/sync');
              // previousRole is the old role, member.role is the new role
              const oldRole = previousRole as 'owner' | 'admin' | 'member';
              const newRole = member.role as 'owner' | 'admin' | 'member';
              await changeOrgRole({
                tenantId: org.id,
                userId: member.userId,
                oldRole,
                newRole,
              });
              console.log(
                `🔐 SpiceDB: Updated member ${member.userId} role from ${oldRole} to ${newRole} in org ${org.name}`
              );
            } catch (error) {
              console.error('❌ SpiceDB sync failed for role update:', error);
            }
          },
          afterRemoveMember: async ({ member, organization: org }) => {
            try {
              const { syncOrgMemberToSpiceDb } = await import('./authz/sync');
              await syncOrgMemberToSpiceDb({
                tenantId: org.id,
                userId: member.userId,
                role: member.role as 'owner' | 'admin' | 'member',
                action: 'remove',
              });
              console.log(`🔐 SpiceDB: Removed member ${member.userId} from org ${org.name}`);
            } catch (error) {
              console.error('❌ SpiceDB sync failed for member removal:', error);
            }
          },
        },
      }),
      deviceAuthorization({
        verificationUri: '/device',
        expiresIn: '60m', // 30 minutes
        interval: '5s', // 5 second polling interval
        userCodeLength: 8, // e.g., "ABCD-EFGH"
      }),
      jwt(),
      oauthProvider({
        // OAuth clients are managed in the database (oauth_client table).
        // Clients with skip_consent=true will skip the consent screen.
        // No in-memory trustedClients needed - all clients are looked up from DB.

        // Login page: Points directly to manage-ui's login page.
        // Better Auth will append the returnUrl automatically so the OAuth flow
        // resumes after login. This avoids an extra redirect through manage-api.
        loginPage: env.INKEEP_AGENTS_MANAGE_UI_URL
          ? `${env.INKEEP_AGENTS_MANAGE_UI_URL}/login`
          : 'http://localhost:3000/login',
        // Consent page: Served by manage-ui for full React/Tailwind component support.
        // The page at /oauth/consent in manage-ui fetches client info and POSTs consent
        // decisions back to manage-api's /api/auth/oauth2/consent endpoint.
        consentPage: env.INKEEP_AGENTS_MANAGE_UI_URL
          ? `${env.INKEEP_AGENTS_MANAGE_UI_URL}/oauth/consent`
          : 'http://localhost:3000/oauth/consent',

        scopes: ['openid', 'profile', 'email', 'offline_access', 'agents'],
        // Organization context in tokens
        postLogin: {
          page: env.INKEEP_AGENTS_MANAGE_UI_URL
            ? `${env.INKEEP_AGENTS_MANAGE_UI_URL}/oauth/consent`
            : 'http://localhost:3000/oauth/consent',
          shouldRedirect: () => false, // Don't require org selection for now
          consentReferenceId: ({ session }): string | undefined => {
            // activeOrganizationId is set automatically on session creation via databaseHooks
            // (see above). This stores the org_id as referenceId for the consent/tokens.
            const orgId = session?.activeOrganizationId as string | undefined;
            console.log('[OAuth Provider] consentReferenceId called:', {
              activeOrganizationId: orgId,
            });
            return orgId;
          },
        },

        // Claims - minimal info for API authorization
        customAccessTokenClaims: ({ user, referenceId }) => {
          console.log('[OAuth Provider] customAccessTokenClaims called:', {
            userId: user?.id,
            referenceId,
          });
          return {
            'https://inkeep.com/org_id': referenceId,
            'https://inkeep.com/user_id': user?.id,
          };
        },

        // Valid audiences (APIs that accept these tokens)
        // When a client passes `resource` param matching one of these, a JWT access token is issued
        validAudiences,

        // Advertise supported scopes/claims
        advertisedMetadata: {
          scopes_supported: ['openid', 'profile', 'email', 'offline_access', 'agents'],
          claims_supported: ['https://inkeep.com/org_id', 'https://inkeep.com/user_id'],
        },
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
// export const auth = null as any as ReturnType<typeof createAuth>;
export const auth = createAuth({
  baseURL: env.INKEEP_AGENTS_API_URL || 'http://localhost:3002',
  secret: env.BETTER_AUTH_SECRET || 'development-secret-change-in-production',
  dbClient: createAgentsRunDatabaseClient(),
});
