import { credential } from '@inkeep/agents-sdk';

export const inkeepApiKey = credential({
  id: 'inkeep-api-key',
  name: 'Inkeep API Key',
  type: 'memory',
  credentialStoreId: 'memory-default',
  retrievalParams: {
    key: 'INKEEP_API_KEY',
  },
});
