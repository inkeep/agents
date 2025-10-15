/**
 * Centralized OAuth service for MCP tools
 * Handles the complete OAuth 2.1/PKCE flow for MCP tool authentication
 */

import type { McpTool } from '@inkeep/agents-core';
import { discoverOAuthEndpoints, type OAuthConfig } from '@inkeep/agents-core';
import { env } from '../env';
import { getLogger } from '../logger';

const logger = getLogger('oauth-service');

// PKCE storage (TODO: Use Redis or database in production)
const pkceStore = new Map<
  string,
  {
    codeVerifier: string;
    toolId: string;
    tenantId: string;
    projectId: string;
    clientId: string;
  }
>();

/**
 * Store PKCE verifier for later use in token exchange
 */
function storePKCEVerifier(
  state: string,
  codeVerifier: string,
  toolId: string,
  tenantId: string,
  projectId: string,
  clientId: string
): void {
  pkceStore.set(state, { codeVerifier, toolId, tenantId, projectId, clientId });

  // Clean up after 10 minutes (OAuth flows should complete quickly)
  setTimeout(
    () => {
      pkceStore.delete(state);
    },
    10 * 60 * 1000
  );
}

/**
 * Retrieve and remove PKCE verifier
 */
export function retrievePKCEVerifier(state: string): {
  codeVerifier: string;
  toolId: string;
  tenantId: string;
  projectId: string;
  clientId: string;
} | null {
  const data = pkceStore.get(state);
  if (data) {
    pkceStore.delete(state); // One-time use
    return data;
  }
  return null;
}

/**
 * OAuth client configuration
 */
interface OAuthClientConfig {
  defaultClientId?: string;
  clientName?: string;
  clientUri?: string;
  logoUri?: string;
  redirectBaseUrl?: string;
}

/**
 * OAuth flow initiation result
 */
interface OAuthInitiationResult {
  redirectUrl: string;
  state: string;
}

/**
 * Token exchange result
 */
interface TokenExchangeResult {
  tokens: any;
  oAuthConfig: OAuthConfig;
}

/**
 * OAuth service class that handles the complete OAuth flow
 */
class OAuthService {
  private defaultConfig: Required<OAuthClientConfig>;

  constructor(config: OAuthClientConfig = {}) {
    this.defaultConfig = {
      defaultClientId:
        config.defaultClientId || process.env.DEFAULT_OAUTH_CLIENT_ID || 'mcp-client',
      clientName: config.clientName || process.env.OAUTH_CLIENT_NAME || 'Inkeep Agent Framework',
      clientUri: config.clientUri || process.env.OAUTH_CLIENT_URI || 'https://inkeep.com',
      logoUri:
        config.logoUri ||
        process.env.OAUTH_CLIENT_LOGO_URI ||
        'https://inkeep.com/images/logos/inkeep-logo-blue.svg',
      redirectBaseUrl: config.redirectBaseUrl || env.AGENTS_MANAGE_API_URL,
    };
  }

  /**
   * Initiate OAuth flow for an MCP tool
   */
  async initiateOAuthFlow(params: {
    tool: McpTool;
    tenantId: string;
    projectId: string;
    toolId: string;
    baseUrl?: string; // Optional override for the base URL
  }): Promise<OAuthInitiationResult> {
    const { tool, tenantId, projectId, toolId, baseUrl } = params;

    // Type guard - OAuth only works with MCP tools
    if (tool.config.type !== 'mcp') {
      throw new Error('OAuth is only supported for MCP tools');
    }

    const oAuthConfig = await discoverOAuthEndpoints(tool.config.mcp.server.url, logger);
    if (!oAuthConfig) {
      throw new Error('OAuth not supported by this server');
    }

    const { codeVerifier, codeChallenge } = await this.generatePKCEInternal();

    const redirectBaseUrl = baseUrl || this.defaultConfig.redirectBaseUrl;
    const redirectUri = `${redirectBaseUrl}/oauth/callback`;
    let clientId = this.defaultConfig.defaultClientId;

    if (oAuthConfig.supportsDynamicRegistration && oAuthConfig.registrationUrl) {
      clientId = await this.performDynamicClientRegistration(
        oAuthConfig.registrationUrl,
        redirectUri
      );
    }

    const state = `tool_${toolId}`;
    const authUrl = this.buildAuthorizationUrl({
      oAuthConfig,
      clientId,
      redirectUri,
      state,
      codeChallenge,
      resource: tool.config.mcp.server.url,
    });

    storePKCEVerifier(state, codeVerifier, toolId, tenantId, projectId, clientId);

    logger.info({ toolId, oAuthConfig, tenantId, projectId }, 'OAuth flow initiated successfully');

    return {
      redirectUrl: authUrl,
      state,
    };
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCodeForTokens(params: {
    code: string;
    codeVerifier: string;
    clientId: string;
    tool: McpTool;
    baseUrl?: string; // Optional override for the base URL
  }): Promise<TokenExchangeResult> {
    const { code, codeVerifier, clientId, tool, baseUrl } = params;

    // Type guard - OAuth only works with MCP tools
    if (tool.config.type !== 'mcp') {
      throw new Error('OAuth is only supported for MCP tools');
    }

    // Discover OAuth server endpoints from MCP server
    const oAuthConfig = await discoverOAuthEndpoints(tool.config.mcp.server.url, logger);
    if (!oAuthConfig?.tokenUrl) {
      throw new Error('Could not discover OAuth token endpoint');
    }

    const redirectBaseUrl = baseUrl || this.defaultConfig.redirectBaseUrl;
    const redirectUri = `${redirectBaseUrl}/oauth/callback`;

    let tokens: any;

    try {
      // Try openid-client first (more robust)
      tokens = await this.exchangeWithOpenIdClient({
        oAuthConfig,
        clientId,
        code,
        codeVerifier,
        redirectUri,
      });
      logger.info({ tokenType: tokens.token_type }, 'Token exchange successful with openid-client');
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : error },
        'openid-client failed, falling back to manual token exchange'
      );

      // Fallback to manual token exchange
      tokens = await this.exchangeManually({
        oAuthConfig,
        clientId,
        code,
        codeVerifier,
        redirectUri,
      });
      logger.info({ tokenType: tokens.token_type }, 'Manual token exchange successful');
    }

