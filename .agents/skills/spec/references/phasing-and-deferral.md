Use when: Planning phases, ordering work by risk/validation, distinguishing 1-way doors vs reversible choices, and documenting deferrals.
Priority: P0
Impact: You ship prematurely, or you overbuild; future work loses context; "later" becomes re-research.

---

# Phasing and deferral

## Phases are about validating assumptions
A good phase plan answers:
- what architectural assumption does this phase validate?
- what user value does this phase deliver (if any)?
- what risk does it retire?

## Phase 1 selection criteria
Phase 1 should:
- Validate the core architectural bet (if the architecture is wrong, Phase 1 reveals it)
- Serve at least one consumer type end-to-end (not a partial experience for everyone)
- Be the minimum scope where the design proves it works under real conditions
- Leave every Phase 2+ feature additive (no rework of Phase 1 required)

If Phase 1 requires rework to support Phase 2, the phase boundary is wrong.

## Phase 2+ qualification (phases are earned, not default)

Phase 1 is always present. Additional phases must earn their way in — they are committed, executable plans, not aspirational buckets.

A phase is warranted when you can concretely fill in **all** of these:
- **Goal:** What specific assumption does this validate or what user value does it deliver?
- **Acceptance criteria:** Verifiable conditions (not "works correctly" or "supports more providers")
- **Owner:** Who will execute this?
- **Timeframe:** When is this planned? ("after Phase 1", "Q3", etc. — not "someday")

If you cannot fill these in concretely, the item belongs in **Documented Deferrals** — not a phase.

### Phase vs. Deferral

| Signal | Phase | Deferral |
|---|---|---|
| Acceptance criteria | Concrete, verifiable | Vague or aspirational |
| Owner | Assigned or assignable | TBD or none |
| Timeframe | Planned | "Eventually" or "when needed" |
| Scope | Well-defined (you could write user stories) | Exploratory or open-ended |
| Dependencies | Clear (blocked by Phase N, needs X first) | Unclear or speculative |

### Scale check

Not every feature needs multiple phases. A small feature with Phase 1 + documented deferrals is often the right shape. Don't manufacture Phase 2 just because the template has a section for it — the template is a menu, not a mandatory form.

## Technical vs product milestones
Call out explicitly:
- **Technical milestone:** internal validation; may deliver no user value
- **Product milestone:** onboarding, docs, UX; users can actually use it

Don't conflate the two.

## 1-way doors: require diligence
Examples:
- public API/SDK shape
- persistent data model / schema
- URLs / naming exposed to users
- security/auth trust boundaries
- irreversible migrations

For 1-way doors:
- require explicit user confirmation
- prefer evidence-backed research
- record rationale + rollback/migration strategy

## Reversible decisions: phase intentionally
Examples:
- internal factoring
- non-public implementation choices
- optional UX enhancements
- feature flags and rollout defaults

For reversible choices:
- decide faster
- record the current choice and why it's good enough for now
- note what would trigger revisiting

## Documented deferral (never "just later")
When deferring:
- What we learned (summary)
- Why we're not doing it now (scope/risk/time)
- Triggers to revisit (scale, customer demand, failures)
- Implementation sketch (enough to avoid re-research)

Capture deferrals as appendices in the spec.

## The scope accordion
Use it deliberately:
1) Expand scope to test generality ("does this pattern work for future providers?")
2) Contract to implement Phase 1
3) Preserve the expanded thinking as a documented appendix

This prevents "scope creep" while preserving insight.
