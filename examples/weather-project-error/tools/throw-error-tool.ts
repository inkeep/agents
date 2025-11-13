import { mcpTool } from '@inkeep/agents-sdk';

export const throwErrorTool = mcpTool({
  id: 'throw-error-tool',
  name: `throw new Error() tool`,
  serverUrl: `https://broken-mcp.vercel.app/mcp`,
});
