import { defineConfig } from '@inkeep/agents-cli';

export default defineConfig({
  tenantId: 'inkeep',
  projectId: 'default',
  agentsRunApiUrl: 'http://localhost:3003',
  agentsManageApiUrl: 'http://localhost:3002',
});
