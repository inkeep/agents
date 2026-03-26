'use server';

/**
 * This file contains server-side functions for interacting with the Nango API.
 */

import { Nango } from '@nangohq/node';
import type {
  ApiProvider,
  ApiPublicIntegration,
  ApiPublicIntegrationCredentials,
  AuthModeType,
  PostConnectSessions,
} from '@nangohq/types';
import { cache } from 'react';
import { makeManagementApiRequest } from '@/lib/api/api-config';
import { DEFAULT_TENANT_ID } from '@/lib/runtime-config/defaults';
import { NangoError, wrapNangoError } from './nango-types';

/**
 * Verify the authenticated user has access to the given tenant.
 * Makes a lightweight authenticated call through the backend API,
 * which validates session cookies and tenant membership.
 * Throws if the user is not authenticated or not a member of the tenant.
 */
// Intentionally used as an auth gate: the backend validates session cookies
// and tenant membership on this request. If this endpoint ever becomes
// public or cached, the tenant isolation check will silently break.
async function verifyTenantAccess(tenantId: string): Promise<void> {
  await makeManagementApiRequest(`tenants/${tenantId}/projects?limit=1`);
}

/**
 * Verify that a Nango integration uniqueKey belongs to the given tenant.
 * Integration keys follow the convention: {provider}-{tenantId}-{suffix}
 */
function assertKeyBelongsToTenant(uniqueKey: string, tenantId: string): void {
  const tenantSegment = `-${tenantId}-`;
  const tenantSuffix = `-${tenantId}`;
  if (!uniqueKey.endsWith(tenantSuffix) && !uniqueKey.includes(tenantSegment)) {
    throw new NangoError(`Integration key '${uniqueKey}' does not belong to tenant '${tenantId}'`);
  }
}

// Initialize Nango client with environment variables
const getNangoClient = () => {
  const secretKey = process.env.NANGO_SECRET_KEY;
  if (!secretKey) {
    throw new NangoError('NANGO_SECRET_KEY environment variable is required for Nango integration');
  }

  const host =
    process.env.PUBLIC_NANGO_SERVER_URL ||
    process.env.NEXT_PUBLIC_NANGO_SERVER_URL ||
    process.env.NANGO_SERVER_URL ||
    'https://api.nango.dev';

  try {
    return new Nango({ secretKey, host });
  } catch (error) {
    throw new NangoError('Failed to initialize Nango client', 'new Nango', error);
  }
};

/**
 * Fetch all available Nango providers
 */
async function $fetchNangoProviders(): Promise<ApiProvider[]> {
  try {
    const nango = getNangoClient();
    const response = await nango.listProviders({});
    return response.data;
  } catch (error) {
    console.error('Failed to fetch providers:', error);
    wrapNangoError(error, 'Unable to retrieve available providers from Nango', 'listProviders');
  }
}

export const fetchNangoProviders = cache($fetchNangoProviders);

export interface MaskedCredentials {
  type: string;
  client_id?: string;
  client_secret?: string;
  scopes?: string | null;
  app_id?: string;
  app_link?: string;
  has_private_key?: boolean;
}

export interface NangoIntegrationWithMaskedCredentials {
  unique_key: string;
  provider: string;
  display_name?: string | null;
  logo: string;
  created_at: string;
  updated_at: string;
  areCredentialsSet: boolean;
  maskedCredentials: MaskedCredentials | null;
}

type CredentialAuthMode = ApiPublicIntegrationCredentials['type'];

const CREDENTIAL_AUTH_MODES: readonly CredentialAuthMode[] = [
  'OAUTH1',
  'OAUTH2',
  'TBA',
  'APP',
  'CUSTOM',
];

function isCredentialAuthMode(value: string): value is CredentialAuthMode {
  return (CREDENTIAL_AUTH_MODES as readonly string[]).includes(value);
}

