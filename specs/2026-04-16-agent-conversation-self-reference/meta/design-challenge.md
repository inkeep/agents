# Design Challenge Findings

**Artifact:** public/agents/specs/2026-04-16-agent-conversation-self-reference/SPEC.md
**Challenge date:** 2026-04-16
**Total findings:** 11 (3 High, 5 Medium, 3 Low)

**Scope of this run.** β-pure (template-variable-only) re-challenge. The spec has pivoted twice — β → α → β-pure. Prior challenger pushed hybrid + transport-header; user weighed those and landed on β-pure after realizing variable absence gives implicit opt-out. Hybrid, ambient, and transport-header rejections are re-examined below but deliberately accepted as already-considered unless new evidence emerges. The challenges that follow are cold-read concerns about the β-pure design as written.

---

## High Severity

### [H] Finding 1: Discoverability and adoption risk is under-weighted relative to the design's chosen opt-out mechanism

**Category:** DESIGN
**Source:** DC3 (framing validity) + DC1 (simpler alternative)
**Location:** §1 Resolution; §14 last row ("Discoverability — customers don't find the variable and under-adopt"); §9 Alternatives considered (ambient rejection)
**Issue:** The spec's core privacy argument is "implicit opt-out via absence." That framing only holds if the population of agents that *should* use the variable reliably *will* use the variable. If customers don't discover the feature, the privacy-via-absence argument degenerates into "absence because nobody knew it existed" — the feature exists but produces zero correlation value and zero privacy signal. §14 lists discoverability as a MED/LOW-MED risk with mitigations "cookbook + autocomplete + docs" — the same three levers every framework's under-adopted feature ships with.

The α design was rejected partly because it "auto-broadcasts without consent." The β-pure design solves consent by making adoption a manual, discoverable act. But the spec offers no evidence that the three discoverability levers will clear a bar like "50 % of agents that create Zendesk tickets, Linear issues, or audit rows will include the variable within 90 days." If that bar is missed, the feature's motivating use case (Zendesk write-back across the customer base, not just one internal integration) is not actually solved — it's solved for the one customer who read §5 User journeys and followed the cookbook.
**Current design:** "Implicit opt-out via absence" (§1); "Discoverability — customers don't find the variable and under-adopt … MED likelihood / LOW-MED impact" (§14); "Adoption proxy: repo-grep for `{{$conversation.` across customer agent definitions at 90 days" (§7).
**Alternative:** Either (a) instrument adoption as a release gate in §7 rather than a post-release signal (e.g., "≥ X % of agents in the top N cookbook templates use the variable; if not, promote it to ambient or ship a scaffolder that inserts it") or (b) explicitly state in §2 that adoption is a secondary goal and the primary goal is "the one customer who wants it has a working, supported path." These are materially different product commitments with different success criteria.
**Trade-off:** Gained: honesty about what the design optimizes for. Lost: nothing — the spec is currently ambiguous about whether broad adoption or supported-path-for-motivated-users is the target, and that ambiguity will resurface at ship review.
**Status:** CHALLENGED
**Suggested resolution:** State the adoption intent explicitly in §2. If broad adoption matters, add a pre-release adoption-forcing mechanism (scaffolder, prompt-upgrade migration for existing customer-support cookbook installs, or a one-time soft-nudge in the Manage UI when an agent has MCP tools + no `{{$conversation.` reference). If not, make the "motivated users only" stance explicit so §14's discoverability risk is correctly downgraded to "acceptable."

---

### [H] Finding 2: The "zero-drift for agents that don't use the variable" invariant (G4) is weaker than stated because the β-pure design restructures the `contextConfigId` guard for *all* agents, not just for agents using the variable

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — SRE reviewing behavioral-regression risk)
**Location:** §2 G4; §9 "Render path when agent has no `contextConfigId`"; §14 row 7 "`buildSystemPrompt` restructure … regresses existing contextConfig agents" (LOW likelihood)
**Issue:** G4 claims agents that don't reference `{{$conversation.id}}` see **zero behavior change.** The implementation in §9 says the render path must now run when the prompt contains `{{...}}` even if `resolvedContext` is null — that's a change to the guard condition at `system-prompt.ts:205, 296`, not a change scoped to agents using the new variable. Any agent today whose prompt contains a `{{...}}` pattern that is *not* a legitimate contextVariable, headers, or $env reference (e.g., stray `{{` in example text, templated prose, embedded JSON schemas, a customer who used double-braces in an unrelated way) currently skips template rendering entirely when `contextConfigId` is null. Post-change, template rendering runs on those prompts.

