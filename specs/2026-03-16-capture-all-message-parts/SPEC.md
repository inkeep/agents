# Capture All Message Part Kinds in Conversation History — Spec

**Status:** Draft
**Owner(s):** Andrew
**Last updated:** 2026-03-16
**Links:**
- Research report: `reports/conversations-vercel-streaming-protocol/REPORT.md`
- Evidence: `./evidence/`
- Prior work: branch `fix/conversations-nontext-parts` (US-001, US-002, US-003)

---

## 1) Problem statement

- **Who is affected:** End-users loading conversation history in the widget/UI after a session ends, and any API consumer of GET /conversations.
- **What pain:** The live streaming session shows a rich experience — tool calls running, artifacts rendering, images displayed — but conversation history only returns text. Returning to a conversation shows a fundamentally degraded version of what was just visible.
- **Why now:** Testing the US-001/002/003 fixes revealed the root cause is deeper than the read path. The write path in `executionHandler.ts` collapses all non-text parts to `kind: 'data'` (losing file part structure), and tool invocations are never persisted at all.
- **Current workaround:** None — tool call information and file part structure are lost after the streaming session ends.

## 2) Goals

- **G1:** Persist all message part kinds faithfully — text, data, file, and tool invocations — so conversation history matches the live streaming experience.
- **G2:** The GET /conversations read path returns all persisted part kinds in Vercel UIMessage format.
- **G3:** Backward compatible with existing stored data (legacy `type` property, existing data-only parts).

## Vercel AI SDK UIMessage Format (source of truth)

The SDK defines `UIMessage.parts` as:

```typescript
parts: Array<TextUIPart | ReasoningUIPart | ToolInvocationUIPart | SourceUIPart | FileUIPart | StepStartUIPart>
```

Part types:
- `TextUIPart`: `{ type: 'text', text: string }`
- `ToolInvocationUIPart`: `{ type: 'tool-invocation', toolInvocation: ToolInvocation }`
- `FileUIPart`: `{ type: 'file', mimeType: string, data: string }`
- `ReasoningUIPart`: `{ type: 'reasoning', reasoning: string, details: [...] }`
- `SourceUIPart`: `{ type: 'source', source: LanguageModelV1Source }`
- `StepStartUIPart`: `{ type: 'step-start' }`

ToolInvocation is a discriminated union by `state`:
```typescript
type ToolInvocation =
  | { state: 'partial-call', step?: number } & ToolCall  // streaming args
  | { state: 'call', step?: number } & ToolCall          // args complete
  | { state: 'result', step?: number } & ToolResult      // result available

// ToolCall: { toolCallId, toolName, input }
// ToolResult: { toolCallId, toolName, input, output }
```

**Key insight:** The SDK uses `input` (not `arguments`) for tool args, and `output` (not `result`) for tool return value. Our current `toVercelMessage()` maps to the wrong field names (`args` instead of `input`).

**Key insight 2:** For restored conversation history, tool invocations should have `state: 'result'` since they're completed. They need BOTH `input` and `output`.

**Key insight 3:** `FileUIPart` uses `{ type: 'file', mimeType: string, data: string }` — our current file part storage uses `{ kind: 'file', data: blobUri, metadata: { mimeType } }` which doesn't match. The read path needs to reshape this.

**Key insight 4 (CRITICAL):** The streaming protocol uses `data-component` (not `data`) as the part type for data components. During streaming, `IncrementalStreamParser.streamPart()` emits `{ type: 'data-component', data: {...} }` for regular data and `{ type: 'data-artifact', data: {...} }` for artifacts. The GET /conversations read path must use the same type names so the widget can render them with the same code path. Currently it emits `{ type: 'data' }` which the widget doesn't handle.

## 3) Non-goals

- **NG1:** Persisting ephemeral streaming events (operations, summaries, errors) — these are interactive-only.
- **NG2:** Replaying the streaming experience (progressive tool call rendering) — history shows completed state only.
- **NG3:** Changing the streaming protocol itself.
- **NG4:** Resolving blob URIs to proxy URLs in the read path (separate concern, can be layered later).

## 4) Personas / consumers

- **P1: End-user (widget/UI)** — loads conversation history, expects to see same content as live session.
- **P2: API consumer (developer)** — fetches conversation data via GET /conversations, builds custom UIs.
- **P3: Internal services** — `reconstructMessageText()`, artifact compression, context window management — read `content.parts` from the DB.

## 5) User journeys

