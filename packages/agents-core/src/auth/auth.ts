import { sso } from '@better-auth/sso';
import { type BetterAuthAdvancedOptions, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import type { GoogleOptions } from 'better-auth/social-providers';
import { eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { generateId } from '../utils';
import * as authSchema from './auth-schema';
import { ac, adminRole, memberRole, ownerRole } from './permissions';

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
  dbClient: DatabaseClient;
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

async function registerSSOProvider(
  dbClient: DatabaseClient,
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
    socialProviders: config.socialProviders?.google && {
      google: config.socialProviders.google,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // Cache duration in seconds
      },
    },
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
      },
      ...config.advanced,
    },
    trustedOrigins: [
      'http://localhost:3000',
      'http://localhost:3002',
      process.env.INKEEP_AGENTS_MANAGE_UI_URL as string,
      process.env.INKEEP_AGENTS_MANAGE_API_URL as string,
    ],
    plugins: [
      sso(),
      organization({
        allowUserToCreateOrganization: true,
        ac,
        roles: {
          member: memberRole,
          admin: adminRole,
          owner: ownerRole,
        },
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
