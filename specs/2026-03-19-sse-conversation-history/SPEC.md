# SSE-First Conversation History — Spec

**Status:** Draft
**Owner(s):** Andrew
**Last updated:** 2026-03-19
**Links:**
- Related spec: `specs/2026-03-19-file-ui-part-output-compliance/SPEC.md`
- Predecessor: PR #2709 (`pdf/support`) — fixes file input pipeline
- Evidence: `./evidence/stream-infrastructure.md`

---

## 1) Problem statement
- **Who is affected:** SDK consumers using the Vercel AI SDK `useChat()` hook who want to load existing conversations (page reload, conversation switching, mobile app resume)
- **What pain:** There is no first-class way to load conversation history with correctly-shaped file parts. The REST endpoint (`GET /run/conversations/{id}`) returns broken `blob://` URIs and wrong field names. Even if we fix that (see sibling spec), clients need two separate integration surfaces: SSE for new messages, REST for history.
- **Why now:** PR #2709 adds PDF support, increasing the frequency of file parts in conversations. The existing REST output is broken for files. Rather than just fixing the REST shape, we should evaluate whether the SSE stream itself — where file parts would naturally arrive in the correct `FileUIPart` format — is the better delivery mechanism for conversation history.
- **Current workaround:** Clients must make a separate `GET /run/conversations/{id}` request, parse the non-spec-compliant response, manually reshape file parts, and hydrate `useChat` via `setMessages()` or `initialMessages`. No documented pattern exists for this.

## 2) Goals
- G1: Clients can load conversation history and send new messages through a single SSE connection
- G2: File parts in history arrive in native `FileUIPart` format (`{ type: 'file', mediaType, url }`) — no client-side reshaping needed
- G3: The pattern works naturally with the Vercel AI SDK `useChat()` hook
- G4: Blob URIs are resolved to proxy HTTP URLs before reaching clients

## 3) Non-goals
- NG1: Replace the REST `GET /run/conversations/{id}` endpoint — it stays for non-streaming consumers
- NG2: Stream the full conversation on every request — only on "load" requests (first request for a conversationId, or explicit history request)
- NG3: Change the database storage format
- NG4: Presigned URLs — proxy pattern is correct

## 4) Personas / consumers
- **P1: Vercel AI SDK client** — Uses `useChat()` with our API. Primary target. Would consume history via `onData` callback + `setMessages()`, or via a purpose-built stream event.
- **P2: Custom SSE consumer** — Connects to the chat SSE endpoint directly. Would receive history as structured data events.
- **P3: Direct REST consumer** — Uses the GET endpoint. Not affected by this spec (served by sibling spec).

## 5) User journeys

### P1: Load existing conversation in Vercel AI SDK app
**Today (broken):**
1. Page loads with `conversationId` from URL/state
2. Client calls `GET /run/conversations/{id}` → receives messages with broken `blob://` URIs and wrong field names
3. Client manually reshapes each file part → calls `setMessages()` → renders
4. Client sends new message via `useChat()` → SSE stream → new response renders correctly

**Proposed (SSE-first):**
1. Page loads with `conversationId` from URL/state
2. Client sends initial request via `useChat()` with `conversationId` and a `loadHistory: true` flag (or similar)
3. Server streams back history messages as data events before the new assistant response
4. Client's `onData` handler receives history → calls `setMessages()` → renders
5. If user types a new message → same SSE stream pattern, but history already loaded → only new response streamed

### Failure/recovery
- If conversation doesn't exist (invalid ID): Server proceeds normally with empty history → creates new conversation
- If history load fails mid-stream: Error event emitted, client can fall back to REST endpoint

## 6) Requirements

### Functional requirements
| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | R1: Server can emit conversation history messages through the SSE stream | When `conversationId` is provided, prior messages are emitted as data events before the assistant response | Core feature |
| Must | R2: File parts in history use `FileUIPart` format | History file parts arrive as `{ type: 'file', mediaType, url }` with resolved proxy URLs | Eliminates the output shape problem |
| Must | R3: Blob URIs resolved before streaming | No `blob://` URIs in streamed history | Same as sibling spec R3 |
| Must | R4: History is only streamed when requested | Not every chat request replays full history — only when explicitly requested or on first request | Avoid redundant data |
| Should | R5: Both SSE (chat completions) and Vercel data stream routes support history emission | Consistent behavior across both stream protocols | |
| Should | R6: Client-side example showing `useChat` + history loading | SDK guide or docs show the recommended pattern | |
| Could | R7: Pagination/windowing for large conversation histories | Stream only last N messages, with a "load more" mechanism | Performance |

### Non-functional requirements
- **Performance:** History emission should add minimal latency before the assistant response begins. Messages are already in DB; resolution is string manipulation.
- **Reliability:** If history emission fails, the new assistant response should still proceed
- **Backward compatibility:** Clients that don't request history should see zero change

## 7) Success metrics & instrumentation
- **Metric:** Vercel AI SDK clients can load and resume conversations without a separate REST call
- **Instrumentation:** Trace span for history emission (count, duration, message count)