Concrete regression mode: a customer's agent has no contextConfig and has a prompt like `Respond in JSON: {{"result": ...}}`. Today, the `{{...}}` pattern is preserved verbatim because `resolvedContext` is null and the render short-circuits at line 205/296. Post-change, `TemplateEngine.render()` runs with `runtimeBuiltins` only (or empty `{}`); the pattern gets processed, JMESPath fails to resolve `"result": ...` as a path, warns, and — because mode is lenient — replaces it with empty string. The prompt now says `Respond in JSON: ` where it used to say `Respond in JSON: {{"result": ...}}`.

This is:
(a) A real behavior change for agents that don't reference `{{$conversation.id}}`.
(b) Silent (lenient mode, warn log only).
(c) Not caught by §7's "regression eval on existing agents" unless the eval set happens to contain a no-contextConfig agent with a stray `{{...}}` pattern — which is exactly the long-tail surface most evals don't cover.

The spec's §7.2 release gate "expect bit-exact prompt output for existing agents" is mis-stated: with this guard change, bit-exact is only guaranteed for agents where the prompt has NO `{{...}}` patterns at all, OR has only legitimate variable patterns AND a contextConfig. The intersection is narrower than "agents that don't use `{{$conversation.id}}`."
**Current design:** "G4: Customers who don't reference `{{$conversation.id}}` in any prompt see **zero behavior change.**" and "restructure so template rendering runs whenever `ctx.config.prompt` … contains `{{...}}`, even if `resolvedContext` is null."
**Alternative:** Gate the restructured render path on the prompt specifically containing `{{$`-prefixed variables (not any `{{...}}`). Implementation: `if (prompt.includes('{{$') || resolvedContext)`. That preserves the current behavior for non-contextConfig agents whose prompts contain non-`$` `{{...}}` patterns, and only activates the new path for prompts that actually reference a builtin. Narrower, lower blast radius, strictly stronger version of G4.
**Trade-off:** Gained: G4 becomes literally true; the eval regression gate becomes meaningful. Lost: ~1 line of extra guard logic; still covers the v1 use case (any `$conversation.*` prompt goes through the path).
**Status:** CHALLENGED
**Suggested resolution:** Either tighten the guard condition per the alternative OR relax G4's wording to acknowledge the restructure's broader blast radius and expand §7.2's regression corpus to include no-contextConfig agents with stray `{{...}}` patterns. Recommendation: the former — it's strictly safer and costs nothing.

---

### [H] Finding 3: The scope invariant (D6) is enforced by convention ("only agent-prompt callers pass `runtimeBuiltins`"), not by the type system or runtime guard. This is a 1-way-door security-relevant property defended by code review only.

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — security engineer reviewing 1-way-door constraints)
**Location:** §9 D6 discussion; §9 "Implementation mechanism"; §14 row "Scope-invariant violation" (LOW likelihood)
**Issue:** D6 declares a load-bearing invariant: `$conversation.*` must resolve only at the two agent-prompt render sites, NOT at `relationTools.ts:383` (delegation headers), `ContextFetcher.ts:281` (URLs), or `CredentialStuffer.ts:215` (MCP credentials). The stated rationale includes "confusing or potentially security-sensitive surprises" — specifically, conversationId leaking into MCP auth headers or outbound URLs would be a semantic + potentially privacy surprise.

The enforcement mechanism is: `runtimeBuiltins` is an optional parameter; only the two agent-prompt callers pass it; the other callers don't; therefore `$conversation.*` stays unresolved at those sites. This works *at the moment of implementation*. Six months from now, a new engineer adding a fourth `TemplateEngine.render()` caller (e.g., a new tool-argument templating feature) has no structural signal that passing `runtimeBuiltins` is or isn't safe. The type signature `runtimeBuiltins?: Record<string, unknown>` gives no hint about scope. The per-caller-merge in §9 says "Scope invariant (D6) enforced by construction" — but "construction" here means "human remembered which callers should pass it."

