import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerHttpTools } from './tools/http';

const SERVER_INSTRUCTIONS = `
Use fetch_url to make outbound HTTP requests. Supports GET, POST, PUT, PATCH, and DELETE with custom headers and body.

## When to use fetch_url
- Retrieve content from any URL (web pages, APIs, files)
- Submit data to external APIs (POST/PUT with JSON or form body)
- Call webhooks or external services

## Chaining results further
Pass the response body to other tools using \`{"$tool": "<_toolCallId>"}\` — the system resolves the full result automatically. Use whatever processing tools are available in your session to extract fields, convert content, or find patterns.
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
