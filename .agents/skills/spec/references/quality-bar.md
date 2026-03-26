Use when: Checking completeness and correctness of the PRD+tech spec; ensuring traceability; avoiding hidden gaps.
Priority: P0
Impact: Specs are not implementable, not testable, or fail to capture user value and operational reality.

---

# Quality bar

## Must-have checklist
- [ ] Problem statement is specific (who, pain, why now)
- [ ] Goals and non-goals are explicit
- [ ] Primary personas/consumers identified
- [ ] At least one end-to-end user journey per primary persona
- [ ] Requirements are prioritized with acceptance criteria
- [ ] Acceptance criteria describe observable behavior (not internal mechanisms — see /tdd)
- [ ] Current state described (how it works today, constraints)
- [ ] Proposed solution described as a vertical slice (UX → API → data → runtime → ops)
- [ ] Decision Log exists with rationale, door-type classification, and evidence links
- [ ] Open Questions have statuses and next actions
- [ ] Spec includes both PRD + technical design (not just one)
- [ ] Every major assertion is evidence-backed or labeled ASSUMPTION with a verification plan
- [ ] Deferrals are documented (not vague)
- [ ] Success metrics defined: what to measure, baseline, target, instrumentation plan
- [ ] Evidence files contain primary source material (not just summaries)
- [ ] NOT FOUND claims include documented negative searches

## Should-have checklist
- [ ] Consumer matrix (how each persona/consumer experiences this end-to-end)
- [ ] Product surface-area impact map (dashboards, API, SDK, CLI, docs, billing, errors)
- [ ] Internal surface-area impact map (build, CI/CD, database, auth, runtime, observability, deployment)
- [ ] If repo-level surface area skills exist, were they consulted and referenced?
- [ ] Alternatives considered (why not)
- [ ] Risks and mitigations with owners
- [ ] Phasing is ordered by architectural risk validation + user value (not just "small chunks")
- [ ] Phase 2+ sections pass the qualification bar (concrete acceptance criteria, owner, timeframe) — if not, move to documented deferrals

**Escalation note:** Should-have items become must-have when any "High-stakes stop and verify" trigger applies (below), unless the user explicitly accepts the risk of skipping.

## Phase completion gate
A phase's spec is complete when:
- [ ] Phase N goals and non-goals are explicit
- [ ] All Phase N blockers are resolved OR explicitly deferred with a documented plan
- [ ] Owners and next actions exist for Phase N execution
- [ ] The user agrees the remaining uncertainty is acceptable for this phase

Do not declare a phase complete unilaterally. Surface the remaining unknowns and ask the user whether they're comfortable proceeding to implementation.

## Traceability checks (the "two-way link")
- [ ] Every top requirement maps to an implementation plan element
- [ ] Every major design decision explains user impact
- [ ] Every 1-way door has explicit confirmation and evidence (or a clear plan)
- [ ] Assumptions are treated as temporary scaffolding (see `references/decision-protocol.md`) and are not left "forever unresolved" without an explicit decision to accept risk.

## High-stakes "stop and verify" triggers
If any of these are true, force deeper diligence:
- security boundary changes
- new auth/permissions model
- public API/SDK stability commitments
- data model migrations
- large blast radius across core systems

For these:
- treat all Should-have items as Must-have unless the user explicitly accepts the risk
- require evidence-backed research (often `/research`)
- explicitly label what's uncertain
- record rollback/migration strategy

## Common failure modes
- Missing failure experience (what does the user see when upstream fails?)
- Missing operational plan (telemetry, alerts, debugging)
- Missing migration story (how do we roll out without breaking existing users?)
- Over-optimizing architecture while degrading user mental model
- Under-researching 1-way doors and discovering constraints late