More concretely: the engineer who ships runtimeBuiltins sprinkles it at the two prompt callers. The engineer who adds a new feature two quarters later copy-pastes a render call from `relationTools.ts` (because it's the nearest example), refactors, and accidentally adds `runtimeBuiltins` because "that's what other code was doing." No test catches it unless the negative-path tests at §6 are exhaustively maintained as new callers are added — and the test at `relationTools.ts:383`, `ContextFetcher.ts:281`, and `CredentialStuffer.ts:215` is explicitly scoped to those three files. Site #4 has no negative-path test by construction.

A simple type-level enforcement exists: make `runtimeBuiltins` a distinct nominal type (branded, or a discriminated subtype `PromptRenderOptions extends TemplateRenderOptions`) such that only prompt-render callers can construct it. That's a 10-line addition and makes the scope invariant structurally enforced rather than tribal knowledge.
**Current design:** "Implementation uses per-site merge via new `options.runtimeBuiltins` parameter — only passed at agent-prompt sites" and "Scope invariant (D6) enforced by construction."
**Alternative:** Define a `PromptRenderOptions` type that extends `TemplateRenderOptions` and adds `runtimeBuiltins`. Export a dedicated `TemplateEngine.renderPrompt(template, context, opts: PromptRenderOptions)` method used only by the two agent-prompt callers. Non-prompt callers keep using the plain `render()` which has no runtimeBuiltins field. Then D6 is structurally enforced: it's impossible to pass runtimeBuiltins at a non-prompt site without deliberately choosing the prompt API. As a bonus, code review + code search ("where is `renderPrompt` called?") is trivial.
**Trade-off:** Gained: D6 moves from tribal-knowledge to compile-time invariant; the "enforced by construction" claim becomes literally true. Lost: one extra method on TemplateEngine; callers at prompt sites switch `.render()` → `.renderPrompt()` (5 lines).
**Status:** CHALLENGED
**Suggested resolution:** Add a named prompt-render entry point. Not a blocker for v1, but cheap to include now and significantly cheaper to enforce than to un-enforce later when a fourth caller is added. If declining, add a lint rule that flags any new `TemplateEngine.render()` caller passing `runtimeBuiltins` and requires reviewer sign-off.

---

## Medium Severity

### [M] Finding 4: The spec treats "template variable" and "template variable with support for future `$conversation.*` sub-paths" as identical 1-way doors, but they are not

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC3 (framing validity)
**Location:** §2 G1; §3 NG2 ("Conversation URL"); §15 Identified ("Conversation URL variant"); §10 D2
**Issue:** The spec locks `{{$conversation.id}}` as customer-facing syntax (D3, LOCKED, 1-way door) and simultaneously defers `{{$conversation.url}}` (NG2, NOT NOW) with revisit criteria. It also identifies "other runtime IDs" as Future Work (§15 Identified) but uncertain whether they'd be `{{$self.agentId}}` or `{{$conversation.something}}` shape.

The problem: shipping only `{{$conversation.id}}` with a `runtimeBuiltins = { $conversation: { id } }` shape commits the framework to treating `$conversation` as a namespace that can grow. If v2 wants `{{$conversation.url}}`, the mechanism is obvious: add a `url` key to the object. But if v2 wants `{{$conversation.participant.email}}` or `{{$conversation.firstMessage.timestamp}}`, the JMESPath resolution via runtimeBuiltins supports it — meaning the current implementation defines the *shape of future growth* without the spec declaring that shape.

This is a soft 1-way door the spec doesn't address: once `$conversation` is a namespace with one member, the namespace's semantics are "arbitrary conversation metadata." That's a bigger commitment than "this one ID." And it's made implicitly by the choice of nested shape (`$conversation.id`) rather than flat shape (`$conversationId`). The spec's rationale for nested (D3: "Dollar-prefix mirrors existing `$env.*` builtin convention; syntax-level collision-free with user-defined contextVariable names") justifies the `$`-prefix but does NOT justify nesting — `$conversationId` (flat) would also be collision-free.

The audit question a skeptical reviewer would ask: why `$conversation.id` and not `$conversationId`? The spec doesn't answer. If the answer is "because `$conversation.*` will grow," say so and commit to the growth shape. If the answer is "because `$env.*` grows and we're mirroring," note that `$env` grows horizontally (new env vars from `process.env`) not structurally (no nested env vars) — the analogy is weaker than it looks.
**Current design:** "`{{$conversation.id}}`, `$`-prefixed, nested" (D3); "Conversation URL variant (`{{$conversation.url}}`) — Future Work Identified" (§15).
**Alternative A:** Flat shape `{{$conversationId}}`. Pros: no implicit namespace commitment; mirrors peer-framework convention (`thread_id` in OpenAI/LangGraph per `evidence/prior-art-peer-frameworks.md`); simpler implementation (just a string value in runtimeBuiltins, no nested object). Cons: harder to grow cleanly — adding URL means a parallel variable `{{$conversationUrl}}`, not a natural sub-path.
**Alternative B:** Nested shape with explicit namespace commitment in §10 D3. Document that `$conversation.*` is a namespace for runtime conversation metadata and enumerate the anticipated growth (`id`, `url`, possibly `startedAt`) with semantics for each. Then D2 (no URL in v1) becomes a deferral under a known-shape namespace, not a deferral under an unknown shape.
**Trade-off:** Gained: the customer-facing syntax's future evolution is a considered 1-way door, not an accidental one. Lost: the discussion requires naming what else *could* live under `$conversation.*` — which the spec has some appetite for avoiding, since it narrowed scope to the ID.
**Status:** CHALLENGED
**Suggested resolution:** Either (a) flat, with explicit rationale in D3, or (b) nested with §10 D3 capturing the namespace semantics. Current state splits the difference and leaves the 1-way door underspecified. Note: this is also the frame the prior challenger's "relitigate shape" concern would have re-surfaced — it held up once (user picked nested), but the *rationale for nested* doesn't survive cold re-reading.

---

### [M] Finding 5: Strict-mode rendering semantics for `{{$conversation.id}}` are not defined; the fallthrough to `processBuiltinVariable` returns empty + warn, which behaves like lenient mode even in strict mode

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — the engineer who adds a third TemplateEngine caller that uses strict mode)
**Location:** §6 Functional ("strict mode — throws with clear variable name"); §9 "processBuiltinVariable" fallthrough path; `TemplateEngine.ts:146–160`
**Issue:** §6 states: "strict mode … throws with clear variable name." The proposed implementation in §9 adds a check against `options.runtimeBuiltins` in the `$`-prefix dispatch (line 68–69). The code path is: "if path resolves in `runtimeBuiltins`, return value; else fall through to `processBuiltinVariable`."

