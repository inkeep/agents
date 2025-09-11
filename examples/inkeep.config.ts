import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: 'inkeep',
  projectId: 'default',
  agentsManageApiUrl: 'http://localhost:3002',
  agentsRunApiUrl: 'http://localhost:3003',
  modelSettings: {
    base: {
      model: 'anthropic/claude-sonnet-4-20250514',
      providerOptions: {
        // API key should be set via ANTHROPIC_API_KEY environment variable
      },
    },
    structuredOutput: {
      model: 'openai/gpt-4.1-mini-2025-04-14',
      providerOptions: {
        // API key should be set via ANTHROPIC_API_KEY environment variable
      },
    },
    summarizer: {
      model: 'openai/gpt-4.1-nano-2025-04-14',
      providerOptions: {
        // API key should be set via ANTHROPIC_API_KEY environment variable
      },
    },
    pull: {
      model: 'anthropic/claude-sonnet-4-20250514',
      providerOptions: {
        // API key should be set via ANTHROPIC_API_KEY environment variable
      },
    },
  },
});
