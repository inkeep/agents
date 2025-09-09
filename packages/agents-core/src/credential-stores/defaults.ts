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
        apiUrl: process.env.NANGO_HOST || 'https://api.nango.dev',
        secretKey: process.env.NANGO_SECRET_KEY,
      })
    );
  }

  // Always include keychain store
  stores.push(createKeyChainStore('keychain-default'));

  return stores;
}