export async function buildCredentialsPayload(
  credentials: Record<string, unknown> | undefined,
  authMode: AuthModeType | undefined
): Promise<ApiPublicIntegrationCredentials | undefined> {
  if (!credentials || !authMode) return undefined;

  if (!isCredentialAuthMode(authMode)) {
    console.warn(`Auth mode "${authMode}" does not support credential payloads`);
    return undefined;
  }

  if (typeof credentials.app_link === 'string' && credentials.app_link.trim()) {
    const url = new URL(credentials.app_link.trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are allowed for app_link');
    }
  }

  return { ...credentials, type: authMode } as ApiPublicIntegrationCredentials;
}

function maskSecret(value: string | null | undefined, visibleChars = 4): string | undefined {
  if (!value) return undefined;
  if (value.length <= visibleChars) return '\u2022'.repeat(value.length);
  return '\u2022'.repeat(Math.min(value.length - visibleChars, 12)) + value.slice(-visibleChars);
}

function buildMaskedCredentials(credentials: ApiPublicIntegration['credentials']): {
  areCredentialsSet: boolean;
  masked: MaskedCredentials | null;
} {
  if (!credentials) return { areCredentialsSet: false, masked: null };

  if (
    credentials.type === 'OAUTH2' ||
    credentials.type === 'OAUTH1' ||
    credentials.type === 'TBA'
  ) {
    const areCredentialsSet = !!(credentials.client_id && credentials.client_secret);
    return {
      areCredentialsSet,
      masked: {
        type: credentials.type,
        client_id: credentials.client_id ?? undefined,
        client_secret: maskSecret(credentials.client_secret),
        scopes: credentials.scopes,
      },
    };
  }

  if (credentials.type === 'APP') {
    const areCredentialsSet = !!(credentials.app_id && credentials.app_link);
    return {
      areCredentialsSet,
      masked: {
        type: credentials.type,
        app_id: credentials.app_id ?? undefined,
        app_link: credentials.app_link ?? undefined,
        has_private_key: !!credentials.private_key,
      },
    };
  }

  return { areCredentialsSet: true, masked: { type: credentials.type } };
}

/**
 * Fetch a specific Nango integration
 */
export async function fetchNangoIntegration(
  uniqueKey: string
): Promise<NangoIntegrationWithMaskedCredentials | null> {
  try {
    const nango = getNangoClient();
    const response = await nango.getIntegration({ uniqueKey }, { include: ['credentials'] });
    const integration = response.data;

    const { areCredentialsSet, masked } = buildMaskedCredentials(integration.credentials);

    return {
      unique_key: integration.unique_key,
      provider: integration.provider,
      display_name: integration.display_name,
      logo: integration.logo,
      created_at: String(integration.created_at),
      updated_at: String(integration.updated_at),
      areCredentialsSet,
      maskedCredentials: masked,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return null;
    }

    console.error(`Failed to fetch integration ${uniqueKey}:`, error);
    wrapNangoError(error, `Unable to fetch integration with key '${uniqueKey}'`, 'getIntegration');
  }
}

export async function deleteNangoIntegration(uniqueKey: string, tenantId: string): Promise<void> {
  await verifyTenantAccess(tenantId);
  assertKeyBelongsToTenant(uniqueKey, tenantId);

  try {
    const nango = getNangoClient();
    await nango.deleteIntegration(uniqueKey);
  } catch (error) {
    console.error(`Failed to delete integration ${uniqueKey}:`, error);
    wrapNangoError(error, `Failed to delete integration '${uniqueKey}'`, 'deleteNangoIntegration');
  }
}

/**
 * List all Nango integrations for a given provider + tenant.
 * Filters by the naming convention: keys starting with `{provider}-{tenantId}`.
 * Fetches credentials for each to build masked summaries.
 */
