import { mcpTool } from '@inkeep/agents-sdk';

/**
 * Get your API key from https://firecrawl.dev/app/api-keys
 */

export const firecrawlMcpTool = mcpTool({
  id: 'ad1dRlGjxH7FgdTcRn-qr',
  name: 'Firecrawl',
  serverUrl: 'https://mcp.firecrawl.dev/{FIRECRAWL_API_KEY}/v2/mcp',
  transport: {
    type: 'streamable_http'
  }
});