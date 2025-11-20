import { mcpTool } from '@inkeep/agents-sdk';

export const inkeepManagementTools = mcpTool({
  id: 'inkeep-management-tools',
  name: 'Inkeep Management Tools',
  serverUrl: 'http://localhost:3002/mcp',
  transport: {
    type: 'streamable_http',
  },
});
