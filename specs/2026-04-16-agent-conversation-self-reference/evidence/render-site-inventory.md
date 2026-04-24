---
name: TemplateEngine.render() call-site inventory
description: Enumeration of every TemplateEngine.render() caller in the repo — which are agent-prompt render sites, which handle other templating (headers, credentials, URLs) — to scope where $conversation.* should resolve.
type: factual
sources:
  - Worldmodel subagent investigation 2026-04-16 (a17319c1018e52c44)
captured: 2026-04-16
baseline: 2abfdf44e
---

# All 8 `TemplateEngine.render()` call sites

| # | Caller | File:line | Classification | Context passed | Mode |
|---|---|---|---|---|---|
| 1 | Sub-agent's own prompt (`corePrompt`) | `agents-api/src/domains/run/agents/generation/system-prompt.ts:207` | **Agent prompt** | `resolvedContext` (from `getResolvedContext`) | lenient |
| 2 | Overarching agent system prompt | `agents-api/src/domains/run/agents/generation/system-prompt.ts:298` | **Agent prompt** | `resolvedContext` | lenient |
| 3 | Relation-tool (A2A delegation) header rendering | `agents-api/src/domains/run/agents/relationTools.ts:383` | **Non-prompt** — delegate config headers | `{ headers, contextVariable }` via `resolveHeaders()` | **strict** |
| 4 | Context-fetcher URL / body interpolation | `agents-api/src/domains/run/context/ContextFetcher.ts:281` | **Non-prompt** — outbound fetch definition | Pre-resolution contextVariable loop | lenient |
| 5 | Credential stuffer header templating (MCP credentials) | `packages/agents-core/src/credential-stuffer/CredentialStuffer.ts:215` | **Non-prompt** — MCP auth headers | `{ headers: headersContext }` | **strict** |
| 6 | `TemplateEngine.preview()` helper | `packages/agents-core/src/context/TemplateEngine.ts:236` | Self-reference (preview utility) | Caller-supplied | either |
| 7 | TemplateEngine unit tests | `packages/agents-core/src/__tests__/context/TemplateEngine.test.ts` | **Test** | various | various |
| 8 | CredentialStuffer tests | `packages/agents-core/src/__tests__/credentials/credentialStuffer.test.ts:44` | **Test** | various | various |

# Scope implication

Two distinct architectural choices:

**Option A — Per-site merge** (inject `$conversation` into `contextWithBuiltins` only at `system-prompt.ts:61–64` and/or at the two render sites):
- `$conversation` resolves ONLY at sites #1 and #2 (agent prompts).
- Sites #3–#5 continue to see only their scoped contexts (headers, credentials, URLs).
- Minimal blast radius; matches the narrow v1 scope.

**Option B — Extend `processBuiltinVariable`** (add `$conversation.*` as a static built-in inside `TemplateEngine.ts`, similar to `$env`):
- `$conversation` resolves at **all 8 call sites** including MCP credential headers and outbound fetch URLs.
- Requires threading conversationId into a static method — not the current extension pattern.
- Exposes conversationId to header/URL/credential templating — probably surprising, possibly unwanted.

**Recommendation:** Option A. Confines self-reference to prompt context where the user-visible use case lives; avoids accidentally leaking conversationId into MCP authentication headers or context-fetcher URLs. Register as a scope invariant in the spec (D5).

# Known fallback shapes of `conversationId` at render time

- **`'default'` sentinel** — two sites only: `generateTaskHandler.ts:385` and `AgentSession.ts:983` (`conversationId: this.contextId || 'default'`). Prior claim that `AgentSession.ts:1151, 1476, 1705` were sentinel sites was wrong — those lines pass through already-resolved `contextId` without the fallback. When the sentinel fires, ambient block is omitted per Q1 resolution.
- **`undefined`** — `Agent.test.ts:574, 640, 671, 713` — tests invoke `buildSystemPrompt` with `runtimeContext: undefined`.
- **Fresh `contextId = generateId()`** — A2A sub-agent delegation: `a2a/handlers.ts:383, 492, 650, 791` generates a new contextId when the parent doesn't propagate one. Sub-agent's `{{$conversation.id}}` resolves to the sub-agent's synthetic contextId, not the user's original conversationId.
- **Synthesized in compression** — `BaseCompressor.ts:413, 419` uses `this.conversationId` as-is.
- **Eval replay** — `conversationEvaluation.ts:42–74` replays conversations; the ID at render time is the eval's synthetic ID, not the original.
