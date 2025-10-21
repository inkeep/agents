/**
 * Centralized authentication detection utilities for MCP tools
 * Uses proper MCP OAuth specification (RFC 9728 + RFC 8414) for discovery
 */

import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  exchangeAuthorization,
  registerClient,
  startAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthMetadata,
  OAuthProtectedResourceMetadata,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { PinoLogger } from './logger';

/**
 * OAuth configuration interface
 */
export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  registrationUrl?: string;
  supportsDynamicRegistration: boolean;
  scopes?: string;
}

/**
 * MCP OAuth metadata discovery result
 */
interface McpDiscoveryResult {
  success: boolean;
  metadata?: OAuthMetadata;
  resourceMetadata?: OAuthProtectedResourceMetadata;
  scopes?: string;
  error?: string;
}

/**
 * Discovers OAuth scopes from server metadata, with preference for resource metadata scopes
 */
function discoverScopes(
  resourceMetadata?: OAuthProtectedResourceMetadata,
  metadata?: OAuthMetadata
): string | undefined {
  const resourceScopes = resourceMetadata?.scopes_supported;
  const oauthScopes = metadata?.scopes_supported;
  const scopes = (resourceScopes?.length ? resourceScopes : oauthScopes) || [];
  return scopes.length > 0 ? scopes.join(' ') : undefined;
}

/**
 * MCP Dynamic OAuth metadata discovery utility
 * Implements RFC9728 (Protected Resource Metadata Discovery) + RFC8414 (Authorization Server Metadata Discovery)
 */
