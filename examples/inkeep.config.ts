import { defineConfig } from '@inkeep/agents-cli/config';
import 'dotenv/config';

export default defineConfig({
  tenantId: 'default',
  outputDirectory: 'default',
  agentsManageApi: {
    url: 'http://localhost:3002',
    apiKey: process.env.LOCAL_MANAGE_API_KEY,
  },
  agentsRunApi: {
    url: 'http://localhost:3003',
    apiKey: process.env.LOCAL_RUN_API_KEY,
  },
});
