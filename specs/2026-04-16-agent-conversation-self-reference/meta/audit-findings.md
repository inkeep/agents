# Audit Findings

**Artifact:** /Users/timothycardona/inkeep/agents-private/public/agents/specs/2026-04-16-agent-conversation-self-reference/SPEC.md
**Audit date:** 2026-04-16
**Baseline commit:** 2abfdf44e (as stamped in SPEC.md)
**Total findings:** 10 (1 High, 5 Medium, 4 Low)

This is a **re-audit of the β-pure design** (template-variable-only). The prior `audit-findings.md` file covered the earlier α (ambient injection) design and was a distinct artifact; this file overwrites it. Prior-era findings are preserved in `meta/_changelog.md`. The audit below was produced cold against the current SPEC only.

---

## High Severity

### [H] Finding 1: G4 "zero drift for agents without the variable" is not structurally guaranteed when the G2 guard is restructured

**Category:** COHERENCE (internal consistency) + FACTUAL (code behavior)
**Source:** L1 (Cross-finding contradictions) + T1 (Own codebase)
**Location:** SPEC.md §2 (G4), §6 Functional row "Implementation is additive", §9 "Render path when agent has no contextConfigId (G2)", §13 deployment row "Zero-drift on existing agents", §14 risk row "`buildSystemPrompt` restructure regresses..."
**Issue:** The spec claims G4 ("Customers who don't reference `{{$conversation.id}}` in any prompt see zero behavior change. No ambient context, no automatic injection, no drift.") is structurally guaranteed. But the proposed G2 fix changes the guard at `system-prompt.ts:205` and `:296` from `if (resolvedContext && ctx.config.prompt)` to "runs whenever `ctx.config.prompt` contains `{{...}}`, even if `resolvedContext` is null." Under the current code, when `resolvedContext === null` (agents without `contextConfigId`), `TemplateEngine.render` is **never called** — so any `{{...}}` in the prompt passes through verbatim to the LLM.

Under the proposed restructure, `TemplateEngine.render(prompt, {} /* or runtimeBuiltins-only context */, { strict: false, preserveUnresolved: false })` would be called. In lenient mode, any `{{...}}` that doesn't resolve returns empty string (TemplateEngine.ts:110). That means an existing customer agent without a `contextConfigId` that happens to have the literal text `{{anything}}` in its prompt (even spurious occurrences, an embedded JSON example with literal `{{` delimiters, a mistake the customer never noticed because the prompt worked, or any intentional use of `{{contextVariable.foo}}` that was silently no-op) will get different rendered output pre/post change:

- **Today:** `{{foo}}` reaches the LLM verbatim.
- **After fix:** `{{foo}}` is replaced with empty string (or with `processBuiltinVariable`'s empty fallback if it starts with `$`).

This is behavior drift for agents that do not reference `$conversation.id`, violating G4's "No ambient context, no automatic injection, no drift" claim.

**Current text:** §2 G4: "Customers who don't reference `{{$conversation.id}}` in any prompt see **zero behavior change.**" §9 System design: "Fix: restructure so template rendering runs whenever `ctx.config.prompt` (or the overarching agent prompt) contains `{{...}}`, even if `resolvedContext` is null."

**Evidence:** `system-prompt.ts:204-221` — today's guard skips rendering entirely when `resolvedContext === null`. `TemplateEngine.ts:78-110` — lenient mode returns empty string for unresolved variables. Any existing no-contextConfig agent with literal `{{...}}` in its prompt would shift from verbatim-passthrough to empty-substitution.

**Status:** INCOHERENT — G2's proposed restructure and G4's "zero drift" guarantee are in tension. Whether this matters in practice depends on whether any production agent without contextConfig has `{{...}}` in its prompt; but the spec claims a structural guarantee that the code path does not deliver.

**Suggested resolution:** Either (a) narrow the G2 restructure to only run `TemplateEngine.render` when `runtimeBuiltins !== undefined`, preserving today's behavior when conversationId is degenerate AND contextConfig is absent; (b) restructure to preserve existing behavior by only rendering when the prompt contains a `{{$}}` substring or explicitly contains `{{$conversation.`; or (c) explicitly acknowledge the edge case in G4 and §13 as an accepted trade-off. The regression-eval release gate in §7.2 would likely catch this if it exercises no-contextConfig agents, but the spec should say so explicitly.

---

## Medium Severity

### [M] Finding 2: Render-site line citations in §6 requirements row 1 refer to today's line numbers, but the proposed restructure changes the line layout

**Category:** COHERENCE
**Source:** L1 (Cross-section)
**Location:** SPEC.md §6 Functional row 1, §9 System design, §10 D4 rationale, §16 SCOPE row 3
**Issue:** The spec references three slightly different sets of line numbers for the same two render sites:
- §6 row 1: `system-prompt.ts:207` and `:298`
- §8 Current state: line 207 and 298, and guards at `205, 296`, and G2 guard at line 29
- §9 System design: "both `TemplateEngine.render()` calls (line 207 and 298)"
- §10 D4 rationale: `system-prompt.ts:29, 205, 296`
- D7 rationale: `TemplateEngine.ts:68–69`
- §9 also says "line 63–69" and §16 says "lines 67–69" for the TemplateEngine `$`-prefix dispatch

For `TemplateEngine.ts`, the actual `$`-prefix dispatch is at lines 67–70 (not 67–69, 68–69, or 63–69). The inconsistent citations within the spec are a minor clarity issue. More load-bearing: once the G2 guard is restructured, the render-site line numbers will shift — so the spec's "line 207 / :298" is a moving target for implementers.
**Current text:** See §6, §8, §9, §10, §16 for various line citations.
**Evidence:** TemplateEngine.ts:63 is `return template.replace(...)`, :67 is the comment, :68 is `if (trimmedPath.startsWith('$')) {`, :69 is `return TemplateEngine.processBuiltinVariable(trimmedPath);`, :70 is `}`. Three different ranges (63–69, 67–69, 68–69) appear across sections for the same dispatch.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Pick one line range for the TemplateEngine.ts dispatch (either 68–70 or "the `$`-prefix branch at lines 67–70") and use it consistently. For the system-prompt.ts call sites, consider tying the citation to the code symbol (`TemplateEngine.render` call inside `buildSystemPrompt`) rather than the line number, since the restructure will shift lines.

---

### [M] Finding 3: The spec's "via JMESPath" lookup for `$conversation.id` against `runtimeBuiltins` is technically imprecise — JMESPath does not accept `$` as an identifier character

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** SPEC.md §9 "System design", D7 rationale, §16 SCOPE row 1
**Issue:** The spec says: "In `processVariables` at line 63–69: when a `$`-prefixed path is matched, first check `options.runtimeBuiltins` via JMESPath" and D7: "check `options.runtimeBuiltins` first; if resolved there, return that value." §16 SCOPE: "modify the `$`-prefix dispatch at lines 67–69 to check `options.runtimeBuiltins` first via JMESPath, fall through to `processBuiltinVariable` on miss."

If implemented literally as `searchJMESPath(options.runtimeBuiltins, '$conversation.id')` against the data `{ $conversation: { id: "..." } }`, JMESPath will fail to parse `$conversation` as an identifier — the JMESPath grammar requires identifiers to start with `[A-Za-z_]`. `$` is not a legal first character for an unquoted identifier. `normalizeJMESPath` (packages/agents-core/src/utils/jmespath-utils.ts:163–185) only adds quotes when a segment contains `-`; it will not quote `$conversation`.

In practice, implementers have several straightforward workarounds (strip the `$` prefix before lookup; register data under `conversation` key without the `$`; quote the `$` segment; use plain object navigation instead of JMESPath). So this is an implementation detail, not a design blocker — but the spec's literal description does not work.

**Current text:** §9: "first check `options.runtimeBuiltins` via JMESPath; if the path resolves to a value there, return it." D7: "check `options.runtimeBuiltins` first; if resolved there, return that value."
**Evidence:** TemplateEngine.ts:68–69 shows `$`-prefix paths are intercepted and passed to `processBuiltinVariable` before `normalizeJMESPath` / `searchJMESPath` are called on line 72–76. JMESPath spec and library accept identifiers matching `[A-Za-z_][A-Za-z0-9_]*` unquoted; `$conversation` fails to parse.
**Status:** CONTRADICTED (literal description); UNVERIFIABLE (actual implementation not yet written)
**Suggested resolution:** In §9 and D7, replace "via JMESPath" with a more accurate description such as: "strip the `$` prefix and look up the remaining path in `runtimeBuiltins` using JMESPath, or use direct object navigation." Or defer the lookup mechanism to implementation and remove the "via JMESPath" commitment. The additive-param architecture is sound; the specific lookup mechanism is under-specified.

---

### [M] Finding 4: Spec's "two sites only" for the `'default'` sentinel omits a third site

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** SPEC.md §8 Current state ("two sites only"); §5 Failure/recovery ("`'default'` sentinel (`generateTaskHandler.ts:385`, `AgentSession.ts:983`)"); evidence `render-site-inventory.md` line 42
**Issue:** The spec and the evidence file claim `'default'` sentinel for `conversationId` exists at exactly two sites: `generateTaskHandler.ts:385` and `AgentSession.ts:983`. Grep on the repo finds a **third** site: `agents-api/src/domains/run/agents/tools/relation-tools.ts:57` — `conversationId: runtimeContext?.contextId || 'default'` inside the delegate-tool closure construction, fallback for missing runtimeContext.metadata. There is also a live `'default'` at the A2A handlers fallback chain (`a2a/handlers.ts:143, 150`), though that's more accurately described as a pass-through of an incoming sentinel rather than a fresh assignment.
**Current text:** §8: "`'default'` sentinel fallback exists at `generateTaskHandler.ts:385` and `AgentSession.ts:983` (two sites only)." Evidence: "two sites only: `generateTaskHandler.ts:385` and `AgentSession.ts:983`."
**Evidence:** `relation-tools.ts:55–58` contains `contextId: runtimeContext?.contextId || 'default'` AND `conversationId: runtimeContext?.contextId || 'default'` in the metadata fallback. This is a fresh assignment of the sentinel when `runtimeContext?.metadata` is undefined. It pre-dates any `buildSystemPrompt` call on the child side (this is on the parent's delegate-tool setup path), so its practical blast radius for the current feature is "supplies `'default'` as a propagated value into the A2A flow, not at the render site."
**Status:** CONTRADICTED (minor — the enumeration is incomplete)
**Suggested resolution:** Either (a) update §8 and `render-site-inventory.md` to enumerate three sites, or (b) narrow the claim to "two sites where the sentinel is assigned to the local `conversationId` variable used by `buildSystemPrompt`-adjacent code; `relation-tools.ts:57` can propagate `'default'` through the A2A path." The `isValidConversationId` guard in §9 catches all such cases at the render site — so the enumeration is documentary rather than design-load-bearing — but the spec's blanket "two sites only" is factually wrong.

---

### [M] Finding 5: Scope invariant D6 enforcement claim ("by construction") is true only at the call-site level, not at the TemplateEngine level

**Category:** COHERENCE
**Source:** L1 (Cross-section)
**Location:** SPEC.md §9 "System design" ("Scope invariant (D6) enforced by construction"), D6 description, §14 Risks row 4 ("enforced by construction — only agent-prompt callers pass runtimeBuiltins"), §16 STOP_IF row 2
**Issue:** The spec claims that scope invariant D6 (`$conversation.*` resolves only at the two agent-prompt sites) is "enforced by construction." The enforcement mechanism is: only the agent-prompt render sites pass `runtimeBuiltins`; the other three sites (`relationTools.ts:383`, `ContextFetcher.ts:281`, `CredentialStuffer.ts:215`) continue to call `TemplateEngine.render` with no `runtimeBuiltins`.

This enforcement is real but **conventional, not structural**. A future edit that adds `runtimeBuiltins` to one of the three non-prompt callers would silently violate D6 with no mechanical barrier. The TemplateEngine itself does not inspect the call site or refuse to accept `runtimeBuiltins` from non-prompt paths; it simply resolves whatever context is passed. The only check claimed in §14 mitigations is "enforce by grep" (row 3), which is a process control, not "by construction."

The contradiction: `(§9)` and `(§14 Risks row 4)` say "enforced by construction"; `(§14 Risks row 3)` says "enforce by grep." Only one of these is true.

**Current text:** §9: "Scope invariant (D6) enforced by construction." §14 row 3: "Never pass `runtimeBuiltins` at those sites; enforce by grep." §14 row 4: "enforced by construction — only agent-prompt callers pass runtimeBuiltins."
**Evidence:** `TemplateEngine.render` (TemplateEngine.ts:24–53) has no awareness of which caller invoked it; options are resolved opaquely. There is no type-level or runtime guard that would refuse `runtimeBuiltins` from `relationTools`, `ContextFetcher`, or `CredentialStuffer`.
**Status:** INCOHERENT — "by construction" overclaims the strength of the guarantee.
**Suggested resolution:** Either (a) soften the phrasing in §9 and §14 to "enforced by convention (only agent-prompt callers pass `runtimeBuiltins`) and tested by negative-path tests at the three non-prompt callers"; or (b) introduce a stronger mechanism (e.g., a branded opaque token on the `runtimeBuiltins` parameter that only the agent-prompt sites can produce; a TemplateEngine API split). Option (a) is likely what the spec means; if so, the language should match.

---

### [M] Finding 6: Requirement row 6 (Monaco lint) and current code show lint allows more than just `$env.` — the "only allows `$env.`" claim is imprecise

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** SPEC.md §6 Requirements row 6 ("current lint at `prompt-editor.tsx:45` only allows `$env.`")
**Issue:** The spec's requirement row 6 says: "current lint at `prompt-editor.tsx:45` only allows `$env.`". Inspection of the code shows lint at lines 42–49 accepts four cases as valid:
1. `validVariables.has(variableName)` — any contextVariable/header suggestion from `agentStore`
2. `variableName.startsWith('$env.')`
3. `variableName.includes('[')` — array-index syntax
4. `variableName.startsWith('length(')` — JMESPath expression

So the lint is not solely `$env.`-gated; it's `$env.` plus three other allow-paths. The spec's characterization is **narrowly correct for `$`-prefixed variables only** — among `$`-prefixed variables, only `$env.` is accepted. A more precise phrasing would clarify this.
**Current text:** §6 row 6: "current lint at `prompt-editor.tsx:45` only allows `$env.`"
**Evidence:** `prompt-editor.tsx:42-49` — the four conditions are ORed.
**Status:** CONTRADICTED (minor — the literal claim is imprecise; the operative claim is correct when scoped to `$`-prefix)
**Suggested resolution:** Rephrase to "current lint at `prompt-editor.tsx:43–49` accepts only `$env.` among `$`-prefixed variables; other paths go through `validVariables` (contextVariable/headers suggestions) or the `[` / `length(` escape hatches."

---

## Low Severity

### [L] Finding 7: Evidence file `template-engine-render-sites.md` contains a stale narrative about "contextWithBuiltins seam" that conflicts with the spec's chosen mechanism (D7)

**Category:** COHERENCE
**Source:** L4 (Evidence-synthesis fidelity)
**Location:** `evidence/template-engine-render-sites.md` lines 43–45, 90–101; SPEC.md D7
**Issue:** The evidence file describes the "contextWithBuiltins seam" as the extensibility mechanism for new builtins: "Adding `$conversation` = adding one more line here." It also says "If we merge `$conversation` into the render-time `context` object (as `$env` is currently merged — see below), JMESPath will resolve `{{$conversation.id}}` automatically. **No change to `processBuiltinVariable` required.**"

This is factually wrong and internally contradicted by the evidence file itself — line 68 of TemplateEngine.ts intercepts `$`-prefixed paths **before** JMESPath resolves them. Adding `$conversation` to `contextWithBuiltins` would NOT make JMESPath resolve it because the `$`-prefix dispatch fires first. The evidence's own §26–45 section implies the opposite of §43–45.

The spec corrects this via D7 (additive `runtimeBuiltins` parameter), but the evidence file still contains the misleading claim.

**Current text:** Evidence line 43: "If we merge `$conversation` into the render-time `context` object (as `$env` is currently merged — see below), JMESPath will resolve `{{$conversation.id}}` automatically (line 72–76 path)."
**Evidence:** TemplateEngine.ts:68 intercepts `$`-prefix before JMESPath is called at line 76.
**Status:** CONTRADICTED (in the evidence file, relative to the source code)
**Suggested resolution:** Update `template-engine-render-sites.md` to note that the "contextWithBuiltins seam" alone is NOT sufficient because of the `$`-prefix interception, and reference D7's additive-parameter mechanism as the chosen path. The `_changelog.md` at line 44–45 already acknowledges this — the evidence file should be updated to match.

---

### [L] Finding 8: `a2a-conversation-id-propagation.md` references the ambient block at line 38 ("Will populate the ambient `<conversation_context>` block correctly.")

**Category:** COHERENCE
**Source:** L4 (Evidence-synthesis fidelity)
**Location:** `evidence/a2a-conversation-id-propagation.md` lines 37–38, 62
**Issue:** The evidence file was captured during the α (ambient injection) design and uses ambient-specific language ("ambient block", "`<conversation_context>` block"). The β-pure design abandons ambient entirely (NG5 [NEVER]), so these references are stale. The conclusion remains factually correct (conversationId propagation works for Inkeep-initiated A2A), but the mechanism language no longer fits.
**Current text:** Line 38: "Will populate the ambient `<conversation_context>` block correctly." Line 62: "the ambient block will render the correct (user-facing) ID." Line 42: "When the sentinel fires, ambient block is omitted per Q1 resolution" — but "ambient block" no longer exists in β-pure.
**Evidence:** Same evidence file against SPEC.md §3 NG5 ("Ambient injection... Explored in a prior iteration... rejected").
**Status:** STALE
**Suggested resolution:** Update the evidence file to replace "ambient block" with "`{{$conversation.id}}` variable resolution" wording. Conclusions remain valid — only the mechanism language needs updating. Alternative: add a frontmatter note that the file was captured pre-β-pivot and the G3 conclusion applies to template-variable resolution by the same propagation path.

---

### [L] Finding 9: The spec's §10 "Decision history" paragraph references "§10 Alternatives considered" but Alternatives is in §9

**Category:** COHERENCE (document structure)
**Source:** L1 (Cross-section) + reader pass
**Location:** SPEC.md §3 NG5, §10 Decision history
**Issue:** §3 NG5 references "§9 Alternatives considered"  — but also says "Explored in a prior iteration of this spec and rejected — see 'Decision history' above §10". The Decision history is **inside** §10 (first paragraph), not above it. §9 does contain Alternatives considered (line 176+). The cross-reference wording "Decision history above §10" reads as if Decision history were a separate sibling section above §10; actually it's the lede of §10.
**Current text:** §3 NG5: "Explored in a prior iteration of this spec and rejected — see 'Decision history' above §10 and §9 Alternatives considered."
**Evidence:** §10 opens with "Decision history: The design pivoted twice..." — the paragraph IS in §10.
**Status:** INCOHERENT (minor, cross-ref phrasing)
**Suggested resolution:** Rephrase as "see §10 'Decision history' paragraph and §9 'Alternatives considered'."

---

### [L] Finding 10: `ContextFetcher.ts:281` is classified as "strict" in the D6/§6 non-prompt-site argumentation, but the code actually uses `strict: false, preserveUnresolved: true`

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** SPEC.md §8 "Current state" final bullet ("the other 3 ... use scoped contexts in strict mode")
**Issue:** §8 last bullet of the §8 Current state (3rd from last bullet) says: "Only 2 are agent-prompt; the other 3 (relation-tool headers, context-fetcher URLs, credential-stuffer) use scoped contexts in strict mode." Actually, `ContextFetcher.ts:281` uses `strict: false, preserveUnresolved: true` — lenient with preservation. Only `relationTools.ts:383` and `CredentialStuffer.ts:215` use `strict: true`.
**Current text:** §8: "Only 2 are agent-prompt; the other 3 (relation-tool headers, context-fetcher URLs, credential-stuffer) use scoped contexts in strict mode."
**Evidence:** `ContextFetcher.ts:281–284`: `TemplateEngine.render(template, context, { strict: false, preserveUnresolved: true })`. This matches the `render-site-inventory.md` classification of ContextFetcher as "lenient."
**Status:** CONTRADICTED (minor — one of three sites misclassified)
**Suggested resolution:** Rephrase to "the other 3 sites use scoped contexts; 2 are strict (`relationTools.ts:383`, `CredentialStuffer.ts:215`) and 1 is lenient-with-preserve (`ContextFetcher.ts:281`)." Does not affect the D6 scope-invariant argument.

---

## Confirmed Claims (summary)

Verified against code at baseline `2abfdf44e` — these claims check out:

- **TemplateEngine dispatch at `$`-prefix** (TemplateEngine.ts:67–70 intercepts before JMESPath; only `$env.*` is handled today; other `$`-paths log "Unknown built-in variable" and return empty). CONFIRMED by direct source read.
- **`buildSystemPrompt` two render sites at `system-prompt.ts:207` (sub-agent prompt, becomes `corePrompt`) and `:298` (overarching agent prompt)**. CONFIRMED.
- **Short-circuit guards at `:205` (`if (resolvedContext && ctx.config.prompt)`) and `:296` (`if (prompt && resolvedContext)`)**. CONFIRMED.
- **`getResolvedContext` early-null return at `:29` when no `contextConfigId`**. CONFIRMED.
- **conversationId extraction at `:198` (`runtimeContext?.metadata?.conversationId || runtimeContext?.contextId`)**. CONFIRMED.
- **`metadata.taskId` missing from the type literal at `system-prompt.ts:180–190`** (Q6). CONFIRMED — type does not include `taskId`, but `generateTaskHandler.ts:453` passes `taskId: task.id` into metadata at the call site. Type-narrowing hole confirmed.
- **Monaco lint at `prompt-editor.tsx:45`** accepts `$env.` among `$`-prefixed variables. CONFIRMED (see Finding 6 for precision).
- **Monaco autocomplete at `use-monaco-store.ts:186`** uses hardcoded `'$env.'`. CONFIRMED.
- **Cypress test at `agent-prompt.cy.ts:21, 26`** references `$env.` and `$env.MY_ENV` as the reference cases. CONFIRMED.
- **CLI pull-v4 silent-breakage path at `templates.ts:64`**: the `headers.` branch is the only explicit match; all other template variables (including `$env.*` and would-be `$conversation.*`) fall through to `contextReference.toTemplate(variableName)` at line 78, which rewrites them incorrectly. CONFIRMED.
- **TODO comment at `templates.ts:28`** about escaping. CONFIRMED.
- **8 TemplateEngine render-site inventory** (2 agent-prompt + 3 non-prompt production + 1 preview + 2 test) — matches `render-site-inventory.md`. CONFIRMED from grep of `TemplateEngine.render` across `public/agents/`.
- **A2A delegation conversationId propagation via Inkeep's delegation tool**: parent's contextId → `params.message.contextId` → `task.context.conversationId` at `a2a/handlers.ts:122` → `contextId` at `generateTaskHandler.ts:370` → `runtimeContext.metadata.conversationId` at `:452`. CONFIRMED end-to-end.
- **`generateId()` fallback sites at `a2a/handlers.ts:383, 492, 650, 791`** for contextId when external A2A callers omit it. CONFIRMED by grep; line 650 is unconditional, others are `||` fallbacks. The spec's general claim is correct; the evidence file's enumeration is correct.
- **Prior-art claim that peer frameworks do not expose runtime IDs via prompt template variables** — matches evidence/prior-art-peer-frameworks.md, which cites subagent investigation; no contradictory evidence found in this audit.
- **Additive `runtimeBuiltins` parameter on `TemplateRenderOptions`** is architecturally sound — existing callers pass no parameter, default `undefined`, existing `$env` and JMESPath paths unchanged. CONFIRMED that the design does not require breaking changes to `TemplateRenderOptions`. (Implementation lookup mechanism has the JMESPath-`$` subtlety flagged in Finding 3.)
- **Scope invariant D6 at the call-site level**: only agent-prompt sites pass `runtimeBuiltins` under the proposed design. CONFIRMED — though enforcement strength is overclaimed as "by construction" (see Finding 5).

## Unverifiable Claims

- **§7 Release gate 1: "LLM transcribes the substituted value into tool-call arguments in ≥ 95 % of runs across ≥ 50 representative prompt + tool-schema combinations."** The ≥ 95 % / ≥ 50 threshold is a product judgment; no evidence base exists yet. Cannot verify; flagged as a forward-looking commitment.
- **§7 Post-release failure signal: "Alert on rate > 0.1 %."** Threshold-setting is a judgment call; cannot verify against existing alerting configuration without digging into OTEL/alerting setup.
- **A1 (assumption): `runtimeContext.metadata.conversationId` is the correct "user's overarching conversation ID" in all non-A2A paths (chat, webhook, trigger, transfer).** Confidence MED per spec. Trace paths for webhook and trigger were not verified in this audit (A2A is verified). Would require separate code traces for webhook / trigger entry points.
- **A2 (assumption): LLM transcription reliability ≥ 95 % across four primary models.** Pre-release gate; no prior data.
- **Prior-art claim "Inkeep's first-class tool type is the MCP remote server"** (prior-art-peer-frameworks.md line 27) — not cross-checked in this audit. Referenced but not independently verified.