## 8) Current state (how it works today)

### Stream lifecycle (both routes)
```
Request arrives with conversationId
  │
  ├── Stream initialized (SSE or Vercel v2)
  │     └── Initial event emitted (writeRole / start)
  │                │
  │     ┌──────────┘
  │     │  ← INJECTION WINDOW (stream ready, agent not started)
  │     │     ~100 lines of setup: stream registration, execution context
  │     └──────────┐
  │                │
  ├── ExecutionHandler.execute()
  │     └── Agent loads history internally (as compressed string for model prompt)
  │     └── Agent generates response → streamed to client
  │
  └── Stream completed
```

### Conversation history loading (agent-internal)
- History is loaded by `buildConversationHistory()` in `conversation-history.ts`
- Converts messages to a compressed TEXT string for model context
- File parts are NOT included in this text representation
- History is NEVER emitted to the client stream

### How clients currently load history
- Manage UI: Polls `/api/traces/conversations/{id}` (proxies to manage API)
- SDK consumers: No documented pattern — would need custom `GET /run/conversations/{id}` + `setMessages()`
- Neither uses the SSE stream for history

### Vercel `useChat` hook capabilities
- `initialMessages`: Accepts `UIMessage[]` for hydration on mount
- `setMessages(messages)`: Updates messages state without API call
- `onData(dataPart)`: Callback for custom `data-*` stream events
- Does NOT natively reconstruct multiple messages from stream events — only builds current assistant message

## 9) Proposed solution (vertical slice)

### Protocol design: `data-history` events

Use the Vercel data stream protocol's `data-*` extension mechanism. Emit history as a batch of `data-history` events before the assistant response begins:

**Vercel data stream format:**
```
data: {"type":"start","messageId":"msg_new_response"}
data: {"type":"data-history","data":{"messages":[
  {"id":"msg_1","role":"user","parts":[{"type":"text","text":"What's in this image?"},{"type":"file","mediaType":"image/png","url":"https://api.example.com/manage/tenants/.../media/..."}],"createdAt":"2026-03-19T10:00:00Z"},
  {"id":"msg_2","role":"assistant","parts":[{"type":"text","text":"I can see a chart showing..."}],"createdAt":"2026-03-19T10:00:05Z"}
]}}
data: {"type":"text-start","id":"t1"}
data: {"type":"text-delta","id":"t1","delta":"Here is my new response..."}
```

**SSE (chat completions) format:**
```
data: {"choices":[],"data":{"type":"history","messages":[...]}}

data: {"choices":[{"delta":{"role":"assistant"}}]}
data: {"choices":[{"delta":{"content":"Here is my new response..."}}]}
```

### Server-side changes

#### 1. New `StreamHelper` method
```typescript
interface StreamHelper {
  // ... existing methods
  writeHistory(messages: HistoryMessage[]): Promise<void>;
}

type HistoryMessage = {
  id: string;
  role: string;
  parts: FileUIPart | TextUIPart | DataUIPart[];
  createdAt: string;
};
```

#### 2. History loading + emission in route handlers

In both `chat.ts` and `chatDataStream.ts`, after stream setup and before `ExecutionHandler.execute()`:

```typescript
// In the injection window:
if (conversationId && shouldLoadHistory(body)) {
  const messages = await getVisibleMessages(runDbClient)(conversationId, { limit: 50 });
  const resolved = resolveMessagesListBlobUris(messages);
  const formatted = resolved.map(toFileUIPart); // reshape to FileUIPart format
  await streamHelper.writeHistory(formatted);
}
```

#### 3. Request parameter: `loadHistory`

Add an optional parameter to the chat request body:
- `loadHistory?: boolean` — when `true`, server emits history before response
- Default: `false` for backward compatibility
- Alternative: `historyMode?: 'none' | 'full' | 'recent'`

### Client-side pattern

```tsx
const { messages, sendMessage, setMessages } = useChat({
  transport: new DefaultChatTransport({
    api: "/run/api/chat",
    body: { conversationId, loadHistory: true },
  }),
  onData: (part) => {
    if (part.type === 'history') {
      setMessages(part.data.messages);
    }
  },
});
```

### Alternatives considered

**Option A: Use `initialMessages` from REST endpoint**
- Client fetches history via GET, passes to `useChat({ initialMessages })`
- Pro: Standard Vercel SDK pattern
- Con: Requires fixing REST output shape (sibling spec), two integration surfaces, extra round trip
- **This is the current recommended pattern — but requires the sibling spec work**

**Option B: Custom stream protocol with full message reconstruction**
- Server streams each historical message as a separate `start`/`text-delta`/`finish` sequence
- Pro: Uses native protocol events
- Con: The SDK would treat each as a new assistant message — breaks the `messages` array structure. User messages can't be represented this way.
- **Rejected:** Protocol mismatch — stream events build the current message, not arbitrary past messages

