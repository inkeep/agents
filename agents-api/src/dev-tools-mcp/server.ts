import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { env } from '../env';
import { registerEncodingTools } from './tools/encoding';
import { registerHtmlTools } from './tools/html';
import { registerHttpTools } from './tools/http';
import { registerImageTools } from './tools/image';
import { registerJsonTools } from './tools/json-tools';
import type { ScratchpadStore } from './tools/scratchpad';
import { registerScratchpadTools } from './tools/scratchpad';
import { registerSearchTools } from './tools/search';
import { registerTextTools } from './tools/text';
import { registerUtilityTools } from './tools/utility';

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface SessionEntry {
  pad: ScratchpadStore;
  lastUsed: number;
}

const sessions = new Map<string, SessionEntry>();

function evictStaleSessions(): void {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.lastUsed > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export function getOrCreateSession(sessionId: string): ScratchpadStore {
  evictStaleSessions();
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.pad;
  }
  const pad: ScratchpadStore = new Map();
  sessions.set(sessionId, { pad, lastUsed: Date.now() });
  return pad;
}

const SERVER_INSTRUCTIONS = `
These are YOUR tools. You must use them actively for any task involving text processing, data manipulation, web requests, search, encoding, images, or note-taking. Do not attempt these tasks manually or inline — call the appropriate tool.

## Available capabilities (use these, do not work around them)
- **Text**: search, replace, extract, truncate, count, diff
- **JSON**: format, query (JMESPath), merge, diff
- **Encoding**: base64 encode/decode, hash (md5/sha256/sha512), URL encode/decode, HTML entity encode/decode
- **HTML**: convert HTML to Markdown
- **Images**: resize, convert format, get metadata
- **HTTP**: fetch any URL, POST/PUT/PATCH/DELETE requests
- **Search**: semantic and keyword web search via Exa
- **Scratchpad**: persist notes across tool calls within this session

## Tool result chaining — YOU MUST DO THIS
Every tool result has a \`_toolCallId\`. Instead of copying large values between tool calls, pass a reference object. This is mandatory when chaining tools — never copy raw content inline.

Reference syntax:
  { "$tool": "toolu_01..." }                           ← previous tool result (use the _toolCallId value)
  { "$artifact": "art_01...", "$tool": "toolu_01..." } ← artifact reference (BOTH fields required)

**Chain tool calls like this — always:**
- \`fetch_url\` → pass \`{"$tool": "<id>"}\` to \`html_to_markdown\`, \`json_query\`, or \`text_search\`
- \`text_search\` → pass \`{"$tool": "<id>"}\` to \`text_extract\` or \`text_replace\`
- \`json_query\` → pass \`{"$tool": "<id>"}\` to \`json_format\` or another \`json_query\`
- Artifact in ledger → pass \`{"$artifact": "<id>", "$tool": "<id>"}\` to any tool that accepts data/content/input

**References work across ALL MCP servers — not just Dev Tools.**
If a tool from another server returned a complex object and you need a specific field, use \`json_query\` to extract it first, then pipe that result:
- \`other_tool\` returns \`{ "results": [...], "text": "..." }\`  (call_id: "call_a")
- \`json_query({ "data": {"$tool": "call_a"}, "query": "text" })\`  (call_id: "call_b")
- \`text_search({ "content": {"$tool": "call_b"}, "pattern": "..." })\`  ← receives just the extracted string

Never extract a value by reading it and copying it inline — always chain through \`json_query\`.

**When working with artifacts — ALWAYS extract before processing:**
Artifacts are structured objects. Never pass a raw artifact reference directly to \`text_search\`, \`regex_match\`, or \`text_extract\`. Always use \`json_query\` first to isolate the field you need.
Pipeline: artifact → \`json_query\` (extract field) → \`text_search\` / \`regex_match\` / \`text_extract\` (process string)
- \`json_query({ "data": {"$artifact": "<id>", "$tool": "<id>"}, "query": "body" })\`  (call_id: "call_q")
- \`text_search({ "content": {"$tool": "call_q"}, "pattern": "..." })\`  ← receives the extracted string

**After \`json_query\` returns a primitive — do NOT run another \`json_query\` on it:**
Once \`json_query\` has extracted a string or number, that result IS the value. Running \`json_query\` on a primitive returns null. Pipe the primitive directly to the text tool using \`{"$tool": "call_q"}\`.

**If \`json_query\` returns null — fix the selector, do not copy the value inline:**
A null result means the JMESPath path is wrong. Debug it step by step (see json_query tool description). Never use a null result as a signal to fall back to copying the value manually.

**Decision tree — which tool to use when extracting content:**
1. Data is in a structured artifact or JSON object? → \`json_query\` to isolate the field FIRST
2. Need to find a specific pattern in a string? → \`regex_match\` (returns exact match only)
3. Need lines of context around a keyword? → \`text_search\` (returns matching lines + context)
4. Need a character or line range? → \`text_extract\`
Never skip step 1 when the source is structured data.

**After \`json_query\` extraction — reference the extraction's call_id, not the original artifact:**
- \`json_query(...)\`  (call_id: "call_q")
- \`text_search({ "content": {"$tool": "call_q"}, ... })\`  ← correct
- ❌ \`text_search({ "content": {"$artifact": "<id>", "$tool": "<id>"}, ... })\`  ← wrong, skips extraction

The framework resolves references before invoking the tool — the tool always receives the real content. Never inline large strings when a reference is available.
`.trim();

export function createDevToolsServer(sessionId: string): McpServer {
  const server = new McpServer(
    { name: 'inkeep-dev-tools', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  const pad = getOrCreateSession(sessionId);

  registerTextTools(server);
  registerEncodingTools(server);
  registerJsonTools(server);
  registerHtmlTools(server);
  registerImageTools(server);
  registerHttpTools(server);
  registerUtilityTools(server);
  registerScratchpadTools(server, pad);

  if (env.EXA_API_KEY) {
    registerSearchTools(server, env.EXA_API_KEY);
  }

  return server;
}
