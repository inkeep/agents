import { credential } from '@inkeep/agents-sdk';

export const apiCredentialsCredential = credential({
  id: 'api-credentials',
  name: 'API Credentials',
  type: 'memory',
  credentialStoreId: 'main-store',
  retrievalParams: {
    key: 'token',
  },
});
