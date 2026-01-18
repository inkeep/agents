import { mcpTool } from '@inkeep/agents-sdk';

export const invalidMcpTool = mcpTool({
  id: 'invalid-mcp-tool',
  name: `invalid MCP tool`,
  serverUrl: `https://broken-mcp.vercel.app/mcp1`,
});
