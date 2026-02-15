import { sso } from '@better-auth/sso';
import { type BetterAuthAdvancedOptions, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, deviceAuthorization, oAuthProxy, organization } from 'better-auth/plugins';
import type { GoogleOptions } from 'better-auth/social-providers';
import { eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import { env } from '../env';
import { generateId } from '../utils';
import * as authSchema from './auth-schema';
import { type OrgRole, OrgRoles } from './authz/types';
import { setEmailSendStatus } from './email-send-status-store';
import { setPasswordResetLink } from './password-reset-link-store';
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

export interface EmailServiceConfig {
  sendInvitationEmail(data: {
    to: string;
    inviterName: string;
    organizationName: string;
    role: string;
    invitationUrl: string;
    authMethod?: string;
    expiresInDays?: number;
  }): Promise<{ emailSent: boolean; error?: string }>;
  sendPasswordResetEmail(data: {
    to: string;
    resetUrl: string;
    expiresInMinutes?: number;
  }): Promise<{ emailSent: boolean; error?: string }>;
  isConfigured: boolean;
}

export interface BetterAuthConfig {
  baseURL: string;
  secret: string;
  dbClient: AgentsRunDatabaseClient;
  cookieDomain?: string;
  ssoProviders?: SSOProviderConfig[];
  socialProviders?: {
    google?: GoogleOptions;
  };
  advanced?: BetterAuthAdvancedOptions;
  emailService?: EmailServiceConfig;
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
  const cookieDomain = extractCookieDomain(config.baseURL, config.cookieDomain);

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
      resetPasswordTokenExpiresIn: 60 * 30,
      sendResetPassword: async ({ user, url, token }) => {
        setPasswordResetLink({ email: user.email, url, token });
        if (config.emailService?.isConfigured) {
          try {
            await config.emailService.sendPasswordResetEmail({
              to: user.email,
              resetUrl: url,
            });
          } catch (err) {
            console.error('[email] Failed to send password reset email:', err);
          }
        }
      },
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
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: 'compact',
      },
    },
    advanced: {
      // Only enable cross-subdomain cookies for production (when we have a real domain)
      ...(cookieDomain && {
        crossSubDomainCookies: {
          enabled: true,
          domain: cookieDomain,
        },
      }),
      defaultCookieAttributes: {
        sameSite: 'none',
        secure: true,
        httpOnly: true,
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
        creatorRole: OrgRoles.ADMIN,
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

          if (config.emailService?.isConfigured) {
            try {
              const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';
              const invitationUrl = `${manageUiUrl}/accept-invitation/${data.id}?email=${encodeURIComponent(data.email)}`;
              const result = await config.emailService.sendInvitationEmail({
                to: data.email,
                inviterName: data.inviter.user.name || data.inviter.user.email,
                organizationName: data.organization.name,
                role: data.role,
                invitationUrl,
                authMethod: (data.invitation as Record<string, unknown> | undefined)?.authMethod as
                  | string
                  | undefined,
              });
              setEmailSendStatus(data.id, {
                emailSent: result.emailSent,
                error: result.error,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error(`[email] Failed to send invitation email to ${data.email}:`, message);
              setEmailSendStatus(data.id, { emailSent: false, error: message });
            }
          } else {
            setEmailSendStatus(data.id, { emailSent: false });
          }
        },
        schema: {
          invitation: {
            additionalFields: {
              authMethod: {
                type: 'string',
                input: true,
                required: false,
              },
            },
          },
        },
        organizationHooks: {
          afterAcceptInvitation: async ({ member, user, organization: org }) => {
            try {
              const { syncOrgMemberToSpiceDb } = await import('./authz/sync');
              await syncOrgMemberToSpiceDb({
                tenantId: org.id,
                userId: user.id,
                role: member.role as OrgRole,
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
          beforeUpdateMemberRole: async ({ member, organization: org, newRole }) => {
            const { changeOrgRole, revokeAllProjectMemberships } = await import('./authz/sync');
            const oldRole = member.role as OrgRole;
            const targetRole = newRole as OrgRole;

            // Update org role in SpiceDB
            await changeOrgRole({
              tenantId: org.id,
              userId: member.userId,
              oldRole,
              newRole: targetRole,
            });
            console.log(
              `🔐 SpiceDB: Updated member ${member.userId} role from ${oldRole} to ${targetRole} in org ${org.name}`
            );

            // When promoting to admin, revoke all project-level roles
            // (they become redundant as admins have inherited access to all projects)
            const isPromotion =
              oldRole === OrgRoles.MEMBER &&
              (targetRole === OrgRoles.ADMIN || targetRole === OrgRoles.OWNER);
            if (isPromotion) {
              await revokeAllProjectMemberships({
                tenantId: org.id,
                userId: member.userId,
              });
              console.log(
                `🔐 SpiceDB: Revoked all project memberships for ${member.userId} (promoted to ${targetRole})`
              );
            }
          },
          afterRemoveMember: async ({ member, organization: org }) => {
            try {
              const { syncOrgMemberToSpiceDb } = await import('./authz/sync');
              await syncOrgMemberToSpiceDb({
                tenantId: org.id,
                userId: member.userId,
                role: member.role as OrgRole,
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
