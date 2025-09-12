import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: 'inkeep',
  projectId: 'my-project',
  agentsManageApiUrl: 'http://localhost:3002',
  agentsRunApiUrl: 'http://localhost:3003',
});
