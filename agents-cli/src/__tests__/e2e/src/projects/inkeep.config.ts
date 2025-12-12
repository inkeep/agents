import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: 'default',
  agentsManageApi: {
    url: 'http://localhost:3002',
  },
  agentsRunApi: {
    url: 'http://localhost:3003',
  },
});
