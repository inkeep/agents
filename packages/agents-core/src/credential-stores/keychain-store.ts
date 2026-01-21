import type { Entry } from '@napi-rs/keyring';
import { CredentialStoreType } from '../types';
import type { CredentialStore } from '../types/server';
import { getLogger } from '../utils/logger';

/**
 * KeyChainStore - Cross-platform system keychain credential storage
 *
 * Uses the native OS credential storage:
 * - macOS: Keychain
 * - Windows: Credential Vault
 * - Linux: Secret Service API/libsecret
 *
 * Requires the '@napi-rs/keyring' npm package to be installed.
 * Falls back gracefully if keyring is not available.
 *
 * ## macOS Permission Handling
 *
 * On macOS, when your Node.js app first calls keyring operations:
 * - `setPassword()` creates a new Keychain item (no prompt required)
 * - `getPassword()` may prompt the user for permission on first access
 * - Users can click "Allow", "Always Allow", or "Deny"
 * - If denied, keyring returns `null` which this implementation handles gracefully
 * - The calling binary (usually `node`) will be shown in the permission prompt
 * - For better UX in packaged apps, consider code signing and app bundling
 *
 * This implementation handles all permission scenarios gracefully:
 * - Returns `null` when access is denied or credentials don't exist
 * - Logs errors for debugging permission issues
 * - Never throws on permission denial, only on system-level errors
 */
export class KeyChainStore implements CredentialStore {
  public readonly id: string;
  public readonly type = CredentialStoreType.keychain;
  private readonly service: string;
  private readonly logger = getLogger('KeyChainStore');
  private keyringAvailable = false;
  private EntryClass: typeof Entry | null = null;
  private initializationPromise: Promise<void>;

  constructor(id: string, servicePrefix = 'inkeep-agent-framework') {
    this.id = id;
    // Use service prefix to isolate credentials by store ID
    this.service = `${servicePrefix}-${id}`;
    this.initializationPromise = this.initializeKeyring();
  }

