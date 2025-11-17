import { mcpTool } from '@inkeep/agents-sdk';

export const firecrawlMcpTool = mcpTool({
  id: 'firecrawl-mcp',
  name: 'Firecrawl',
  description: 'Web scraping and content extraction tool using Firecrawl',
  serverUrl: 'http://localhost:4000/mcp',
});
