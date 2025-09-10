import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: 'inkeep',
  projectId: 'cm8q9j9l0005gs601sm5eg58l',
  managementApiUrl: 'http://localhost:3002',
  executionApiUrl: 'http://localhost:3003',
  modelSettings: {
    model: 'anthropic/claude-sonnet-4-20250514',
    providerOptions: {
      // API key should be set via ANTHROPIC_API_KEY environment variable
    },
  },
});
