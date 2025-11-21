'use server';

/**
 * This file contains server-side functions for interacting with the Nango API.
 */

import { Nango } from '@nangohq/node';
import type {
  ApiProvider,
  ApiPublicConnection,
  ApiPublicIntegration,
  ApiPublicIntegrationCredentials,
} from '@nangohq/types';
import { DEFAULT_TENANT_ID } from '@/lib/runtime-config/defaults';
import { NangoError, wrapNangoError } from './nango-types';

// Initialize Nango client with environment variables
const getNangoClient = () => {
  const secretKey = process.env.NANGO_SECRET_KEY;
  if (!secretKey) {
    throw new NangoError('NANGO_SECRET_KEY environment variable is required for Nango integration');
  }

  try {
    return new Nango({
      secretKey,
      host: process.env.NANGO_SERVER_URL || 'https://api.nango.dev',
    });
  } catch (error) {
    throw new NangoError('Failed to initialize Nango client', 'new Nango', error);
  }
};

/**
 * Check if Nango is properly configured
 * Returns true if NANGO_SECRET_KEY is set and not empty
 */
export async function isNangoConfigured(): Promise<boolean> {
  const secretKey = process.env.NANGO_SECRET_KEY;
  return !!(secretKey && secretKey.trim() !== '');
}

/**
 * Fetch all available Nango providers
 */
export async function fetchNangoProviders(): Promise<ApiProvider[]> {
  try {
    const nango = getNangoClient();
    const response = await nango.listProviders({});
    return response.data;
  } catch (error) {
    console.error('Failed to fetch providers:', error);
    wrapNangoError(error, 'Unable to retrieve available providers from Nango', 'listProviders');
  }
}

/**
 * Get details for a specific Nango provider
 */
