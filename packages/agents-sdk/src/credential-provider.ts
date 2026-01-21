/**
 * InkeepCredentialProvider - Abstraction for Credential Management
 *
 * This module provides a clean abstraction over credential provider implementations.
 * Cloud customers can use this without needing to know about or install internal
 * dependencies like Nango.
 *
 * @example
 * ```typescript
 * // Simple usage with environment variables (default)
 * import { InkeepCredentialProvider } from '@inkeep/agents-sdk'
 *
 * const credentials = new InkeepCredentialProvider()
 *
 * // With custom configuration
 * const credentials = new InkeepCredentialProvider({
 *   type: 'memory',
 *   id: 'my-store'
 * })
 * ```
 */

/**
 * Base interface for all credential stores
 * This is a simplified version for SDK customers
 */
export interface CredentialStore {
  /** Unique identifier for this credential store */
  readonly id: string;
  /** Type of credential store */
  readonly type: CredentialProviderType;
  /** Get a credential by key */
  get(key: string): Promise<string | null>;
  /** Set a credential */
  set(key: string, value: string, metadata?: Record<string, string>): Promise<void>;
  /** Check if a credential exists */
  has(key: string): Promise<boolean>;
  /** Delete a credential */
  delete(key: string): Promise<boolean>;
  /** Check if the credential store is available */
  checkAvailability(): Promise<{ available: boolean; reason?: string }>;
}

/**
 * Supported credential provider types
 */
export type CredentialProviderType = 'memory' | 'keychain' | 'nango' | 'custom';

/**
 * Configuration for memory-based credential storage
 */
export interface MemoryCredentialConfig {
  type: 'memory';
  /** Optional store ID (defaults to 'memory-default') */
  id?: string;
}

/**
 * Configuration for keychain-based credential storage
 */
export interface KeychainCredentialConfig {
  type: 'keychain';
  /** Optional store ID (defaults to 'keychain-default') */
  id?: string;
  /** Optional service name for keychain entries */
  serviceName?: string;
}

/**
 * Configuration for Nango-based credential storage (OAuth management)
 * Note: Using Nango requires the @nangohq/node package to be installed
 */
export interface NangoCredentialConfig {
  type: 'nango';
  /** Optional store ID (defaults to 'nango-default') */
  id?: string;
  /** Nango secret key (defaults to NANGO_SECRET_KEY env var) */
  secretKey?: string;
  /** Nango API URL (defaults to https://api.nango.dev) */
  apiUrl?: string;
}

/**
 * Configuration for custom credential provider
 */
export interface CustomCredentialConfig {
  type: 'custom';
  /** Custom credential store implementation */
  store: CredentialStore;
}

/**
 * Union type for all credential provider configurations
 */
export type CredentialProviderConfig =
  | MemoryCredentialConfig
  | KeychainCredentialConfig
  | NangoCredentialConfig
  | CustomCredentialConfig;

/**
 * Default configuration using memory store
 */
const DEFAULT_CONFIG: MemoryCredentialConfig = {
  type: 'memory',
  id: 'memory-default',
};

/**
 * Simple in-memory credential store implementation
 * Automatically loads from environment variables as fallback
 */
class InMemoryStore implements CredentialStore {
  public readonly id: string;
  public readonly type: CredentialProviderType = 'memory';
  private credentials = new Map<string, string>();

  constructor(id = 'memory-default') {
    this.id = id;
  }

  async get(key: string): Promise<string | null> {
    const credential = this.credentials.get(key);
    if (!credential) {
      // Try loading from environment variables
      const envValue = process.env[key];
      if (envValue) {
        this.credentials.set(key, envValue);
        return envValue;
      }
      return null;
    }
    return credential;
  }

  async set(key: string, value: string, _metadata?: Record<string, string>): Promise<void> {
    this.credentials.set(key, value);
  }

  async has(key: string): Promise<boolean> {
    return this.credentials.has(key) || !!process.env[key];
  }

  async delete(key: string): Promise<boolean> {
    return this.credentials.delete(key);
  }

  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    return { available: true };
  }
}

/**
 * InkeepCredentialProvider - Unified credential management for Inkeep SDK
 *
 * Provides a clean abstraction over various credential storage backends.
 * Cloud customers can use simple memory-based storage, while advanced
 * users can integrate with OAuth providers like Nango.
 *
 * @example
 * ```typescript
 * // Default memory-based storage
 * const provider = new InkeepCredentialProvider()
 *
 * // Store and retrieve credentials
 * await provider.set('my-api-key', 'secret-value')
 * const key = await provider.get('my-api-key')
 *
 * // Use environment variables automatically
 * process.env.MY_TOKEN = 'env-token'
 * const token = await provider.get('MY_TOKEN') // Returns 'env-token'
 * ```
 */
export class InkeepCredentialProvider implements CredentialStore {
  private store: CredentialStore;

  constructor(config: CredentialProviderConfig = DEFAULT_CONFIG) {
    this.store = this.createStore(config);
  }

