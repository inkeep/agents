---
name: Downstream surfaces — UI prompt editor, CLI pull-v4, observability
description: Silent-failure modes where $conversation.id would "just work" at runtime but break at UI editing or CLI round-trip. AGENTS.md mandates both surfaces get updated for any new feature.
type: factual
sources:
  - Worldmodel subagent investigation 2026-04-16 (a17319c1018e52c44)
captured: 2026-04-16
baseline: 2abfdf44e
---

# 1. Agent Manage UI — Prompt Editor (Monaco)

## Silent-failure mode

`{{$conversation.id}}` would render as a **red squiggly "Unknown variable" error** in the prompt editor, even though it resolves correctly at runtime.

## Evidence

- **Lint allowlist** — `agents-manage-ui/src/components/editors/prompt-editor.tsx:45` hardcodes `variableName.startsWith('$env.')` as the only valid `$`-prefixed variable. Anything else produces an "Unknown variable" marker.
- **Autocomplete source** — `agents-manage-ui/src/features/agent/state/use-monaco-store.ts:186` hardcodes `$env.` as the sole `$`-prefix completion.
- **Cypress assertion** — `agents-manage-ui/cypress/e2e/agent-prompt.cy.ts:21, 26` asserts `$env.` in the suggest list and no squiggly on `{{$env.MY_ENV}}` but squiggly on `{{unknown}}`.
- **Context-variable suggestions** — `agents-manage-ui/src/lib/context-suggestions.ts:75` builds suggestions only from `contextVariables` + `headersSchema`. Agents without a `contextConfig` have no autocomplete suggestions *at all* beyond the hardcoded `$env.`.

## Required v1 changes

- Extend the prompt-editor lint allowlist to accept `$conversation.id` (and future `$conversation.*`).
- Add `$conversation.id` to Monaco autocomplete suggestions — **unconditionally** (not gated on contextConfig presence, matching G2).
- Update the Cypress test to verify `$conversation.id` renders without squiggly.

## Adjacent signal — UI allowlist centralization

`$env.` is hardcoded at **three separate UI sites** (lint, autocomplete, test). Each new builtin requires three edits. No central "registered builtins" constant exists. The right future-work move is a shared `BUILTIN_TEMPLATE_PREFIXES` constant in `agents-core` that both runtime and UI consume. Out of v1 scope unless you want it — but worth noting as the next avoidable pain point.

# 2. Agents CLI — `pull-v4` round-trip

## Silent-failure mode

`{{$conversation.id}}` authored in the Manage UI → pulled via `inkeep pull` → committed to code → pushed via `inkeep push` results in an **agent prompt that no longer references `$conversation.id`**. The variable is silently rewritten to a user contextVariable lookup; customer doesn't notice until runtime produces an empty string in the tool call.

## Evidence

`agents-cli/src/commands/pull-v4/utils/templates.ts:11, 28, 64–78`:

- Line 11 — `TEMPLATE_VARIABLE_REGEX = /\{\{(?!\{)(?<variableName>[^{}]+)}}/g` matches `{{$conversation.id}}`.
- Line 28 — TODO comment: "should escape variables except when we inject context variables and headers" — acknowledges the existing escaping design is incomplete.
- Lines 64–78 — branches on `variableName.startsWith('headers.')`; **everything else** (including `$env.*` today!) falls through to `contextReference.toTemplate(variableName)`, which produces `${contextReference.toTemplate("...")}` string.

**Implication:** `$env.MY_ENV` is *already* latently broken in the CLI round-trip (not yet observed because no one has pulled an agent that uses it). Adding `$conversation.id` would hit the same code path.

## Required v1 changes

- `pull-v4/utils/templates.ts` branches must recognize `$`-prefixed builtins and preserve them verbatim (alongside the existing `headers.` branch).
- Add regression test covering round-trip of `{{$conversation.id}}`.
- **Opportunistically fix `$env.*` preservation too** — already broken latently, same change.

# 3. Cookbook — Customer Support template

`agents-cookbook/template-projects/customer-support/agents/customer-support.ts:26–43` is the motivating example. Update as part of v1 so the reference template demonstrates the feature:

```ts
prompt: `... When creating a Zendesk ticket, include a link back to this conversation:
https://<your-inkeep-host>/conversations/{{$conversation.id}} ...`
```

Acts as both documentation and a regression fixture.

# 4. Observability — Langfuse

- Inkeep integrates Langfuse via OTEL (`agents-docs/content/guides/observability/langfuse-usage.mdx`, `agents-cookbook/evals/langfuse-dataset-example/`).
- Langfuse ingests full prompt text. Rendered `$conversation.id` will appear verbatim in prompt payloads.
- `conversation.id` was already a span attribute (`chat.ts:227, 241`, `chatDataStream.ts:288, 303`) — no new data leaves the tenant, but the surface expands from "metadata field" to "inline in prompt body."
- No integration change required. Note-worthy for privacy-conscious customers; not blocking.

# 5. Documentation

- No central "template variables" reference page exists in `agents-docs/content/`. Grep: zero hits for `$env` across `agents-docs/content/`. `{{contextVariable.*}}` and `{{headers.*}}` are mentioned only incidentally in feature guides.
- v1 delivery should include a new docs page (or new section) centralizing the template-variable vocabulary: `{{contextVariable.*}}`, `{{headers.*}}`, `{{$env.*}}` (finally documented), `{{$conversation.id}}`.
- Mandatory per `public/agents/AGENTS.md` "Development Guidelines → MANDATORY: Required for All New Features."

# Summary of v1-mandated downstream changes

| Surface | Change | Severity if omitted |
|---|---|---|
| Prompt editor lint | Allow `$conversation.*` | **High** — visible red squiggly on valid variable |
| Prompt editor autocomplete | Suggest `$conversation.id` | Medium — discoverability gap |
| Cypress test | Cover `$conversation.id` path | Low — regression protection |
| CLI `pull-v4` templates.ts | Preserve `$`-prefixed builtins on round-trip | **High** — silent data loss |
| Cookbook customer-support | Use `$conversation.id` as reference impl | Medium — discoverability gap |
| agents-docs | Create central template-variable reference | Medium — mandatory per AGENTS.md |
| Changesets | `pnpm bump minor --pkg agents-core --pkg agents-api` (+ agents-cli if touching CLI) | **High** — required per AGENTS.md |
