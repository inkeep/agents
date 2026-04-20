---
name: Template engine internals and agent-prompt render sites
description: How TemplateEngine.render() resolves variables, the contextWithBuiltins extensibility seam, where agent prompt rendering happens, and the contextConfigId gate.
type: factual
sources:
  - public/agents/packages/agents-core/src/context/TemplateEngine.ts
  - public/agents/agents-api/src/domains/run/agents/generation/system-prompt.ts
captured: 2026-04-16
baseline: 2abfdf44e
---

# TemplateEngine internals

`public/agents/packages/agents-core/src/context/TemplateEngine.ts`

## Render pipeline

- **Entry:** `TemplateEngine.render(template, context, options?)` — static method, line 24.
- **Variable match:** `/\{\{([^}]+)\}\}/g` — line 63.
- **Built-in dispatch:** any path starting with `$` routes to `processBuiltinVariable` — line 68–69.
- **Normal path:** normalized and evaluated as JMESPath against the `context` arg — line 72–76.
- **Lenient vs strict** (default lenient) — line 29, 38:
  - Lenient: unresolved variables become empty strings; warning logged (line 88–109).
  - Strict: throws with variable name.

## Built-in variables (the seam)

`processBuiltinVariable`, line 146–160:

```ts
private static processBuiltinVariable(variable: string): string {
  if (variable.startsWith('$env.')) {
    const envVar = variable.substring(5);
    return process.env[envVar] || '';
  }
  logger.warn({ variable }, 'Unknown built-in variable');
  return '';
}
```

**Key fact:** Only `$env.*` is a real built-in. Any other `{{$<something>}}` logs "Unknown built-in variable" and returns empty.

**Implication for `$conversation`:**
- An earlier iteration of this evidence claimed that merging `$conversation` into the render-time `context` object would let JMESPath resolve `{{$conversation.id}}` automatically. **That claim was wrong** — `$`-prefixed paths are intercepted at `TemplateEngine.ts:67–70` BEFORE JMESPath runs, so anything `$`-prefixed in the context object is dead code path. Correct approach per current D7: add `runtimeBuiltins?: Record<string, unknown>` to `TemplateRenderOptions`; in the `$`-prefix intercept, check `options.runtimeBuiltins` via a direct dotted-path walk (not JMESPath — the `$` prefix doesn't play well with JMESPath identifier rules); fall through to `processBuiltinVariable` on miss. Only agent-prompt render sites pass `runtimeBuiltins`; D6 scope invariant enforced at the caller.

## `{{contextVariable.*}}` and `{{headers.*}}` are NOT hardcoded namespaces

These patterns resolve because the `ContextResolver` output produces a `resolvedContext` object whose top-level keys happen to be `contextVariable` and `headers`. JMESPath resolution walks the object. There is no reserved-namespace logic in `TemplateEngine` itself.

# Agent-prompt render sites

`public/agents/agents-api/src/domains/run/agents/generation/system-prompt.ts`

## `buildSystemPrompt` — two render sites

1. **Line 207** — sub-agent's own prompt:
   ```ts
   processedPrompt = TemplateEngine.render(ctx.config.prompt, resolvedContext, {
     strict: false,
     preserveUnresolved: false,
   });
   ```
   This becomes `corePrompt` in the final system prompt (line 337).

2. **Line 298** — overarching agent system's prompt:
   ```ts
   prompt = TemplateEngine.render(prompt, resolvedContext, {
     strict: false,
     preserveUnresolved: false,
   });
   ```
   This becomes `prompt` (rendered into `<agent_context>` section) in the final system prompt (line 338).

Both sites use `resolvedContext` — the output of `getResolvedContext()`.

## The `contextConfigId` gate

`getResolvedContext`, line 21–90:

```ts
if (!ctx.config.contextConfigId) {
  logger.debug('No context config found for agent');
  return null;                                    // ← early return
}
```

**Effect:** When no `contextConfigId`, `getResolvedContext` returns `null`. Both render sites are guarded (`if (resolvedContext && ...)`) — when `null`, neither render runs. Prompts pass through unchanged. This is the gate that must be unwired for G2 (self-reference must work without contextConfig).

## The `contextWithBuiltins` seam

`getResolvedContext`, line 61–64:

```ts
const contextWithBuiltins = {
  ...result.resolvedContext,
  $env: process.env,
};
```

**This is the extensibility seam for new builtins.** Adding `$conversation` = adding one more line here, plus restructuring the function (or its callers) so a builtins-only object is returned when `contextConfigId` is absent.

## Available runtime identifiers at render time

From `buildSystemPrompt`'s signature (line 178–197) and body:

| Identifier | Source | Notes |
|---|---|---|
| `conversationId` | `runtimeContext.metadata.conversationId` (line 198) — fallback: `runtimeContext.contextId` | Primary target for v1 |
| `contextId` | `runtimeContext.contextId` | ≠ conversationId in some A2A/task-ID encodings — avoid exposing |
| `threadId` | `runtimeContext.metadata.threadId` | Not exposed in v1 |
| `streamRequestId` | `runtimeContext.metadata.streamRequestId` | Not exposed in v1 |
| `taskId` | Passed into `runtimeContext.metadata` at call sites but **missing from the type definition** (lines 180–190 omit it) | Q6 in current spec (was Q7 pre-α-pivot) — bundle type fix with implementation |
| `tenantId` | `ctx.config.tenantId` | Not exposed in v1 |
| `projectId` | `ctx.config.projectId` | Not exposed in v1 |
| `agentId` | `ctx.config.agentId` | Not exposed in v1 |

## Other TemplateEngine.render() callers

Not yet traced. Open question Q3 will enumerate them via Grep. Hypotheses to confirm:
- Tool argument templating (if any).
- Status messages / streaming updates.
- Output schema / structured-output templating.
- CLI `pull-v4` round-trip (agents-cli/src/commands/pull-v4/utils/templates.ts:28 TODO).

# Restructuring options for G2 (works without contextConfigId)

Two mechanical options surfaced during intake:

**Option A — Move builtins merge outside `getResolvedContext`.** Apply at both render sites regardless of `getResolvedContext` return value. Semantics: builtins always available; user context only available if contextConfig exists. Cleanest; preserves existing contextConfigId-null short-circuit for user-context resolution.

**Option B — Restructure `getResolvedContext` to return a minimal builtins-only object when `contextConfigId` is absent.** Return `{ $env, $conversation: { id } }` instead of `null`. More invasive to the function's contract (null-return is load-bearing at callers); higher blast radius.

Recommendation (tentative, pending Q1 blast-radius trace): Option A.
