Use when: You want to enforce the transcript-derived meta-process reliably (decision batching, scope accordion, vertical slicing, autonomous investigation).
Priority: P1
Impact: The agent becomes "helpful" but not rigorous; the process loses the distinctive decision discipline.

---

# Traits and tactics

This is the behavioral "operating system" of the spec process.
Each trait includes: signal → the move you should make → what to record.

---

## Process traits

### 1) Seed + Delegate + Steer
**Signal:** User gives a high-level seed.
**Move:** Propose a structured plan (questions + research angles) and invite user steering via numbered choices.
**Record:** initial assumptions + backlog + plan.

### 2) Numbered Decision Batches
**Signal:** Many decisions are pending.
**Move:** Present 3-8 decisions as a numbered batch; request a numbered reply.
**Record:** decisions with dates + rationale.

### 3) Drill-down spiral
**Signal:** One area becomes interesting/uncertain.
**Move:** Go one layer deeper repeatedly: concept → current state → blast radius → implementation implications.
**Record:** why the drill-down matters; what it changes.

### 4) Scope accordion
**Signal:** You're exploring architecture and future directions.
**Move:** Expand to validate generality; contract to ship; preserve expansion as appendices.
**Record:** deferrals with "what we learned" + triggers.

### 5) Decision velocity calibration
**Signal:** Some items are easy; one is hard.
**Move:** Clear easy items quickly; slow down and research the hard one.
**Record:** which items need more evidence and why.

### 6) Gap-probing discipline
**Signal:** A milestone feels "done", or the open questions list feels "complete."
**Move:** Treat the feeling of completeness as a signal to probe harder. Re-run the three extraction probes (walk-through, tensions, negative space) from Step 4 against the current state. Restate: what's resolved, what's still open, what's blocking, and what hasn't been examined yet.
**Record:** current Open Questions list (top P0) + any newly discovered items from the re-sweep.

### 7) Documented deferral
**Signal:** You say "later", "Phase 2", or "future work" without concrete criteria.
**Move:** Document it properly (learnings, rationale, triggers, sketch). Then decide: does it pass the phase qualification bar (concrete acceptance criteria, owner, timeframe)? If yes, it earns a phase. If not, it stays as a documented deferral.
**Record:** deferral entry or qualified phase — not a vague bullet.

### 8) Recursive refinement loop
**Signal:** New findings change old decisions.
**Move:** Explicitly call out the revision and update affected parts of the spec.
**Record:** decision revisions + what they invalidate.

### 9) Spontaneous insight accommodation
**Signal:** "Oh, one thing..." pivot emerges.
**Move:** Integrate it; re-check impacted decisions; update backlog.
**Record:** pivot + cascade analysis.

### 10) Autonomous investigation with judgment stops
**Signal:** There are multiple unknowns.
**Move:** Investigate evidence gaps autonomously (code, dependencies, prior art). Stop when you hit judgment calls. Present findings + remaining threads for user direction.
**Record:** what was investigated, what was found, what still needs human judgment.

---

## Cognitive traits

### 11) Vertical slice thinking
**Signal:** Decisions span multiple layers.
**Move:** Always describe implications across UX/API/data/runtime/ops in one thread.
**Record:** vertical-slice summary in spec.

### 12) Pragmatic idealism
**Signal:** There is a "dream end-state" vision.
**Move:** Evaluate each pragmatic step by "does it foreclose the ideal?"
**Record:** explicit "does not foreclose because..." notes.

### 13) Scenario-based generalization testing
**Signal:** A pattern may become precedent.
**Move:** Test against 2-3 hypothetical future cases.
**Record:** generalization notes + constraints.

### 14) Uncertainty as an investigation trigger
**Signal:** hedging language ("maybe", "idk", "hmmm").
**Move:** Investigate rather than guess. If investigation is possible, do it; if it requires human judgment, surface as an open thread.
**Record:** what was investigated, what remains uncertain, what needs user input.

### 15) User as domain knowledge contributor
**Signal:** A question requires domain knowledge that isn't in the code, docs, or web — product intent, user behavior, organizational context, strategic priorities.
**Move:** Ask about what they know or think, and propose options for them to react to. Frame as intent/preference questions ("Do you need X, or would Y satisfy the need?"), not process questions ("Have you checked with...?"). Treat their answers as evidence.
**Record:** user-provided constraints and domain knowledge (with caveats where the agent's investigation suggests a different picture).

### 16) Constraint propagation
**Signal:** A decision impacts many downstream areas.
**Move:** Explicitly list what it unlocks/blocks; update backlog.
**Record:** cascade notes.

### 17) Latent issue discovery
**Signal:** Research for one question surfaces something unexpected — a bug, a race condition, an inconsistency, a gap in another area.
**Move:** Don't bury it. Flag it immediately ("While researching X, I found Y"), assess whether it affects the current design, and add it to the backlog.
**Record:** the issue, its impact assessment, and whether it changes any prior decisions.

### 18) Product-technical tension surfacing
**Signal:** Investigation reveals that a product goal and a technical constraint pull in different directions, or that the design optimizes for one dimension at disproportionate cost to the other.
**Move:** Surface the tension explicitly with evidence on both sides. Don't bury it in individual decisions — name it directly: "Your product goal is zero-configuration setup, but the technical design requires three environment variables. Either the goal softens or we need a different technical approach." Present both directions with their costs. See `references/challenge-protocol.md` for calibration.
**Record:** The tension, which direction was chosen, and why — in the Decision Log with cross-cutting type.

---

## Evaluation facets (apply to major decisions)
**See also:** `references/evaluation-facets.md` for the full set with "what to check" guidance.
