import { CredentialStoreType } from '../types';
import type { CredentialStore } from '../types/server';

/**
 * In-memory credential store implementation
 * Automatically loads environment variables prefixed with CREDENTIAL_STORE_ on initialization
 * Note: Runtime credentials are lost when the server restarts, but env vars are reloaded
 */
export class InMemoryCredentialStore implements CredentialStore {
  public readonly id: string;
  public readonly type = CredentialStoreType.memory;
  private credentials = new Map<string, string>();

  constructor(id = 'memory-default') {
    this.id = id;
  }

  /**
   * Get a credential from the in memory store.
   * If the key is not found in the in memory store then it is loaded from environment variables.
   * If the key is not found in the environment variables or in the in memory store then returns null.
   * @param key - The key of the credential to get
   * @returns The credential value or null if not found
   */
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

  /**
   * Set a credential in the in memory store.
   * @param key - The key of the credential to set
   * @param value - The value of the credential to set
   */
  async set(key: string, value: string): Promise<void> {
    this.credentials.set(key, value);
  }

  /**
   * Check if a credential exists in the in memory store.
   * @param key - The key of the credential to check
   * @returns True if the credential exists, false otherwise
   */
  async has(key: string): Promise<boolean> {
    return this.credentials.has(key);
  }

  /**
   * Delete a credential from the in memory store.
   * @param key - The key of the credential to delete
   * @returns True if the credential was deleted, false otherwise
   */
  async delete(key: string): Promise<boolean> {
    return this.credentials.delete(key);
  }

  /**
   * Check if the credential store is available and functional
   */
  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    return {
      available: true,
    };
  }
}
