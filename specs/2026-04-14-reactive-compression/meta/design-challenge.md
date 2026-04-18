# Design Challenge — Reactive Mid-Generation Compression + Artifact Exclusion

**Challenger role:** Cold-reader stress test of the spec.
**Date:** 2026-04-14
**Baseline:** `a074f63cd`
**Scope of challenge:** the five areas requested + any independent concerns surfaced while reading.

Severity calibration used below:
- **HIGH** — challenges a LOCKED decision with new evidence or a concrete mechanism the spec missed.
- **MEDIUM** — proposes a meaningful refinement; spec is defensible but another option is competitive.
- **LOW** — nit / clarification request. Does not change what gets built.
- **DISMISSED** — independently arrived at an already-rejected path; rejection holds.

---

## Summary table

| # | Area | Severity | Verdict |
|---|---|---|---|
| C1 | Middleware vs outer try/catch (DEC-06) | MEDIUM | Rejection holds for **streaming**; partially holds for **non-streaming**. Spec should say so explicitly. |
| C2 | Retry budget of 1 (DEC-01) | LOW→MEDIUM | 1 is probably right, but the decision is under-argued and worth ladder-considering once. |
| C3 | Artifact stub vs full omission | MEDIUM | Plausible alternative: omit entirely for tool-result artifacts; keep stub only for initial-message artifacts. Worth a split. |
| C4 | Post-commit mid-stream overflow hard-fail | LOW | Dismissed. Recovery is not possible without SDK-level replay primitives that don't exist. |
| C5 | Removing proactive compression wholesale | MEDIUM | The **conversation-history** path already acts as a safety net. The concern is real but mitigated by existing design. Worth stating explicitly. |
| C6 | `doGenerate()` / `doStream()` signature (NEW — independent) | HIGH | Spec's §6.2 pseudocode `doGenerate({ ...params, prompt })` does not match the installed AI SDK type — `doGenerate` is `() => ...` with no args. Implementer will need to call `options.model.doGenerate(modified)` directly, or use `transformParams` pattern. Spec acknowledges this in a `NOTE` comment but does not describe the mechanism. |
| C7 | `transformParams` as alternative to manual peek (NEW) | MEDIUM | The AI SDK has a built-in `transformParams` middleware hook. Not usable for **reactive** transform (error-driven), but worth naming in the decision log so readers see why it was rejected. |
| C8 | Compressor lifecycle & concurrency inside the middleware (NEW) | MEDIUM | `ctx.currentCompressor` is attached to the outer run context, but the middleware runs per-model-call. Spec doesn't describe how the middleware gets the compressor. This is an implementer gap, not a design gap — but it should be named. |

---

## C1. Middleware vs outer try/catch — DEC-06 "1-way door" verdict

**Spec claim:** Outer try/catch resets state (step counters, tool accumulation, `onStepFinish` side effects). Middleware is the only correct interception layer.

**Challenge:** The claim is **fully correct for the streaming path** but **too strong for non-streaming `generateText`**. At `generate.ts:318`, the non-streaming call is:

```ts
rawResponse = await generateText(nonStreamingConfig as ...)
```

`generateText` is atomic from the outer system's perspective — nothing is persisted, streamed to the user, or passed to `onStepFinish`-based side-effect collectors until after it resolves. An outer try/catch + retry with recompressed messages would work *for this branch* without state loss. The spec's rationale — "step counters, tool-call accumulation, `onStepFinish`" — is about what happens **inside** a multi-step run, but `generateText` owns those internally and a failed call leaves no external residue.

Why the spec is still right to pick middleware:
1. **Uniformity.** One code path for both streaming and non-streaming reduces bug surface.
2. **Multi-step overflow at step N>1 in non-streaming** — if `generateText` has already completed step 1 internally and overflows on step 2, an outer catch *does* lose step 1's state. Middleware catches it at the `doGenerate` call for step 2 without losing step 1. This is the strongest argument for middleware in non-streaming, and the spec **does not make it**.
3. Streaming dominates product usage, and the streaming argument is airtight.

