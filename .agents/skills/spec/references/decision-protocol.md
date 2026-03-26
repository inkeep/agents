Use when: Turning ambiguity into a structured decision backlog; running numbered decision batches; maintaining Open Questions + Decision Log.
Priority: P0
Impact: Conversation drifts; decisions aren't explicit; the user can't drive efficiently; "unknown unknowns" persist.

---

# Decision protocol

## Vocabulary (be strict)
- **Open Question:** Something we cannot decide yet without more info.
- **Decision:** A choice to commit to (even if reversible).
- **Assumption:** A temporary placeholder to unblock progress; must carry confidence + a verification plan.
- **Risk:** A known downside with probability/impact and a mitigation plan.
- **Deferred item:** Out-of-scope for the current phase, but documented with enough detail to pick up later.

## Assumption lifecycle
Assumptions are temporary scaffolding. Every assumption must carry:
- A confidence level (HIGH / MEDIUM / LOW)
- A verification plan (what would confirm or refute it)
- An expiry: by what point in the process must this be resolved?

When an assumption is verified → convert to Decision (with evidence reference).
When an assumption is refuted → cascade: what other decisions relied on this? Update them.

## Tagging schema (apply to every Open Question / Decision)
1) **Type:** Product / Technical / Cross-cutting
2) **Priority:** P0 (must), P1 (should), P2 (nice)
3) **Reversibility:** 1-way door / reversible
4) **Blocking:** blocks Phase 1? yes/no
5) **Confidence:** HIGH / MEDIUM / LOW (or CONFIRMED / INFERRED / UNCERTAIN)

## The numbered decision batch (default interaction contract)
When it's time for user input, present:

- **Decision 1:** <one sentence>
  - Options: A / B / C
  - Practical effect (what changes in the real world)
  - Recommendation (if evidence supports it)
  - Confidence + what increases it

Close every batch with a **"What I need from you"** block that differentiates the ask by confidence:
- For HIGH-confidence items (stated intentions): "I'll proceed with [X, Y] unless you object."
- For MEDIUM-confidence items (genuine choices): "I need your call on [D3, D5]."
- For items needing user vision: "These need your product judgment: [D7]."
- For tracked threads (§3): "Say 'go deeper on N' to direct further investigation."

This tells the user their **minimum viable response** — they see immediately whether they need to evaluate 1 hard decision or 5.

## Decision velocity calibration
In your batch:
- Put "easy/clear" items first (so the user can clear them quickly).
- Put the "hard/uncertain" items next with more context, investigation findings so far, and what further evidence would clarify.
- Keep batches small enough to answer in one reply (usually 3-8 items). This is a presentation constraint — the total backlog should be as large as reality demands. Extract exhaustively; present in digestible batches.
- **Dependency ordering trumps velocity ordering.** If one decision's outcome would materially change the options, relevance, or framing of other decisions in the batch — present it first, even if it's harder. The user shouldn't spend effort evaluating items that an upstream decision might invalidate.

## Confidence-weighted presentation (don't pretend all items are equally open)
For each item, signal:
- **Ready to decide now:** evidence is strong; recommendation included.
- **Needs more evidence:** the agent investigated but couldn't reach high confidence; present with current findings and what further investigation would clarify (open thread).
- **Needs user vision:** requires product strategy/positioning choice; ask directly.

### Format by confidence level

Match presentation depth to how open the decision actually is:

**HIGH confidence (ready to decide):**
State your recommendation as an intention. One sentence. No option grid.
> "I'll use three-dot diff to match GitHub PR semantics, with configurable target branch defaulting to main."

Include: what you'll do, why (brief), and what would change your mind. The user can object, redirect, or approve by not objecting.

**MEDIUM confidence (genuine choice):**
Present 2-3 options with tradeoffs. This is where the full decision format applies — options, practical effect, recommendation, evidence basis, confidence, what would increase it.

**LOW confidence / needs user vision:**
Full context: investigation findings so far, what's still unclear, what the options are and why you can't narrow them. Ask directly for the user's judgment.

**Exception:** 1-way doors always get the MEDIUM format (explicit options + confirmation) regardless of confidence — the cost of getting them wrong is too high to present as a stated intention.

## Uncertainty as an investigation trigger
Treat any of these as a signal to **investigate**:
- "I think...", "probably...", "maybe...", "not sure..."
- user: "hmmm...", "idk...", "help me think..."
- conflicting constraints or multiple plausible architectures

Your job:
- do not resolve uncertainty by guessing
- investigate what's accessible (code, dependencies, prior art, web)
- convert what remains into crisp decision options for the user — only what requires human judgment

## Bounded reasoning (when exact answers aren't available)

When the session can't produce an exact answer — no benchmark to run, no data to query, no definitive source — don't leave it as an open question. Bound it:

- **Order-of-magnitude estimates:** "Based on the stated user count and the code's current query pattern, we're looking at roughly 50-200 req/s. The design holds at 200; it breaks around 1K."
- **Comparable systems:** "Stripe handles a similar pattern with X; our scale is ~100x smaller, so the simpler approach likely works."
- **Consequence thresholds:** "This matters if the number exceeds N. Below that, the current design is fine. Do you expect it to exceed N in the next 12 months?"
- **Upper/lower bounds:** "Best case, latency adds 10ms. Worst case, 500ms if the cache misses. The p50 is probably fine; the p99 might not be."

Bounded reasoning turns "we don't know" into "we know enough to decide." Present the bounds, state what assumption would break them, and let the human decide whether the bounds are acceptable.

This is not false precision — explicitly state these are estimates and what would change them. The goal is to enable decisions, not predict the future.

## After every decision: cascade analysis
Immediately do:
1) Update Decision Log (what changed, why, date)
2) Identify what the decision unlocks:
   - new requirements
   - new constraints
   - new open questions
3) Identify blast radius:
   - product surfaces touched
   - technical systems touched
4) Update phases/deferrals if needed

## Stop conditions (when to force deeper diligence)
If any decision is a 1-way door (public API, schema, security boundary, naming):
- require explicit confirmation from the user
- propose evidence gathering if confidence isn't HIGH
- ensure the spec records rationale and rollback/migration implications

## When you disagree with the user's decision
If the user makes a decision you believe is wrong:
1. State your concern clearly and specifically (not "I'm not sure about this").
2. Explain what evidence supports a different direction.
3. If it's a 1-way door: push harder — "I want to flag this as high-stakes. Here's what I think we'd regret and why."
4. If it's reversible: record your concern in the decision rationale, note it's revisitable, and move on.
5. Never silently comply with a decision you believe is a mistake — the value of this process is surfacing risks the user might not see on their own.