async function discoverMcpMetadata(
  mcpServerUrl: string,
  logger?: PinoLogger
): Promise<McpDiscoveryResult> {
  try {
    // RFC9728 - Protected Resource Metadata Discovery
    let resourceMetadata: OAuthProtectedResourceMetadata | null = null;
    let authServerUrl = new URL(mcpServerUrl);

    try {
      resourceMetadata = await discoverOAuthProtectedResourceMetadata(mcpServerUrl);

      if (
        resourceMetadata?.authorization_servers?.length &&
        resourceMetadata.authorization_servers[0]
      ) {
        authServerUrl = new URL(resourceMetadata.authorization_servers[0]);
      }
    } catch {
      // RFC9728 resource metadata discovery is optional - if it fails,
      // we continue with the original MCP server URL as the authorization server
    }

    // RFC8414 - Authorization Server Metadata Discovery
    const metadata = await discoverAuthorizationServerMetadata(authServerUrl.href);
    if (!metadata) {
      throw new Error('Failed to discover OAuth authorization server metadata');
    }

    logger?.debug(
      {
        tokenEndpoint: metadata.token_endpoint,
        authEndpoint: metadata.authorization_endpoint,
      },
      'MCP metadata discovery successful'
    );

    const discoveredScopes = discoverScopes(resourceMetadata ?? undefined, metadata);

    return {
      success: true,
      metadata,
      ...(resourceMetadata && { resourceMetadata }),
      ...(discoveredScopes && { scopes: discoveredScopes }),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger?.debug({ error: errorMessage }, 'MCP metadata discovery failed');
    return { success: false, error: errorMessage };
  }
}

/**
 * MCP OAuth flow initiation result
 */
export interface McpOAuthFlowResult {
  authorizationUrl: string;
  codeVerifier: string;
  state: string;
  clientInformation: any;
  scopes?: string;
  metadata: any;
  resourceUrl?: string;
}

/**
 * MCP OAuth token exchange result
 */
export interface McpTokenExchangeResult {
  access_token: string;
  refresh_token?: string;
  expires_at?: Date;
  token_type: string;
  scope?: string;
}

/**
 * Initiate MCP OAuth flow using the official MCP SDK
 */
export async function initiateMcpOAuthFlow({
  mcpServerUrl,
  redirectUri,
  state,
  clientName = 'Inkeep Agent Framework',
  clientUri = 'https://inkeep.com',
  logoUri,
  defaultClientId = 'mcp-client',
  logger,
}: {
  mcpServerUrl: string;
  redirectUri: string;
  state: string;
  clientName?: string;
  clientUri?: string;
  logoUri?: string;
  defaultClientId?: string;
  logger?: PinoLogger;
}): Promise<McpOAuthFlowResult> {
  const discoveryResult = await discoverMcpMetadata(mcpServerUrl, logger);
  if (!discoveryResult.success || !discoveryResult.metadata) {
    throw new Error(`OAuth not supported by this server: ${discoveryResult.error}`);
  }

  const { metadata, resourceMetadata, scopes: discoveredScopes } = discoveryResult;

  const clientMetadata = {
    redirect_uris: [redirectUri],
    token_endpoint_auth_method: 'none', // PKCE - no client secret
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    client_name: clientName,
    client_uri: clientUri,
    ...(logoUri && { logo_uri: logoUri }),
  };

  // Handle client registration (dynamic or static)
  let clientInformation: any;
  if (metadata.registration_endpoint) {
    clientInformation = await registerClient(mcpServerUrl, {
      metadata,
      clientMetadata,
    });
  } else {
    clientInformation = {
      client_id: defaultClientId,
      ...clientMetadata,
    };
  }

  // Node's URL and global DOM URL are identical at runtime but have different TypeScript types
  // The MCP SDK expects the DOM URL type, so we cast appropriately
  const resource = resourceMetadata?.resource
    ? (new globalThis.URL(resourceMetadata.resource) as unknown as URL)
    : undefined;

  const authResult = await startAuthorization(mcpServerUrl, {
    metadata,
    clientInformation,
    redirectUrl: redirectUri,
    state,
    scope: discoveredScopes || '',
    ...(resource && { resource }),
  });

  logger?.debug(
    {
      authorizationUrl: authResult.authorizationUrl.href,
      scopes: discoveredScopes,
      clientId: clientInformation.client_id,
    },
    'MCP OAuth flow initiated successfully'
  );

  return {
    authorizationUrl: authResult.authorizationUrl.href,
    codeVerifier: authResult.codeVerifier,
    state,
    clientInformation,
    metadata,
    resourceUrl: resource?.href || undefined,
    ...(discoveredScopes && { scopes: discoveredScopes }),
  };
}

/**
 * Exchange authorization code for tokens using MCP SDK
 */
export async function exchangeMcpAuthorizationCode({
  mcpServerUrl,
  metadata,
  clientInformation,
  authorizationCode,
  codeVerifier,
  redirectUri,
  resourceUrl,
  logger,
}: {
  mcpServerUrl: string;
  metadata: any;
  clientInformation: any;
  authorizationCode: string;
  codeVerifier: string;
  redirectUri: string;
  resourceUrl?: string;
  logger?: PinoLogger;
}): Promise<McpTokenExchangeResult> {
  // Node's URL and global DOM URL are identical at runtime but have different TypeScript types
  // The MCP SDK expects the DOM URL type, so we cast appropriately
  const resource = resourceUrl ? (new globalThis.URL(resourceUrl) as unknown as URL) : undefined;

  const tokens = await exchangeAuthorization(mcpServerUrl, {
    metadata,
    clientInformation,
    authorizationCode,
    codeVerifier,
    redirectUri,
    ...(resource && { resource }),
  });

  logger?.debug(
    {
      tokenType: tokens.token_type,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
    },
    'MCP token exchange successful'
  );

  // Convert to standardized format
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
    token_type: tokens.token_type || 'Bearer',
    scope: tokens.scope,
  };
}

/**
 * Detect if MCP OAuth authentication is specifically required for a tool
 * Uses proper MCP OAuth specification discovery methods
 */
export const detectAuthenticationRequired = async ({
  serverUrl,
  toolId,
  error,
  logger,
}: {
  serverUrl: string;
  toolId: string;
  error?: Error;
  logger?: PinoLogger;
}): Promise<boolean> => {
  try {
    const discoveryResult = await discoverMcpMetadata(serverUrl, logger);
    if (discoveryResult.success && discoveryResult.metadata) {
      logger?.info({ toolId, serverUrl }, 'MCP OAuth support confirmed via metadata discovery');
      return true;
    }
  } catch (discoveryError) {
    logger?.debug({ toolId, discoveryError }, 'MCP OAuth metadata discovery failed');
  }

  logger?.debug(
    { toolId, error: error?.message },
    'No MCP OAuth authentication requirement detected'
  );
  return false;
};
