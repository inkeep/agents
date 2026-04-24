# Change log — 2026-04-16-agent-conversation-self-reference

## 2026-04-16 — Session start

**Seed.** User (Tim) wants AI agents to be able to reference their own conversation in prompts. Driving use case: classification agent that writes back to Zendesk tickets with a link to the originating conversation. Prior discussion considered MCP-side header injection; rejected in favor of prompt-level template variables (LLM-visible, trace-visible, works for MCP + function tools).

**Intake iterations.**
- V1 framing: "Runtime identifiers as a namespace" — overscoped. Candidate table included `conversationId`, `taskId`, `agentId`, `userId`, `tenantId`, `projectId`, etc.
- User correction: "they dont need other information there" — scope narrowed to the conversation only. Stream is interchangeable with the whole conversation; no sub-conversation granularity needed.
- Final SCR framed around "conversation self-reference" — one capability, one variable.

**Locked decisions.**
- D1 (LOCKED): v1 scope is the current conversation only. Other runtime IDs are explicit Future Work.
- D2 (LOCKED): Shape A — raw ID only. No URL in v1.
- D3 (DIRECTED): Variable shape `{{$conversation.id}}` — dollar-prefixed, nested; mirrors `$env` built-in pattern.
- D4 (LOCKED): Must work regardless of whether the agent has a `contextConfigId`.

**Evidence captured in `./evidence/`.**
- `template-engine-render-sites.md` — TemplateEngine internals, render sites in `buildSystemPrompt`, the `contextWithBuiltins` seam, the `contextConfigId` gate.
- `prior-art-peer-frameworks.md` — how LangGraph, Vercel AI SDK, Claude SDK, OpenAI Assistants, and Letta handle (or decline to handle) runtime-context-in-prompts; why Inkeep differing is architecturally justified.

**Scaffolding.**
- Spec path: `public/agents/specs/2026-04-16-agent-conversation-self-reference/`.
- Per repo convention, specs live under `public/agents/specs/` (13 existing specs there); env var `CLAUDE_SPECS_DIR` points at monorepo-root `/specs/` which doesn't exist — noted, using established path.
- Baseline commit: `2abfdf44e`.

**Next.** Dispatch /worldmodel for surface-area mapping (agents-api, agents-core, agents-manage-ui, agents-docs, agents-cli, SDK, cookbook), then work the open-questions backlog (Q1–Q8).

## 2026-04-16 — Worldmodel returned

Worldmodel subagent (agent id `a17319c1018e52c44`) completed surface mapping. Major findings folded into SPEC.md:

**Scope boundary sharpened (D5, DIRECTED).**
- `TemplateEngine.render()` has **8 call sites**, not 2. Sites 3–5 (relation-tool headers `relationTools.ts:383`, context-fetcher URLs `ContextFetcher.ts:281`, credential-stuffer templating `CredentialStuffer.ts:215`) use strict-mode with scoped contexts and have nothing to do with prompts. Scope invariant added: `$conversation.*` resolves ONLY at agent-prompt sites.

**Two new silent-failure modes captured (new Must requirements in §6).**
- **UI prompt editor lint** — `prompt-editor.tsx:45` hardcodes `$env.` as the only valid `$`-prefix. `{{$conversation.id}}` would render as a red squiggly "Unknown variable" at edit time while working at runtime. Must update lint + autocomplete + Cypress.
- **CLI `pull-v4` round-trip** — `templates.ts:64` only preserves `headers.*`; all other vars fall through to `contextReference.toTemplate()`, which silently rewrites them. `$env.*` is latently broken today; adding `$conversation.id` hits the same code path. Must fix; opportunistically fixes `$env.*` too.

**Two new open questions surfaced that need user judgment.**
- **Q9 ('default' sentinel semantics).** `generateTaskHandler.ts:385` and `AgentSession.ts:983` fall back to `conversationId = 'default'` when regex extraction fails. `{{$conversation.id}}` would render as literal `"default"` — LLM could tag external systems with garbage. Needs explicit semantics decision.
- **Q10 (A2A delegation semantics).** Sub-agents invoked via A2A with fresh `contextId = generateId()` (`a2a/handlers.ts:383`) see a synthetic conversation ID unrelated to the user's conversation. `{{$conversation.id}}` in a delegated sub-agent's prompt links external records to the wrong conversation unless we propagate parent ID.