  /**
   * Create the appropriate store based on configuration
   */
  private createStore(config: CredentialProviderConfig): CredentialStore {
    switch (config.type) {
      case 'memory':
        return new InMemoryStore(config.id);

      case 'keychain':
        // Keychain requires optional dependency - try to load dynamically
        return this.createKeychainStore(config);

      case 'nango':
        // Nango requires optional dependency - try to load dynamically
        return this.createNangoStore(config);

      case 'custom':
        return config.store;

      default:
        throw new Error(`Unknown credential provider type: ${(config as any).type}`);
    }
  }

  /**
   * Create keychain store with dynamic import
   */
  private createKeychainStore(config: KeychainCredentialConfig): CredentialStore {
    // Return a lazy-loading proxy that defers to @inkeep/agents-core when accessed
    const storeId = config.id || 'keychain-default';

    return {
      id: storeId,
      type: 'keychain' as CredentialProviderType,
      get: async (key: string) => {
        const { createKeyChainStore } = await import('@inkeep/agents-core/credential-stores');
        const store = createKeyChainStore(storeId);
        return store.get(key);
      },
      set: async (key: string, value: string, metadata?: Record<string, string>) => {
        const { createKeyChainStore } = await import('@inkeep/agents-core/credential-stores');
        const store = createKeyChainStore(storeId);
        return store.set(key, value, metadata);
      },
      has: async (key: string) => {
        const { createKeyChainStore } = await import('@inkeep/agents-core/credential-stores');
        const store = createKeyChainStore(storeId);
        return store.has(key);
      },
      delete: async (key: string) => {
        const { createKeyChainStore } = await import('@inkeep/agents-core/credential-stores');
        const store = createKeyChainStore(storeId);
        return store.delete(key);
      },
      checkAvailability: async () => {
        try {
          const { createKeyChainStore } = await import('@inkeep/agents-core/credential-stores');
          const store = createKeyChainStore(storeId);
          return store.checkAvailability();
        } catch {
          return {
            available: false,
            reason: 'Keychain store requires @napi-rs/keyring package to be installed',
          };
        }
      },
    };
  }

  /**
   * Create Nango store with dynamic import
   */
  private createNangoStore(config: NangoCredentialConfig): CredentialStore {
    // Return a lazy-loading proxy that defers to @inkeep/agents-core when accessed
    const storeId = config.id || 'nango-default';
    const secretKey = config.secretKey;
    const apiUrl = config.apiUrl;

    return {
      id: storeId,
      type: 'nango' as CredentialProviderType,
      get: async (key: string) => {
        const { createNangoCredentialStore } = await import(
          '@inkeep/agents-core/credential-stores'
        );
        const store = createNangoCredentialStore(storeId, { secretKey, apiUrl });
        return store.get(key);
      },
      set: async (key: string, value: string, metadata?: Record<string, string>) => {
        const { createNangoCredentialStore } = await import(
          '@inkeep/agents-core/credential-stores'
        );
        const store = createNangoCredentialStore(storeId, { secretKey, apiUrl });
        return store.set(key, value, metadata);
      },
      has: async (key: string) => {
        const { createNangoCredentialStore } = await import(
          '@inkeep/agents-core/credential-stores'
        );
        const store = createNangoCredentialStore(storeId, { secretKey, apiUrl });
        return store.has(key);
      },
      delete: async (key: string) => {
        const { createNangoCredentialStore } = await import(
          '@inkeep/agents-core/credential-stores'
        );
        const store = createNangoCredentialStore(storeId, { secretKey, apiUrl });
        return store.delete(key);
      },
      checkAvailability: async () => {
        try {
          const { createNangoCredentialStore } = await import(
            '@inkeep/agents-core/credential-stores'
          );
          const store = createNangoCredentialStore(storeId, { secretKey, apiUrl });
          return store.checkAvailability();
        } catch (error) {
          return {
            available: false,
            reason:
              error instanceof Error
                ? error.message
                : 'Nango store requires @nangohq/node package and NANGO_SECRET_KEY',
          };
        }
      },
    };
  }

  // Implement CredentialStore interface by delegating to internal store

  get id(): string {
    return this.store.id;
  }

  get type(): CredentialProviderType {
    return this.store.type;
  }

  /**
   * Get a credential by key
   * @param key - The credential key
   * @returns The credential value or null if not found
   */
  async get(key: string): Promise<string | null> {
    return this.store.get(key);
  }

  /**
   * Set a credential
   * @param key - The credential key
   * @param value - The credential value
   * @param metadata - Optional metadata
   */
  async set(key: string, value: string, metadata?: Record<string, string>): Promise<void> {
    return this.store.set(key, value, metadata);
  }

  /**
   * Check if a credential exists
   * @param key - The credential key
   * @returns True if the credential exists
   */
  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  /**
   * Delete a credential
   * @param key - The credential key
   * @returns True if the credential was deleted
   */
  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  /**
   * Check if the credential store is available and functional
   * @returns Availability status
   */
  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    return this.store.checkAvailability();
  }

  /**
   * Get the underlying store (for advanced use cases)
   */
  getStore(): CredentialStore {
    return this.store;
  }
}

/**
 * Factory function to create an InkeepCredentialProvider
 * @param config - Configuration options
 * @returns A new InkeepCredentialProvider instance
 */
export function createCredentialProvider(
  config: CredentialProviderConfig = DEFAULT_CONFIG
): InkeepCredentialProvider {
  return new InkeepCredentialProvider(config);
}