### Happy path
1. User sends message with an image attachment
2. Agent makes tool calls (e.g., Linear API), receives results, generates response with artifacts
3. Live stream shows: user message with image → tool call in progress → tool result → text + artifact
4. User navigates away, returns later
5. GET /conversations returns the full conversation: user message (text + file part), agent message (text + tool invocations + data parts)
6. UI renders the same content as the live session (minus progressive streaming animation)

### Current failure path
Steps 1-4 same, then:
5. GET /conversations returns: user message (text only, image lost), agent message (text only, tool calls lost, artifacts lost as `data: undefined`)
6. UI shows a text-only conversation — user thinks content is missing

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Could | **FR1:** Write path preserves all part properties | Parts written to DB retain original `kind`, `text`, `data`, `metadata`, and any extra fields | Currently only 'text' and 'data' kinds exist in practice — no data loss today. Forward-compat improvement. |
| Must | **FR2:** Tool invocations persisted in agent response messages | `content.tool_calls` populated with `{id, type, function: {name, arguments}}` for each tool call made during the response | Source: AgentSession events |
| Must | **FR3:** Read path returns all part kinds | `toVercelMessage()` handles text, data, file, and tool-invocation parts | Already partially done (US-002) |
| Must | **FR4:** Backward compatible with existing data | Read path handles both `kind` and legacy `type` properties; handles parts stored as collapsed `kind: 'data'` | Already done (US-002) |
| Must | **FR5:** Data parts use streaming protocol type names | Data components use `{ type: 'data-component', data: {...} }` and artifacts use `{ type: 'data-artifact', data: {...} }` — matching the SSE streaming protocol so the widget renders them identically | Currently uses `{ type: 'data' }` which widget doesn't handle |
| Must | **FR6:** Tool invocation parts conform to Vercel SDK `ToolInvocationUIPart` format | Parts use `{ type: 'tool-invocation', toolInvocation: { state, toolCallId, toolName, input, output } }` — not the current broken `{ args, state }` shape | Existing read path has wrong field names |
| Must | **FR7:** File parts conform to Vercel SDK `FileUIPart` format | Parts use `{ type: 'file', mimeType, data }` — not `{ type: 'file', data, metadata: { mimeType } }` | Current shape doesn't match SDK |
| Should | **FR8:** Tool results persisted alongside tool calls | `content.tool_calls` entries include `result` field with tool output for completed tools | Enables `state: 'result'` with output in history |

### Non-functional requirements

- **Performance:** No additional DB queries — tool call data comes from in-memory AgentSession.
- **Reliability:** If tool call capture fails, text + data parts must still persist (graceful degradation).
- **Storage:** Tool call args + results increase message content size. Most tool calls are small JSON objects — not a concern at current scale.

## 7) Success metrics & instrumentation

- **Metric:** Conversation history part coverage — % of messages where GET response parts match what was streamed.
  - Baseline: ~40% (only text parts match)
  - Target: >95% (all part kinds preserved)
- **What we will log:** Part counts per kind in the persistence span (`execution_handler.execute` span attributes).

## 8) Current state (how it works today)

### Write path (executionHandler.ts:518-537)

After generation completes, `responseParts` are extracted from `streamedContent.parts` (IncrementalStreamParser) or `artifacts`. Then mapped:

```
responseParts.map(part => ({
    kind: part.kind === 'text' ? 'text' : 'data',  // ← collapses all non-text to 'data'
    text: part.kind === 'text' ? part.text : undefined,
    data: part.kind === 'data' ? JSON.stringify(part.data) : undefined,
}))
```

**Problems:**
1. File parts (`kind: 'file'`) → mapped to `kind: 'data'` with `data: undefined` (file info lost)
2. Any future part kinds → same lossy mapping
3. Tool calls bypass IncrementalStreamParser entirely (streamed from `tool-wrapper.ts` directly to SSE/Vercel helper)
4. `content.tool_calls` is never populated

### Tool call data availability

AgentSession (in-memory) records `tool_call` and `tool_result` events with:
- `toolCallId`, `toolName`, `input` (for tool_call)
- `toolCallId`, `toolName`, `output`, `duration` (for tool_result)

This data is available in `agentSessionManager.getSession(requestId)` at the time of persistence (executionHandler.ts:493-496 already calls `getSession`).

### Read path (conversations.ts)

`toVercelMessage()` now handles text, data, file parts and `content.tool_calls` (after US-001/002/003). The tool_calls handling exists but is dead code since tool_calls are never written.

See `evidence/current-system-behavior.md` for full trace.

## 9) Proposed solution (vertical slice)

### Change 1: Write path — preserve all part properties (executionHandler.ts)

**Status: RE-EVALUATED — lower priority than originally thought.**

