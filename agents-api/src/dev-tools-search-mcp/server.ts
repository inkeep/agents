import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchTools } from './tools/search';

const SERVER_INSTRUCTIONS = `
Use these tools to search the web and find related content. Results include titles, URLs, and content snippets.

## web_search vs find_similar
- **web_search** — keyword or semantic search across the web. Use for current events, recent information, documentation, or any topic-based query.
- **find_similar** — given a URL or text, find semantically similar content. Use when you have a reference document and want to find related pages.

## Search types (web_search)
- \`neural\` — semantic/vector search. Best for conceptual queries ("how does X work", "examples of Y").
- \`keyword\` — exact term matching. Best for specific names, error messages, code identifiers.
- \`auto\` — let Exa decide based on the query (default and recommended for most cases).

## Chaining results into dev-tools
After searching, pipe result content to dev-tools for further processing:
- HTML page content → pass to \`html_to_markdown\` to convert to readable text
- JSON API response → pass to \`json_query\` to extract specific fields
- Text content → pass to \`text_search\` to find specific patterns

Reference syntax for chaining:
  { "$tool": "<call_id>" }

Example pipeline:
1. web_search({ "query": "Hono middleware auth pattern", "searchType": "neural" })  (call_id: "call_a")
2. html_to_markdown({ "html": { "$tool": "call_a" } })  — convert page content to readable markdown
3. text_search({ "content": { "$tool": "call_b" }, "pattern": "createMiddleware" })

Never copy search result content inline — always chain via references.
`.trim();

export interface DevToolsSearchScope {
  tenantId: string;
  projectId: string;
}

export function createDevToolsSearchServer(
  _sessionId: string,
  exaApiKey: string,
  _scope?: DevToolsSearchScope
): McpServer {
  const server = new McpServer(
    { name: 'inkeep-dev-tools-search', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerSearchTools(server, exaApiKey);

  return server;
}
