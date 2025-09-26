import { CredentialStoreType } from '@inkeep/agents-core';
import { registerEnvironmentSettings } from '@inkeep/agents-sdk';

export const development = registerEnvironmentSettings({
  credentials: {
    stripe_api_credential: {
      id: 'stripe_api_credential',
      type: CredentialStoreType.memory,
      credentialStoreId: 'memory-default',
      retrievalParams: {
        key: 'STRIPE_API_KEY',
      },
    },
  },
});