  /**
   * Initialize keyring dynamically to handle optional availability
   */
  private async initializeKeyring(): Promise<void> {
    if (this.EntryClass) {
      this.keyringAvailable = true;
      return;
    }

    try {
      // Dynamic import with `webpackIgnore` to prevent Webpack/Turbopack from bundling
      // or analyzing the `@napi-rs/keyring` module (must be loaded at runtime only).
      const keyringModule = await import(/* webpackIgnore: true */ '@napi-rs/keyring');
      this.EntryClass = keyringModule.Entry;
      this.keyringAvailable = true;
    } catch (error) {
      this.logger.warn(
        {
          storeId: this.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Keyring not available - KeyChainStore will return null for all operations'
      );
      this.keyringAvailable = false;
    }
  }

  /**
   * Add a key to the index
   */
  private addKeyToIndex(key: string): void {
    if (!this.EntryClass) return;

    try {
      const indexEntry = new this.EntryClass(this.service, '__key_index__');
      const indexJson = indexEntry.getPassword();
      const keys: string[] = indexJson ? JSON.parse(indexJson) : [];

      if (!keys.includes(key)) {
        keys.push(key);
        indexEntry.setPassword(JSON.stringify(keys));
      }
    } catch (error) {
      this.logger.warn(
        { storeId: this.id, key, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to update key index'
      );
    }
  }

  /**
   * Remove a key from the index
   */
  private removeKeyFromIndex(key: string): void {
    if (!this.EntryClass) return;

    try {
      const indexEntry = new this.EntryClass(this.service, '__key_index__');
      const indexJson = indexEntry.getPassword();
      if (!indexJson) return;

      const keys: string[] = JSON.parse(indexJson);
      const filteredKeys = keys.filter((k) => k !== key);

      if (filteredKeys.length !== keys.length) {
        indexEntry.setPassword(JSON.stringify(filteredKeys));
      }
    } catch (error) {
      this.logger.warn(
        { storeId: this.id, key, error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to update key index'
      );
    }
  }

  /**
   * Get a credential from the keychain
   */
  async get(key: string): Promise<string | null> {
    await this.initializationPromise;

    if (!this.keyringAvailable || !this.EntryClass) {
      this.logger.debug({ storeId: this.id, key }, 'Keyring not available, returning null');
      return null;
    }

    try {
      const entry = new this.EntryClass(this.service, key);
      const password = entry.getPassword();

      if (password === null || password === undefined) {
        this.logger.debug(
          { storeId: this.id, service: this.service, account: key },
          'No credential found in keychain'
        );
        return null;
      }

      return password;
    } catch (error) {
      this.logger.error(
        {
          storeId: this.id,
          service: this.service,
          account: key,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Error getting credential from keychain'
      );
      return null;
    }
  }

  /**
   * Set a credential in the keychain
   */
  async set(
    key: string,
    value: string,
    /** Optional metadata (ignored by keychain store) */
    _metadata?: Record<string, string>
  ): Promise<void> {
    await this.initializationPromise;

    if (!this.keyringAvailable || !this.EntryClass) {
      this.logger.warn({ storeId: this.id, key }, 'Keyring not available, cannot set credential');
      throw new Error('Keyring not available - cannot store credentials in system keychain');
    }

    try {
      const entry = new this.EntryClass(this.service, key);
      entry.setPassword(value);
      this.addKeyToIndex(key);

      this.logger.debug(
        { storeId: this.id, service: this.service, account: key },
        'Credential stored in keychain'
      );
    } catch (error) {
      this.logger.error(
        {
          storeId: this.id,
          service: this.service,
          account: key,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Error setting credential in keychain'
      );
      throw new Error(
        `Failed to store credential in keychain: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if a credential exists in the keychain
   */
  async has(key: string): Promise<boolean> {
    const credential = await this.get(key);
    return credential !== null;
  }

  /**
   * Check if the credential store is available and functional
   */
  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    await this.initializationPromise;

    if (!this.keyringAvailable || !this.EntryClass) {
      return {
        available: false,
        reason: 'Keyring not available - cannot store credentials in system keychain',
      };
    }

    return {
      available: true,
    };
  }

  /**
   * Delete a credential from the keychain
   */
  async delete(key: string): Promise<boolean> {
    await this.initializationPromise;

    if (!this.keyringAvailable || !this.EntryClass) {
      this.logger.warn({ storeId: this.id, key }, 'Keyring not available, cannot delete credential');
      return false;
    }

    try {
      const entry = new this.EntryClass(this.service, key);
      entry.deletePassword();
      this.removeKeyFromIndex(key);

      this.logger.debug(
        { storeId: this.id, service: this.service, account: key },
        'Credential deleted from keychain'
      );

      return true;
    } catch (error) {
      this.logger.error(
        {
          storeId: this.id,
          service: this.service,
          account: key,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Error deleting credential from keychain'
      );
      return false;
    }
  }

  /**
   * Find all credentials for this service
   * Useful for debugging and listing stored credentials
   *
   * NOTE: @napi-rs/keyring does not have a findCredentials equivalent.
   * This implementation uses a key index to track all stored keys.
   * The index is maintained separately and updated during set/delete operations.
   */
  async findAllCredentials(): Promise<Array<{ account: string; password: string }>> {
    await this.initializationPromise;

    if (!this.keyringAvailable || !this.EntryClass) {
      return [];
    }

    try {
      // Try to get the index of all keys
      const indexEntry = new this.EntryClass(this.service, '__key_index__');
      const indexJson = indexEntry.getPassword();

      if (!indexJson) {
        return [];
      }

      const keys: string[] = JSON.parse(indexJson);
      const credentials: Array<{ account: string; password: string }> = [];

      for (const key of keys) {
        try {
          const entry = new this.EntryClass(this.service, key);
          const password = entry.getPassword();
          if (password) {
            credentials.push({ account: key, password });
          }
        } catch {
          // Skip keys that can't be retrieved
          continue;
        }
      }

      return credentials;
    } catch (error) {
      this.logger.error(
        {
          storeId: this.id,
          service: this.service,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Error finding credentials in keychain'
      );
      return [];
    }
  }

  /**
   * Clear all credentials for this service
   * WARNING: This will delete all credentials stored under this service
   */
  async clearAll(): Promise<number> {
    const credentials = await this.findAllCredentials();
    let deletedCount = 0;

    for (const cred of credentials) {
      const deleted = await this.delete(cred.account);
      if (deleted) {
        deletedCount++;
      }
    }

    // Clear the key index
    if (this.EntryClass && deletedCount > 0) {
      try {
        const indexEntry = new this.EntryClass(this.service, '__key_index__');
        indexEntry.deletePassword();
      } catch (error) {
        this.logger.warn(
          { storeId: this.id, error: error instanceof Error ? error.message : 'Unknown error' },
          'Failed to delete key index'
        );
      }
    }

    if (deletedCount > 0) {
      this.logger.info(
        {
          storeId: this.id,
          service: this.service,
          deletedCount,
        },
        'Cleared all credentials from keychain'
      );
    }

    return deletedCount;
  }
}

/**
 * Factory function to create KeyChainStore
 * Provides consistent initialization and optional configuration
 *
 * ## Usage Recommendations for macOS Permission Handling
 *
 * 1. **First-time setup**: Inform users that they may see permission prompts
 * 2. **Error handling**: Check for `null` returns from `get()` operations
 * 3. **User guidance**: If credentials can't be retrieved, guide users to:
 *    - Check Keychain Access app for denied permissions
 *    - Re-run the application if they accidentally clicked "Deny"
 * 4. **Development**: Use a consistent `servicePrefix` to avoid permission prompt spam
 * 5. **Production**: Consider code-signing your distributed app for better permission prompts
 *
 * Example usage with permission handling:
 * ```typescript
 * const store = createKeyChainStore('my-app');
 *
 * // Always check for null when retrieving
 * const apiKey = await store.get('api-key');
 * if (!apiKey) {
 *   console.log('API key not found or access denied');
 *   // Guide user to check permissions or re-enter credentials
 * }
 * ```
 */
export function createKeyChainStore(
  id: string,
  options?: {
    servicePrefix?: string;
  }
): KeyChainStore {
  return new KeyChainStore(id, options?.servicePrefix);
}