**Implementation-mechanism discovery (Q11, P0).**
- `$`-prefixed paths in `TemplateEngine` are intercepted by `processBuiltinVariable` BEFORE JMESPath runs. So my earlier evidence note about "merge `$conversation` into `contextWithBuiltins`" was wrong — JMESPath never sees `$`-prefixed keys. Real options: modify dispatch to fall through to JMESPath for `$`-keys present in context; add `runtimeBuiltins` param to `render()`; or make `processBuiltinVariable` instance-based. Q11 picks one during iterative loop.

**Adjacent tech-debt signal (Q12, Future Work).**
- UI `$env.` is hardcoded at 3 sites. Each new builtin = 3 parallel edits. Could centralize in `agents-core` as `BUILTIN_TEMPLATE_PREFIXES`. Not blocking v1; flagged for re-visit if more builtins are proposed.

**Evidence added.**
- `evidence/render-site-inventory.md` — all 8 callers, classification, mode.
- `evidence/downstream-surfaces.md` — UI + CLI + cookbook + observability + docs.

**Backlog after this cascade.** 12 open questions (Q1–Q12). P0: Q1–Q6, Q9–Q11. P2: Q7, Q8, Q12.

**Next.** Start the iterative loop with the user — Q9, Q10, Q11 are investigatable (and Q10 borders on product-judgment); Q1, Q2, Q3, Q4, Q6 are code-traces. Present as a prioritized decision batch.

## 2026-04-16 — α pivot (ambient over template variable)

**User challenge.** "wait so you want to expose it as something we can manually add to the prompt? it wont be something every agent implcitly knows?" — re-examining the fundamental interaction model.

**Finding that broke the old framing.** `clientCurrentTime` is already ambient in the framework: it's an optional field on `SystemPromptV1` (`agents-api/src/domains/run/agents/types.ts:52`), populated in `buildSystemPrompt` (`system-prompt.ts:332, 351`), rendered as a `<current_time>` block by `SystemPromptBuilder.generateCurrentTimeSection` (`PromptConfig.ts:243`), substituted via `{{CURRENT_TIME_SECTION}}` placeholder (`PromptConfig.ts:116`). The framework already has the "things every agent implicitly knows" pattern — I was reinventing a more complex one.

**Acknowledged bias.** My prior framing anchored on extending `TemplateEngine`'s `{{...}}` vocabulary because my investigation started from TemplateEngine internals. That pulled the design toward template-variable shape by habit, not by fit. User's pushback was correct; ambient is the better design.

**New locked interaction model (D3).** Ambient injection. No template variable.

**Revocations.**
- D3-prev (`{{$conversation.id}}` variable shape) — REVOKED.
- D5-prev (scope invariant across 8 TemplateEngine render sites) — REVOKED. Moot without a template variable.

**New locked decision (D5, was Q10).** In A2A delegation and transfer, the ambient conversationId must be the parent's (user-initiated) conversation ID, not a synthetic child contextId. Mechanism TBD — investigation dispatched (Q2 — subagent `a0b70b4db7c38a870`).

**Retained.** D1 (narrow scope), D2 (ID only, no URL), D4 (works without contextConfigId — re-framed as "ambient block renders even without contextConfig").

**SPEC.md fully rewritten.** New structure reflects α design — much smaller. Template-variable-specific requirements (Monaco lint, Monaco autocomplete, CLI pull-v4 round-trip, Cypress, scope invariant) all removed as they no longer apply. Changeset surface shrinks from `agents-core + agents-api + agents-cli` to `agents-api` only.

**Evidence files retained.** `render-site-inventory.md`, `downstream-surfaces.md`, `template-engine-render-sites.md`, `prior-art-peer-frameworks.md` — all still factually correct. They capture what we learned about the template-variable path; the α pivot made that path a rejected alternative (now documented in §9 Alternatives considered and §15 Future Work Explored).

**New open questions (Q1–Q6).**
- Q1: `'default'` sentinel semantics (unchanged from old Q9).
- Q2: A2A delegation propagation mechanism (refocused from old Q10).
- Q3: Ambient block phrasing — new.
- Q4: `buildSystemPrompt` additive-change safety — reframed from old Q1.
- Q5: Eval / replay / compression interaction — new.
- Q6: Missing `metadata.taskId` type — retained from old Q7.