export async function fetchNangoProvider(providerName: string): Promise<ApiProvider> {
  try {
    const nango = getNangoClient();
    const response = await nango.getProvider({ provider: providerName });
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch provider ${providerName}:`, error);
    wrapNangoError(error, `Provider '${providerName}' not found or inaccessible`, 'getProvider');
  }
}

/**
 * Fetch user's existing Nango integrations
 */
export async function fetchNangoIntegrations(): Promise<ApiPublicIntegration[]> {
  try {
    const nango = getNangoClient();
    const response = await nango.listIntegrations();
    return response.configs;
  } catch (error) {
    console.error('Failed to fetch integrations:', error);
    wrapNangoError(error, 'Unable to retrieve existing integrations', 'listIntegrations');
  }
}

/**
 * Fetch a specific Nango integration
 */
export async function fetchNangoIntegration(
  uniqueKey: string
): Promise<(ApiPublicIntegration & { areCredentialsSet: boolean }) | null> {
  try {
    const nango = getNangoClient();

    const response = await nango.getIntegration({ uniqueKey }, { include: ['credentials'] });
    const integration = response.data;

    // Determine if credentials are set (server-side only)
    let areCredentialsSet = false;

    if (
      integration.credentials?.type === 'OAUTH2' ||
      integration.credentials?.type === 'OAUTH1' ||
      integration.credentials?.type === 'TBA'
    ) {
      areCredentialsSet = !!(
        integration.credentials?.client_id && integration.credentials?.client_secret
      );
    } else if (integration.credentials?.type === 'APP') {
      areCredentialsSet = !!(integration.credentials?.app_id && integration.credentials?.app_link);
    } else {
      areCredentialsSet = true;
    }

    // Strip credentials before returning to frontend
    const { credentials: _credentials, ...integrationWithoutCredentials } = integration;

    return {
      ...integrationWithoutCredentials,
      areCredentialsSet,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return null;
    }

    console.error(`Failed to fetch integration ${uniqueKey}:`, error);
    wrapNangoError(error, `Unable to fetch integration with key '${uniqueKey}'`, 'getIntegration');
  }
}

/**
 * Create a new Nango integration
 */
async function createNangoIntegration(params: {
  provider: string;
  uniqueKey: string;
  displayName?: string;
  credentials?: ApiPublicIntegrationCredentials;
}): Promise<ApiPublicIntegration> {
  try {
    const nango = getNangoClient();
    const response = await nango.createIntegration({
      provider: params.provider,
      unique_key: params.uniqueKey,
      display_name: params.displayName,
      credentials: params.credentials,
    });
    return response.data;
  } catch (error) {
    console.error('Failed to create integration:', error);
    wrapNangoError(
      error,
      `Failed to create integration '${params.uniqueKey}' for provider '${params.provider}'`,
      'createIntegration'
    );
  }
}

export async function updateMCPGenericIntegration({
  uniqueKey,
}: {
  uniqueKey: string;
}): Promise<ApiPublicIntegration> {
  const secretKey = process.env.NANGO_SECRET_KEY;
  if (!secretKey) {
    throw new NangoError('NANGO_SECRET_KEY environment variable is required for Nango integration');
  }

  const host = process.env.NANGO_SERVER_URL || 'https://api.nango.dev';

  const clientName = process.env.OAUTH_CLIENT_NAME || 'Inkeep Agent Framework';
  const clientUri = process.env.OAUTH_CLIENT_URI || 'https://inkeep.com';
  const logoUri =
    process.env.OAUTH_CLIENT_LOGO_URI || 'https://inkeep.com/images/logos/inkeep-logo-blue.svg';

  const response = await fetch(`${host}/integrations/${uniqueKey}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      custom: {
        oauth_client_name: clientName,
        oauth_client_uri: clientUri,
        oauth_client_logo_uri: logoUri,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new NangoError(
      `Failed to update integration: ${response.status} ${response.statusText}`,
      'updateMCPGenericIntegration',
      errorData
    );
  }

  return await response.json();
}

/**
 * Get connections for a specific integration
 */
export async function fetchNangoConnections(
  integrationKey?: string
): Promise<ApiPublicConnection[]> {
  try {
    const nango = getNangoClient();
    const response = await nango.listConnections();
    return response.connections;
  } catch (error) {
    const context = integrationKey ? ` for integration '${integrationKey}'` : '';
    console.error(`Failed to fetch connections${context}:`, error);
    wrapNangoError(error, `Unable to retrieve connections${context}`, 'listConnections');
  }
}

async function createNangoConnectSession({
  endUserId = 'test-tenant',
  endUserEmail = 'test@test-tenant.com',
  endUserDisplayName = 'Test User',
  organizationId = process.env.TENANT_ID || DEFAULT_TENANT_ID,
  organizationDisplayName = 'Test Organization',
  integrationId,
}: {
  endUserId?: string;
  endUserEmail?: string;
  endUserDisplayName?: string;
  organizationId?: string;
  organizationDisplayName?: string;
  integrationId: string;
}): Promise<{
  token: string;
  expires_at: string;
}> {
  try {
    const nango = getNangoClient();
    const { data } = await nango.createConnectSession({
      end_user: {
        id: endUserId,
        email: endUserEmail,
        display_name: endUserDisplayName,
      },
      organization: {
        id: organizationId,
        display_name: organizationDisplayName,
      },
      allowed_integrations: [integrationId],
    });
    return data;
  } catch (error) {
    console.error('Failed to create connect session:', error);
    wrapNangoError(
      error,
      `Unable to create connect session for integration '${integrationId}'`,
      'createConnectSession'
    );
  }
}

/**
 * Create a connect session for a Nango provider (sets up integration if needed)
 */
export async function createProviderConnectSession({
  providerName,
  uniqueKey,
  displayName,
  credentials,
}: {
  providerName: string;
  uniqueKey: string;
  displayName: string;
  credentials?: ApiPublicIntegrationCredentials;
}): Promise<string> {
  try {
    let integration: ApiPublicIntegration;
    let existingIntegration: (ApiPublicIntegration & { areCredentialsSet: boolean }) | null = null;

    try {
      existingIntegration = await fetchNangoIntegration(uniqueKey);
    } catch (error) {
      if (error instanceof NangoError) {
        throw error;
      }
      // Log but continue - integration might not exist yet
      console.debug(`Integration '${providerName}' not found, will create new one`);
    }

    if (existingIntegration?.areCredentialsSet) {
      integration = existingIntegration;
    } else {
      try {
        integration = await createNangoIntegration({
          provider: providerName,
          uniqueKey,
          displayName,
          credentials,
        });
      } catch (error) {
        wrapNangoError(
          error,
          `Failed to create integration for provider '${providerName}'`,
          'create'
        );
      }
    }

    if (providerName === 'mcp-generic') {
      try {
        await updateMCPGenericIntegration({
          uniqueKey: integration.unique_key,
        });
      } catch (error) {
        console.warn('Failed to update MCP generic integration:', error);
      }
    }

    try {
      const connectSession = await createNangoConnectSession({
        integrationId: integration.unique_key,
      });

      return connectSession.token;
    } catch (error) {
      wrapNangoError(
        error,
        `Failed to create connect session for integration '${integration.unique_key}'`,
        'createConnectSession'
      );
    }
  } catch (error) {
    console.error('Unexpected error creating provider connect session:', error);
    wrapNangoError(
      error,
      `Unexpected error creating connect session for provider '${providerName}'`,
      'createProviderConnectSession'
    );
  }
}

/**
 * Get metadata for a Nango connection
 */
export async function getNangoConnectionMetadata({
  providerConfigKey,
  connectionId,
}: {
  providerConfigKey: string;
  connectionId: string;
}): Promise<Record<string, string> | null> {
  try {
    const nango = getNangoClient();
    const metadata = await nango.getMetadata(providerConfigKey, connectionId);
    return metadata as Record<string, string>;
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return null;
    }

    console.error('Failed to get connection metadata:', error);
    wrapNangoError(
      error,
      `Unable to retrieve metadata for connection '${connectionId}'`,
      'getMetadata'
    );
  }
}

/**
 * Set metadata for a Nango connection
 */
export async function setNangoConnectionMetadata({
  providerConfigKey,
  connectionId,
  metadata,
}: {
  providerConfigKey: string;
  connectionId: string;
  metadata: Record<string, string>;
}): Promise<void> {
  try {
    const nango = getNangoClient();
    await nango.setMetadata(providerConfigKey, connectionId, metadata);
  } catch (error) {
    console.error('Failed to set connection metadata:', error);
    wrapNangoError(
      error,
      `Unable to update metadata for connection '${connectionId}'`,
      'setMetadata'
    );
  }
}
