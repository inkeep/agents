import { CredentialStoreType } from '@inkeep/agents-core';
import './development.validation'; // Validate development env vars
import { registerEnvironmentSettings } from '@inkeep/agents-sdk';

export const development = registerEnvironmentSettings({
  credentials: {
    'inkeep-api-credential': {
      id: 'inkeep-api-credential',
      type: CredentialStoreType.memory,
      credentialStoreId: 'memory-default',
      retrievalParams: {
        key: 'INKEEP_API_KEY_DEV',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  },
});