**Pruned open questions** (no longer apply without template-variable surface):
- Old Q2 (contextVariable $ prefix collision).
- Old Q3 (all TemplateEngine render sites).
- Old Q5, Q6 (Monaco / CLI cascades).
- Old Q8 (SDK validation for template var).
- Old Q11 (implementation mechanism for per-site merge).
- Old Q12 (UI builtins centralization).

**Baseline commit unchanged:** `2abfdf44e`.

**Next.** A2A investigation (subagent `a0b70b4db7c38a870`) returns — fold into Q2 resolution. In parallel: Q1 (sentinel), Q3 (block phrasing), Q4 (additive-change safety) are investigatable/drafted by me.

## 2026-04-16 — A2A investigation returned, multiple Qs resolved

**Q2 resolved — no new mechanism needed.** A2A subagent traced the parent → delegation tool → A2A message → child task → runtimeContext flow end-to-end. The parent's `contextId` propagates naturally through existing delegation code. The `generateId()` sites in `a2a/handlers.ts` are fallbacks for missing/`'default'` contextId — they do not fire in the normal flow. G3 (LOCKED, formerly DIRECTED in D5) is met by existing code. Transfer preserves implicitly via same execution loop.

**Q4 resolved.** Additive-change safety confirmed via `clientCurrentTime` precedent — that field is populated at `system-prompt.ts:332` independently of `getResolvedContext()`. Our parallel addition follows the same path; no behavior dependency on the `contextConfigId` gate.

**Q5 resolved.** Eval harness uses per-run `conversationId` (`evals/services/conversationEvaluation.ts:42–74`); ambient block shows eval's synthetic ID correctly. Token-tracking already accounts for section placeholders at `PromptConfig.ts:87–97`; adding one more follows the same convention.

**Q1 (sentinel) recommendation drafted.** Omit the block when `conversationId` is the `'default'` sentinel, empty, or undefined — mirrors the `.trim() === ''` guard in `generateCurrentTimeSection`. Pending user ack.

**Q3 (block phrasing) recommendation drafted.** Mirror the `<current_time>` block's register. Candidate phrasing reflects: declarative ID statement + use-case examples + "don't reference this section" framing. Pending user ack.

**Q6, Q7 (small cleanups).** Q6 is the `metadata.taskId` type def fix — recommend bundling. Q7 is the defensive child-task-ID encoding enhancement — recommend deferring since normal flow works without it.

**Evidence added.**
- `evidence/a2a-conversation-id-propagation.md` — full parent→child flow with file:line citations.

**Implementation sketch locked** (§9). Five file touches, all additive:
1. `SystemPromptV1` + `conversationId?: string` field.
2. `buildSystemPrompt` populates the field from runtimeContext.
3. `PromptConfig.generateConversationContextSection()` mirrors `generateCurrentTimeSection`.
4. Token-overhead baseline updated for the new placeholder.
5. `system-prompt.xml` gets `{{CONVERSATION_CONTEXT_SECTION}}` placeholder.

**Remaining before audit.** User acks on Q1, Q3, Q6/Q7. Then fill §16 (Agent constraints) and proceed to audit (Step 6).

**State.** Iteration nearly complete. Backlog: 7 entries. Resolved: Q2, Q4, Q5. Recommendations pending confirm: Q1, Q3, Q6, Q7.

## 2026-04-16 — Iteration closed; audit dispatched

**User confirmations on Q1, Q3, Q6, Q7.**
- Q1 (sentinel): OMIT block when conversationId is empty, undefined, or `"default"`. ✓
- Q3 (phrasing): confirmed — mirrors `<current_time>` register. ✓
- Q6 (taskId type fix): BUNDLE with implementation. ✓
- Q7 (defensive child-task-ID encoding): DEFER as unrelated cleanup. ✓

**All P0 open questions resolved.** §16 (Agent constraints) filled. SPEC is in a complete, reviewable state.

**Dispatched:**
- Auditor subprocess — `/audit` + `/spec` against SPEC.md + evidence/. Output → `meta/audit-findings.md`.
- Challenger subprocess — `/spec` + `design-challenge-protocol.md`. Output → `meta/design-challenge.md`.

Both running in parallel. Findings will be evaluated and presented per `/spec` Step 7.

## 2026-04-16 — Audit + challenge returned; corrections applied, challenges escalated

**Auditor findings (8):** 1 High, 3 Medium, 4 Low. Verified every factual claim independently.

