import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: 'default',
  agentsApi: {
    url: 'http://localhost:3002',
  },
  manageUiUrl: 'http://localhost:3000',
});
