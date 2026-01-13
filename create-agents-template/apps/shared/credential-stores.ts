import {
  createKeyChainStore,
  createNangoCredentialStore,
  DEFAULT_NANGO_STORE_ID,
  InMemoryCredentialStore,
} from '@inkeep/agents-core';

// Shared credential stores configuration for all services
export const credentialStores = [
  new InMemoryCredentialStore('memory-default'),
  ...(process.env.NANGO_SECRET_KEY
    ? [
        createNangoCredentialStore(DEFAULT_NANGO_STORE_ID, {
          apiUrl: process.env.NANGO_SERVER_URL || 'https://api.nango.dev',
          secretKey: process.env.NANGO_SECRET_KEY,
        }),
      ]
    : []),
  createKeyChainStore('keychain-default'),
];
