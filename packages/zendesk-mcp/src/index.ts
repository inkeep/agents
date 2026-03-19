#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getConfig, ZendeskClient } from './lib/zendesk-client.js';
import { registerGetComments } from './tools/get-comments.js';
import { registerGetTicket } from './tools/get-ticket.js';
import { registerListTickets } from './tools/list-tickets.js';
import { registerSearchTickets } from './tools/search-tickets.js';
import { registerSearchUsers } from './tools/search-users.js';

async function main() {
  const config = getConfig();
  const client = new ZendeskClient(config);

  const server = new McpServer({
    name: 'zendesk-mcp-server',
    version: '0.1.0',
  });

  registerSearchTickets(server, client, config.subdomain);
  registerGetTicket(server, client, config.subdomain);
  registerGetComments(server, client);
  registerListTickets(server, client, config.subdomain);
  registerSearchUsers(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Zendesk MCP server running via stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