Investigation revealed that `responseParts` only ever contains `kind: 'text'` and `kind: 'data'` parts (see `evidence/write-path-part-kinds.md`). The `StreamPart` type is literally `{ kind: 'text' | 'data' }`. File parts are never emitted by agents — they only exist in user messages. The current lossy mapping is **functionally correct** for today's system.

However, a preserve-all approach would be a defensive improvement for forward compatibility:

```typescript
parts: responseParts.map((part: any) => {
    const { data, ...rest } = part;
    return {
        ...rest,
        ...(data !== undefined && {
            data: typeof data === 'string' ? data : JSON.stringify(data),
        }),
    };
}),
```

**Recommendation:** Defer to future work. The write path is not currently losing data. If new part kinds are added to `StreamPart` in the future, this should be revisited.

### Change 2: Persist tool calls from AgentSession (executionHandler.ts)

After extracting text content, query the AgentSession for tool call events and populate `content.tool_calls`:

```typescript
const agentSessionData = agentSessionManager.getSession(requestId);
const toolCalls = agentSessionData
    ? extractToolCallsFromSession(agentSessionData, currentAgentId)
    : [];

await createMessage(runDbClient)({
    // ...existing fields...
    content: {
        text: textContent || undefined,
        parts: responseParts.map(/* preserve-all mapping */),
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    // ...
});
```

Where `extractToolCallsFromSession()` pairs `tool_call` + `tool_result` events by `toolCallId` and returns the OpenAI tool_calls format:

```typescript
[{
    id: toolCallId,
    type: 'function',
    function: {
        name: toolName,
        arguments: JSON.stringify(input),
    },
    // Extension: store result for Vercel SDK compatibility
    result: output,
}]
```

### Change 3: Read path — data parts use streaming protocol type names (conversations.ts)

**Root cause of widget rendering failure:** The streaming protocol emits `{ type: 'data-component', data: {...} }` for data components and `{ type: 'data-artifact', data: {...} }` for artifacts. The widget handles these types. But the GET endpoint returns `{ type: 'data', data: {...} }` — a type the widget doesn't recognize.

Fix: match the streaming protocol types:

```typescript
// Current (WRONG — widget doesn't handle 'data' type):
parts.push({ type: 'data', data: parsed });

// Fixed (matches streaming protocol):
const isArtifact = parsed && typeof parsed === 'object' && parsed.artifactId && parsed.toolCallId;
parts.push({
    type: isArtifact ? 'data-artifact' : 'data-component',
    data: parsed,
});
```

### Change 4: Read path — fix tool invocation format (conversations.ts)

**Bug fix:** The existing `toVercelMessage()` tool_calls handler uses `args` (wrong) instead of `input` (what SDK expects), and doesn't include `output`. Fix to match the Vercel `ToolInvocationUIPart` format:

```typescript
// Current (WRONG):
parts.push({
    type: 'tool-invocation',
    toolCallId: tc.id,
    toolName: tc.function.name,
    args: tc.function.arguments,
    state: 'result',
});

// Fixed (matches Vercel SDK ToolInvocationUIPart):
parts.push({
    type: 'tool-invocation',
    toolInvocation: {
        state: 'result',
        toolCallId: tc.id,
        toolName: tc.function.name,
        input: JSON.parse(tc.function.arguments),
        output: (tc as any).result,
    },
});
```

### Change 5: Read path — fix file part format (conversations.ts)

Reshape to match `FileUIPart` format `{ type: 'file', mimeType, data }`:

```typescript
// Current:
parts.push({ type: 'file', ...rest });

// Fixed (matches Vercel SDK FileUIPart):
parts.push({
    type: 'file',
    mimeType: p.metadata?.mimeType ?? 'application/octet-stream',
    data: p.data as string,
});
```

### Change 6: Read path — generic fallback for unknown part kinds

For forward compatibility:

```typescript
else {
    const { kind: _k, ...rest } = p as Record<string, unknown>;
    parts.push({ type: kind, ...rest });
}
```

### Alternatives considered

**Alt A: Capture tool calls in IncrementalStreamParser** — would require modifying the parser to track tool calls, adding tool-related methods. More invasive, couples the parser to tool semantics.

**Alt B: Proxy StreamHelper that intercepts tool calls** — wrap the original StreamHelper to capture tool call data. Cleaner separation but adds a layer of indirection.

**Alt C (chosen): Extract from AgentSession** — AgentSession already records tool_call and tool_result events. Zero new capture code needed; just read what's already recorded at persistence time.

**Why C:** Simplest change, no new capture mechanism, data is already available. AgentSession is already read at line 493-496 of executionHandler.ts for the session summary.

## 10) Decision log

