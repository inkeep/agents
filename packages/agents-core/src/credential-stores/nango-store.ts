import { type AllAuthCredentials, type AuthModeType, Nango } from '@nangohq/node';
import type { ApiKeyCredentials, ApiPublicIntegration } from '@nangohq/types';
import { z } from 'zod';
import { CredentialStoreType } from '../types';
import type { CredentialStore } from '../types/server';
import { getLogger } from '../utils/logger';

const logger = getLogger('nango-credential-store');

// Schema for validating credential key structure
const CredentialKeySchema = z.object({
  connectionId: z.string().min(1, 'connectionId must be a non-empty string'),
  providerConfigKey: z.string().min(1, 'providerConfigKey must be a non-empty string'),
});

export interface NangoConfig {
  secretKey: string;
  apiUrl?: string;
}

/**
 * Nango-specific credential data with additional properties
 */
export interface NangoCredentialData {
  connectionId: string;
  providerConfigKey: string;
  secretKey: string;
  provider: string;
  token?: string;
  metadata?: Record<string, any>;
}

const SUPPORTED_AUTH_MODES = [
  'APP',
  'API_KEY',
  'BASIC',
  'CUSTOM',
  'JWT',
  'NONE',
  'OAUTH1',
  'OAUTH2',
  'OAUTH2_CC',
  'TBA',
] as const satisfies readonly AuthModeType[];

type SupportedAuthMode = (typeof SUPPORTED_AUTH_MODES)[number];

function isSupportedAuthMode(mode: unknown): mode is SupportedAuthMode {
  return (SUPPORTED_AUTH_MODES as readonly string[]).includes(mode as string);
}

/**
 * Nango-based CredentialStore that fetches OAuth credentials from Nango API
 * Uses connectionId and providerConfigKey from metadata to fetch live credentials
 */
export class NangoCredentialStore implements CredentialStore {
  public readonly id: string;
  public readonly type = CredentialStoreType.nango;
  private nangoConfig: NangoConfig;
  private nangoClient: Nango;

  constructor(id: string, config: NangoConfig) {
    this.id = id;
    this.nangoConfig = config;
    this.nangoClient = new Nango({
      secretKey: this.nangoConfig.secretKey,
      host: this.nangoConfig.apiUrl,
    });
  }

  private getAccessToken(credentials: AllAuthCredentials): Record<string, any> | null {
    const { type } = credentials;
    if (!isSupportedAuthMode(type)) {
      return null;
    }

    const extractAccessTokenForBearerType = (
      tokenString: string | undefined
    ): string | undefined => {
      // Token is always a string, but might be a stringified JSON object
      if (tokenString && typeof tokenString === 'string') {
        try {
          const parsedToken = JSON.parse(tokenString);
          if (parsedToken.access_token && typeof parsedToken.access_token === 'string') {
            return parsedToken.access_token;
          }
        } catch {}
        return tokenString;
      }

      return undefined;
    };

    switch (type) {
      case 'API_KEY':
        return {
          token: extractAccessTokenForBearerType(
            (credentials as any).apiKey || (credentials as any).api_key
          ),
        };
      case 'APP':
        return {
          token: extractAccessTokenForBearerType(
            (credentials as any).accessToken || (credentials as any).access_token
          ),
        };
      case 'BASIC':
        return {
          username: credentials.username,
          token: credentials.password,
        };
      case 'CUSTOM':
        return credentials.raw;
      case 'JWT':
        return {
          token: extractAccessTokenForBearerType(credentials.token),
        };
      case 'OAUTH1':
        return {
          token: credentials.oauth_token,
          token_secret: credentials.oauth_token_secret,
        };
      case 'OAUTH2':
        return {
          token: extractAccessTokenForBearerType(credentials.access_token),
          refresh_token: credentials.refresh_token,
        };
      case 'OAUTH2_CC':
        return {
          token: extractAccessTokenForBearerType(credentials.token),
          client_certificate: credentials.client_certificate,
          client_id: credentials.client_id,
          client_private_key: credentials.client_private_key,
          client_secret: credentials.client_secret,
        };
      case 'TBA':
        return {
          token: credentials.token_id,
          token_secret: credentials.token_secret,
        };
      default:
        return null;
    }
  }

