import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: 'inkeep',
  projectId: 'default',
  agentsManageApiUrl: 'http://localhost:3002',
  agentsRunApiUrl: 'http://localhost:3003',
  modelSettings: {
    model: 'anthropic/claude-sonnet-4-20250514',
    providerOptions: {
      // API key should be set via ANTHROPIC_API_KEY environment variable
    },
  },
});
