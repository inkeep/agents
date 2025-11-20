import { mcpTool } from '@inkeep/agents-sdk';

export const apolloMcp = mcpTool({
  id: 'apollo-mcp',
  name: 'Apollo',
  serverUrl: 'https://apollo-mcp-three.preview.inkeep.com/mcp'
});