In the current codebase, `processBuiltinVariable` (line 146–160) does NOT respect strict mode. For an unknown `$`-prefixed path like `{{$conversation.unknown}}` or `{{$conversation.id}}` at a site that didn't pass runtimeBuiltins, it logs "Unknown built-in variable" at warn level and returns an empty string — silently, regardless of whether the caller is in strict mode.

This means:
- At a prompt site with runtimeBuiltins in strict mode: `{{$conversation.id}}` resolves correctly, but `{{$conversation.xyz}}` (typo) returns empty + warn, NOT throws. Violates the §6 "strict mode throws" claim for the new variable namespace.
- At a non-prompt site in strict mode (e.g., `relationTools.ts:383` which IS strict): `{{$conversation.id}}` returns empty + warn, NOT throws. A customer who accidentally puts the variable in a delegation-tool header template sees a silent empty value at a site the spec explicitly lists as strict.

This is not a hypothetical. The strict-mode failure modes at non-prompt sites are exactly the "semantic surprise" D6 is supposed to prevent — and D6's enforcement is "return empty, no resolution." But returning empty silently is arguably the worst failure mode at a strict-mode site: the error is swallowed, the empty string propagates, and the downstream MCP server receives a malformed URL or header with no signal.

The existing `$env.*` path has the same bug today (strict mode doesn't throw for unknown `$env.*` paths) — but the bug is less visible because `$env.*` falls through to `process.env[envVar]` which is defined at framework-load time, so there's a second dereference before the empty-string fallback. For `$conversation.*` in the new implementation, there's no such second dereference; it's pure empty-string-on-miss.
**Current design:** "strict mode — throws with clear variable name" (§6); new dispatch "check `options.runtimeBuiltins` via JMESPath; if the path resolves to a value there, return it. If not, fall through to the existing `processBuiltinVariable` dispatch" (§9).
**Alternative:** In the new dispatch, when `runtimeBuiltins` is passed but the `$`-path doesn't resolve there AND `options.strict` is true, throw with the variable name (matching the JMESPath-path behavior at line 79–80). At non-prompt sites in strict mode without runtimeBuiltins, `$conversation.*` should also throw — the silent-empty behavior is a latent bug we'd inherit.
**Trade-off:** Gained: strict mode's semantics are consistent across all template variable types; non-prompt sites that accidentally reference the variable fail loudly. Lost: touching `processBuiltinVariable`'s strict-mode handling marginally widens the implementation scope — but the fix is correct and the current behavior is already wrong for `$env.*`.
**Status:** CHALLENGED
**Suggested resolution:** Define strict-mode semantics for `$conversation.*` explicitly in §6 and fix `processBuiltinVariable` to honor strict mode. This is a latent correctness bug in `$env.*` the spec inherits; either fix it or explicitly accept it. The spec currently does neither.

---

### [M] Finding 6: A2A delegation semantics are stated for the happy path but the "variable absence carries no state" guarantee is not defended against author-mismatched agents

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-support engineer handling a delegation bug report)
**Location:** §2 G3, G4; §5 "A2A delegated sub-agent"; §10 D5
**Issue:** Spec asserts: "Customers who don't write the variable get no new behavior — implicit opt-out via absence" (§1, §2 G4). This holds when one agent author controls all prompts. The spec does not explore the author-mismatch case.

