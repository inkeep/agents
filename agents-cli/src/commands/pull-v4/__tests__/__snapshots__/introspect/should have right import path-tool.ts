import { mcpTool } from '@inkeep/agents-sdk';
import { envSettings } from '../environments';

export const linearTool = mcpTool({
  id: 'vzj9wh8zv14uffbw0p4dz',
  name: 'Linear',
  serverUrl: 'https://mcp.linear.app/mcp',
  credential: envSettings.getEnvironmentCredential('1dapm6e7ajmw50rvw8fwp'),
});
