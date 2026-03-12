import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEncodingTools } from './tools/encoding';
import { registerHtmlTools } from './tools/html';
import { registerJsonTools } from './tools/json-tools';
import { registerTextTools } from './tools/text';
import { registerUtilityTools } from './tools/utility';

const SERVER_INSTRUCTIONS = `
These are YOUR tools. You must use them actively for any task involving text processing, data manipulation, encoding, or utility operations. Do not attempt these tasks manually or inline — call the appropriate tool.

## Available capabilities (use these, do not work around them)
- **Text**: grep, sed, diff, patch, head (first N lines), tail (last N lines)
- **JSON**: format, query (JMESPath), merge, diff
- **Encoding**: base64 encode/decode, hash (md5/sha256/sha512), URL encode/decode
- **HTML**: convert HTML to Markdown
- **Utility**: calculate arithmetic, generate UUID, get current timestamp

## Tool result chaining — YOU MUST DO THIS
Never copy raw content inline between tool calls — always chain via \`{"$tool": "<_toolCallId>"}\` references. For artifacts, use \`{"$artifact": "<id>", "$tool": "<_toolCallId>"}\`.

**Chain tool calls like this — always:**
- \`html_to_markdown\` result → pass \`{"$tool": "<id>"}\` to \`grep\`, \`sed\`, or \`json_query\`
- \`grep\` result → pass \`{"$tool": "<id>"}\` to \`sed\` or another \`grep\`
- \`json_query\` → pass \`{"$tool": "<id>"}\` to \`json_format\` or another \`json_query\`
- Artifact in ledger → pass \`{"$artifact": "<id>", "$tool": "<id>"}\` to any tool that accepts data/content/input

**References work across ALL MCP servers — not just Dev Tools.**
If a tool from another server returned a complex object and you need a specific field, use \`json_query\` to extract it first, then pipe that result:
- \`other_tool\` returns \`{ "results": [{"title": "...", "url": "..."}, ...], "total": 5 }\`  (call_id: "call_a")
- \`json_query({ "data": {"$tool": "call_a"}, "query": "results[0].title" })\`  (call_id: "call_b")
- \`grep({ "content": {"$tool": "call_b"}, "pattern": "..." })\`  ← receives just the extracted string

Never extract a value by reading it and copying it inline — always chain through \`json_query\`.

## MANDATORY GATE — before calling any text tool (grep, sed)

This is not guidance. Skipping this gate is a violation.

Step 1 — Is the source a structured object (artifact, JSON response, object from any tool)?
  → MUST call \`json_query\` first to extract the specific string field.
  → For artifacts: pass \`{"$artifact": "<id>", "$tool": "<toolCallId>"}\` as the \`data\` argument to \`json_query\` directly — do NOT call \`get_reference_artifact\` first.
  → VIOLATION: passing an object or artifact reference directly to a text tool without \`json_query\` first.

Step 2 — Did \`json_query\` return a non-empty string?
  → Only then call the text tool with \`{"$tool": "<_toolCallId from json_query>"}\`.
  → If \`json_query\` returned null or empty: the path is wrong. Do not call the text tool. Re-examine the source structure and retry with a corrected path.
  → If \`json_query\` returned an array (e.g. \`content\` is \`[{text: "...", type: "text"}, ...]\`): run a second \`json_query\` to flatten it to a string first — e.g. \`json_query({ query: "content[*].text | join(' ', @)" })\` — then pass that result to the text tool.

Step 3 — Is the source already a plain string from a prior step?
  → Pass it directly as \`{"$tool": "<_toolCallId>"}\`. No intermediate step needed.

**After \`json_query\` returns a primitive — do NOT run another \`json_query\` on it:**
Once \`json_query\` has extracted a string or number, that result IS the value. Running \`json_query\` on a primitive returns null. Pipe the primitive directly to the text tool.

**Tool selection once you have a string:**
- Search for a pattern with context? → \`grep\` (supports -v, -w, -o, -c, -A, -B, -C)
- Extract a line range, character range, or pattern-delimited section? → \`sed\` (extraction mode)
- Find and replace? → \`sed\` (substitution mode with \`find\`/\`replace\`)
- Delete lines matching a pattern? → \`sed\` with \`startPattern\` + \`invertMatch: true\`
- First N lines from the top? → \`head\` (negative n = all but last N)
- Last N lines from the bottom? → \`tail\` (negative n = all but first N)
`.trim();

export interface DevToolsScope {
  tenantId: string;
  projectId: string;
}

export function createDevToolsServer(_scope?: DevToolsScope): McpServer {
  const server = new McpServer(
    { name: 'inkeep-coreutils', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerTextTools(server);
  registerEncodingTools(server);
  registerJsonTools(server);
  registerHtmlTools(server);
  registerUtilityTools(server);

  return server;
}
