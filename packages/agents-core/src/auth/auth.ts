import { dash } from '@better-auth/infra';
import { type SSOOptions, sso } from '@better-auth/sso';
import { betterAuth, type Session, type User } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import {
  bearer,
  deviceAuthorization,
  lastLoginMethod,
  oAuthProxy,
  organization,
} from 'better-auth/plugins';
import { querySsoProviderIds } from '../data-access/runtime/auth';
import { createUserProfileIfNotExists } from '../data-access/runtime/userProfiles';
import { env } from '../env';
import {
  extractCookieDomain,
  getInitialOrganization,
  getTrustedOrigins,
  hasCredentialAccount,
  shouldAutoProvision,
} from './auth-config-utils';
import type { BetterAuthConfig } from './auth-types';
import { type OrgRole, OrgRoles } from './authz/types';
import { setEmailSendStatus } from './email-send-status-store';
import { DEFAULT_MEMBERSHIP_LIMIT } from './entitlement-constants';
import { setPasswordResetLink } from './password-reset-link-store';
import { ac, adminRole, memberRole, ownerRole } from './permissions';

export { extractCookieDomain, hasCredentialAccount } from './auth-config-utils';
export type {
  BetterAuthConfig,
  EmailServiceConfig,
  OIDCProviderConfig,
  SAMLProviderConfig,
  SSOProviderConfig,
  UserAuthConfig,
} from './auth-types';

/**
 * Type-only helper: a simplified betterAuth call that TypeScript can evaluate
 * cheaply to produce precise API types. The real createAuth() has complex
 * callbacks/closures that cause TypeScript to fall back to index signatures.
 * This function is never called at runtime.
 *
 * Note: sso() and dash() are intentionally excluded here. They come from
 * @better-auth/sso and @better-auth/infra which resolve @better-auth/core
 * through different pnpm virtual store paths (due to @better-auth/infra
 * bundling better-call@beta). This creates duplicate @better-auth/core
 * instances that TypeScript treats as incompatible, causing the plugins
 * array to widen to BetterAuthPlugin[] and producing an index signature
 * on .api. Since no auth.api.* calls use SSO or dash methods, omitting
 * them is safe and preserves precise types.
 */
function _inferAuthType() {
  return betterAuth({
    plugins: [
      bearer(),
      oAuthProxy(),
      organization({
        schema: {
          invitation: {
            additionalFields: {
              authMethod: { type: 'string' as const, required: false },
            },
          },
          organization: {
            additionalFields: {
              preferredAuthMethod: { type: 'string' as const, input: true, required: false },
              serviceAccountUserId: { type: 'string' as const, input: true, required: false },
            },
          },
        },
      }),
      deviceAuthorization(),
    ],
  });
}

type AuthInstance = ReturnType<typeof _inferAuthType>;