Scenario A — parent knows, child doesn't: Parent agent's author writes `{{$conversation.id}}` in the parent prompt. The LLM sees the ID and, during a delegation tool call, passes it to the child as a tool argument (perhaps in a delegation-meta `context` field or as explicit text in the delegated task description). The child's prompt does NOT contain the variable. The child's own prompt rendering produces zero behavior change — G4 holds for the child *syntactically*. But the ID has flowed to the child through the message/metadata payload. For the child's author who opted out by not writing the variable, the ID is still present in the child's conversation history and may be echoed in tool calls if the LLM copies it. Is this still "implicit opt-out via absence"? The spec's privacy framing says yes (the child's prompt didn't reference it), but a reviewer auditing a data-flow diagram would say the child received the ID anyway.

Scenario B — parent doesn't know, child does: Parent's prompt has no variable. Child's prompt has `{{$conversation.id}}`. Child is an A2A-delegated sub-agent; per §5 and evidence, child's runtimeContext.metadata.conversationId is the parent's user-conversation ID via existing propagation. Child resolves the variable correctly to the parent's ID. Parent had no opportunity to consent to its conversation ID being exposed through its subagent — because the subagent's author controls what the subagent's prompt references. The spec's "opt-in by writing the variable" framing assumes the variable-writer is the same entity as the conversation-owner. In a multi-author / multi-tenant / delegation-ecosystem setup, they aren't.

This isn't hypothetical for the framework. §10 D5 locks "delegated sub-agent resolves to parent's ID via existing A2A propagation." The implication: once a parent agent delegates to any sub-agent whose prompt uses the variable, the parent's ID flows to that sub-agent — regardless of whether the parent's author intended to expose it.

For the v1 Zendesk use case (all agents owned by one customer), this is irrelevant. For a future marketplace / shared-agent / plug-in-agent ecosystem — which the framework is architected toward — it's a privacy-model question the spec doesn't engage with.
**Current design:** "Implicit opt-out via absence. … agents that don't use it, don't [see new behavior]" (§2 G4); "`{{$conversation.id}}` in a delegated sub-agent's prompt resolves to the parent's (user-initiated) conversation ID" (D5).
**Alternative A:** Document the invariant precisely: "Implicit opt-out holds per-prompt. If any agent in a delegation chain writes the variable, that agent sees the ID; the ID does not 'infect' agents that don't reference it EXCEPT through ordinary LLM-generated tool arguments and message payloads." Acknowledge the author-mismatch case explicitly.
**Alternative B:** Gate delegation-propagated conversationId on the parent also referencing the variable. I.e., only populate `runtimeBuiltins.$conversation.id` in a child agent if the parent's prompt contains `{{$conversation.`. This preserves the parent's opt-out. But it's a complex runtime check and probably over-engineered for v1.
**Alternative C:** Accept the current design and name the edge case as a known v2 concern in §15 under a new "Multi-author delegation privacy model" entry.
**Trade-off:** Gained: privacy invariant is defensible under multi-author scenarios; the "opt-out via absence" claim survives cold review. Lost: more spec prose; Alternative B adds implementation complexity we don't need for v1.
**Status:** CHALLENGED
**Suggested resolution:** Alternative A or C. Pick one and say it in §6 Non-functional / Security or §15 Identified. Current silence on this reads as not-considered rather than accepted-with-eyes-open.

---

### [M] Finding 7: Release gate §7.1 (LLM transcription reliability ≥ 95 %) is a post-β-pure carry-over from α, but the failure mode it was designed to catch differs materially between the two designs

**Category:** DESIGN
**Source:** DC3 (framing validity — is the gate still measuring what matters?)
**Location:** §7 "Release gates" item 1; §10 Decision history
**Issue:** The 95 % transcription gate was designed to catch: "LLM reads a value from a prompt (ambient block or template substitution) and copies it into a tool-call argument." Under α (ambient), the mechanism was the same: the LLM sees a value in a `<conversation_context>` block and must transcribe it. Under β-pure, the mechanism is still "LLM reads substituted value and transcribes it." The claim in §7 is that the concern is unchanged.

