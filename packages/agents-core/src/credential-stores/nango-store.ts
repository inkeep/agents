import { type AllAuthCredentials, type AuthModeType, Nango } from '@nangohq/node';
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

    switch (type) {
      case 'API_KEY':
        return {
          token: (credentials as any).apiKey || (credentials as any).api_key,
        };
      case 'APP':
        return {
          token: (credentials as any).accessToken || (credentials as any).access_token,
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
          token: credentials.token,
        };
      case 'OAUTH1':
        return {
          token: credentials.oauth_token,
          token_secret: credentials.oauth_token_secret,
        };
      case 'OAUTH2':
        return {
          token: credentials.access_token,
          refresh_token: credentials.refresh_token,
        };
      case 'OAUTH2_CC':
        return {
          token: credentials.token,
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
  async set(_key: string, _value: string): Promise<void> {
    throw new Error('Setting credentials not supported for Nango store - use OAuth flow instead');
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
