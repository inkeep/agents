import { mcpTool } from "@inkeep/agents-sdk";

export const knowledgeBaseMcpTool = mcpTool({
  id: 'knowledge-base-mcp',
  name: 'Knowledge Base MCP',
  serverUrl: 'https://mcp.inkeep.com/inkeep/mcp',
  imageUrl: 'https://cdn-icons-png.flaticon.com/512/12535/12535014.png',
});