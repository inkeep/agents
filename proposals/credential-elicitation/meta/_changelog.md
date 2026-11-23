# Spec Changelog

## 2026-02-24 — Session 1: Intake + Initial Investigation

- **Intake:** User described the problem: user-scoped MCP credentials with no runtime elicitation flow. Chats error out when user-level auth is missing. User's initial direction: new SSE event type, but unsure whether to model as data component, tool call, or new primitive.
- **Investigation dispatched (3 parallel):** credential system trace, SSE event inventory, tool approval pattern trace.
- **Evidence captured:**
  - `evidence/credential-system.md` — full credential resolution flow, current failure mode
  - `evidence/tool-approval-pattern.md` — complete tool approval lifecycle as reference architecture
  - `evidence/sse-event-inventory.md` — all 15 event types, blast radius for adding new ones
- **Key finding:** Tool approval pattern is a near-perfect architectural blueprint. The "pause stream, emit event, block on Promise, resume on client response" pattern is proven and can be adapted.

## 2026-02-24 — Session 1: MCP Protocol + AI SDK Research

- **Research dispatched:** MCP elicitation protocol, MCP auth framework, Vercel AI SDK v6 MCP support.
- **Evidence captured:**
  - `evidence/mcp-elicitation-protocol.md` — MCP's two-mode elicitation primitive (form + URL), security model, capability negotiation
  - `evidence/ai-sdk-elicitation-gap.md` — AI SDK v6 has MCP elicitation server-side but NO stream protocol support for UI propagation
- **Key findings:**
  1. MCP has a stable two-mode elicitation primitive: form mode (structured data, in-band) and URL mode (sensitive data, out-of-band via browser). URL mode is specifically designed for credential/auth flows.
  2. MCP mandates sensitive credentials NEVER transit the client — server stores them directly via out-of-band browser flow.
  3. AI SDK v6 supports `onElicitationRequest` server-side but has zero UI propagation through the data stream protocol — this is exactly the gap we fill.
  4. MCP's `URLElicitationRequiredError` (-32042) enables stateless servers to signal "auth needed" as an error response.

## 2026-02-24 — Session 1: PR 2291 Analysis

- **PR 2291 reviewed:** `feat/tool-auth-error-propagation` — 674 additions, 4 commits
- **Evidence captured:** `evidence/pr-2291-analysis.md`
- **Key finding:** PR 2291 is a fire-and-forget notification approach (`tool-auth-required` event), NOT a blocking elicitation flow. It short-circuits tool execution with a placeholder tool, emits a notification event, and the LLM explains the auth error in text. No pause, no resume, no interactive auth.

## 2026-02-24 — Session 1: MCP Elicitation Chaining + Agent-as-MCP-Server Investigation

- **Research dispatched:** MCP elicitation chaining spec, agent-as-MCP-server architecture
- **Evidence captured:**
  - `evidence/mcp-elicitation-chaining.md` — MCP spec has NO chaining behavior. Each hop is independent.
  - `evidence/agent-mcp-architecture.md` — Our agents expose as MCP servers but have ZERO elicitation/sampling capability.
- **Key finding:** ToolApprovalUiBus + PendingManager pattern is directly reusable for elicitation at every level.

## 2026-02-24 — Session 1: A2A Protocol Investigation

- **Evidence captured:** `evidence/a2a-input-required.md`
- **Key findings:** A2A has BOTH `input-required` AND `auth-required` as first-class task states. Our codebase has them in the enum but NEVER uses them.

## 2026-02-24 — Session 1: SPEC.md Draft Written

- **6 confirmed decisions** (D1-D6), **5 open questions** (Q1-Q5), **5 active assumptions** (A1-A5).

## 2026-02-24 — Session 1: Q1-Q3 Resolved, Q4 Detailed

- **Q1 resolved → D7:** OAuth (Nango) only for Phase 1.
- **Q2 resolved → D8:** Hosted auth page.
- **Q3 resolved → D9:** Widget + Slack for Phase 1.
- **Q4 detailed:** Three options presented — (A) Generalize bus with rename, (B) Parallel bus, (C) Generic typed `InProcessEventBus<T>`.

## 2026-02-25 — Session 2: Q4 Resolved

- **Q4 resolved → D10:** Generic typed `InProcessEventBus<T>`. Extract bus class as generic, create separate typed instances.

## 2026-02-25 — Session 2: Q5 Resolved, Schema Hardening Discovered

- **Deep exploration dispatched:** Traced tool approval negotiation (none), client entry points (7 types), unknown event handling per protocol, existing opt-in precedent (`x-emit-operations`), keepalive mechanisms (none).
- **Evidence captured:** `evidence/capability-negotiation.md`
- **Critical finding:** `StreamEventSchema` uses `z.discriminatedUnion` which rejects unknown `type` values. Adding ANY new stream event type breaks deployed AI SDK provider consumers with Zod parse errors.
- **Q5 resolved → D11:** Opt-in header `x-supports-elicitation: true`. Follows `x-emit-operations` precedent.
- **New Q6 resolved → D12:** Schema hardening with catch-all passthrough in `StreamEventSchema`.
- **All open questions resolved.** 12 confirmed decisions (D1-D12).

## 2026-02-25 — Session 2: Technical Accuracy Verification

- **Verification dispatched (4 parallel tracks):** credential system (8 assertions), stream/event system (10 assertions), tool approval + bus (9 assertions), MCP/A2A architecture (11 assertions).
- **Result: 37/38 CONFIRMED, 1 CONTRADICTED (factual correction).**
- **Corrections applied:** NFR Reliability removed false heartbeat claim; D10 file count updated 6 → 7.
- **Spec is verified against current codebase.**

## 2026-02-25 — Session 2: PR 2291 Re-analysis

- **4 new commits since initial analysis:** event renamed `tool-auth-required` → `data-tool-auth-required`, nested `data` envelope added, VercelDataStreamHelper no longer a no-op, dual error messages (LLM vs UI).
- **PR-2291-COMPARISON.md created** for sharing with PR authors.
- **No design conflicts** — PR 2291 remains fire-and-forget notification; coexists as degraded-mode fallback.