export async function listNangoProviderIntegrations(
  provider: string,
  tenantId: string
): Promise<NangoIntegrationWithMaskedCredentials[]> {
  await verifyTenantAccess(tenantId);

  try {
    const nango = getNangoClient();
    const response = await nango.listIntegrations();
    const allIntegrations = response.configs;

    const prefix = `${provider}-${tenantId}`;
    const matching = allIntegrations.filter(
      (i) => i.provider === provider && i.unique_key.startsWith(prefix)
    );

    if (matching.length === 0) return [];

    const detailed = await Promise.all(matching.map((i) => fetchNangoIntegration(i.unique_key)));

    return detailed.filter((i): i is NangoIntegrationWithMaskedCredentials => i !== null);
  } catch (error) {
    console.error(`Failed to list integrations for ${provider}:`, error);
    wrapNangoError(
      error,
      `Unable to list integrations for provider '${provider}'`,
      'listNangoProviderIntegrations'
    );
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

export async function updateNangoIntegrationCredentials({
  uniqueKey,
  credentials,
  tenantId,
}: {
  uniqueKey: string;
  credentials: ApiPublicIntegrationCredentials;
  tenantId: string;
}): Promise<ApiPublicIntegration> {
  await verifyTenantAccess(tenantId);
  assertKeyBelongsToTenant(uniqueKey, tenantId);

  const secretKey = process.env.NANGO_SECRET_KEY;
  if (!secretKey) {
    throw new NangoError('NANGO_SECRET_KEY environment variable is required for Nango integration');
  }

  const host =
    process.env.PUBLIC_NANGO_SERVER_URL ||
    process.env.NEXT_PUBLIC_NANGO_SERVER_URL ||
    process.env.NANGO_SERVER_URL ||
    'https://api.nango.dev';

  const response = await fetch(`${host}/integrations/${encodeURIComponent(uniqueKey)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ credentials }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new NangoError(
      `Failed to update integration credentials: ${response.status} ${response.statusText}`,
      'updateNangoIntegrationCredentials',
      errorData
    );
  }

  return await response.json();
}

async function updateMCPGenericIntegration({
  uniqueKey,
}: {
  uniqueKey: string;
}): Promise<ApiPublicIntegration> {
  const secretKey = process.env.NANGO_SECRET_KEY;
  if (!secretKey) {
    throw new NangoError('NANGO_SECRET_KEY environment variable is required for Nango integration');
  }

  const host =
    process.env.PUBLIC_NANGO_SERVER_URL ||
    process.env.NEXT_PUBLIC_NANGO_SERVER_URL ||
    process.env.NANGO_SERVER_URL ||
    'https://api.nango.dev';

  const clientName = process.env.OAUTH_CLIENT_NAME || 'Inkeep Agent Framework';
  const clientUri = process.env.OAUTH_CLIENT_URI || 'https://inkeep.com';
  const logoUri =
    process.env.OAUTH_CLIENT_LOGO_URI || 'https://inkeep.com/images/logos/inkeep-logo-blue.svg';

  const response = await fetch(`${host}/integrations/${encodeURIComponent(uniqueKey)}`, {
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
}): Promise<PostConnectSessions['Success']['data']> {
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
  endUserId,
  endUserEmail,
  endUserDisplayName,
  organizationId,
  organizationDisplayName,
}: {
  providerName: string;
  uniqueKey: string;
  displayName: string;
  credentials?: ApiPublicIntegrationCredentials;
  endUserId?: string;
  endUserEmail?: string;
  endUserDisplayName?: string;
  organizationId?: string;
  organizationDisplayName?: string;
}): Promise<string> {
  try {
    let integration: ApiPublicIntegration | NangoIntegrationWithMaskedCredentials;
    let existingIntegration: NangoIntegrationWithMaskedCredentials | null = null;

    try {
      existingIntegration = await fetchNangoIntegration(uniqueKey);
    } catch (error) {
      if (error instanceof NangoError) {
        throw error;
      }
      console.debug(`Integration '${providerName}' not found, will create new one`);
    }

    if (existingIntegration) {
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
        endUserId,
        endUserEmail,
        endUserDisplayName,
        organizationId,
        organizationDisplayName,
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
