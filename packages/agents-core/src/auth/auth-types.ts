import type { BetterAuthAdvancedOptions } from 'better-auth';
import type { GoogleOptions } from 'better-auth/social-providers';
import { z } from 'zod';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';

export type AuthMethodType = 'email-password' | 'google' | 'sso';

export const authMethodTypeSchema = z.enum(['email-password', 'google', 'sso']);

export const methodOptionSchema = z.object({
  method: authMethodTypeSchema,
  providerId: z.string().optional(),
  providerType: z.enum(['oidc', 'saml']).optional(),
  displayName: z.string().optional(),
});

export type MethodOption = z.infer<typeof methodOptionSchema>;

export const orgAuthInfoSchema = z.object({
  organizationId: z.string(),
  organizationName: z.string(),
  organizationSlug: z.string(),
  methods: z.array(methodOptionSchema),
});

export type OrgAuthInfo = z.infer<typeof orgAuthInfoSchema>;

export const authLookupResponseSchema = z.object({
  organizations: z.array(orgAuthInfoSchema),
});

export type AuthLookupResponse = z.infer<typeof authLookupResponseSchema>;

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

export type AllowedAuthMethod =
  | { method: Extract<AuthMethodType, 'email-password'> }
  | { method: Extract<AuthMethodType, 'google'> }
  | {
      method: Extract<AuthMethodType, 'sso'>;
      providerId: string;
      displayName: string;
      autoProvision: boolean;
      enabled: boolean;
    };

export function parseAllowedAuthMethods(raw: string | null | undefined): AllowedAuthMethod[] {
  if (!raw) return [{ method: 'email-password' }];
  try {
    const parsed = JSON.parse(raw) as AllowedAuthMethod[];
    if (!Array.isArray(parsed)) return [{ method: 'email-password' }];
    return parsed;
  } catch {
    return [{ method: 'email-password' }];
  }
}

export function serializeAllowedAuthMethods(methods: AllowedAuthMethod[]): string {
  return JSON.stringify(methods);
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
  manageDbPool?: import('pg').Pool;
  cookieDomain?: string;
  socialProviders?: {
    google?: GoogleOptions;
  };
  advanced?: BetterAuthAdvancedOptions;
  emailService?: EmailServiceConfig;
}

export interface UserAuthConfig {
  socialProviders?: {
    google?: GoogleOptions;
  };
  advanced?: BetterAuthAdvancedOptions;
}