But the two designs have a material difference: under α, the ID was present in every agent's prompt (broadcast); under β-pure, it's only present when the customer authored the variable into a specific context ("set the custom_fields.inkeep_conversation to {{$conversation.id}} …"). In α, the LLM might see the ID in context with no clear instruction to use it and fail to transcribe correctly because the intent was diffuse. In β-pure, by construction, the ID appears in a prompt position where the author explicitly told the LLM what to do with it.

These are different prompting conditions and likely have different transcription accuracy. The 95 % number was a plausible threshold for α (diffuse context). For β-pure, the relevant threshold is probably higher (the author is literally telling the LLM "put this value in this field"), and the failure distribution is probably different (β-pure failures are more likely to be "LLM didn't call the tool at all" than "LLM called the tool with a wrong ID").

The gate isn't wrong per se — but it's under-designed for β-pure. It should be re-characterized: what failure rate in the β-pure design materially harms the Zendesk use case? If the ID is only correlated "most of the time," is that acceptable? If not, the gate needs a stricter threshold; if so, the gate is over-engineered and should be relaxed to "95 % across prompt patterns where the author did NOT explicitly instruct the LLM what to do with the ID" (i.e., the ambient-like failure distribution).

Also: §7.1 says "Same concern as ambient would have had — template resolution happens before the LLM, so the LLM still has to copy the value from prompt context into the tool argument." This is partly true (the LLM still transcribes) but elides that under β-pure the author has also authored the *instruction to transcribe*. The failure mode "value present but LLM doesn't know to use it" doesn't exist in β-pure the way it did in α.
**Current design:** "LLM transcription reliability. Representative prompts using `{{$conversation.id}}` executed against Claude Opus / Sonnet / Haiku and OpenAI show the LLM correctly transcribes the substituted value into tool-call arguments in ≥ 95 % of runs across ≥ 50 representative prompt + tool-schema combinations."
**Alternative:** Re-characterize the gate as a β-pure-specific test: evaluate the Zendesk write-back E2E prompt + schema at each of the four models, expect ≥ 99 % success (high bar because the author explicitly instructs the model); separately test "author instructs implicitly or ambiguously" as a secondary test with a lower bar. Current 95 % across 50 combinations is not calibrated to the design.
**Trade-off:** Gained: gate measures a condition that distinguishes β-pure success from failure. Lost: more specific test matrix to maintain.
**Status:** CHALLENGED
**Suggested resolution:** Either raise the bar (99 %) for the β-pure-shaped prompts OR narrow the gate to explicitly what β-pure failure looks like. Current 95 % is an α-era artifact not updated for the pivot.

---

### [M] Finding 8: Deployment-mode implications (SaaS / self-hosted / widget) are acknowledged only for the deferred URL variant, not for the `id` variant the spec is actually shipping

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — SRE operating self-hosted + widget deployments)
**Location:** §3 NG2 (URL deferred); §13 deployment/rollout table; §6 Non-functional / Security
**Issue:** NG2 defers `{{$conversation.url}}` because URL canonicalization varies by deployment mode. Good — but the implicit assumption is that the `id` itself is deployment-mode-neutral. Is it?

Three concrete deployment-mode concerns the spec doesn't address for v1:

1. **Widget deployments.** In widget mode, the conversation ID may be the same as (or coupled to) a client-side conversation ID that end-users can see in URL fragments, cookies, localStorage. If the framework substitutes the same ID into tool calls that go to third-party MCP servers, the third party now has a correlation identifier that can link to the widget's end-user session — without the framework explicitly consenting to that. §6 states "the ID is already in customer URLs, logs, and OTEL spans" — but widget URLs are typically customer-facing, not customer-controlled. Is it the same privacy story?

2. **Self-hosted deployments.** ConversationIds in self-hosted are opaque strings generated by `generateId()`. In self-hosted, the customer controls the ID namespace. In SaaS, Inkeep controls it. The privacy invariant "conversationId is not sensitive" relies on the ID being opaque to third parties. For self-hosted customers, that invariant is *their* responsibility (they generated it); for SaaS, it's *Inkeep's* (we generated it). Neither the spec nor the release notes distinguish these postures.

3. **Multi-tenant SaaS.** The spec states the ID is already a span attribute, implying it's already observable. But span attributes are internal; tool arguments are external (flow to third-party MCP servers). Moving from internal-only to internal + external is a real change to the data-flow graph even for a SaaS deployment, and §6's invariant statement conflates "observable internally" with "safe to send externally."