export function createAuth(config: BetterAuthConfig): AuthInstance {
  const cookieDomain = extractCookieDomain(config.baseURL, config.cookieDomain);
  const isSecure = config.baseURL.startsWith('https://');

  const instance = betterAuth({
    appName: 'Inkeep Agents',
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
      sendResetPassword: async ({
        user,
        url,
        token,
      }: {
        user: User;
        url: string;
        token: string;
      }) => {
        const hasCreds = await hasCredentialAccount(config.dbClient, user.id);
        if (!hasCreds) {
          return;
        }

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
        trustedProviders: async () => {
          const base = ['google', 'email-password'];
          try {
            const providerIds = await querySsoProviderIds(config.dbClient)();
            return [...base, ...providerIds];
          } catch {
            return base;
          }
        },
      },
    },
    // Automatically set user's first organization as active when session is created
    // See: https://www.better-auth.com/docs/plugins/organization#active-organization
    databaseHooks: {
      session: {
        create: {
          before: async (session: Session & Record<string, unknown>) => {
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
        maxAge: 30,
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
        httpOnly: true,
        ...(isSecure
          ? { sameSite: 'none' as const, secure: true }
          : { sameSite: 'lax' as const, secure: false }),
        ...(cookieDomain && { domain: cookieDomain }),
      },
      ...config.advanced,
    },
    trustedOrigins: (request) => getTrustedOrigins(config.dbClient, request),
    plugins: [
      bearer(),
      dash(),
      lastLoginMethod({
        customResolveMethod(ctx) {
          const path = ctx.path;
          if (path === '/sign-in/email' || path === '/sign-up/email') return 'email';
          if (path.startsWith('/callback/') || path.startsWith('/oauth2/callback/'))
            return ctx.params?.id || ctx.params?.providerId || path.split('/').pop() || null;
          if (path.startsWith('/sso/callback/'))
            return ctx.params?.providerId || path.split('/').pop() || null;
          if (path.startsWith('/sso/saml2/sp/acs/'))
            return ctx.params?.providerId || path.split('/').pop() || null;
          return null;
        },
      }),
      sso({
        organizationProvisioning: {
          disabled: true,
        },
        async provisionUser({
          user,
          provider,
        }: Parameters<NonNullable<SSOOptions['provisionUser']>>[0]) {
          if (!provider.organizationId) {
            return;
          }

          const autoProvision = await shouldAutoProvision(config.dbClient, user, provider);

          if (!autoProvision) {
            return;
          }

          await instance.api.addMember({
            body: {
              userId: user.id,
              organizationId: provider.organizationId,
              role: 'member',
            },
          });
        },
      }),
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
        membershipLimit: async (_user, org) => {
          const { resolveTotalMembershipLimit } = await import('./entitlements');
          const { dalGetServiceAccountUserId } = await import(
            '../data-access/runtime/entitlements'
          );
          const serviceAccountUserId = await dalGetServiceAccountUserId(config.dbClient, org.id);
          return resolveTotalMembershipLimit(config.dbClient, org.id, !!serviceAccountUserId);
        },
        invitationLimit: DEFAULT_MEMBERSHIP_LIMIT,
        invitationExpiresIn: 7 * 24 * 60 * 60, // 7 days (in seconds)
        async sendInvitationEmail(data) {
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
                organizationId: data.organization.id,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error(`[email] Failed to send invitation email to ${data.email}:`, message);
              setEmailSendStatus(data.id, {
                emailSent: false,
                error: message,
                organizationId: data.organization.id,
              });
            }
          } else {
            setEmailSendStatus(data.id, { emailSent: false, organizationId: data.organization.id });
          }
        },
        schema: {
          invitation: {
            additionalFields: {
              authMethod: {
                type: 'string',
                required: false,
              },
            },
          },
          organization: {
            additionalFields: {
              preferredAuthMethod: {
                type: 'string',
                input: true,
                required: false,
              },
              allowedAuthMethods: {
                type: 'string',
                input: true,
                required: false,
              },
              serviceAccountUserId: {
                type: 'string',
                input: true,
                required: false,
              },
            },
          },
        },
        organizationHooks: {
          beforeCreateInvitation: async ({ invitation, organization: org }) => {
            const { enforcePerRoleSeatLimit } = await import('./entitlements');
            await enforcePerRoleSeatLimit(config.dbClient, org.id, invitation.role);
          },
          beforeAddMember: async ({ member, user, organization: org }) => {
            const { enforcePerRoleSeatLimit } = await import('./entitlements');
            await enforcePerRoleSeatLimit(config.dbClient, org.id, member.role);

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
              console.error('❌ SpiceDB sync failed for new member:', error);
              throw new Error(
                `Failed to sync member permissions: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }
          },
          beforeAcceptInvitation: async ({ invitation, user, organization: org }) => {
            const { enforcePerRoleSeatLimit } = await import('./entitlements');
            await enforcePerRoleSeatLimit(config.dbClient, org.id, invitation.role);

            try {
              const { syncOrgMemberToSpiceDb } = await import('./authz/sync');
              await syncOrgMemberToSpiceDb({
                tenantId: org.id,
                userId: user.id,
                role: invitation.role as OrgRole,
                action: 'add',
              });
              console.log(
                `🔐 SpiceDB: Synced member ${user.email} as ${invitation.role} to org ${org.name}`
              );
            } catch (error) {
              console.error('❌ SpiceDB sync failed for new member:', error);
              throw new Error(
                `Failed to sync member permissions: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }

            try {
              await createUserProfileIfNotExists(config.dbClient)(user.id);
            } catch (error) {
              console.error('[auth] Failed to create user profile for user', user.id, error);
            }
          },
          beforeUpdateMemberRole: async ({ member, organization: org, newRole }) => {
            const { roleMatchesAdminBucket, enforcePerRoleSeatLimit } = await import(
              './entitlements'
            );
            const oldRole = member.role as OrgRole;
            const targetRole = newRole as OrgRole;

            const { changeOrgRole, revokeAllProjectMemberships } = await import('./authz/sync');

            const doRoleChange = async () => {
              await changeOrgRole({
                tenantId: org.id,
                userId: member.userId,
                oldRole,
                newRole: targetRole,
              });
            };

            const oldBucketIsAdmin = roleMatchesAdminBucket(oldRole);
            const newBucketIsAdmin = roleMatchesAdminBucket(targetRole);
            if (oldBucketIsAdmin !== newBucketIsAdmin) {
              await enforcePerRoleSeatLimit(config.dbClient, org.id, targetRole, doRoleChange);
            } else {
              await doRoleChange();
            }
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
          beforeRemoveMember: async ({ member, organization: org }) => {
            try {
              if (config.manageDbPool) {
                const { cleanupUserTriggers } = await import(
                  '../data-access/manage/triggerCleanup'
                );
                await cleanupUserTriggers({
                  tenantId: org.id,
                  userId: member.userId,
                  runDb: config.dbClient,
                  manageDbPool: config.manageDbPool,
                });
              }

              const { revokeAllUserRelationships } = await import('./authz/sync');
              await revokeAllUserRelationships({
                tenantId: org.id,
                userId: member.userId,
              });

              console.log(
                `🔐 Preparing to remove member ${member.userId} - cleaned up triggers and revoked all relationships in org ${org.name}`
              );
            } catch (error) {
              console.error('❌ Cleanup failed before member removal:', error);
              throw new Error(
                `Failed to clean up user data: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
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
  }) as unknown as AuthInstance;

  return instance;
}

// Type placeholder for type inference in consuming code (e.g., app.ts AppVariables)
// Actual auth instances should be created using createAuth() with a real database client
// This is cast as any to avoid instantiation while preserving type information
export const auth = null as unknown as AuthInstance;
