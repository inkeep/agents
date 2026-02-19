import { credential } from '@inkeep/agents-sdk';

export const apiCredentials = credential({
  id: 'api-credentials',
  name: 'API Credentials',
  type: 'bearer',
  credentialStoreId: 'main-store',
  retrievalParams: {
    key: 'token'
  }
});