  private sanitizeMetadata(metadata: unknown): Record<string, string> {
    if (!metadata || typeof metadata !== 'object') return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
      if (typeof key !== 'string') continue;
      if (typeof value === 'string') {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Fetch a specific Nango integration
   */
  private async fetchNangoIntegration(
    uniqueKey: string
  ): Promise<(ApiPublicIntegration & { areCredentialsSet: boolean }) | null> {
    try {
      const response = await this.nangoClient.getIntegration(
        { uniqueKey },
        { include: ['credentials'] }
      );
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
        areCredentialsSet = !!(
          integration.credentials?.app_id && integration.credentials?.app_link
        );
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

      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', uniqueKey },
        `Failed to fetch integration ${uniqueKey}`
      );
      return null;
    }
  }

  /**
   * Optimize OAuth token data to fit within Nango's 1024 character limit for apiKey field
   * Strategy: Remove unnecessary fields
   */
  private optimizeOAuthTokenForNango(tokenData: string): string | undefined {
    const parsed = JSON.parse(tokenData);

    // Start with essential fields only (removes id_token, scope, etc.)
    const essential = {
      access_token: parsed.access_token,
      token_type: parsed.token_type,
      expires_in: parsed.expires_in,
      refresh_token: parsed.refresh_token,
    };

    // Remove undefined fields
    Object.keys(essential).forEach((key) => {
      if (essential[key as keyof typeof essential] === undefined) {
        delete essential[key as keyof typeof essential];
      }
    });

    const result = JSON.stringify(essential);

    // If still too big after removing unnecessary fields, we cannot store in Nango
    if (result.length > 1024) {
      logger.error(
        {
          originalLength: tokenData.length,
          essentialLength: result.length,
          accessTokenLength: parsed.access_token?.length || 0,
          refreshTokenLength: parsed.refresh_token?.length || 0,
        },
        'OAuth token too large for Nango storage even after removing non-essential fields'
      );

      throw new Error(
        `OAuth token (${result.length} chars) exceeds Nango's 1024 character limit. ` +
          `Essential fields cannot be truncated without breaking functionality. ` +
          `Consider using keychain storage instead of Nango for this provider.`
      );
    }

    return result;
  }

  /**
   * Create an API key credential by setting up Nango integration and importing the connection
   */
  private async createNangoApiKeyConnection({
    name,
    apiKeyToSet,
    metadata,
  }: {
    name: string;
    apiKeyToSet: string;
    metadata: Record<string, string>;
  }): Promise<void> {
    const provider = 'private-api-bearer';

    try {
      // Step 1: Ensure Nango integration exists
      let integration: ApiPublicIntegration | undefined;

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
        const response = await this.nangoClient.createIntegration({
          provider,
          unique_key: name,
          display_name: name,
        });

        integration = response.data;
      } catch (error: any) {
        // Safe fallback: fetch the existing integration (idempotent operation)
        const existingIntegration = await this.fetchNangoIntegration(name);
        if (existingIntegration) {
          integration = existingIntegration;
        } else {
          // Edge case: 400 error wasn't about duplicate key
          console.log(`Integration creation failed for unexpected reasons`, error);
        }
      }

      if (!integration) {
        throw new Error(`Integration '${name}' not found`);
      }

      // Step 2: Import the connection to Nango
      const importConnectionUrl = `${process.env.NANGO_SERVER_URL || 'https://api.nango.dev'}/connections`;

      // Optimize the OAuth token data to fit within Nango's 1024 character limit
      const optimizedApiKey = this.optimizeOAuthTokenForNango(apiKeyToSet);

      if (!optimizedApiKey) {
        throw new Error(`Failed to optimize OAuth token for Nango.`);
      }

      const credentials: ApiKeyCredentials = {
        type: 'API_KEY',
        apiKey: optimizedApiKey,
      };

      const body = {
        provider_config_key: integration.unique_key,
        connection_id: name,
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
        const errorText = await response.text();
        throw new Error(
          `Failed to import connection: HTTP ${response.status} - ${response.statusText}. Response: ${errorText}`
        );
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          name,
        },
        `Unexpected error creating API key credential '${name}'`
      );
      throw new Error(
        `Failed to create API key credential '${name}': ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Fetch credentials from Nango API using connection information
   * @param connectionId - The connection ID for the Nango connection
   * @param providerConfigKey - The provider config key for the Nango connection
   * @returns The credential data or null if the credentials are not found
   */
  private async fetchCredentialsFromNango({
    connectionId,
    providerConfigKey,
  }: {
    connectionId: string;
    providerConfigKey: string;
  }): Promise<NangoCredentialData | null> {
    try {
      const nangoConnection = await this.nangoClient.getConnection(providerConfigKey, connectionId);

      const tokenAndCredentials = this.getAccessToken(nangoConnection.credentials) ?? {};

      // Return credential data with Nango MCP server headers
      const credentialData: NangoCredentialData = {
        ...tokenAndCredentials,
        connectionId,
        providerConfigKey,
        provider: (nangoConnection as any).provider || 'unknown',
        secretKey: this.nangoConfig.secretKey,
        metadata: this.sanitizeMetadata(nangoConnection.metadata ?? {}),
      };

      return credentialData;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          connectionId,
          providerConfigKey,
        },
        'Error fetching credentials from Nango'
      );
      return null;
    }
  }

  /**
   * Get credentials by key - implements CredentialStore interface
   * Key format: JSON string with connectionId and providerConfigKey
   */
  async get(key: string): Promise<string | null> {
    try {
      // Parse and validate the JSON key structure
      let parsedKey: unknown;
      try {
        parsedKey = JSON.parse(key);
      } catch (parseError) {
        logger.warn(
          {
            storeId: this.id,
            key: key.substring(0, 50), // Log only first 100 chars to avoid log pollution
            error: parseError instanceof Error ? parseError.message : 'Unknown parsing error',
          },
          'Invalid JSON format in credential key'
        );
        return null;
      }

      // Validate the parsed key structure using Zod
      const validationResult = CredentialKeySchema.safeParse(parsedKey);
      if (!validationResult.success) {
        logger.warn(
          {
            storeId: this.id,
            key: key.substring(0, 100),
            validationErrors: validationResult.error.issues,
          },
          'Invalid credential key structure'
        );
        return null;
      }

      const { connectionId, providerConfigKey } = validationResult.data;

      const credentials = await this.fetchCredentialsFromNango({ connectionId, providerConfigKey });

      if (!credentials) {
        return null;
      }

      const credentialString = JSON.stringify(credentials);
      return credentialString;
    } catch (error) {
      logger.error(
        {
          storeId: this.id,
          key: key.substring(0, 100),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Error getting credentials from Nango'
      );
      return null;
    }
  }

  /**
   * Set credentials - not supported for Nango (OAuth flow handles this)
   */
  async set(key: string, value: string): Promise<void> {
    await this.createNangoApiKeyConnection({
      name: key,
      apiKeyToSet: value,
      metadata: {},
    });
  }

  /**
   * Check if credentials exist by attempting to fetch them
   */
  async has(key: string): Promise<boolean> {
    try {
      const credentials = await this.get(key);
      return credentials !== null;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          key,
        },
        'Error checking credentials existence'
      );
      return false;
    }
  }

  /**
   * Delete credentials - not supported for Nango (revoke through Nango dashboard)
   */
  async delete(key: string): Promise<boolean> {
    try {
      // Parse and validate the JSON key structure
      let parsedKey: unknown;
      try {
        parsedKey = JSON.parse(key);
      } catch (parseError) {
        logger.warn(
          {
            storeId: this.id,
            key: key.substring(0, 50), // Log only first 100 chars to avoid log pollution
            error: parseError instanceof Error ? parseError.message : 'Unknown parsing error',
          },
          'Invalid JSON format in credential key'
        );
        return false;
      }

      // Validate the parsed key structure using Zod
      const validationResult = CredentialKeySchema.safeParse(parsedKey);
      if (!validationResult.success) {
        logger.warn(
          {
            storeId: this.id,
            key: key.substring(0, 100),
            validationErrors: validationResult.error.issues,
          },
          'Invalid credential key structure'
        );
        return false;
      }

      const { connectionId, providerConfigKey } = validationResult.data;

      await this.nangoClient.deleteConnection(providerConfigKey, connectionId);
      return true;
    } catch (error) {
      logger.error(
        {
          storeId: this.id,
          key: key.substring(0, 100),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Error deleting credentials from Nango'
      );
      return false;
    }
  }
}

/**
 * Factory function to create NangoCredentialStore
 * Automatically reads NANGO_SECRET_KEY from environment and validates it
 */
export function createNangoCredentialStore(
  id: string,
  config?: Partial<NangoConfig>
): NangoCredentialStore {
  const nangoSecretKey = config?.secretKey || process.env.NANGO_SECRET_KEY;

  if (
    !nangoSecretKey ||
    nangoSecretKey === 'your_nango_secret_key' ||
    nangoSecretKey.includes('mock')
  ) {
    throw new Error(
      'NANGO_SECRET_KEY environment variable is required and must be a real Nango secret key (not mock/placeholder)'
    );
  }

  return new NangoCredentialStore(id, {
    apiUrl: 'https://api.nango.dev',
    ...config,
    secretKey: nangoSecretKey,
  });
}
