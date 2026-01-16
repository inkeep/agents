/**
 * Centralized OAuth service for MCP tools
 * Handles the complete OAuth 2.1/PKCE flow for MCP tool authentication
 */

import type { McpTokenExchangeResult } from '@inkeep/agents-core';
import { exchangeMcpAuthorizationCode, initiateMcpOAuthFlow } from '@inkeep/agents-core';
import { env } from '../env';
import { getLogger } from '../logger';

const logger = getLogger('oauth-service');

// PKCE storage with OAuth metadata (TODO: Use Redis or database in production)
const pkceStore = new Map<
  string,
  {
    codeVerifier: string;
    toolId: string;
    tenantId: string;
    projectId: string;
    clientInformation: any;
    metadata: any;
    resourceUrl?: string;
  }
>();

/**
 * Store PKCE verifier and OAuth metadata for later use in token exchange
 */
function storePKCEVerifier(
  state: string,
  codeVerifier: string,
  toolId: string,
  tenantId: string,
  projectId: string,
  clientInformation: any,
  metadata: any,
  resourceUrl?: string
): void {
  pkceStore.set(state, {
    codeVerifier,
    toolId,
    tenantId,
    projectId,
    clientInformation,
    metadata,
    resourceUrl,
  });

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
  clientInformation: any;
  metadata: any;
  resourceUrl?: string;
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
  tokens: McpTokenExchangeResult;
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
      redirectBaseUrl: config.redirectBaseUrl || env.INKEEP_AGENTS_MANAGE_API_URL,
    };
  }

  /**
   * Initiate OAuth flow for an MCP tool using MCP SDK
   */
  async initiateOAuthFlow(params: {
    tenantId: string;
    projectId: string;
    toolId: string;
    mcpServerUrl: string;
    baseUrl?: string; // Optional override for the base URL
  }): Promise<OAuthInitiationResult> {
    const { tenantId, projectId, toolId, mcpServerUrl, baseUrl } = params;

    const redirectBaseUrl = baseUrl || this.defaultConfig.redirectBaseUrl;
    const redirectUri = `${redirectBaseUrl}/oauth/callback`;
    const state = `tool_${toolId}`;

    const authResult = await initiateMcpOAuthFlow({
      mcpServerUrl,
      redirectUri,
      state,
      clientName: this.defaultConfig.clientName,
      clientUri: this.defaultConfig.clientUri,
      logoUri: this.defaultConfig.logoUri,
      defaultClientId: this.defaultConfig.defaultClientId,
      logger,
    });

    storePKCEVerifier(
      state,
      authResult.codeVerifier,
      toolId,
      tenantId,
      projectId,
      authResult.clientInformation,
      authResult.metadata,
      authResult.resourceUrl
    );

    logger.info(
      {
        toolId,
        authorizationUrl: authResult.authorizationUrl,
        tenantId,
        projectId,
        scopes: authResult.scopes,
      },
      'MCP OAuth flow initiated successfully'
    );

    return {
      redirectUrl: authResult.authorizationUrl,
      state,
    };
  }

  /**
   * Exchange authorization code for access tokens using MCP SDK with stored metadata
   */
  async exchangeCodeForTokens(params: {
    code: string;
    codeVerifier: string;
    clientInformation: any;
    metadata: any;
    resourceUrl?: string;
    mcpServerUrl: string;
    baseUrl?: string; // Optional override for the base URL
  }): Promise<TokenExchangeResult> {
    const { code, codeVerifier, clientInformation, metadata, resourceUrl, mcpServerUrl, baseUrl } =
      params;

    const redirectBaseUrl = baseUrl || this.defaultConfig.redirectBaseUrl;
    const redirectUri = `${redirectBaseUrl}/oauth/callback`;

    // Use MCP SDK token exchange with stored metadata (no rediscovery needed)
    const tokens = await exchangeMcpAuthorizationCode({
      mcpServerUrl,
      metadata,
      clientInformation,
      authorizationCode: code,
      codeVerifier,
      redirectUri,
      resourceUrl,
      logger,
    });

    logger.info(
      {
        tokenType: tokens.token_type,
        hasRefreshToken: !!tokens.refresh_token,
        clientId: clientInformation.client_id,
      },
      'MCP token exchange successful'
    );

    return { tokens };
  }
}

// Default instance for convenience
export const oauthService = new OAuthService();
