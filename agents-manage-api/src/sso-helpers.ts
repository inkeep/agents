import type { OIDCProviderConfig, SSOProviderConfig } from '@inkeep/agents-core/auth';
import * as client from 'openid-client';

export interface OIDCProviderOptions {
  providerId: string;
  clientId: string;
  clientSecret: string;
  domain: string;
  organizationId?: string;
  scopes?: string[];
  pkce?: boolean;
}

export async function createOIDCProvider(
  options: OIDCProviderOptions
): Promise<SSOProviderConfig | null> {
  try {
    // Discover OIDC configuration using openid-client
    const issuerUrl = new URL(`https://${options.domain}`);
    const config = await client.discovery(issuerUrl, client.randomPKCECodeVerifier());
    const metadata = config.serverMetadata();

    if (
      !metadata.issuer ||
      !metadata.authorization_endpoint ||
      !metadata.token_endpoint ||
      !metadata.userinfo_endpoint ||
      !metadata.jwks_uri
    ) {
      console.log('Some OIDC configuration endpoints are missing, which might cause issues with SSO');
    }

    const oidcConfig: OIDCProviderConfig = {
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      discoveryEndpoint: `https://${options.domain}/.well-known/openid-configuration`,
      authorizationEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      userinfoEndpoint: metadata.userinfo_endpoint,
      jwksEndpoint: metadata.jwks_uri,
      scopes: options.scopes || ['openid', 'email', 'profile'],
      pkce: options.pkce !== false,
      mapping: {
        id: 'sub',
        email: 'email',
        emailVerified: 'email_verified',
        name: 'name',
        image: 'picture',
      },
    };

    return {
      providerId: options.providerId,
      issuer: metadata.issuer,
      domain: options.domain,
      organizationId: options.organizationId,
      oidcConfig,
    };
  } catch (error) {
    console.error(`Error discovering OIDC configuration for ${options.domain}:`, error);
    return null;
  }
}

export async function createAuth0Provider(options: {
  domain: string;
  clientId: string;
  clientSecret: string;
}): Promise<SSOProviderConfig | null> {
  return await createOIDCProvider({
    ...options,
    providerId: 'auth0',
  });
}