§13 lists "Zero-drift on existing agents" and "CLI round-trip" as deployment concerns, but doesn't address deployment-mode differences. §6 gestures at deployment modes for URLs but not for IDs.
**Current design:** "conversationId is **not sensitive** — already a span attribute on every agent run" (§6); NG2 defers URL for deployment-mode reasons; ID variant treated as deployment-mode-neutral implicitly.
**Alternative:** Add a deployment-mode row to §13 with posture statements: (a) SaaS — Inkeep guarantees ID opacity; (b) Self-hosted — customer controls ID format; Inkeep's no-config-knob posture means the customer's IDs are exposed verbatim; (c) Widget — if widget IDs are derived from end-user-visible sources, document this as a known posture and reference (or create) a Future Work item for widget-safe correlation.
**Trade-off:** Gained: deployment-mode reviewers (self-hosted operators, widget integrators) have an explicit posture to evaluate. Lost: §13 grows by a row.
**Status:** CHALLENGED
**Suggested resolution:** Add the deployment-mode row. Cheap. Without it, self-hosted / widget operators have to re-derive the posture from first principles at ship time.

---

## Low Severity

### [L] Finding 9: "Residual state" concern from the re-challenge prompt (customer writes variable once, removes it) is implicitly fine but not stated as an invariant

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — compliance reviewer auditing data retention)
**Location:** §1 Resolution; §6 Non-functional / Security; §10 D3
**Issue:** The re-challenge prompt asks: "A customer writes the variable once, then removes it — can they be sure no residual state carries over?" The answer from the design is: yes, no residual state — `TemplateEngine.render()` is a pure function; there is no cache keyed on whether a prompt ever contained the variable; the ID is never persisted by the framework as a consequence of the variable being present; prompt text at render time is what gets rendered.

But the spec doesn't state this as an invariant. A compliance reviewer auditing whether the feature creates retention obligations would have to trace the code to confirm.

One edge the spec *does* have: if the customer's agent, in a prior conversation, emitted the ID into external systems (Zendesk tickets, Linear issues, audit logs) via the variable, those external systems retain the ID even after the customer removes the variable from the prompt. The framework has no obligation or capability to reach into those systems. But the spec doesn't note this either. A customer who thinks "remove the variable and the exposure is gone" would be wrong — only *future* renders stop substituting.
**Current design:** Pure-function resolution; no persistence beyond existing span attributes (implicit).
**Alternative:** Add a one-line invariant in §6 Non-functional: "No residual state — removing the variable from a prompt immediately stops future substitutions; the framework retains no record that the variable was ever used. External systems that received the ID via tool calls retain their own copies; framework cannot revoke."
**Trade-off:** Gained: compliance story is explicit. Lost: one sentence.
**Status:** CHALLENGED
**Suggested resolution:** Add the invariant. Trivial.

---

### [L] Finding 10: The decision-log rationale for "mirrors `$env.*` convention" undercounts the fact that `$env` has never been documented

**Category:** DESIGN
**Source:** DC3 (framing validity — precedent-of-one re-examined)
**Location:** §10 D3 rationale; §8 current state ("`$env.` is hardcoded at three separate UI sites"); §13 "docs obligation"
**Issue:** D3's rationale cites mirroring the `$env.*` convention as a principal justification for the `$`-prefix + nested shape. The prior challenger's M5 ("precedent of one, becoming the pattern") was accepted under α.

What the β-pure spec doesn't re-examine: `$env.*` is undocumented. Evidence file `downstream-surfaces.md` §5 notes: "No central 'template variables' reference page exists in `agents-docs/content/`. Grep: zero hits for `$env` across `agents-docs/content/`." The "precedent" is code-level only — customers can't discover `$env.*` today except by reading source or asking support.

So the D3 rationale reduces to: "new framework surface, but shaped like existing framework surface that customers can't find." The user-facing precedent is effectively zero. This weakens the "consistency with existing conventions" argument to "consistency with code-only conventions." The v1 docs obligation (§13, §6 Should requirement) is to fix this by finally documenting both together.

That's fine — but the spec doesn't state that the `$env.*` documentation burden is a precondition to cleanly rationalizing the `$conversation.*` shape. If the docs page slips or gets cut for time, the "mirrors convention" argument becomes "mirrors undocumented convention."
**Current design:** D3 rationale cites mirroring `$env.*`; Should requirement in §6 adds central docs page.
**Alternative:** Elevate the docs page from Should to Must (or make the `$env.*` documentation a hard prerequisite in §7 release gates). Alternatively: weaken D3's rationale to "we chose `$`-prefix for collision-safety; the shape mirrors our internal convention which is now being documented for the first time as part of this spec."
**Trade-off:** Gained: D3's rationale is self-consistent. Lost: a Should becomes a Must OR the rationale gets one more caveat.
**Status:** CHALLENGED
**Suggested resolution:** Promote the docs page to Must requirement, or soften D3's rationale to acknowledge the weak-precedent reality.

