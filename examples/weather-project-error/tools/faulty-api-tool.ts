import { mcpTool } from '@inkeep/agents-sdk';

export const faultyApiTool = mcpTool({
  id: 'faulty-api-tool',
  name: `faulty API tool`,
  serverUrl: `https://broken-mcp.vercel.app/mcp`,
});
