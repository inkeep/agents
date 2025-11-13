import { mcpTool } from '@inkeep/agents-sdk';

export const error405Tool = mcpTool({
  id: '405-error-tool',
  name: `405 error tool`,
  serverUrl: `https://broken-mcp.vercel.app/mcp`,
});
