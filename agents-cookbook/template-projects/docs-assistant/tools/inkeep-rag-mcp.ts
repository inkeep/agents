import { mcpTool } from '@inkeep/agents-sdk';

export const inkeepRagMcp = mcpTool({
  id: 'inkeep-rag-mcp',
  name: 'Inkeep RAG MCP',
  imageUrl: 'https://cdn-icons-png.flaticon.com/512/12535/12535014.png',
  headers: null,
  serverUrl: 'https://agents.inkeep.com/mcp',
});