**Applied autonomously (factual / coherence corrections):**
- **H1 (auditor):** Sentinel line citation corrected. Grep confirmed `'default'` appears at `AgentSession.ts:248` (not conversationId-related) and line 983 only; the three other lines I cited (1151, 1476, 1705) pass through resolved contextId without the sentinel. Fixed in §8, §5 already correct; evidence file `render-site-inventory.md` corrected.
- **M3 (auditor):** Evidence file `template-engine-render-sites.md` updated — Q7 reference was stale (pre-α-pivot numbering); now correctly cites Q6.
- **M4 (auditor):** Line range corrected from `182-189` to `180-190` throughout SPEC.
- **L5 (auditor):** "Populated" clarified — "extracted at 332, assigned at 351" split made explicit in §6 and §11 Q4.
- **L7 / L8 (auditor):** Tracked with H1; resolved by the same fix.

**Applied autonomously (framing / honesty improvements from challenger):**
- **M3 (challenger):** G3 narrowed — now explicitly scoped to Inkeep chat entry points + transfer + Inkeep delegation-tool flows. External A2A callers that don't pass `contextId` get the block omitted. Matches the evidence; removes "silently wrong" failure mode.
- **M4 (challenger):** G5 rephrased — "zero changes to customer-authored prompt text, config schemas, or public API" + explicit acknowledgment that ambient block adds ~20 tokens and introduces minor behavior-drift potential; regression-eval gate added to §7.
- **M5 (challenger):** D3 rationale softened from "established pattern" to "precedent of one, becoming the pattern." Forward commitment added: other runtime IDs in §15 follow the ambient shape pending per-ID evaluation.
- **M6 (challenger):** Privacy invariant stated explicitly in §6 non-functional: conversationId treated as non-sensitive (already in OTEL spans, not a bearer token). Opt-out documented as Future Work in §15 for privacy-sensitive deployments.
- **L7 (challenger):** §9 "5 touches" wording corrected to "5 code touches in agents-api plus cookbook + docs + tests + changeset (~10 files total)"; points to §16 for full deliverable list.
- **L8 (challenger):** §7 success metrics hardened — three release gates (LLM transcription reliability ≥95 % across 4 models, regression eval on existing non-Zendesk agents, Zendesk E2E). Primary metric now a release gate, not just an adoption check.