    return { tokens, oAuthConfig };
  }

  /**
   * Perform dynamic client registration
   */
  private async performDynamicClientRegistration(
    registrationUrl: string,
    redirectUri: string
  ): Promise<string> {
    logger.info({ registrationUrl }, 'Attempting dynamic client registration');

    try {
      const registrationResponse = await fetch(registrationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_name: this.defaultConfig.clientName,
          client_uri: this.defaultConfig.clientUri,
          logo_uri: this.defaultConfig.logoUri,
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none', // PKCE only, no client secret
          application_type: 'native', // For PKCE flows
        }),
      });

      if (registrationResponse.ok) {
        const registration = await registrationResponse.json();
        logger.info({ clientId: registration.client_id }, 'Dynamic client registration successful');
        return registration.client_id;
      } else {
        const errorText = await registrationResponse.text();
        logger.warn(
          {
            status: registrationResponse.status,
            errorText,
          },
          'Dynamic client registration failed, using default client_id'
        );
      }
    } catch (regError) {
      logger.warn(
        { error: regError },
        'Dynamic client registration error, using default client_id'
      );
    }

    return this.defaultConfig.defaultClientId;
  }

  /**
   * Build authorization URL
   */
  private buildAuthorizationUrl(params: {
    oAuthConfig: OAuthConfig;
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    resource: string;
  }): string {
    const { oAuthConfig, clientId, redirectUri, state, codeChallenge, resource } = params;

    const authUrl = new URL(oAuthConfig.authorizationUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('resource', resource); // Required by MCP spec

    return authUrl.toString();
  }

  /**
   * Exchange code using openid-client library
   */
  private async exchangeWithOpenIdClient(params: {
    oAuthConfig: OAuthConfig;
    clientId: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<any> {
    const { oAuthConfig, clientId, code, codeVerifier, redirectUri } = params;

    // Import openid-client for proper OAuth handling
    const oauth = await import('openid-client' as any);

    // Extract OAuth server base URL from token URL
    const tokenUrl = new URL(oAuthConfig.tokenUrl);
    const oauthServerUrl = `${tokenUrl.protocol}//${tokenUrl.host}`;

    logger.info({ oauthServerUrl, clientId }, 'Attempting openid-client discovery');

    const config = await oauth.discovery(
      new URL(oauthServerUrl),
      clientId,
      undefined // No client secret for PKCE
    );

    const callbackUrl = new URL(
      `${redirectUri}?${new URLSearchParams({ code, state: 'unused' }).toString()}`
    );

    return await oauth.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: codeVerifier,
    });
  }

  /**
   * Internal PKCE generation
   */
  private async generatePKCEInternal(): Promise<{
    codeVerifier: string;
    codeChallenge: string;
  }> {
    const codeVerifier = Buffer.from(
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
    ).toString('base64url');

    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const codeChallenge = Buffer.from(hash).toString('base64url');

    return { codeVerifier, codeChallenge };
  }

  /**
   * Manual token exchange fallback
   */
  private async exchangeManually(params: {
    oAuthConfig: OAuthConfig;
    clientId: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<any> {
    const { oAuthConfig, clientId, code, codeVerifier, redirectUri } = params;

    logger.info({ tokenUrl: oAuthConfig.tokenUrl }, 'Attempting manual token exchange');

    const tokenResponse = await fetch(oAuthConfig.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier, // PKCE verification
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error(
        {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          ...(process.env.NODE_ENV === 'development' && { errorText }),
          clientId,
          tokenUrl: oAuthConfig.tokenUrl,
        },
        'Token exchange failed'
      );

      throw new Error('Authentication failed. Please try again or contact support.');
    }

    return await tokenResponse.json();
  }
}

// Default instance for convenience
export const oauthService = new OAuthService();
