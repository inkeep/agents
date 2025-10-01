import { mcpTool } from '@inkeep/agents-sdk';

export const zendeskMcp = mcpTool({
  id: 'zendesk-mcp',
  name: 'Zendesk Support Tools',
  description: 'Tools for managing Zendesk support tickets including getting tickets by email, updating tickets, and creating new tickets',
  serverUrl: 'https://zendesk-mcp.preview.inkeep.com/mcp'
});