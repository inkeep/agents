import { mcpTool } from "@inkeep/agents-sdk";

export const inkeepRagMcpTool = mcpTool({
  id: 'inkeep-rag-mcp',
  name: 'Inkeep RAG MCP',
  serverUrl: 'https://agents.inkeep.com/mcp',
  imageUrl: 'https://cdn-icons-png.flaticon.com/512/12535/12535014.png',
});