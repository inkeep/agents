import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerHttpTools } from './tools/http';

const SERVER_INSTRUCTIONS = `
Use fetch_url to make outbound HTTP requests. Supports GET, POST, PUT, PATCH, and DELETE with custom headers and body.

## When to use fetch_url
- Retrieve content from any URL (web pages, APIs, files)
- Submit data to external APIs (POST/PUT with JSON or form body)
- Call webhooks or external services

## Chaining results into dev-tools
After fetching, pipe the response body to the appropriate dev-tools processing tool:
- HTML response → pass result to html_to_markdown to convert to readable text
- JSON response → pass result to json_query to extract specific fields
- Plain text response → pass result to text_search to find patterns

Reference syntax for chaining:
  { "$tool": "<call_id>" }

Example pipeline:
1. fetch_url({ "url": "https://example.com/api/data" })  (call_id: "call_a")
2. json_query({ "data": { "$tool": "call_a" }, "query": "results[0].title" })

Never copy response bodies inline between tool calls — always chain via references.
`.trim();

export interface DevToolsHttpScope {
  tenantId: string;
  projectId: string;
}

export function createDevToolsHttpServer(
  _sessionId: string,
  _scope?: DevToolsHttpScope
): McpServer {
  const server = new McpServer(
    { name: 'inkeep-dev-tools-http', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerHttpTools(server);

  return server;
}