| ID | Decision | Type (P/T/X) | 1-way door? | Status | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Use AgentSession as tool call source | T | No | Proposed | Data already captured; avoids new capture mechanism | evidence/current-system-behavior.md | Requires AgentSession to be available at persistence time (already is) |
| D2 | Preserve-all part serialization on write path | T | No | Proposed | Generic, forward-compatible, no information loss | evidence/current-system-behavior.md | Increases message content size slightly; existing consumers unaffected (they filter by kind) |

## 11) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | Should tool results (output) also be stored, or just tool call inputs? | P | P1 | No | Vercel SDK `ToolInvocationUIPart` with `state: 'result'` requires both `input` AND `output`. Storing results is needed for SDK conformance. **Recommendation: store results.** | Open |
| Q2 | Should file parts in the read path resolve blob URIs to proxy URLs? | X | P2 | No | Separate concern; the `/manage/.../media/` endpoint exists for retrieval | Open |
| Q3 | Do any internal consumers of `content.parts` break if parts now have varied `kind` values beyond text/data? | T | P0 | Yes | **Resolved:** Audited 10 consumers — all safe. Every consumer filters by explicit `kind` values and ignores unknowns. Only `toVercelMessage()` needs a handler for new kinds (already planned in FR3). | Resolved |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | AgentSession is available and populated at the time executionHandler persists the message | HIGH | Already verified — getSession() called at line 493 | Before implementation | Active |
| A2 | Internal consumers of content.parts only read `kind === 'text'` and `kind === 'data'` — new kinds won't break them | HIGH | Audited 10 consumers — all filter by explicit kind values | N/A | Confirmed |
| A3 | `content.tool_calls` field in MessageContent type is sufficient for storing tool invocation data | HIGH | Type definition verified at utility.ts:98-105 | Before implementation | Active |

## 13) In Scope (implemented)

- ~~**FR1:** Write path preserve-all~~ → Deferred (no data loss today; see `evidence/write-path-part-kinds.md`)
- ~~**FR2:** Tool invocation persistence~~ → Deferred to PRD-6319
- **FR3:** Read path returns data/file/text parts ✅ (US-002)
- **FR4:** Backward compatibility with `kind`/`type` ✅ (US-002)
- **FR5:** Data parts use streaming protocol type names (`data-component`/`data-artifact`) ✅
- **Write path kind/type fix** ✅ (US-001)
- **Pagination total count fix** ✅ (US-003)

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Internal consumers break on new part kinds | Low | Medium | Audit consumers before implementation; they all filter by specific kinds | Andrew |
| AgentSession data missing for some edge cases (e.g., non-standard flows) | Low | Low | Graceful degradation — tool_calls omitted if session unavailable | Andrew |
| Increased message content size from preserving all properties | Low | Low | Parts are small JSON; JSONB compression handles this | N/A |

## 15) Future Work

### Explored

- **Tool call persistence ([PRD-6319](https://linear.app/inkeep/issue/PRD-6319))**
  - What we learned: AgentSession records tool_call + tool_result events in memory. Data is available at persistence time. Vercel SDK requires `input` + `output` for `state: 'result'` tool invocations. 10 internal consumers audited — all safe.
  - Recommended approach: Extract from AgentSession, populate `content.tool_calls`, fix `toVercelMessage()` field names (`input` not `args`, nested `toolInvocation` object).
  - Why not in scope now: Requires product decision on storing tool results (storage cost trade-off).
  - Triggers to revisit: When conversation history needs to show tool call steps.

- **Write path preserve-all serialization**
  - What we learned: `responseParts` only contains `kind: 'text'` and `kind: 'data'` today. `StreamPart` type is `{ kind: 'text' | 'data' }`. No data loss occurring. See `evidence/write-path-part-kinds.md`.
  - Recommended approach: Replace lossy mapping with structure-preserving spread.
  - Why not in scope now: No current data loss. Purely forward-compatibility improvement.
  - Triggers to revisit: If `StreamPart` type is extended with new kinds (e.g., file, reasoning).

### Identified

- **Blob URI resolution in read path** — resolve `blob://` URIs to proxy URLs in `toVercelMessage()` so clients can display images without knowing the media endpoint pattern. Needs its own design (caching, auth, URL format).
- **Read path unknown kind fallback** — add generic passthrough for unrecognized part kinds instead of silently dropping them.
- **Tool invocation format conformance** — `toVercelMessage()` tool_calls handler uses wrong field names. Blocked on PRD-6319.
- **File part format conformance** — file parts don't match Vercel `FileUIPart` shape. Low urgency since agents don't emit file parts.

### Noted

- **Streaming replay** — reconstructing the progressive streaming experience from stored parts. Very different architecture.
