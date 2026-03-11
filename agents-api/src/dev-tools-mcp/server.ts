import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEncodingTools } from './tools/encoding';
import { registerHtmlTools } from './tools/html';
import { registerJsonTools } from './tools/json-tools';
import { registerTextTools } from './tools/text';
import { registerUtilityTools } from './tools/utility';

const SERVER_INSTRUCTIONS = `
These are YOUR tools. You must use them actively for any task involving text processing, data manipulation, encoding, or utility operations. Do not attempt these tasks manually or inline — call the appropriate tool.

## Available capabilities (use these, do not work around them)
- **Text**: search, replace, extract, truncate, diff, patch, regex match
- **JSON**: format, query (JMESPath), merge, diff
- **Encoding**: base64 encode/decode, hash (md5/sha256/sha512), URL encode/decode
- **HTML**: convert HTML to Markdown
- **Utility**: calculate arithmetic, generate UUID, get current timestamp

## Tool result chaining — YOU MUST DO THIS
Every tool result has a \`_toolCallId\`. Instead of copying large values between tool calls, pass a reference object. This is mandatory when chaining tools — never copy raw content inline.

Reference syntax:
  { "$tool": "toolu_01..." }                           ← previous tool result (use the _toolCallId value)
  { "$artifact": "art_01...", "$tool": "toolu_01..." } ← artifact reference (BOTH fields required)

**Chain tool calls like this — always:**
- \`html_to_markdown\` result → pass \`{"$tool": "<id>"}\` to \`text_search\`, \`text_extract\`, or \`json_query\`
- \`text_search\` → pass \`{"$tool": "<id>"}\` to \`text_extract\` or \`text_replace\`
- \`json_query\` → pass \`{"$tool": "<id>"}\` to \`json_format\` or another \`json_query\`
- Artifact in ledger → pass \`{"$artifact": "<id>", "$tool": "<id>"}\` to any tool that accepts data/content/input

**References work across ALL MCP servers — not just Dev Tools.**
If a tool from another server returned a complex object and you need a specific field, use \`json_query\` to extract it first, then pipe that result:
- \`other_tool\` returns \`{ "results": [{"title": "...", "url": "..."}, ...], "total": 5 }\`  (call_id: "call_a")
- \`json_query({ "data": {"$tool": "call_a"}, "query": "results[0].title" })\`  (call_id: "call_b")
- \`text_search({ "content": {"$tool": "call_b"}, "pattern": "..." })\`  ← receives just the extracted string

Never extract a value by reading it and copying it inline — always chain through \`json_query\`.

**When working with artifacts — ALWAYS extract before processing:**
Artifacts are structured objects. Never pass a raw artifact reference directly to \`text_search\`, \`regex_match\`, or \`text_extract\`. Always use \`json_query\` first to isolate the field you need.
Pipeline: artifact → \`json_query\` (extract field) → \`text_search\` / \`regex_match\` / \`text_extract\` (process string)

**Decision tree — which tool to use when extracting content:**
1. Data is in a structured artifact or JSON object? → \`json_query\` to isolate the field FIRST
2. Need to find a specific pattern in a string? → \`regex_match\` (returns exact match only)
3. Need lines of context around a keyword? → \`text_search\` (returns matching lines + context)
4. Need a character or line range? → \`text_extract\`
Never skip step 1 when the source is structured data.

**After \`json_query\` returns a primitive — do NOT run another \`json_query\` on it:**
Once \`json_query\` has extracted a string or number, that result IS the value. Running \`json_query\` on a primitive returns null. Pipe the primitive directly to the text tool using \`{"$tool": "call_q"}\`.

The framework resolves references before invoking the tool — the tool always receives the real content. Never inline large strings when a reference is available.
`.trim();

export interface DevToolsScope {
  tenantId: string;
  projectId: string;
}

export function createDevToolsServer(_scope?: DevToolsScope): McpServer {
  const server = new McpServer(
    { name: 'inkeep-dev-tools', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerTextTools(server);
  registerEncodingTools(server);
  registerJsonTools(server);
  registerHtmlTools(server);
  registerUtilityTools(server);

  return server;
}
