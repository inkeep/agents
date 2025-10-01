import type { CredentialStore } from '../types/server';
import { createKeyChainStore } from './keychain-store';
import { InMemoryCredentialStore } from './memory-store';
import { createNangoCredentialStore } from './nango-store';

/**
 * Create default credential stores based on environment variables
 */
export function createDefaultCredentialStores(): CredentialStore[] {
  const stores: CredentialStore[] = [];

  // Always include in-memory store
  stores.push(new InMemoryCredentialStore('memory-default'));

  // Include Nango store if NANGO_SECRET_KEY is set
  if (process.env.NANGO_SECRET_KEY) {
    stores.push(
      createNangoCredentialStore('nango-default', {
        apiUrl: process.env.NANGO_SERVER_URL || 'https://api.nango.dev',
        secretKey: process.env.NANGO_SECRET_KEY,
      })
    );
  }

  if (process.env.ENABLE_KEYCHAIN_STORE === 'true') {
    try {
      stores.push(createKeyChainStore('keychain-default'));
    } catch (error) {
      console.warn(
        'Failed to create keychain store:',
        error instanceof Error ? error.message : error
      );
    }
  }

  return stores;
}
