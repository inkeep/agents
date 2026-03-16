import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SearchProvider } from '@plust/search-sdk';
import { registerSearchTools } from './tools/search';

const SERVER_INSTRUCTIONS = `
Use the web_search tool to search the web. Returns results with titles, URLs, and snippets.
`.trim();

export function createSearchServer(provider: SearchProvider): McpServer {
  const server = new McpServer(
    { name: 'inkeep-search', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerSearchTools(server, provider);

  return server;
}
