import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchTools } from './tools/search';

export interface DevToolsSearchScope {
  tenantId: string;
  projectId: string;
}

export function createDevToolsSearchServer(
  _sessionId: string,
  exaApiKey: string,
  _scope?: DevToolsSearchScope
): McpServer {
  const server = new McpServer({ name: 'inkeep-dev-tools-search', version: '1.0.0' });

  registerSearchTools(server, exaApiKey);

  return server;
}
