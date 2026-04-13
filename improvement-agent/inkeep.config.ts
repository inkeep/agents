import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: 'default',
  agentsApi: {
    url: 'http://127.0.0.1:3002',
    apiKey: process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET,
  },
  manageUiUrl: 'http://localhost:3000',
});
