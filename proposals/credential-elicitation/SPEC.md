# Elicitation Primitive — Spec

**Status:** Draft
**Owner(s):** TBD
**Last updated:** 2026-02-25
**Links:**
- Evidence: `./evidence/` (spec-local findings)
- Related PR: [#2291](https://github.com/inkeep/agents/pull/2291) (concept — `tool-auth-error-propagation`)

---

## 1) Problem statement

- **Who is affected:** End users of agents configured with user-scoped MCP tools (e.g., Linear, GitHub, Gmail via Nango OAuth). Also affects any client consuming agents via MCP or A2A protocols when downstream servers/agents need user input.
- **What pain / job-to-be-done:** When a user interacts with an agent that requires user-level authentication for an MCP tool, the system silently degrades — it proceeds without credentials, the MCP server returns a 401, the agent retries multiple times, and the user eventually sees a generic "having issues" error. There is no mechanism to pause execution, prompt the user to authenticate, and resume.
- **Why now:** User-scoped credentials are shipping to customers. The current failure mode actively burns through retries and produces a confusing UX. Additionally, MCP and A2A protocols both define elicitation/input-required primitives that our system cannot participate in — making us a bad citizen in both ecosystems.
- **Current workaround(s):** Users must leave the chat, navigate to admin settings, connect their credentials, and start a new conversation. There is no in-conversation recovery path.

## 2) Goals

- **G1:** When a user-scoped tool is missing credentials, the agent pauses, the client presents an actionable auth prompt, the user authenticates, and the agent resumes — all within the same conversation/stream.
- **G2:** Introduce a general-purpose elicitation primitive (not credential-specific) that serves as the internal hub for MCP elicitation, A2A input-required/auth-required, and our own credential detection — with protocol adapters on each side.
- **G3:** Design the public API surface (stream event schema, response endpoints) to work in both the current synchronous runtime and the planned future async runtime, with no breaking changes needed at the transition.

## 3) Non-goals

- **NG1:** Implementing MCP client elicitation passthrough (receiving `elicitation/create` from external MCP servers) — Phase 2.
- **NG2:** Implementing A2A `input-required`/`auth-required` state production or consumption — Phase 2.
- **NG3:** Implementing MCP server → client elicitation (our agent requesting input from external MCP clients) — Phase 3.
- **NG4:** Form-mode elicitation (structured input collection via schemas) — Phase 2+. Phase 1 is URL-mode only (credential flows).
- **NG5:** Async runtime support — the schema is designed for it, but the Phase 1 implementation uses synchronous Promise-based blocking.

## 4) Personas / consumers

- **P1: End user (chat widget / copilot)** — The person chatting with an agent who encounters a tool requiring their credentials. Needs a clear, in-context prompt to authenticate without losing conversation state.
- **P2: End user (Slack)** — Same as P1 but via Slack work-app integration. Needs an interactive Slack message with an auth link.
- **P3: SDK consumer (AI SDK provider / OpenAI-compatible API)** — Programmatic consumers of the chat stream who need to detect and handle elicitation events, either by surfacing them to their own UIs or handling them programmatically.
- **P4: External MCP/A2A client** — (Phase 2+) External clients calling our agents via MCP or A2A protocols, who need to participate in elicitation flows.

## 5) User journeys

### P1: End user in chat widget — credential elicitation (happy path)

1. User sends a message to an agent that uses a user-scoped Linear MCP tool.
2. Agent processes the message, decides to call the Linear tool.
3. System detects: `credentialScope === 'user'`, no credential for `(toolId, userId)`.
4. Stream emits `elicitation-request` with `mode: 'url'`, `message: "Linear requires authentication..."`, `url: <hosted auth page>`.
5. Widget renders an in-chat prompt: "Linear requires authentication. [Connect your account]".
6. User clicks "Connect". A popup/redirect opens to the hosted auth page.
7. Hosted auth page detects credential type (OAuth) → redirects to Linear's OAuth flow via Nango.
8. User authorizes in Linear. Nango callback stores the token. Hosted page signals completion.
9. Widget detects auth completion, sends `elicitation-response` with `action: 'completed'`.
10. Server resolves the pending elicitation. Re-resolves credential for `(toolId, userId)` — now found.
11. Rebuilds MCP config with auth headers. Executes the original tool call.
12. Tool result streams back. Agent continues its response normally.

### P1: End user — dismisses auth prompt

1-5. Same as above.
6. User clicks "Dismiss" or the prompt times out (10 minutes).
7. Widget sends `elicitation-response` with `action: 'decline'`.
8. Server resolves the pending elicitation as declined.
9. Tool returns an error result: "Authentication required but not provided."
10. LLM receives the error and explains to the user that the tool requires authentication and suggests connecting their account in settings.

### P2: End user in Slack

1-3. Same detection as above.
4. Stream emits `elicitation-request`. Slack handler receives it.
5. Slack posts an interactive message: "Linear requires authentication. [Connect your account]" with a button linking to the hosted auth page.
6. User clicks the link, completes OAuth in browser.
7. Hosted auth page signals completion. Slack handler (or callback mechanism) sends `elicitation-response`.
8-12. Same resume flow as widget.

### Debug experience

- OTel spans: `elicitation.requested` (with elicitationId, toolId, trigger), `elicitation.completed`/`elicitation.declined`/`elicitation.timeout`.
- Stream events are visible in the traces timeline UI.
- Agent session records the elicitation pause and resume.

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Detect missing user-scoped credentials before tool execution | When `credentialScope === 'user'` and no credential exists for `(toolId, userId)`, the system emits an elicitation event instead of attempting the MCP call | Proactive detection in `Agent.getMcpTool()` |
| Must | Emit `elicitation-request` stream event with auth URL | Event contains `elicitationId`, `mode: 'url'`, `message`, `url`, and trigger `context` | Schema in `StreamEventSchema` |
| Must | Block agent execution until user responds or timeout | PendingElicitationManager creates a Promise, blocks tool execution, resolves on client response or 10-min timeout | Follows PendingToolApprovalManager pattern |
| Must | Provide response endpoint for clients | `POST /run/api/elicitation-responses` + message-part fast-path via `/run/api/chat` | Dual response mechanism like tool approvals |
| Must | Resume tool execution after successful auth | Re-resolve credential, rebuild MCP config with auth headers, execute original tool call, emit tool result | Novel complexity — tool approvals don't reconfigure |
| Must | Handle declined/timeout gracefully | Return descriptive error to LLM, LLM explains situation to user | Tool returns error, not crash |
| Must | Support delegated agents | Delegated agents propagate via event bus → route handler → stream | New `elicitationBus` instance of generic `InProcessEventBus<T>` (D10) |
| Must | Widget renders auth prompt | In-chat UI with "Connect" button that opens auth URL | `@inkeep/agents-ui` changes |
| Must | Slack renders auth prompt | Interactive message with auth link button | Extend Slack streaming handler |
| Should | Generate auth URL at runtime | Hosted auth page URL with tool/user context, or direct OAuth URL | See D8 |
| Should | `writeElicitationRequest()` on all 3 StreamHelper implementations | SSE (JSON in delta.content), Vercel (typed writer), Buffering (capture) | Follows existing pattern |
| Could | AI SDK provider handles `elicitation-request` | New case in `doStream()` transform — surface or explicitly ignore | Medium coupling |
| Must | Client opt-in via `x-supports-elicitation: true` header | Server checks header before emitting elicitation events. Absent → skip elicitation, return immediate tool error to LLM. Present → full elicitation flow. | Follows `x-emit-operations` precedent (D11) |
| Must | Harden `StreamEventSchema` with catch-all passthrough | Add fallback to `z.discriminatedUnion` so unknown event types pass validation as generic objects instead of causing Zod parse errors | Prevents breaking deployed AI SDK provider consumers (D12) |

### Non-functional requirements

- **Performance:** Elicitation adds latency only when credentials are actually missing. The detection check (credential_references lookup) is already in the hot path and is O(n) over project credentials in memory — no additional DB query.
- **Reliability:** 10-minute timeout with cleanup (same as tool approvals). Stream stays open during elicitation. No heartbeat mechanism exists today (same as tool approvals) — connections rely on TCP keepalive.
- **Security/privacy:** Credentials never transit the chat stream. Auth happens out-of-band via URL mode (browser). The `url` in the event points to our hosted auth page or the OAuth provider — never contains credentials. Identity binding: the hosted auth page must verify the user completing the flow matches the user who initiated the chat.
- **Operability:** OTel spans for elicitation lifecycle. Elicitation events visible in trace timeline. Logging at info level for elicitation start/complete/decline/timeout.
- **Cost:** No additional cost per elicitation — credential storage is existing infrastructure (Nango, Keychain, Memory stores).

## 7) Success metrics & instrumentation

- **Metric 1: Credential error rate**
  - Baseline: 100% of user-scoped tool calls fail when credentials are missing
  - Target: <10% failure rate after elicitation prompt (most users connect successfully)
  - Instrumentation: Count `elicitation.completed` vs `elicitation.declined` + `elicitation.timeout` spans
- **Metric 2: Tool retry waste elimination**
  - Baseline: Missing credentials cause multiple MCP call retries before generic error
  - Target: Zero wasted retries — proactive detection short-circuits before any MCP call
  - Instrumentation: Track MCP 401 errors vs `elicitation.requested` events
- **What we will log/trace:** elicitationId, toolId, toolName, credentialType, trigger, userId, duration (request → response), outcome (completed/declined/timeout)
- **How we'll know adoption/value:** Decrease in "having issues" generic errors for user-scoped tools. Increase in user-scoped credential connections.

## 8) Current state (how it works today)

### Credential resolution flow (`Agent.getMcpTool()`, Agent.ts:~1157)

```
credentialScope === 'user'?
  YES → search project.credentialReferences for (toolId, userId) match
    FOUND → build storeReference, inject auth headers via CredentialStuffer → tool works
    NOT FOUND → log warning → build config WITHOUT auth → MCP call fails with 401
               → agent retries → eventually generic "having issues" error
  NO (project) → use tool.credentialReferenceId for shared credential lookup
```

### Key constraints

- **`userId` is only available from authenticated sessions**, not API-key requests. `getUserIdFromContext()` extracts from `executionContext.metadata.initiatedBy`. Elicitation is inherently tied to interactive sessions.
- **Credential storage is external** (Nango for OAuth, Keychain for local dev, Memory for API keys). The `CredentialStuffer` converts store references to HTTP headers.
- **MCP client has no elicitation capability.** `McpClient` at `packages/agents-core/src/utils/mcp-client.ts` constructs with `capabilities: {}`. If an external MCP server sends `elicitation/create`, it is silently rejected.
- **A2A handler has no `input-required` support.** `TaskState.InputRequired` and `TaskState.AuthRequired` exist in the enum but are never produced or handled. `tasks/get` is a stub.
- **Runtime is synchronous.** Agent execution happens within a single HTTP request lifecycle. Future async runtime is planned but not yet built.

### Known gaps discovered during research

- `data-artifact` event is emitted but not in `StreamEventSchema` — pre-existing schema gap.
- `ToolApprovalUiBus` event type union is approval-specific — needs generalization for new interactive event types.
- `BufferingStreamHelper` (used in MCP server mode) cannot support interactive events — limitation for agent-as-MCP-server elicitation (Phase 3).

## 9) Proposed solution (vertical slice)

### Architecture overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        THREE PROTOCOL SURFACES                          │
│                                                                         │
│  [Stream/SSE]              [MCP Protocol]           [A2A Protocol]      │
│  elicitation-request       elicitation/create        input-required     │
│  elicitation-response      ElicitResult              auth-required      │
│  (widget, copilot, Slack)  (MCP clients/servers)     (A2A clients)      │
└──────────┬─────────────────────┬───────────────────────┬────────────────┘
           │                     │                       │
           v                     v                       v
┌─────────────────────────────────────────────────────────────────────────┐
│                     INTERNAL ELICITATION PRIMITIVE                       │
│                                                                         │
│  PendingElicitationManager  ←→  InProcessEventBus<T>  ←→  StreamHelper  │
│  (Promise blocking/timeout)     (cross-agent propagation)  (3 impls)    │
│                                                                         │
│  Triggers:                                                              │
│  1. Credential detection (Agent.getMcpTool)                             │
│  2. MCP client elicitation handler (Phase 2)                            │
│  3. A2A client input-required handler (Phase 2)                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Stream event schema (1-way door)

```typescript
// Server → Client
ElicitationRequestEventSchema = z.object({
  type: z.literal('elicitation-request'),
  elicitationId: z.string(),
  mode: z.enum(['url', 'form']),
  message: z.string(),

  // URL mode (auth/credentials)
  url: z.string().optional(),

  // Form mode (structured input — Phase 2+)
  requestedSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()).optional(),
  }).optional(),

  // What triggered this elicitation
  context: z.object({
    trigger: z.string(),  // 'credential_required' | 'mcp_elicitation' | 'a2a_input_required'
  }).and(z.record(z.string(), z.unknown())).optional(),
});

// Client → Server (via response endpoint or message part)
ElicitationResponseSchema = z.object({
  elicitationId: z.string(),
  action: z.enum(['accept', 'decline', 'cancel']),
  content: z.record(z.string(), z.unknown()).optional(),  // for form mode
});
```

### Protocol mapping

| Internal event | MCP equivalent | A2A equivalent |
|---|---|---|
| `elicitation-request` mode=url | `elicitation/create` mode=url | Task with `auth-required` state |
| `elicitation-request` mode=form | `elicitation/create` mode=form | Task with `input-required` state |
| `elicitation-response` action=accept | `ElicitResult` action=accept | New `message/send` with input |
| `elicitation-response` action=decline | `ElicitResult` action=decline | `tasks/cancel` or equivalent |

### Server-side components

#### 1. `ElicitationRequestEventSchema` + `ElicitationResponseSchema`
- **File:** `packages/agents-core/src/validation/stream-event-schemas.ts`
- Add to `StreamEventSchema` discriminated union
- Export types

#### 2. `StreamHelper.writeElicitationRequest()`
- **File:** `agents-api/src/domains/run/utils/stream-helpers.ts`
- New method on `StreamHelper` interface
- **SSEStreamHelper:** JSON envelope in `delta.content` (same as tool approvals for OpenAI protocol)
- **VercelDataStreamHelper:** Typed `writer.write()` with `elicitation-request` type
- **BufferingStreamHelper:** Capture in array

#### 3. `PendingElicitationManager`
- **File:** `agents-api/src/domains/run/services/PendingElicitationManager.ts`
- In-memory `Map<string, { resolve, reject, timeout }>` keyed by `elicitationId`
- `waitForElicitation(elicitationId)` → Promise that blocks
- `resolveElicitation(elicitationId, response)` → resolves the Promise
- 10-minute timeout, 2-minute cleanup interval
- Nearly identical to `PendingToolApprovalManager`

#### 4. `InProcessEventBus<T>` (extracted from ToolApprovalUiBus)
- **File:** `agents-api/src/domains/run/services/InProcessEventBus.ts`
- Extract generic bus class:
  ```typescript
  export class InProcessEventBus<T> {
    subscribe(streamRequestId: string, listener: (event: T) => void): () => void;
    publish(streamRequestId: string, event: T): void;
  }
  ```
- Create separate typed instances:
  ```typescript
  // Existing approval events — same types, new bus instance
  export const toolApprovalBus = new InProcessEventBus<ToolApprovalUiEvent>();

  // New elicitation events
  type ElicitationBusEvent =
    | { type: 'elicitation-needed'; elicitationId; mode; message; url?; requestedSchema?; context? }
    | { type: 'elicitation-resolved'; elicitationId; action; content? };
  export const elicitationBus = new InProcessEventBus<ElicitationBusEvent>();
  ```
- Same pub/sub mechanics keyed by `streamRequestId`
- One-time refactor: rename imports in 6 consumer files from `ToolApprovalUiBus` → `toolApprovalBus` from `InProcessEventBus`

#### 5. Capability negotiation via `x-supports-elicitation` header
- **Files:** `agents-api/src/domains/run/routes/chat.ts`, `chatDataStream.ts`
- Read `x-supports-elicitation` header from request (follows `x-emit-operations` pattern)
- Pass `supportsElicitation: boolean` through execution context to `Agent.getMcpTool()`
- When `supportsElicitation === false` and credentials are missing: skip elicitation, return immediate tool error to LLM: *"Tool [name] requires user authentication. The user needs to connect their [service] account before this tool can be used."*
- When `supportsElicitation === true`: proceed with elicitation flow (emit event, block, resume)
- First-party clients (Widget, Slack) add the header at feature ship time

#### 6. `StreamEventSchema` hardening
- **File:** `packages/agents-core/src/validation/stream-event-schemas.ts`
- Add catch-all passthrough to `z.discriminatedUnion`:
  ```typescript
  // After all known event types in the union:
  z.object({ type: z.string() }).passthrough()  // forward-compatible catch-all
  ```
- Prevents Zod parse errors in deployed AI SDK provider consumers when new event types are added
- Ship before adding `elicitation-request` type to the union

#### 7. Credential detection in `Agent.getMcpTool()`
- **File:** `agents-api/src/domains/run/agents/Agent.ts` (~line 1205)
- When `credentialScope === 'user'` and no credential found:
  1. Check `supportsElicitation` from execution context. If false → return immediate tool error to LLM.
  2. Generate `elicitationId`
  3. Generate auth URL (hosted auth page or OAuth URL)
  4. Emit `elicitation-request` via streamHelper (direct) or bus (delegated)
  5. Block on `pendingElicitationManager.waitForElicitation(elicitationId)`
  6. On `accept`: re-query `credential_references` for `(toolId, userId)` — should now exist
  7. Build storeReference, call `credentialStuffer.buildMcpServerConfig()`
  8. Create MCP client with auth headers, execute original tool call
  9. On `decline`/`cancel`/timeout: return descriptive error to LLM

#### 8. Response endpoint
- **File:** `agents-api/src/domains/run/routes/chatDataStream.ts`
- `POST /run/api/elicitation-responses` — dedicated endpoint
  ```typescript
  z.object({
    conversationId: z.string(),
    elicitationId: z.string(),
    action: z.enum(['accept', 'decline', 'cancel']),
    content: z.record(z.string(), z.unknown()).optional(),
  })
  ```
- Message-part fast-path via `POST /run/api/chat` (same pattern as tool approvals)

#### 9. Auth URL generation
- Runtime endpoint or utility that generates a hosted auth page URL:
  ```
  /auth/connect?toolId={toolId}&userId={userId}&elicitationId={elicitationId}&returnUrl={callback}
  ```
- The hosted page handles:
  - Detecting credential type (OAuth vs API key) from tool config
  - For OAuth: redirect to Nango OAuth flow → Nango stores token on callback
  - For API key: render input form → POST credential to manage API
  - On completion: signal back to the originating stream (via callback URL, postMessage, or polling)

### Client-side components

#### Widget (`@inkeep/agents-ui`)
- Detect `elicitation-request` in stream
- Render in-chat prompt: message text + "Connect" / "Dismiss" buttons
- "Connect" opens `url` in popup or new tab
- On auth completion (popup signals back via postMessage or redirect), send `elicitation-response` with `action: 'accept'`
- "Dismiss" sends `elicitation-response` with `action: 'decline'`

#### Copilot (manage UI)
- Similar to widget — new message part component
- Could reuse patterns from `ToolApproval` component

#### Slack
- On `elicitation-request` in SSE stream: post interactive message with auth link button
- Clear stream timeout (same as tool approvals — elicitation can take minutes)
- On auth completion: Slack callback handler sends `elicitation-response`
- On timeout: update Slack message to "Expired" state

#### AI SDK provider
- New case in `doStream()` transform switch for `elicitation-request`
- Surface as custom `LanguageModelV2StreamPart` or ignore with warning

### Alternatives considered

#### A. Credential-specific event (`credential-required`)
Purpose-built for credential flows. Simpler schema, smaller initial scope. **Rejected** because it only covers 1 of 6 elicitation flows (credential detection). MCP passthrough, A2A passthrough, and non-credential input would each need separate events, creating fragmentation. Agents-as-MCP-servers means the primitive must work at every protocol layer.

#### B. Extend tool-approval pattern (`tool-approval-request` with `kind: 'credential'`)
Least new infrastructure — reuses PendingToolApprovalManager and existing endpoints. **Rejected** because the user interactions are fundamentally different (binary approve/deny vs multi-step auth flow vs structured data collection). Overloading creates semantic debt and `kind`-branching everywhere.

#### C. Notification-only event (`tool-auth-required`, PR 2291 approach)
Fire-and-forget event, no blocking, LLM explains error in text. **Rejected as the final design** because it doesn't provide an in-conversation recovery path. However, the placeholder tool pattern from PR 2291 (short-circuit with "DO NOT RETRY" message) is useful as the fallback when elicitation is not supported by the client.

#### Why we chose `elicitation-request`
One general primitive that bridges all three protocols (stream, MCP, A2A) at every layer of the stack. The credential use case is Phase 1; protocol adapters and form-mode are Phase 2+. The schema is MCP-compatible (mode, requestedSchema, elicitationId) and maps cleanly to A2A states (url→auth-required, form→input-required). Designed for both sync (Promise blocking) and future async (persisted task state) runtimes.

## 10) Decision log

| ID | Decision | Type | 1-way door? | Status | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | General `elicitation-request` primitive, not credential-specific | Cross-cutting | Yes (stream protocol) | **Confirmed** | Three protocols (stream, MCP, A2A) converge on the same concept. One primitive handles all triggers: credential detection, MCP passthrough, A2A input-required. Credential-specific would require 3+ separate events. | `evidence/mcp-elicitation-protocol.md`, `evidence/a2a-input-required.md`, `evidence/mcp-elicitation-chaining.md` | Schema must support both URL and form modes. Phase 1 implements URL mode only. |
| D2 | MCP-aligned schema (mode, elicitationId, requestedSchema) | Technical | Yes (public API) | **Confirmed** | MCP's elicitation shapes are well-designed and stable. Aligning enables direct passthrough from MCP servers without transformation. A2A maps via mode→state (url→auth-required, form→input-required). | `evidence/mcp-elicitation-protocol.md` | Form-mode schemas limited to flat primitives (MCP constraint) in Phase 1. Can extend later. |
| D3 | Proactive credential detection (before tool execution) | Technical | No (reversible) | **Confirmed** | Credential lookup already happens in `getMcpTool()`. No reason to let the MCP call fail and then react. Avoids wasted roundtrip + retry loop. | `evidence/credential-system.md` | Detection point is `Agent.getMcpTool()` when `credentialScope === 'user'` and no `(toolId, userId)` match found. |
| D4 | Promise-based blocking (sync) for Phase 1, schema supports async | Cross-cutting | No (implementation detail) | **Confirmed** | Current runtime is synchronous. Schema uses `elicitationId` as correlation key — works for both in-memory Promise (sync) and persisted task state (async). No breaking changes when async runtime ships. | `evidence/async-runtime-constraint.md` | Phase 1: PendingElicitationManager. Future: DB-persisted elicitation state. |
| D5 | Each hop manages its own elicitation independently (no forwarding) | Technical | No (reversible) | **Confirmed** | MCP spec says credentials must not pass through intermediaries. A2A has same gap. Each hop creates a new elicitation with its own ID and trust boundary. | `evidence/mcp-elicitation-chaining.md` | Intermediary agents translate (not forward) elicitation between upstream/downstream. |
| D6 | Dual response mechanism (dedicated endpoint + message part) | Technical | Yes (API surface) | **Confirmed** | Proven pattern from tool approvals. Dedicated endpoint for custom integrations; message-part fast-path for Vercel AI SDK clients. | `evidence/tool-approval-pattern.md` | Two code paths to maintain, but both are simple and the pattern is established. |
| D7 | Phase 1 credential type: OAuth (Nango) only | Product | No | **Confirmed** | User-scoped credentials are OAuth-only in practice. The manage UI (`use-oauth-login.ts`, `view-mcp-server-details-user-scope.tsx`) only offers Nango OAuth or Keychain for user-scoped tools. No API key input UI exists. | Code-verified: `mcp-server-form.tsx:103-138`, `use-oauth-login.ts` | Phase 1 auth URL points to hosted page that triggers Nango OAuth flow. API key support is a future extension. |
| D8 | Auth URL strategy: hosted auth page | Technical | No (reversible) | **Confirmed** | Hosted page handles all credential types uniformly, gives UX control and error handling. The existing `useOAuthLogin` hook already opens a popup to an OAuth URL — hosted page follows same pattern. | `use-oauth-login.ts:65-130` (popup + postMessage pattern) | Need to build the hosted auth page. Can reuse existing Nango connect logic from `useOAuthLogin`. |
| D9 | Phase 1 client surfaces: Widget + Slack | Product | No | **Confirmed** | Widget is the primary interactive surface. Slack is high-value (current pain is worst there). Copilot deferred to Phase 2. | Owner decision | Widget needs `@inkeep/agents-ui` changes. Slack extends existing streaming handler. |
| D10 | Generic typed `InProcessEventBus<T>` for event bus strategy | Technical | No (reversible) | **Confirmed** | Extract bus class as generic `InProcessEventBus<T>`, create separate typed instances: `toolApprovalBus = new InProcessEventBus<ToolApprovalUiEvent>()` and `elicitationBus = new InProcessEventBus<ElicitationBusEvent>()`. DRY implementation, full type safety per bus, scales to N event types. | Codebase exploration: bus is structurally generic (Map+Set), only type constraint is approval-specific. 7 files, 2 subscribers, 6 publishers. | One-time rename/extract across 8 files. Each bus instance is independently typed — no cross-contamination. Future interactive patterns get `new InProcessEventBus<NewType>()`. |
| D11 | Opt-in header `x-supports-elicitation: true` for capability negotiation | Technical | No (reversible) | **Confirmed** | Follows proven `x-emit-operations` pattern already in production. Header present → emit `elicitation-request` and block. Header absent → skip elicitation, return immediate tool error to LLM ("Tool [name] requires user authentication"). Zero-cost fallback that is *better* than today's behavior (silent 401 → retry → generic error). First-party clients (Widget, Slack) add the header; third-party consumers get clean immediate errors. | `x-emit-operations` precedent in `chatDataStream.ts` and `chat.ts`. Analysis of 6 options: no-negotiation, header, body capabilities, timeout degradation, shorter timeout, stream-level exchange. | Widget and Slack add header at feature ship time. Migration path to body `capabilities` field remains open for future. Tool approvals can adopt the same pattern later if needed. |
| D12 | Schema hardening: catch-all passthrough in `StreamEventSchema` | Technical | No (reversible) | **Confirmed** | `StreamEventSchema` uses `z.discriminatedUnion` which rejects unknown event types. Any new stream event type breaks deployed AI SDK provider consumers (Zod parse error → `{ type: 'error' }` in stream). Adding a catch-all passthrough (e.g., `z.object({ type: z.string() }).passthrough()`) makes the schema forward-compatible for all future event types. Pre-existing brittleness, not elicitation-specific. | AI SDK provider at `inkeep-chat-language-model.ts:215` passes `StreamEventSchema` to `createEventSourceResponseHandler`. Zod `discriminatedUnion` rejects unknown `type` values. | Ship as part of Phase 1 before adding `elicitation-request` type. Prevents the same breaking-change problem for any future event types. |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | Which credential types for Phase 1? | Product | P0 | Yes | OAuth (Nango) only. User-scoped API key flows don't exist in the UI today — the manage UI only offers OAuth (Nango) or Keychain for user-scoped tools. No user-facing API key input path. | **Resolved → D7** |
| Q2 | Auth URL strategy: hosted auth page vs raw OAuth provider URL? | Technical | P0 | Yes | Hosted auth page. Handles all credential types uniformly, gives UX control, and works as the single URL in the elicitation event regardless of credential type. | **Resolved → D8** |
| Q3 | Which client surfaces for Phase 1? | Product | P0 | Yes | Widget + Slack. Copilot is Phase 2. | **Resolved → D9** |
| Q4 | Should the event bus be generalized or parallel? | Technical | P1 | No | Generic typed `InProcessEventBus<T>` — extract bus class as generic, create separate typed instances for approvals and elicitation. | **Resolved → D10** |
| Q5 | Capability negotiation for blocking: how do old clients signal they can't handle elicitation? | Technical | P1 | No | Opt-in header `x-supports-elicitation: true`. Follows `x-emit-operations` precedent. Absent → immediate tool error to LLM. Present → elicitation flow. | **Resolved → D11** |
| Q6 | Should `StreamEventSchema` be hardened against unknown event types? | Technical | P1 | No | Yes — add catch-all passthrough to prevent Zod `discriminatedUnion` from breaking deployed AI SDK provider consumers when new event types are added. | **Resolved → D12** |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `@inkeep/agents-ui` can be updated to handle new stream event types without breaking existing functionality | HIGH | Verify with widget team before Phase 1 implementation | Before Phase 1 | Active |
| A2 | Nango OAuth callback reliably stores the token before the hosted auth page signals completion | HIGH | Test with Nango integration in dev environment | Before Phase 1 | Active |
| A3 | 10-minute timeout is sufficient for OAuth flows (user may need to create account, approve permissions, etc.) | MEDIUM | Monitor elicitation timeout rates post-launch. MCP and tool approvals use same timeout. | Phase 1 launch + 2 weeks | Active |
| A4 | MCP client connections can be rebuilt mid-execution after credential resolution (new McpClient with auth headers for the same server) | MEDIUM | Verify in Agent.ts — test creating a new McpClient for a server that already had a cached connection | Before Phase 1 implementation | Active |
| A5 | The credential will exist in `credential_references` by the time the response endpoint is called (Nango OAuth callback has completed) | MEDIUM | There may be a race condition between OAuth callback storing the token and the client signaling completion. Add a short retry/poll on credential lookup after elicitation response. | Before Phase 1 | Active |

## 13) Phases & rollout plan

### Phase 1: Credential elicitation via stream (validate the core)

- **Goal:** When a user-scoped MCP tool is missing credentials, the chat pauses, shows an auth prompt, the user authenticates, and the tool executes — all in one conversation.
- **Non-goals:** MCP protocol passthrough, A2A state support, form-mode input collection, async runtime.
- **In scope:**
  - `StreamEventSchema` hardening: catch-all passthrough for forward compatibility (D12) — ship first
  - `ElicitationRequestEventSchema` + `ElicitationResponseSchema` in `agents-core`
  - `StreamHelper.writeElicitationRequest()` on all 3 implementations
  - `PendingElicitationManager` service
  - `InProcessEventBus<T>` generic extraction + `elicitationBus` instance (D10)
  - Capability negotiation: `x-supports-elicitation` header check in route handlers (D11)
  - Credential detection + blocking + resume in `Agent.getMcpTool()` (gated by `supportsElicitation`)
  - Fallback path: immediate tool error to LLM when header absent
  - Response endpoint (`POST /run/api/elicitation-responses`) + message-part fast-path
  - Auth URL generation (hosted auth page, D8)
  - Widget auth prompt rendering (sends `x-supports-elicitation: true`)
  - Slack auth prompt rendering (sends `x-supports-elicitation: true`)
  - OTel instrumentation
  - Tests: unit tests for schema, manager, stream helpers, capability negotiation; integration test for full elicitation lifecycle
- **Out of scope:** MCP client elicitation handler, A2A input-required, form mode, async runtime, AI SDK provider changes
- **Blockers:**
  - ~~Q1 (credential types)~~ — resolved → D7 (OAuth only)
  - ~~Q2 (auth URL strategy)~~ — resolved → D8 (hosted auth page)
  - ~~Q3 (client surfaces)~~ — resolved → D9 (Widget + Slack)
  - A4 (MCP client rebuild) — must be verified
  - A5 (credential race condition) — must be verified
- **Owner(s)/DRI:** TBD
- **Acceptance criteria:**
  - User in widget encounters user-scoped tool without credential → sees auth prompt → authenticates → tool executes successfully
  - User in Slack encounters same → sees auth message with link → authenticates → tool executes
  - Declined/timeout elicitation → tool returns descriptive error → LLM explains gracefully
  - Delegated agent with user-scoped tool → elicitation propagates to parent stream → same UX
  - Zero MCP 401 retries for missing user credentials
  - Client without `x-supports-elicitation` header → immediate tool error → LLM explains → no blocking
  - Existing AI SDK provider consumers receive no Zod parse errors from unknown event types (schema hardening)
- **Risks + mitigations:**
  - Risk: `@inkeep/agents-ui` widget changes take longer than server-side work → Mitigation: LLM text fallback (like PR 2291) works even without widget support; ship server-side first
  - Risk: OAuth popup/redirect blocked by browser → Mitigation: hosted page can use full-page redirect as fallback; test across browsers
  - Risk: Credential race condition (A5) → Mitigation: retry credential lookup with short backoff after elicitation response

### Phase 2: Protocol adapters + form mode

- **Goal:** Enable MCP client elicitation passthrough, A2A input-required/auth-required production/consumption, and form-mode structured input.
- **In scope:**
  - McpClient capability registration (`{ elicitation: { form: {}, url: {} } }`)
  - McpClient `elicitation/create` handler → emits `elicitation-request` on stream/bus
  - A2A client: detect `input-required`/`auth-required` task states → emit `elicitation-request`
  - A2A handler: `generateTaskHandler` can produce `input-required`/`auth-required` states
  - `tasks/get` real implementation (reads from DB)
  - Form-mode client UI rendering (widget, copilot)
  - AI SDK provider `elicitation-request` handling
- **Acceptance criteria:**
  - External MCP server sends `elicitation/create` during tool call → user sees prompt → responds → MCP server receives result
  - External A2A agent returns `input-required` → user sees prompt → responds → task resumes
  - Our A2A endpoint returns `auth-required` when credentials missing → external client handles it
- **Risks:** MCP server session management (stateless transport in `/run/v1/mcp`); A2A `tasks/get` implementation scope.

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Widget update delays block user-facing value | Medium | High | Server-side + Slack can ship independently. LLM text fallback provides partial value without widget changes. | TBD |
| OAuth popup blocked by browsers | Low | Medium | Full-page redirect fallback on hosted auth page. Detect popup blocker and switch. | TBD |
| Credential race condition (token not stored when completion signal sent) | Medium | Medium | Retry credential lookup with 500ms backoff, 3 attempts after elicitation response. | TBD |
| Stream timeout during long OAuth flows | Low | Medium | 10-minute timeout (same as tool approvals). No heartbeat — relies on TCP keepalive (same as tool approvals). Slack clears its stream timeout on elicitation start. | TBD |
| Breaking change if event schema needs revision | Low | High | Thorough schema review before Phase 1 merge. Schema is a 1-way door. | TBD |
| PendingElicitationManager memory leak on abandoned streams | Low | Low | Cleanup interval (2 min) with TTL. Same pattern as PendingToolApprovalManager which has not had issues. | TBD |

## 15) Appendices (documented deferrals)

### D1: MCP server → client elicitation (Phase 3)
- **What we learned:** Our MCP server endpoint (`/run/v1/mcp`) declares no capabilities for server→client callbacks. The `BufferingStreamHelper` cannot support interactive events. The transport is stateless (fresh per request).
- **Why deferred:** Requires significant MCP server architecture changes. Low demand — external MCP clients rarely need our agents to request input.
- **Trigger to revisit:** When customers use our agents via MCP clients that support elicitation capability.
- **Implementation sketch:** Add `McpServer` capabilities for elicitation. Modify `BufferingStreamHelper` to support blocking interactive events or switch to a persistent transport.

### D2: Async runtime elicitation
- **What we learned:** The current runtime is synchronous (Promise-based blocking within a single HTTP request). The planned async runtime would persist task state and support long-running elicitation. The `elicitationId` schema field is designed to work in both models.
- **Why deferred:** Async runtime is a separate, larger initiative. The schema is forward-compatible.
- **Trigger to revisit:** When async runtime ships. The migration path: replace `PendingElicitationManager` (in-memory) with DB-persisted elicitation state, keyed by `elicitationId`. No client-facing changes needed.

### D3: Form-mode elicitation with structured schemas
- **What we learned:** MCP defines `requestedSchema` with flat JSON Schema (primitives only). A2A has open issue #813 for structured schemas. Form mode enables collecting configuration values, project selection, disambiguation — beyond credentials.
- **Why deferred:** Phase 1 only needs URL mode for credential flows. Form mode requires client-side dynamic form rendering which is significant UI work.
- **Trigger to revisit:** When an MCP server our agents call sends form-mode `elicitation/create`, or when we identify a product use case for structured input collection mid-chat.

### D4: A2A Extensions for structured elicitation
- **What we learned:** A2A `input-required` uses freeform messages with no schema. The A2A extension mechanism allows adding JSON Schema-based input definitions. No such extension exists yet.
- **Why deferred:** A2A extension design is a community effort. We should implement the basic A2A input-required support first (Phase 2) and propose the extension based on real usage.
- **Trigger to revisit:** After Phase 2 A2A support is live and we have data on what structured input patterns are needed.
