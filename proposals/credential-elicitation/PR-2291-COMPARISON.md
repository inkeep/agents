# Elicitation Spec vs PR 2291 — Divergences & Reasoning

## What PR 2291 does well

PR 2291 identifies the right problem and establishes useful infrastructure: the placeholder tool pattern (short-circuit with "DO NOT RETRY"), the dual LLM/UI error messages, and the `data-tool-auth-required` stream event for notifying clients. The Slack block rendering is solid.

## Where the spec diverges

### 1. Blocking elicitation vs fire-and-forget notification

PR 2291 emits a notification and moves on — the LLM explains the error in text, and the user has to leave, authenticate elsewhere, and start a new conversation.

The spec introduces **blocking**: the agent pauses execution, waits for the user to authenticate (up to 10 minutes), then resumes and executes the original tool call — all within the same conversation.

**Why:** The notification approach doesn't solve the core UX problem. Users still lose their conversation context. The tool approval pattern already proves that "pause stream -> emit event -> block on Promise -> resume on client response" works reliably in production. We're applying the same architecture to credentials.

```
PR 2291 (notification):

  User message
      |
      v
  Agent decides to call Linear tool
      |
      v
  Missing credential detected
      |
      +----> Emit data-tool-auth-required (fire-and-forget)
      |
      v
  Placeholder tool returns "DO NOT RETRY" error
      |
      v
  LLM explains: "You need to connect Linear..."
      |
      v
  Stream ends. User must leave, auth elsewhere, start new chat.


Spec (blocking elicitation):

  User message
      |
      v
  Agent decides to call Linear tool
      |
      v
  Missing credential detected
      |
      v
  Check: x-supports-elicitation header?
      |
      +-- NO ----> Immediate tool error to LLM
      |            (same outcome as PR 2291, but faster -- no placeholder tool)
      |
      +-- YES
      |     |
      |     v
      |   Emit elicitation-request { mode: 'url', url: <auth page> }
      |     |
      |     v
      |   +-------------------------------------+
      |   |  STREAM PAUSED (Promise blocks)      |
      |   |                                      |
      |   |  Client shows: "Linear requires      |
      |   |  authentication. [Connect ->]"        |
      |   |                                      |
      |   |  User clicks -> popup opens ->        |
      |   |  OAuth flow completes -> Nango         |
      |   |  stores token                        |
      |   |                                      |
      |   |  Client sends elicitation-response    |
      |   |  { action: 'accept' }                |
      |   +-------------------------------------+
      |     |
      |     v
      |   Re-resolve credential ----> found!
      |     |
      |     v
      |   Rebuild MCP config with auth headers
      |     |
      |     v
      |   Execute original tool call
      |     |
      |     v
      |   Tool result streams back
      |     |
      |     v
      |   Agent continues response normally
      |
      v
  Conversation continues uninterrupted.
```

### 2. General `elicitation-request` primitive vs credential-specific `data-tool-auth-required`

PR 2291 creates a credential-specific event type. The spec introduces a general `elicitation-request` with a `mode` field (`url` for auth flows, `form` for structured input in the future).

**Why:** Our agents are also MCP servers and A2A endpoints. MCP has `elicitation/create` (two modes: form + URL). A2A has `input-required` and `auth-required` task states. All three protocols need the same internal mechanism. A credential-specific event would require separate events for each trigger:

```
One primitive, three protocol surfaces:

  +------------------------------------------------------+
  |              PROTOCOL ADAPTERS (Phase 2)              |
  |                                                      |
  |  Stream/SSE          MCP Protocol      A2A Protocol  |
  |  elicitation-request  elicitation/create  input-required  |
  |  elicitation-response ElicitResult      auth-required |
  +--------+-----------------+------------------+--------+
           |                 |                  |
           v                 v                  v
  +------------------------------------------------------+
  |         INTERNAL ELICITATION PRIMITIVE                |
  |                                                      |
  |  elicitation-request                                 |
  |    mode: 'url'  -> credential auth (Phase 1)         |
  |    mode: 'form' -> structured input (Phase 2)        |
  |                                                      |
  |  Triggers:                                           |
  |    1. Credential detection (Phase 1)                 |
  |    2. MCP server sends elicitation/create (Phase 2)  |
  |    3. A2A agent returns input-required (Phase 2)     |
  +------------------------------------------------------+
```

A `data-tool-auth-required` event only covers trigger #1. We'd need separate events for #2 and #3, fragmenting the client handling.

### 3. Capability negotiation (`x-supports-elicitation` header)

PR 2291 has no negotiation — it emits the event unconditionally. The VercelDataStreamHelper was originally a no-op (to avoid crashing the widget) but the latest commits now emit to all stream types.

The spec gates on an `x-supports-elicitation: true` request header. If absent, we skip the blocking flow entirely and return an immediate tool error to the LLM.

**Why:** Blocking for 10 minutes on a client that doesn't understand the event is worse than today's behavior. Third-party OpenAI-compatible API consumers would see JSON garbage in `delta.content` followed by a 10-minute silent hang. The `x-emit-operations` header is already an established precedent in the codebase for exactly this pattern.

### 4. `StreamEventSchema` hardening

PR 2291 adds `DataToolAuthRequiredEventSchema` to the `z.discriminatedUnion`. Any deployed AI SDK provider consumer that hasn't updated their package version will get Zod parse errors for the new event type.

The spec adds a catch-all passthrough to the `discriminatedUnion` so that unknown event types pass validation as generic objects. This fixes a pre-existing brittleness — any new event type (not just ours) would break deployed consumers without it.

## What coexists

If PR 2291 merges first, the `data-tool-auth-required` notification event becomes a useful **fallback signal** for the non-elicitation path. When a client doesn't send `x-supports-elicitation`, the spec's behavior is: return immediate tool error to LLM + the existing notification event can still fire. The two approaches aren't mutually exclusive — PR 2291's notification is the "degraded mode" and the spec's blocking flow is the "full experience."

## Summary table

| Dimension | PR 2291 | Spec |
|---|---|---|
| Mechanism | Fire-and-forget notification | Blocking with Promise + resume |
| In-conversation recovery | No | Yes |
| Event name | `data-tool-auth-required` | `elicitation-request` |
| Scope | Credential-specific | General (credentials, MCP passthrough, A2A) |
| Capability negotiation | None | `x-supports-elicitation` header |
| Schema forward-compat | No (breaks deployed consumers) | Catch-all passthrough |
| Affected clients | All stream types | Only opted-in clients |
| Phase 1 value | User sees error explanation | User authenticates and tool executes |