**Option C: Single `data-history` batch event (proposed)**
- Server emits one data event with the full message array
- Pro: Clean protocol extension, client receives complete array for `setMessages()`
- Con: Custom protocol — not a native Vercel SDK feature, requires `onData` handler
- **Chosen:** Most natural fit for the "load once, then stream new" pattern

## 10) Decision log

| ID | Decision | Type | 1-way door? | Status | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Use `data-history` custom event type (not native protocol types) | T | No | Pending | Native types build current message, can't represent arbitrary history. `data-*` is the sanctioned extension mechanism. | evidence/stream-infrastructure.md §3 | Client needs `onData` handler |
| D2 | Emit history as a single batch, not individual message events | T | No | Pending | `setMessages()` expects a complete array. Batching reduces client complexity and avoids partial render. | evidence/stream-infrastructure.md §4 | Large histories could be a large JSON payload in one event |
| D3 | `loadHistory` opt-in parameter vs. automatic history on first request | P | No | Pending | Need user input — explicit parameter is safer but more work for consumers | — | API surface decision |
| D4 | This spec complements (not replaces) the REST output fix | P | No | Pending | REST endpoint still needed for non-streaming consumers | — | Both specs should be implemented |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | Should history be opt-in (`loadHistory: true`) or automatic when `conversationId` is present? | P | P0 | Yes | User decision — tradeoff between DX simplicity and backward compat | Open |
| Q2 | Message format in history events — use `FileUIPart` spec directly or our own envelope? | T | P0 | Yes | Use `FileUIPart` for file parts; overall message shape should match `UIMessage` for `setMessages()` compatibility | Open |
| Q3 | Should we still fix the REST endpoint (sibling spec) alongside this? | P | P1 | No | User decision — depends on whether non-streaming consumers matter enough | Open |
| Q4 | How to handle large conversation histories in the stream? Pagination? Truncation? | T | P1 | No | Could default to last 50 messages, allow `historyLimit` parameter | Open |
| Q5 | Should the Vercel `useChat` onData handler pattern be wrapped in a helper/SDK? | P | P2 | No | Could ship as `@inkeep/ai-sdk-helpers` or just document the pattern | Open |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Vercel AI SDK `onData` callback receives `data-*` events and we can use `setMessages()` to hydrate history | MEDIUM | Build a prototype — the SDK docs confirm `onData` exists but don't show this exact pattern | Before implementation | Active |
| A2 | Emitting history before the assistant response doesn't confuse the SDK's internal message state | MEDIUM | Test with `useChat` — the SDK expects stream events to build the current message; history events must not interfere | Before implementation | Active |
| A3 | `data-history` events are ignored by clients that don't handle them (backward compat) | HIGH | Standard behavior for unknown data events in the protocol | — | Active |
| A4 | History emission adds <100ms latency for typical conversations (≤50 messages) | HIGH | DB query + blob resolution is fast; verify with profiling | Before launch | Active |

## 13) In Scope (implement now)

Pending resolution of Q1-Q3. Proposed scope:

- Add `writeHistory()` to `StreamHelper` interface + both implementations
- Add `loadHistory` parameter to chat request body schemas
- Load + resolve + reshape history messages in both route handlers
- Emit `data-history` event before agent execution
- Client-side documentation/example showing `onData` + `setMessages()` pattern
- Tests for history emission

## 14) Risks & mitigations
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Vercel SDK `onData` doesn't receive custom events correctly | Low | High | Prototype before full implementation; fall back to REST if broken | — |
| Large history payloads cause stream buffering/timeouts | Low | Medium | Default limit of 50 messages; add `historyLimit` parameter | — |
| `setMessages()` inside `onData` causes re-render thrash | Medium | Low | Batch history as single event; client calls `setMessages` once | — |
| Custom protocol extension confuses third-party SDK consumers | Low | Low | Document clearly; `data-*` events are explicitly ignorable per protocol | — |

## 15) Future Work

### Explored
- **Streaming file parts in new responses**
  - What we learned: StreamHelper has no `writeFile()` method. The Vercel protocol has native `file` event type.
  - Why not in scope: Model outputs rarely contain file parts currently
  - Triggers to revisit: When agents start producing file attachments

### Identified
- **Incremental history sync** — Instead of loading full history on each conversation switch, delta-sync only new messages since last known state
  - What we know: Would need client-side message ID tracking
  - Why it matters: Efficiency for long conversations
  - What investigation is needed: SDK state management patterns, message ID ordering

- **History streaming with pagination** — Stream first page immediately, lazy-load older messages on scroll
  - What we know: Feasible with `data-history-page` events + client-side accumulation
  - Why it matters: Large conversations (100+ messages) shouldn't block initial render

### Noted
- **REST endpoint `FileUIPart` compliance** — The sibling spec (`2026-03-19-file-ui-part-output-compliance`) should still be implemented for non-streaming consumers. The two specs are complementary.
- **Webhook/push history updates** — SSE could also push new messages from other agents (A2A) or tool results that arrive asynchronously
