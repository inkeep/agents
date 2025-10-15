/**
 * Centralized authentication detection utilities for MCP tools
 */

import type { PinoLogger } from './logger';

/**
 * OAuth configuration interface
 */
export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  registrationUrl?: string;
  supportsDynamicRegistration: boolean;
}

/**
 * Helper function to construct well-known OAuth endpoint URLs
 */
const getWellKnownUrls = (baseUrl: string): string[] => [
  `${baseUrl}/.well-known/oauth-authorization-server`,
  `${baseUrl}/.well-known/openid-configuration`,
];

/**
 * Helper function to validate OAuth metadata for PKCE support
 */
const validateOAuthMetadata = (metadata: any): boolean => {
  return metadata.code_challenge_methods_supported?.includes('S256');
};

/**
 * Helper function to construct OAuthConfig from metadata
 */
const buildOAuthConfig = (metadata: any): OAuthConfig => ({
  authorizationUrl: metadata.authorization_endpoint,
  tokenUrl: metadata.token_endpoint,
  registrationUrl: metadata.registration_endpoint,
  supportsDynamicRegistration: !!metadata.registration_endpoint,
});

/**
 * Helper function to try OAuth discovery at well-known endpoints
 */
const tryWellKnownEndpoints = async (
  baseUrl: string,
  logger?: PinoLogger
): Promise<OAuthConfig | null> => {
  const wellKnownUrls = getWellKnownUrls(baseUrl);

  for (const wellKnownUrl of wellKnownUrls) {
    try {
      const response = await fetch(wellKnownUrl);
      if (response.ok) {
        const metadata = await response.json();
        if (validateOAuthMetadata(metadata)) {
          logger?.debug({ baseUrl, wellKnownUrl }, 'OAuth 2.1/PKCE support detected');
          return buildOAuthConfig(metadata);
        }
      }
    } catch (error) {
      logger?.debug({ wellKnownUrl, error }, 'OAuth endpoint check failed');
    }
  }
  return null;
};

/**
 * Check if a server supports OAuth 2.1/PKCE endpoints (simple boolean)
 */
const checkForOAuthEndpoints = async (serverUrl: string, logger?: PinoLogger): Promise<boolean> => {
  const config = await discoverOAuthEndpoints(serverUrl, logger);
  return config !== null;
};

/**
 * Full OAuth endpoint discovery with complete configuration
 */
export const discoverOAuthEndpoints = async (
  serverUrl: string,
  logger?: PinoLogger
): Promise<OAuthConfig | null> => {
  try {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (response.status === 401) {
      const wwwAuth = response.headers.get('WWW-Authenticate');
      if (wwwAuth) {
        // Parse Protected Resource Metadata URL from WWW-Authenticate header
        const metadataMatch = wwwAuth.match(/as_uri="([^"]+)"/);
        if (metadataMatch) {
          const metadataResponse = await fetch(metadataMatch[1]);
          if (metadataResponse.ok) {
            const metadata = (await metadataResponse.json()) as any;
            if (metadata.authorization_servers?.length > 0) {
              return await tryWellKnownEndpoints(metadata.authorization_servers[0], logger);
            }
          }
        }
      }
    }
  } catch (_error) {
    // Continue to well-known endpoints
  }

  const url = new URL(serverUrl);
  const baseUrl = `${url.protocol}//${url.host}`;

  return await tryWellKnownEndpoints(baseUrl, logger);
};

/**
 * Detect if OAuth 2.1/PKCE authentication is specifically required for a tool
 */
export const detectAuthenticationRequired = async ({
  serverUrl,
  toolId,
  error,
  logger,
}: {
  serverUrl: string;
  toolId: string;
  error: Error;
  logger?: PinoLogger;
}): Promise<boolean> => {
  try {
    const hasOAuthEndpoints = await checkForOAuthEndpoints(serverUrl, logger);
    if (hasOAuthEndpoints) {
      logger?.info(
        { toolId, serverUrl },
        'OAuth 2.1/PKCE support confirmed via endpoint discovery'
      );
      return true; // Server supports OAuth 2.1/PKCE
    }
  } catch (discoveryError) {
    logger?.debug({ toolId, discoveryError }, 'OAuth endpoint discovery failed');
  }

  try {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        id: 1,
        params: { protocolVersion: '2024-11-05', capabilities: {} },
      }),
    });

    if (response.status === 401) {
      const wwwAuth = response.headers.get('WWW-Authenticate');
      if (wwwAuth) {
        // Only trigger OAuth for very specific patterns that indicate actual OAuth flows
        const authLower = wwwAuth.toLowerCase();
        const hasActiveOAuthFlow =
          authLower.includes('authorization_uri') ||
          authLower.includes('as_uri=') ||
          (authLower.includes('bearer') &&
            (authLower.includes('scope=') || authLower.includes('error_uri=')));

        if (hasActiveOAuthFlow) {
          logger?.info(
            { toolId, wwwAuth },
            'Active OAuth flow detected via WWW-Authenticate parameters'
          );
          return true;
        } else {
          logger?.debug(
            { toolId, wwwAuth },
            'Bearer authentication detected - likely simple token auth, not OAuth'
          );
        }
      }
    }
  } catch (fetchError) {
    logger?.debug({ toolId, fetchError }, 'Direct fetch authentication check failed');
  }

  // If no OAuth-specific patterns are found, return false
  // This prevents simple bearer token auth from triggering OAuth flows
  logger?.debug(
    { toolId, error: error.message },
    'No OAuth 2.1/PKCE authentication requirement detected'
  );
  return false;
};