**Also applied autonomously (auditor M2):**
- UI-no-change rationale added to §13 deployment/rollout table. Deliberate deviation from AGENTS.md "Agent Builder UI Components MANDATORY" rule; rationale recorded (no authored surface to expose; matches `clientCurrentTime`'s treatment).

**Escalated to user (3 design challenges):**
- **H1 (challenger):** Revisit ambient-XOR-template vs ambient-AND-template? Cascade costs were less load-bearing than I claimed. User judgment required — 1-way door on customer-facing interaction shape.
- **H2 (challenger):** Revisit framework-default transport-header injection alternative? Distinct from the per-server MCP header injection I rejected. User judgment required.
- **M6 (challenger):** Beyond the privacy invariant statement I added, does any deployment require an opt-out NOW (not Future Work)? If yes, spec needs to expand.

**Challenger findings that held the decision up:** D1, D2, D4, Q1, Q3, Q5, §16. Core design survives independent re-examination.

**State.** Factual corrections landed. Design challenges pending user judgment before Step 7 completion.

## 2026-04-16 — Second pivot: β-pure (template-variable-only)

**User journey through the decision.**

- User picked B (hybrid) on challenger H1 and C (project-level opt-out) on M6.
- I flagged the combined scope implications — hybrid adds ~5 touches across 4 packages (agents-core + agents-manage-ui + agents-cli + agents-api), and project-level opt-out requires a schema migration (no `settings` jsonb bucket on the projects table; all config is typed columns).
- User reacted to "schema migration": "wait woah we need a schema migration?"
- I offered three migration-free alternatives for opt-out: (A) defer, (B) deployment env var, (C) accept the migration.
- User picked (A) defer.
- User then reframed the hybrid question entirely: "if we just did template engine though that would be an implicit opt out unless it was included in the prompt... maybe that is the right call."
- Recognized the logic is clean. Template-variable-only gives implicit opt-out via absence. Privacy-by-default without any opt-out mechanism. Zero behavior change for agents that don't use the variable.
- User confirmed β-pure: template variable only, drop ambient entirely.

**My errors through this, captured honestly.**

- I over-indexed on "the agent implicitly knows" framing from the user's early message, interpreting it as a firm preference rather than a hypothesis the user was testing.
- I treated `clientCurrentTime` as "the framework's established pattern" when it's n=1 — challenger M5 was correct.
- My rejection of template-variable under the α pivot cited a cascade cost that's real but smaller than I implied. Challenger H1 was correct.
- I pushed ambient as the default without naming that "zero adoption cost" also means "zero consent for the behavior change." Challenger M6 (privacy) surfaced this.
- The user's reasoning — "presence of the variable IS the opt-in" — is the cleanest way to think about it. I should have arrived at that framing on my own when we discussed the opt-out question.

**β-pure design shape.**

- **D3 REPLACED.** `{{$conversation.id}}` template variable is the mechanism. No ambient block.
- **D5 UNCHANGED.** A2A propagation still works via existing delegation code.
- **D6 NEW (was briefly locked, now re-locked with different mechanism).** Scope invariant: `$conversation.*` resolves only at the two agent-prompt render sites.
- **D7 NEW.** Implementation via additive `options.runtimeBuiltins` param on `TemplateEngine.render()`. Existing callers unaffected; only agent-prompt sites pass the param.
- **NG5 UPDATED.** Now "no ambient injection" (codifies the opposite of the α design).
- **NG6 NEW.** No opt-out mechanism (implicit via variable absence).

**Scope: four packages.** agents-core (TemplateEngine extension) + agents-api (render sites + Q6 type fix) + agents-cli (pull-v4 preservation, also fixes latent $env bug) + agents-manage-ui (Monaco lint + autocomplete + Cypress). Cookbook + docs + tests.

**No schema migration. No DB work. No new config field. No UI form.**

**Evidence files preserved.** All four evidence files remain factually correct; they capture the full alternatives-analysis trail. Useful for the audit record and for future-work revisits.

**Audit note.** Current SPEC was audited and challenged under the α design. β-pure is a distinct design. Most challenger findings were about α-specific concerns (auto-broadcast, n=1 precedent, opt-out absence) that don't apply to β-pure. A fresh audit of the rewritten spec is reasonable but may be redundant — the challenger's own recommendations (H1's "consider hybrid or template" framing, M6's "stated invariants or opt-out") largely point toward what we ended up with. Presenting to user: offer a re-audit or proceed to Step 7 mechanical checks.

**Next.** User decides: re-audit β-pure, or proceed directly to Step 7 (verify, mechanical checks, finalize)?

## 2026-04-16 — Re-audit returned (β-pure)

**Auditor (10 findings):** 1 High, 5 Medium, 4 Low.

**H1 (decision-implicating) — G4 "zero drift" not structurally delivered by proposed G2 guard.**
Naïve "render whenever prompt has `{{...}}`" regresses no-contextConfig agents whose prompts contain any literal `{{...}}` (docs, examples, typos) — they'd go from pass-through to empty-string replacement. User confirmed the fix approach. Applied: narrowed guard so no-contextConfig render only fires when `prompt.includes('{{$conversation.')` AND uses `preserveUnresolved: true`. Preserves today's pass-through for any other `{{...}}`. G4 preserved by construction — agents without `{{$conversation.` never enter the new code path.

**M2–M6 (precision corrections, applied autonomously):**
- M2: Line citations for TemplateEngine dispatch normalized to 67–70 throughout.
- M3: "Check `runtimeBuiltins` via JMESPath" reworded — JMESPath doesn't cleanly accept `$` identifiers; a direct dotted-path walk is correct.
- M4: "Two sites only" for `'default'` sentinel expanded — actually 5+ sites (added `generate.ts:49`, `tools/relation-tools.ts:55,57,58`). Doesn't change the design; `isValidConversationId` catches all.
- M5: D6 enforcement reframed from "by construction" to "caller-side convention + tests + grep check." Honest about the mechanism.
- M6: §6 "only allows `$env.`" made precise — lint accepts 4 conditions; `$env.*` is the only `$`-prefixed case.

**L7–L10 (stale docs / cross-refs, applied autonomously):**
- L7: Evidence `template-engine-render-sites.md` corrected — removed stale "merge → JMESPath resolves" claim.
- L8: Evidence `a2a-conversation-id-propagation.md` updated — ambient/`<conversation_context>` language swapped for template-variable terminology.
- L9: §3 NG5 cross-ref "above §10" → "preamble in §10".
- L10: §8 claim "other 3 sites use strict mode" corrected — ContextFetcher.ts:281 uses lenient with preserveUnresolved.

**Confirmed:** all load-bearing factual claims about codebase state check out (dispatch at 67–70, render sites 207/298, guards at 205/296, contextConfigId early return at 29, Q6 missing type, Monaco + CLI citations, A2A propagation end-to-end).

**Challenger: still pending.** Will consolidate when it returns.

## 2026-04-16 — Challenger (re-run) returned

**11 findings:** 3 High, 5 Medium, 3 Low.

**Applied autonomously (framing + precision):**
- **M6 Alt C** (multi-author A2A privacy edge case): added to §15 Future Work Identified with the author-mismatch scenario described. Out of scope for v1; real for marketplace futures.
- **M7** (transcription gate recalibration): §7.1 restructured. β-pure has explicit author instruction, so the bar is **99 %** for β-shaped prompts (author explicitly instructs); 95 % for implicit-instruction prompts as a secondary check. Reflects the actual failure distribution under β-pure, not the α-era carry-over.
- **M8** (deployment-mode postures): added row to §13 enumerating SaaS / self-hosted / widget postures for the ID. SaaS — Inkeep controls opacity; self-hosted — customer's responsibility; widget — privacy-review item if widget IDs are end-user-visible.
- **L9** (residual-state invariant): added one-line invariant to §6 non-functional.
- **L10** (docs precedent): promoted the central template-variable reference page from Should to Must. Rationale: D3 claims to mirror `$env.*`, which is undocumented — the docs page must ship with v1 or the rationale fails.
- **L11** (release-gate gaps): added §7.4 (CLI round-trip) and §7.5 (Manage UI editor regression) as release gates. Author-tooling is the opt-in channel under β-pure; gate coverage must match.
- **H2** note: my narrow-guard fix (`.includes('{{$conversation.')`) is strictly stronger than the challenger's suggested broader `{{$` — it preserves today's no-render behavior for `$env.*` references on no-contextConfig agents. No change to the fix.

**Escalated to user (design judgment, 4 items):**
- **H1** — adoption goal framing: "broad adoption" vs "supported path for the motivated user."
- **H3** — D6 enforcement mechanism: convention + tests vs `TemplateEngine.renderPrompt()` as a distinct method.
- **M4** — namespace shape 1-way door re-examination: nested `$conversation.id` vs flat `$conversationId`.
- **M5** — strict mode bug: fix `processBuiltinVariable` for `$conversation.*` AND `$env.*`, narrowly fix only `$conversation.*`, or accept.

**Confirmed choices that held up:** β-pure direction, D5 A2A propagation, D6 invariant (concept sound; mechanism weak per H3), template-injection over transport-header, 1-way-door classification of D3, SCR framing, and no-urgent-issue with the core design.

## 2026-04-16 — Step 7 finalize: user confirmed design judgments; spec approved

**User decisions on the four escalated design challenges:**
- **H1 = A.** Narrow adoption goal to "motivated user has a supported path." Added as G6. Discoverability risk downgraded to acceptable.
- **H3 = B.** Structural D6 enforcement via `TemplateEngine.renderPrompt()` + distinct `PromptRenderOptions` type. D6 and D7 rewritten accordingly; §16 SCOPE updated.
- **M4 = A.** Hold nested `$conversation.id` shape (D3 as locked).
- **M5 = C.** Accept the strict-mode inconsistency as a documented limitation. §6 acknowledges `$`-prefix paths don't throw in strict mode. `processBuiltinVariable` strict-mode fix deferred to §15 Noted.

**Temporal non-goal retagging (Step 7 mechanical check):**
- NG5 NEVER → NOT UNLESS (trigger: LLM transcription reliability materially below gate AND cannot be closed via explicit-instruction prompt patterns).
- NG6 NEVER → NOT UNLESS (trigger: NG5 fires, OR a compliance customer emerges needing enforced absence).
- NG1–NG4 temporal tags verified accurate.

**Step 7 mechanical adversarial checks — all pass:**
- **ASSUMED decisions:** zero. Decision log is D1 LOCKED, D2 LOCKED, D3 LOCKED, D4 LOCKED, D5 LOCKED, D6 LOCKED, D7 LOCKED.
- **1-way door confidence:** D3, D5, D6 all 1-way doors, all HIGH confidence with evidence citations.
- **Non-goal temporal accuracy:** NG1–NG6 tags correct after retagging.

**Agent Constraints §16 finalized** — SCOPE, EXCLUDE, STOP_IF, ASK_FIRST all reflect the final decisions including the `renderPrompt()` structural-enforcement change.

**Baseline commit updated** from scaffold-time `2abfdf44e` to finalization `553206ac7`. This is the authoritative commit the spec was verified against.

**Evidence files:** all four in sync with the β-pure design after the corrections applied earlier this session.

**Status: APPROVED.** Spec is ready for implementation. All P0 open questions resolved; all locked decisions evidenced; all in-scope items pass the resolution completeness gate (decisions made, no 3P deps, architectural viability confirmed, acceptance criteria verifiable, no dependency on Future Work).

## 2026-04-16 — Post-implementation pivot on docs scope (D8 added)

**Trigger.** During PR #141 review, user flagged the `$env.*` section of the new `prompt-template-variables.mdx` as potentially problematic. Triggered a git-archaeology pass on `$env.*` provenance.

**Findings.**
- `$env.*` has **no traceable spec, PRD, or introducing PR**. It shipped in the root commit of `inkeep/agents` (`c39fdd0d4`, 2025-09-05, initial squash by Andrew Mikofalvy — 300 files, `parents: []`). Pre-public history is not available in any git/gh source.
- **Only deliberate engineering decision** touching `$env.*` post-release: `#818` (2025-10-24, miles-kt-inkeep) removed `$now/$timestamp/$date/$time` from `processBuiltinVariable` but **kept** `$env.*`. Changeset note ("remove builtin time variables from context") gives no stated rationale for why `$env` was the survivor.
- **Zero customer-facing docs** for `$env.*` until the draft of this PR's `prompt-template-variables.mdx` (first-ever public documentation).
- **Zero cookbook templates** reference `{{$env.*}}`.
- **Only UI-level surface** is `agents-manage-ui` Monaco autocomplete (`use-monaco-store.ts:186`) + lint allowlist (`prompt-editor.tsx:45`) + Cypress regression tests.

**Implication.** The spec's §6 rationale for promoting the docs page from Should → Must rested on *"D3's 'mirrors `$env.*` convention' argument mirrors an invisible convention."* That rationale collapses once we confirm the "convention" itself is un-designed scaffolding. Documenting `$env.*` for the first time in this PR would retroactively promote it to a customer-facing feature without a security/privacy review commensurate with that promotion — the rendered env-var value is visible to the LLM and can flow through to tool arguments, assistant output, and traces.

**Decision.** Add **D8 (LOCKED)** to §10: `$env.*` is intentionally omitted from the new reference page. Page now covers three customer-facing template variables (`contextVariable.*`, `headers.*`, `$conversation.*`). D3 remains LOCKED on its own merits — dollar-prefix still prevents syntactic collision with user-defined `contextVariable` names regardless of whether `$env.*` is documented as a convention.

**Surgical edits applied.**
- §6 Functional — "Must: docs page" requirement rewritten: three variables not four; justification restated as "single discovery surface + primary home for `$conversation.id`"; explicit reference to D8 for the `$env.*` omission.
- §9 Proposed solution — Docs bullet rewritten to match (three variables; link out for the two existing ones; fully document `$conversation.id` inline).
- §16 SCOPE — agents-docs entry now names the specific file path (`public/agents/agents-docs/content/typescript-sdk/prompt-template-variables.mdx`) and adds `meta.json` nav registration; notes `$env.*` omission per D8.
- §10 Decision log — D8 added with full rationale, evidence pointers (root commit SHA + date, `#818` SHA + date), and implications for D3.

**Page itself.** Trimmed from 150 lines → ~65 lines. Summary-table + focused `$conversation.id` section + link-outs to the existing `context-fetchers.mdx` / `headers.mdx` pages. No `$env.*` mention anywhere.

**`$env.*` feature itself.** Out of scope for this PR. If product wants to either deprecate it or ratify it as a documented feature, that's a separate spec. Current state: undocumented but functional; discoverable via Monaco autocomplete only.

**Not re-audited.** Change is docs-scope only; no code changes; D8 addition strengthens rather than weakens the decision log. Agent Constraints §16 updated, all other decisions unchanged.