**Recommendation (severity: MEDIUM):** Keep DEC-06 LOCKED, but refine the rationale:
> "Outer try/catch works for single-step non-streaming overflow, but (a) streaming commits state to the end-user before overflow can be retried, and (b) overflow at step N>1 of a multi-step `generateText` would lose steps 1..N-1. Middleware intercepts at the per-step boundary and covers both cases uniformly."

This closes a defensibility gap a reviewer would flag. It also answers the user's question "any AI SDK mechanism we're missing that would let us retry at a higher level without resetting state?" with a definitive **no** (grounded in the two points above), rather than the current hand-wave.

---

## C2. Retry budget of 1 — no compression-aggression ladder?

**Spec claim:** DEC-01 LOCKED at retry=1. DEC-05 LOCKED at no `max_tokens` reduction on retry. A2 notes `input + max_tokens > context` can still fail even after compression (Anthropic error string #2).

**Challenge:** If the first compressed retry *can fail for exactly the reason DEC-05 acknowledges*, a one-step ladder is leaving an easy win on the table. A compression-aggression ladder could be:

- **Attempt 1 (current):** `compressor.safeCompress()` — standard summarization.
- **Attempt 2 (proposed):** More aggressive — drop oldest N tool results entirely, or recompress the already-compressed summary with a tighter token target.
- **Attempt 3:** Hard fail.

**Counter-argument (why 1 might still be right):**
- **Second overflow is almost certainly a budget problem, not a shape problem.** The standard compression collapses full history into `{high_level, user_intent, decisions, open_questions, next_steps, related_artifacts}` — if that *plus* `max_tokens` still overflows, more aggressive summarization yields marginal bytes relative to `max_tokens`. Reducing `max_tokens` would help more, and the user explicitly rejected that (DEC-05, operator-config concern).
- **Retry cost compounds.** Each compression is a full LLM call. A 3-step ladder on a single user turn = 3 extra LLM calls, each adding seconds of latency for a user who is already waiting longer than usual.
- **Observability-first posture.** Ship reactive-with-1-retry, measure `compression.outcome = 'second_overflow'` rate, then decide if a ladder is worth it. This is consistent with how the spec treats other post-ship questions (OQ-01, OQ-02).

**Verdict (severity: LOW→MEDIUM):** 1 is probably correct, but the spec does not argue it. Add one sentence to DEC-01:

> "A second compression pass would yield diminishing bytes against a `max_tokens`-dominated budget (see A2). Measure `compression.outcome = 'second_overflow'` post-ship; revisit if rate is non-negligible."

This converts a bare "LOCKED" into a defensible decision with a triggered revisit condition.

---

## C3. Artifact reference stub — does the LLM get confused by a reference it cannot act on?

**Spec claim:** Replace oversized artifact content with:
```
[Artifact "<name>" (id: <id>) — content omitted (~<N>K tokens, exceeds context budget). Content unavailable in this turn.]
```
Risk R4 rates hallucination risk as LOW.

**Challenge — distinguish two contexts:**

1. **Initial-message artifacts (`buildInitialMessages`).** These are background context the agent may reference. A stub is appropriate — dropping them silently would mean the agent doesn't know a relevant artifact exists.

2. **Tool-result artifacts (`buildToolResultForModelInput`).** Here the artifact *is the return value of a tool the agent just called*. A stub says "you called `get_report`, and the report exists but you can't read it." This is exactly the case that risks confusion:
   - The LLM may retry the same tool call, believing it failed.
   - The LLM may hallucinate the content ("The report shows revenue grew 12%..." when it has never seen the content).
   - Compared to R4's LOW rating, this sub-case is meaningfully higher risk because the agent has a **direct causal expectation** of content.

**Simpler alternative for the tool-result case:** replace the tool result with an **error-shaped** tool result:

```json
{
  "error": "result_too_large",
  "message": "Tool returned ~NK tokens, exceeding context budget. Cannot include in this turn.",
  "artifactId": "<id>",
  "name": "<name>"
}
```

This is semantically what happened (tool executed, result was too large to pass to the model) and LLMs are trained to handle tool errors — try a different approach, ask the user, or give up gracefully. Much less hallucination risk than a bracketed text stub.

**Recommendation (severity: MEDIUM):** Consider splitting §6.4:
- Initial-message path: keep the stub (current design).
- Tool-result path: emit an error-shaped tool result instead.

If the user rejects this, R4's rating should be upgraded to MEDIUM with a mitigation note ("monitor hallucination rate on tool-call-following turns"), because the tool-result sub-case is where hallucination is most likely to surface.

---

## C4. Post-commit mid-stream overflow — any recovery?

**Spec claim:** Once a first real chunk has been emitted, retry is unsafe. Hard-fail.

**Considered alternatives:**
- **Replay from client.** The client would need to discard the committed output and re-request. Requires protocol support at the streamHelper/SSE layer. Big surface area for an A3-confirmed rare case.
- **Buffer-then-commit.** Delay first-chunk emission until "safe" (arbitrary heuristic), then commit. Breaks TTFT requirement (R6).
- **Server-side replay via a retry marker.** Emit a signal mid-stream, have the outer handler discard and re-drive. No AI SDK primitive for this.

All alternatives require cross-layer protocol changes for a rare case (A3: HIGH confidence rare). **Verdict (severity: LOW, DISMISSED):** Hard-fail is correct. Independent arrival confirms the rejection.

One addition the spec could make: a **telemetry attribute for this specific path** — `overflow.post_commit = true` — so post-ship data can confirm A3's "rare" assumption or falsify it. R8 lists many attributes but not this one.

---

## C5. Removing proactive compression wholesale — any safety net left?

**Spec claim:** DEC-04 LOCKED (swap wholesale, no feature flag). Risk: "calls that previously succeeded via compression now hit real overflow and need the retry path" (rated MEDIUM, accepted-by-design).

**Challenge:** The spec frames this as "retry handles them." True, but retry is lossy (destructive summarization) *and* adds latency (extra LLM call inside the user-visible turn). The proactive compression was at least *predictable*: it fired when the operator could still cancel, and never surprised the user mid-turn with a hidden second LLM call.

**Is there a safety net left?** Yes, and the spec doesn't call it out:
- **Pre-generation conversation-history compression** (`conversations.ts:380-432`, explicitly out of scope) still runs and still compresses based on prediction. So the "safety net for cases on the edge" already exists — just not inside the generation loop. This is a genuinely reassuring fact that strengthens DEC-04 but is buried in §4 "Unchanged."

**Independent concern — prediction within the loop as a soft signal, not a trigger.** Consider: keep the token-budget *check* in `prepareStep`, but have it only **emit telemetry** (`context.budget_headroom_pct`), not compress. This lets operators observe how close to overflow successful calls get, and retroactively validate whether the reactive approach is leaving headroom or not. Zero behavior change, high observability value. The spec removes the branch wholesale — removing the compression call is correct, but removing the measurement is a missed-observability cost.

**Recommendation (severity: MEDIUM):**
1. Strengthen DEC-04 by explicitly naming the pre-generation compression as the remaining safety net.
2. Consider keeping a lightweight `prepareStep` telemetry emitter that reports prediction-vs-actual headroom without triggering compression. This is cheap and high-signal, and would directly answer OQ-01 post-ship.

---

## C6. [NEW] `doGenerate()` / `doStream()` no-arg signature

**Finding:** From `@ai-sdk/provider@3.0.4/dist/index.d.ts:2066-2088`:

```ts
wrapGenerate?: (options: {
    doGenerate: () => ReturnType<LanguageModelV2['doGenerate']>;
    doStream:   () => ReturnType<LanguageModelV2['doStream']>;
    params: LanguageModelV2CallOptions;
    model:  LanguageModelV2;
}) => Promise<...>;
```

`doGenerate` and `doStream` are **nullary** (`() => ...`). They close over the (already-transformed) params. The spec's §6.2 pseudocode:

```ts
return await doGenerate({ ...params, prompt: compressedPrompt });
```

**does not type-check.** This is flagged only as a NOTE comment in the spec. Implementer will need to take one of these routes:

- **(a)** Call `options.model.doGenerate({ ...params, prompt: compressedPrompt })` directly on retry. This bypasses the closure — the outer `doGenerate()` is unusable for the retry. The initial call uses the closure; retry calls `model.doGenerate` directly.
- **(b)** Re-design to use `transformParams` for the compressed prompt. Not viable because transformParams fires before `doGenerate` — it can't know whether compression is needed until after the error.
- **(c)** Use a stateful middleware that sets a "force-compressed" flag, throws, and re-enters via... no, middleware doesn't re-enter. This doesn't work.

**Recommendation (severity: HIGH for spec quality, LOW for architectural risk):** Replace the NOTE comment with a concrete implementation pointer:

> "Retry calls `options.model.doGenerate({ ...params, prompt: compressedPrompt })` directly. The closure-based `doGenerate()` is used for the initial attempt only."

Without this, the implementer will hit the type error and re-open DEC-06 ("maybe we should wrap at a different layer"), costing time and risking an incorrect redesign.

---

## C7. [NEW] `transformParams` considered and rejected?

The AI SDK provides `transformParams?: (options: { type, params, model }) => PromiseLike<params>` — a proactive shaping hook. It's exactly what the AI SDK maintainers recommend (evidence: discussion #8193). The spec rejects proactive shaping in favor of reactive retry, but never explicitly names `transformParams` as the considered-and-rejected proactive primitive.

**Recommendation (severity: MEDIUM, editorial):** Add one row to the Decision Log:

| DEC-11 | Do not use AI SDK `transformParams` middleware | Technical | Reversible | HIGH | LOCKED — `transformParams` runs before every call; it is proactive by construction and would reproduce the false-positive problem. `wrapGenerate` / `wrapStream` are reactive (fire only on error). |

This closes a comprehension gap for future readers and, more importantly, prevents a future contributor from "simplifying" by moving compression to `transformParams`.

---

## C8. [NEW] Compressor lifecycle inside the middleware

**Finding:** `ctx.currentCompressor` is attached to the outer run context (seen in `handleGenerationError` at `generate.ts:126-130`, which cleans it up). The middleware, however, is attached at model-construction time and has no direct reference to `ctx`.

The spec doesn't describe how the middleware obtains:
- The compressor instance (to call `safeCompress` on retry).
- The context breakdown / telemetry span to emit the retry attributes.
- The model-specific thresholds.

**Options:**
- **(a)** Construct the middleware *per-request* (closure over `ctx`). Requires wrapping the model per-run, not per-agent. Slightly more GC pressure, simplest correctness.
- **(b)** Use AsyncLocalStorage (already imported elsewhere in the codebase — `@inkeep/agents-core` OTel wiring uses it). Middleware reads the current context without needing it passed.
- **(c)** Attach compressor state to `params.providerOptions` or a similar opaque channel. Fragile.

**Recommendation (severity: MEDIUM):** The spec's ASK_FIRST already flags "Choice of where exactly to wire `wrapLanguageModel`" — good. Add to that the compressor-access mechanism. Per-request construction (option a) is the obvious default; AsyncLocalStorage is the scalable default. Pick one in-spec rather than delegating to implementer, because the choice affects test structure (middleware unit tests need to know how to inject the compressor).

---

## What held up

- DEC-03 (no retrieval tool) — sound under current scope.
- DEC-07 (stream peek mechanics) — sound.
- DEC-10 (remove `_oversizedWarning`) — sound; evidence confirms the warning is currently inlined with the bloat, so removing it is a pure improvement.
- R6 (TTFT preservation) — the peek-then-prepend design is correct. Evidence/middleware-approach.md is accurate.
- R7 (post-commit propagation) — correct per C4 above.

## What should change in the spec

Minimum viable edits (in priority order):
1. **C6:** Replace the §6.2 `NOTE` comment with the concrete `options.model.doGenerate(modified)` pattern. *(spec-quality bug)*
2. **C3:** Split artifact exclusion into initial-message path vs tool-result path; use error-shaped result for tool-result case. *(design refinement)*
3. **C1:** Strengthen DEC-06 rationale with the "multi-step step-N>1" argument. *(defensibility)*
4. **C5:** Name pre-generation compression as the remaining safety net; consider a telemetry-only prepareStep check. *(observability)*
5. **C7:** Add DEC-11 explicitly rejecting `transformParams`. *(future-contributor-proofing)*
6. **C8:** Name the compressor-access mechanism. *(implementer clarity)*
7. **C2:** Add one sentence to DEC-01 justifying retry=1 against a ladder. *(defensibility)*

No findings reopen the core architecture. The middleware-based reactive retry + artifact exclusion shape is sound.
