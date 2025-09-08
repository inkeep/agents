import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: 'inkeep',
  projectId: 'default',
  managementApiUrl: 'http://localhost:3001',
  executionApiUrl: 'http://localhost:3002',
  modelSettings: {
    model: 'anthropic/claude-sonnet-4-20250514',
    providerOptions: {
      // API key should be set via ANTHROPIC_API_KEY environment variable
    },
  },
});
