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
 * Requires the 'keytar' npm package to be installed.
 * Falls back gracefully if keytar is not available.
 *
 * ## macOS Permission Handling
 *
 * On macOS, when your Node.js app first calls keytar operations:
 * - `setPassword()` creates a new Keychain item (no prompt required)
 * - `getPassword()` may prompt the user for permission on first access
 * - Users can click "Allow", "Always Allow", or "Deny"
 * - If denied, keytar returns `null` which this implementation handles gracefully
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
  private keytarAvailable = false;
  private keytar: any | null = null;
  private initializationPromise: Promise<void>;

  constructor(id: string, servicePrefix = 'inkeep-agent-framework') {
    this.id = id;
    // Use service prefix to isolate credentials by store ID
    this.service = `${servicePrefix}-${id}`;
    this.initializationPromise = this.initializeKeytar();
  }

  /**
   * Initialize keytar dynamically to handle optional availability
   */
  private async initializeKeytar(): Promise<void> {
    if (this.keytar) {
      this.keytarAvailable = true;
      return;
    }

    try {
      this.keytar = (await import('keytar' as any)).default;
      this.keytarAvailable = true;
      this.logger.info(
        {
          storeId: this.id,
          service: this.service,
        },
        'Keytar initialized successfully'
      );
    } catch (error) {
      this.logger.warn(
        {
          storeId: this.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Keytar not available - KeyChainStore will return null for all operations'
      );
      this.keytarAvailable = false;
    }
  }

  /**
   * Get a credential from the keychain
   */
  async get(key: string): Promise<string | null> {
    await this.initializationPromise;

    if (!this.keytarAvailable || !this.keytar) {
      this.logger.debug({ storeId: this.id, key }, 'Keytar not available, returning null');
      return null;
    }

    try {
      const password = await this.keytar.getPassword(this.service, key);

      if (password === null) {
        this.logger.debug(
          { storeId: this.id, service: this.service, account: key },
          'No credential found in keychain'
        );
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
   * @param metadata - Optional metadata (ignored by keychain store)
   */
  async set(key: string, value: string, _metadata?: Record<string, string>): Promise<void> {
    await this.initializationPromise;

    if (!this.keytarAvailable || !this.keytar) {
      this.logger.warn({ storeId: this.id, key }, 'Keytar not available, cannot set credential');
      throw new Error('Keytar not available - cannot store credentials in system keychain');
    }

    try {
      await this.keytar.setPassword(this.service, key, value);

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

    if (!this.keytarAvailable || !this.keytar) {
      return {
        available: false,
        reason: 'Keytar not available - cannot store credentials in system keychain',
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

    if (!this.keytarAvailable || !this.keytar) {
      this.logger.warn({ storeId: this.id, key }, 'Keytar not available, cannot delete credential');
      return false;
    }

    try {
      const result = await this.keytar.deletePassword(this.service, key);

      if (result) {
        this.logger.debug(
          { storeId: this.id, service: this.service, account: key },
          'Credential deleted from keychain'
        );
      } else {
        this.logger.debug(
          { storeId: this.id, service: this.service, account: key },
          'Credential not found in keychain for deletion'
        );
      }

      return result;
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
   */
  async findAllCredentials(): Promise<Array<{ account: string; password: string }>> {
    await this.initializationPromise;

    if (!this.keytarAvailable || !this.keytar) {
      return [];
    }

    try {
      const credentials = await this.keytar.findCredentials(this.service);
      return credentials || [];
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
