'use server';

/**
 * Nango Integration Utilities
 *
 * This file contains server-side functions for interacting with the Nango API.
 *
 * IMPORTANT: All patterns here involve external API calls to Nango, which has
 * atomic constraints enforced at their database level. Patterns that might look
 * like race conditions (optimistic creation + fallback fetch) are actually safe
 * and recommended for external APIs with uniqueness constraints.
 */

import { generateIdFromName } from '@inkeep/agents-core/client-exports';
import { Nango } from '@nangohq/node';
import type {
  ApiKeyCredentials,
  ApiProvider,
  ApiPublicConnection,
  ApiPublicIntegration,
  ApiPublicIntegrationCredentials,
} from '@nangohq/types';
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
      host: process.env.NEXT_PUBLIC_NANGO_HOST || undefined, // defaults to Nango Cloud
    });
  } catch (error) {
    throw new NangoError('Failed to initialize Nango client', 'new Nango', error);
  }
};

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
    // Check if this is a 404 (integration not found) - return null for this case
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
export async function createNangoIntegration(params: {
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
  organizationId = process.env.TENANT_ID || 'default',
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
 * Create an API key credential by setting up Nango integration and importing the connection
 */
export async function createNangoApiKeyConnection({
  name,
  apiKeyToSet,
  metadata,
}: {
  name: string;
  apiKeyToSet: string;
  metadata: Record<string, string>;
}): Promise<{ integration: ApiPublicIntegration }> {
  const provider = 'private-api-bearer';
  const idFromName = generateIdFromName(name);

  try {
    // Step 1: Ensure Nango integration exists
    let integration: ApiPublicIntegration;

    /*
     * SAFE PATTERN: Optimistic creation for external API with atomic constraints
     *
     * This is NOT a race condition because:
     * 1. Nango API enforces uniqueKey constraints atomically in their database
     * 2. Multiple concurrent requests will get deterministic results:
     *    - One request succeeds (creates the integration)
     *    - All others get 400 duplicate error (safe to handle)
     * 3. The fetchNangoIntegration fallback is idempotent
     *
     * This pattern is recommended for external APIs vs local database operations
     * where true race conditions could occur.
     */
    try {
      // Optimistic creation - assume integration doesn't exist
      integration = await createNangoIntegration({
        provider,
        uniqueKey: idFromName,
        displayName: name,
      });
    } catch (error: any) {
      // Handle Nango's atomic duplicate key rejection (400 status)
      if (
        error instanceof NangoError &&
        error.cause &&
        typeof error.cause === 'object' &&
        'status' in error.cause &&
        error.cause.status === 400
      ) {
        // Safe fallback: fetch the existing integration (idempotent operation)
        const existingIntegration = await fetchNangoIntegration(idFromName);
        if (existingIntegration) {
          integration = existingIntegration;
        } else {
          // Edge case: 400 error wasn't about duplicate key
          wrapNangoError(error, `Integration creation failed for unexpected reasons`, 'create');
        }
      } else {
        // Non-duplicate error (network, auth, etc.)
        wrapNangoError(error, `Failed to create or retrieve integration '${idFromName}'`, 'create');
      }
    }

    // Step 2: Import the connection to Nango
    try {
      const importConnectionUrl = `${process.env.NEXT_PUBLIC_NANGO_HOST || 'https://api.nango.dev'}/connections`;

      const credentials: ApiKeyCredentials = {
        type: 'API_KEY',
        apiKey: apiKeyToSet,
      };

      const body = {
        provider_config_key: integration.unique_key,
        connection_id: idFromName,
        metadata,
        credentials,
      };

      const response = await fetch(importConnectionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.NANGO_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new NangoError(
          `Failed to import connection: HTTP ${response.status} - ${response.statusText}`,
          'importConnection'
        );
      }
    } catch (error) {
      wrapNangoError(error, `Failed to import API key connection to Nango`, 'importConnection');
    }

    // Step 3: Set metadata (Nango workaround)
    try {
      await setNangoConnectionMetadata({
        providerConfigKey: integration.unique_key,
        connectionId: idFromName,
        metadata,
      });
    } catch (error) {
      // Non-critical error - log but don't fail
      console.warn(`Failed to set metadata for connection ${idFromName}:`, error);
    }
    return { integration };
  } catch (error) {
    console.error('Unexpected error creating API key credential:', error);
    wrapNangoError(
      error,
      `Unexpected error creating API key credential '${name}'`,
      'createNangoApiKeyConnection'
    );
  }
}

/**
 * Create a connect session for a Nango provider (sets up integration if needed)
 */
export async function createProviderConnectSession({
  providerName,
  credentials,
}: {
  providerName: string;
  credentials?: ApiPublicIntegrationCredentials;
}): Promise<string> {
  try {
    // Step 1: Check for existing integration
    let integration: ApiPublicIntegration;
    let existingIntegration: (ApiPublicIntegration & { areCredentialsSet: boolean }) | null = null;

    try {
      existingIntegration = await fetchNangoIntegration(providerName);
    } catch (error) {
      if (error instanceof NangoError) {
        throw error;
      }
      // Log but continue - integration might not exist yet
      console.debug(`Integration '${providerName}' not found, will create new one`);
    }

    // Step 2: Use existing or create new integration
    if (existingIntegration?.areCredentialsSet) {
      integration = existingIntegration;
    } else {
      try {
        integration = await createNangoIntegration({
          provider: providerName,
          uniqueKey: providerName,
          displayName: providerName,
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

    // Step 3: Create connect session
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
    // Check if this is a 404 (connection not found) - return null for this case
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
