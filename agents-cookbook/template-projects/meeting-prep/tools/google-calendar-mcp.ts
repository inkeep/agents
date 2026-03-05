import { mcpTool } from '@inkeep/agents-sdk';

/**
 * Go to Zapier MCP to get the URL for the Google Calendar MCP server.
 * https://zapier.com/mcp
 *
 * Copy the URL and paste it here.
 *
 * Example:
 * https://mcp.zapier.com/api/mcp/s/OTM5MjdmailfduIYSDhsIYFTSDFTUxMWEzLTk3OTktNGMzMi05ZDNmLTM4ZjM2NzJkNWI4Ng==/mcp
 *
 * Replace the URL with the one you copied from Zapier MCP.
 */
export const googleCalendarMcpTool = mcpTool({
  id: 'ospbm5j157x58qgypluqb',
  name: 'Google Calendar',
  serverUrl: 'https://your-google-calendar-mcp-server-url',
});
