import { mcpTool } from '@inkeep/agents-sdk';

export const badCredential403Tool = mcpTool({
  id: 'bad-credential-403-tool',
  name: `bad credential 403 tool`,
  serverUrl: `https://broken-mcp-one.vercel.app/api/mcp`,
});
