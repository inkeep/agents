import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: 'default',
  outputDirectory: 'default',
  agentsManageApiUrl: 'http://localhost:3002',
  agentsRunApiUrl: 'http://localhost:3003',
});