---

### [L] Finding 11: "Right set of release gates" — the gates miss "CLI round-trip preservation" and "UI lint does not regress on existing `$env.*`" as gates, only as tests

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — release engineer reviewing the ship checklist)
**Location:** §7 release gates; §6 Must requirements; §14 risks
**Issue:** §7 has three release gates: LLM transcription reliability, regression eval, Zendesk E2E. §6 lists CLI round-trip preservation and UI Monaco lint as Must requirements verified by tests. §14 lists both as HIGH-likelihood-without-the-fix risks.

The gap: the three §7 gates don't include the HIGH-risk regressions. A release where LLM transcription hits 96 % (passes gate 1), regression eval is clean (passes gate 2), and Zendesk E2E works (passes gate 3) could still ship with a CLI round-trip bug that silently loses the variable for customers who pull their agents via `inkeep pull`. The Must requirements in §6 cover this, but §7's explicit release gates don't — so if a tight ship deadline means §7 becomes the ship gate, the CLI bug slips.

Similarly, the UI lint regression: §6 has a Cypress test. §7 doesn't call out "no regression on existing `$env.*` Cypress assertions" as a gate. A lint change that accidentally breaks the existing `$env.MY_ENV` test case would be caught by CI but not surfaced as a release-gate concern.

These are the "category of failure" the re-challenge prompt asks about. The current gates cover runtime behavior; they don't cover author-tooling correctness, which is equally load-bearing for the β-pure design (author-tooling IS the opt-in channel — if Monaco marks the variable as an error, customers don't use it; if CLI strips it, customers lose it).
**Current design:** Three release gates covering LLM/runtime behavior.
**Alternative:** Add release gates: (4) CLI round-trip — `inkeep pull → inkeep push → diff` on an agent using `{{$conversation.id}}` and `{{$env.MY_ENV}}` produces no changes; (5) Monaco prompt editor — no regression on existing `$env.*` Cypress assertions; new `$conversation.id` asserted not-marked.
**Trade-off:** Gained: release gates cover the full customer-facing surface, not just the LLM surface. Lost: two more gate rows; CI already enforces the checks so this is mostly a visibility change.
**Status:** CHALLENGED
**Suggested resolution:** Add gates 4 and 5 to §7. Minor, high-signal.

---

## Confirmed Design Choices (summary)

Design choices that held up under cold re-read:

**DC1 lens (simpler alternative):**
- Variable-only over hybrid (ambient+template). Hybrid's cascade cost (ambient's auto-broadcast consent issue + schema migration for opt-out) is real and the pivot rationale is sound. My independent cold-read arrives at the same place the user did — β-pure is the cleaner privacy posture for v1. Upheld.
- Template-injection over transport-level header injection. `evidence/prior-art-peer-frameworks.md` establishes why Inkeep's MCP-remote-tools architecture makes template-injection consensus-correct *within Inkeep's constraints*. Upheld.
- MCP-side per-server header injection correctly rejected (coupling, invisibility, non-portability).
- Auto-inject-as-tool-argument correctly rejected (prompt-opacity violation).
- Bare top-level key (no `$`) correctly rejected (collision with user-defined contextVariables).

**DC2 lens (stakeholder gap):**
- Scope invariant D6 correctly identified as load-bearing; negative-path tests at three non-prompt sites correctly scoped. (Strengthened by Finding 3 but the invariant itself is sound.)
- A2A propagation via existing delegation-tool code — traced end-to-end in `a2a-conversation-id-propagation.md`; no new mechanism needed. Upheld.
- CLI round-trip and Monaco UI regressions correctly identified as HIGH-likelihood-without-the-fix in §14 and converted to Must requirements in §6. Upheld (noted as release-gate gap in Finding 11).
- `'default'` sentinel guard — correct handling; resolves to empty, no garbage leakage.

**DC3 lens (framing validity):**
- SCR framing holds: customer pain is real (Zendesk write-back use case), workarounds are genuinely poor (MCP-side header injection rejected for the reasons cited), resolution is proportional to the problem.
- 1-way-door classification of D3 (customer-facing syntax) is correct.
- D5 (A2A resolves to parent's ID) is correct and well-evidenced.

No finding surfaced that the core template-variable-only direction is wrong. The findings above are about how the spec *presents* and *defends* the choice, edge cases in implementation, and gaps the cold-read surfaced that the spec's rationale doesn't yet address. The design direction is sound; the spec prose + gates + guard mechanics have room to tighten.
