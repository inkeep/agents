Use when: Mapping current system behavior, designing architecture, evaluating options, defining API/data/runtime changes, and reasoning about enforcement points.
Priority: P0
Impact: The spec collides with reality during implementation; hidden constraints surface too late.

---

# Technical design playbook

## The integrated stance
Every technical choice must be described with its product implications:
- "What does this mean for users?"
- "What does this mean for operators?"
- "What does this mean for future flexibility?"

## Current state trace (non-negotiable for meaningful changes)
Before recommending architecture:
- trace how the system works today end-to-end
- identify constraints and latent bugs
- identify reusable patterns

If you cannot verify current state from the codebase directly:
- investigate using `/research` or `/explore` to confirm
- label what remains uncertain after investigation

## Internal prior art
Always search for:
- similar config models
- similar auth models
- similar UI patterns
- similar package/module boundaries
- similar runtime/transport patterns

Then explicitly say:
- what we reuse
- what we intentionally diverge from

## Internal surface-area map
Map which internal subsystems this feature touches. This is the internal counterpart to the product surface-area impact map.

**Load (in parallel, if available):** `/internal-surface-areas` and `/audience-impact`. These are complementary dimensions — the surface-area skill catalogs *what internal subsystems are touched*, while audience-impact identifies *who is affected and how fast impacts propagate* (especially silent impacts). Load both together; synthesize their outputs into the surface-area map and blast radius analysis below.

Use `/internal-surface-areas` as the baseline and identify which internal surfaces this feature touches — including transitive dependencies via the catalog's dependency graph or impact matrix. Fill gaps only for areas the catalog doesn't cover.

**If the skill is not available**, enumerate from investigation:
- build & package graph
- CI/CD pipelines
- test infrastructure
- database schemas & data access layer
- authentication & authorization infrastructure
- shared runtime types & validation
- observability infrastructure
- runtime engine / core processing
- deployment artifacts
- environment & configuration

For each surface touched:
- what changes
- coupling tightness (shared DB, API contract, event bus, etc.)
- blast radius (direct + transitive dependents)
- failure mode if this surface breaks

## Dependency capability checks
For any design that relies on a third-party capability:
- verify via types/source (not marketing docs)
- confirm extension points
- confirm error semantics
- record alternatives if capability is missing

Investigate directly — use `/research` for deep evidence trails.

When the spec substantively depends on 3P systems, go beyond targeted checks — dispatch Task subagents to investigate capabilities, source code, documentation, and best practices scoped to your scenario. See `references/research-playbook.md` "Third-party dependency investigation."

## Concurrency & data consistency patterns
When the spec involves concurrent data access, multi-step writes, or shared state, investigate these pattern categories during design — don't leave them for implementation to discover.

**Check-then-act (TOCTOU):** Code reads a value, checks a condition, writes based on it — without wrapping both in a transaction or atomic operation. Another request can change the checked value between the read and write.
- Signal: select-then-conditional-insert/update outside a transaction; application-enforced uniqueness without a DB constraint; distributed lock via separate GET/SET instead of atomic SET NX.

**Read-modify-write:** Code fetches a value, transforms it in application memory, writes it back. Concurrent operations lose each other's updates.
- Signal: counter/balance arithmetic in application code instead of atomic SQL; JSON column merge via spread/concat in application code; upsert via SELECT-then-INSERT instead of INSERT ON CONFLICT.

**Isolation & transaction boundaries:** Operations that should be atomic aren't grouped properly, or the isolation level doesn't match the consistency requirement.
- Signal: critical paths (financial, permissions, inventory) using default isolation without conscious choice; aggregate check + insert that can be violated by concurrent inserts; transaction that reads the same row twice assuming consistency without FOR UPDATE.

**Shared mutable state:** Module-level mutable variables in single-process runtimes (e.g., Node.js) where concurrent requests share memory.
- Signal: module-scope `let` or `Map` mutated by request handlers; request-scoped context (currentUser, currentTenant) stored in module-level variables.

**Optimistic locking:** Version/timestamp columns that exist in the schema but aren't actually checked during updates, or conflicts that are silently swallowed.
- Signal: schema has version column but update WHERE clause doesn't include it; update checks version but doesn't verify rowCount or throw on conflict.

For each pattern that applies to the design: make it an explicit decision with the chosen consistency model, the tradeoffs, and what failure mode the design accepts.

## Enforcement architecture
For any policy/filtering/validation question:
- identify the narrowest shared chokepoint
- decide config-time vs runtime enforcement
- ensure the rule cannot be bypassed by untrusted clients

Record this as a decision (often cross-cutting and high-stakes).

## Vertical-slice explanation (default communication format)
When proposing a solution, always include:
- user journey implication
- UX surfaces impacted
- API/SDK shape
- data model change
- runtime/transport behavior
- observability/ops impact
- migration/rollout plan

## Blast radius mapping
If a change touches core primitives:
- list direct dependencies
- list indirect dependencies
- list "likely unaffected" areas with reasoning (don't guess silently)

Use `/audience-impact` output (loaded above with the surface-area map) to map blast radius by persona — which roles are affected, impact propagation timing (immediate, next-publish, next-deploy, silent), and what deliverables each affected audience needs.

## Options and tradeoffs
For each viable option:
- performance
- reliability/failure modes
- security boundary changes
- operability (debuggability, telemetry)
- migration complexity
- conceptual simplicity

Then recommend with confidence and evidence.
