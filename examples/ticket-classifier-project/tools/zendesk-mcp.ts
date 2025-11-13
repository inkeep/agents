import { mcpTool } from '@inkeep/agents-sdk';

export const zendeskMcp = mcpTool({
  id: 'zendesk-mcp',
  name: 'Zendesk Support Tools',
  serverUrl: 'https://zendesk-mcp.preview.inkeep.com/mcp',
  activeTools: ['update_ticket_custom_fields', 'add_internal_ticket_comment'],
});
