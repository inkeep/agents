import { defineConfig } from '@inkeep/agents-cli/config';

const config = defineConfig({
  tenantId: 'default',
  agentsManageApiUrl: 'http://localhost:3002',
  agentsRunApiUrl: 'http://localhost:3003',
});

export default config;
