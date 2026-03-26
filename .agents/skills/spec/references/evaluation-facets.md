Use when: Evaluating a major design decision across product, technical, and cross-cutting dimensions.
Priority: P0
Impact: Missing a relevant facet leads to rework; decisions lack rigor; important edge cases are discovered too late.

---

# Evaluation facets

Before any major decision, scan these facets. Not every one applies — but check all to identify which do.

If the decision is non-trivial and you have not checked the relevant facets, investigate them before recommending.

---

## Facets with detailed guidance

### Enforcement architecture
**Question:** Where does enforcement happen — client, server, proxy, or multiple layers?
**What to check:**
- Identify the narrowest shared chokepoint
- Decide config-time vs runtime enforcement
- Ensure untrusted clients cannot bypass the rule
- Check for redundant enforcement that could be simplified

### Configuration UX
**Question:** How do users configure this? Where do settings live?
**What to check:**
- Where does the user set this? (Dashboard, CLI, config file, API, env var)
- Is the configuration surface consistent with existing patterns?
- What are sensible defaults?
- What happens if configuration is missing or invalid?

### Naming & semantic correctness
**Question:** Are names consistent across every surface?
**What to check:**
- Pick one canonical term and trace it through every layer (API, DB, UI, docs, CLI)
- Check for synonyms that could cause confusion
- Verify naming against existing codebase conventions
- Check that names are accurate to what they represent (not what they were in an earlier design iteration)

### Failure & edge case UX
**Question:** What happens when things go wrong? What does the user see?
**What to check:**
- For each failure mode: what does the consumer see?
- Are error messages actionable (tell user what to do, not just what went wrong)?
- Are partial failures handled gracefully?
- What's the degraded experience? Is it acceptable?

### Migration & backward compatibility
**Question:** How do existing users transition? What breaks?
**What to check:**
- What existing behavior changes?
- Can migration be automated or does it require manual steps?
- Is there a rollback path?
- Can old and new coexist during transition?

### Concept economy
**Question:** Are we introducing a new concept, or can we extend an existing one?
**What to check:**
- Does this design introduce a new noun, mode, resource, flag, config key, or enum?
- Could an existing concept be extended or reused instead?
- Is this new concept likely to become a permanent tax on every customer's mental model?
- If the concept is redundant or overlapping with an existing one, what's the cost of having both?

Every new concept customers must learn is permanent cognitive load. Prefer extending existing concepts over inventing new ones. See also: naming & semantic correctness (above) for term consistency.

### Multi-surface coherence
**Question:** Does this concept read consistently across every surface where it appears?
**What to check:**
- If the concept appears in API + SDK + CLI + UI + docs, are names and meanings aligned across all of them?
- Is vocabulary from one persona (e.g., developer jargon) becoming canonical in surfaces for other personas (e.g., non-technical UI)?
- Is a capability present in one modality (e.g., API) but absent from another (e.g., UI, CLI) where customers would reasonably expect it?
- Would each persona who encounters this — SDK developer, operator, UI user, someone debugging via logs — understand it the same way?

This complements naming (which checks term consistency) by checking *capability and meaning* consistency across surfaces.

### Proportional complexity
**Question:** Is the common path simple, or has it become ceremonial?
**What to check:**
- Does a simple customer goal now require complex setup or multi-step orchestration?
- Is the solution over-generalized for hypothetical future cases at the expense of today's common path?
- Are customers being asked to provide IDs, context, or configuration the system could infer?
- Are internal implementation details leaking into public surfaces (field names, enum values, modes that expose internals)?

The right test: trace the most common use case end-to-end. If it requires more steps, more knowledge, or more configuration than the problem warrants, the design is disproportionate.

### Product debt / split-world
**Question:** Are we creating a second way to do something, and if so, what's the convergence story?
**What to check:**
- Does this introduce a second way to accomplish something customers already can do?
- Does this introduce a second internal foundation alongside an existing one (two HTTP clients, two validation approaches, two queue patterns)?
- Is there an explicit convergence or deprecation plan?
- Will customers (or internal teams) build dependencies on an interim solution that later gets replaced?
- If the split-world is intentional, is the boundary between old and new clear — will future contributors know which path to follow?

This applies at both the product level (customer-facing capability duplication) and the architecture level (internal technology duplication). See also: foundational technology choices (below).

### Concurrency & data consistency
**Question:** Can concurrent operations leave the system in an inconsistent state?
**What to check:**
- Are multi-step writes atomic where they need to be? Could partial failures leave inconsistent state?
- Are there check-then-act patterns (read a value, check a condition, write based on it) that could race under concurrent access?
- Are read-modify-write operations (counters, balances, JSON merges) done atomically in the database, or in application code where concurrent updates would be lost?
- Is the database isolation level appropriate for the operation's consistency requirements?
- Is there shared mutable state at the module/process level that concurrent requests could corrupt?
- If optimistic locking is used, are version checks actually enforced and conflicts surfaced?

When the spec involves concurrent data access, multi-step writes, or shared state, investigate these patterns using `references/technical-design-playbook.md` "Concurrency & data consistency patterns." These are often one-way doors — the data model and consistency semantics are hard to change later.

### Foundational technology choices
**Question:** Is a new library, framework, or infrastructure primitive being adopted — and is it a one-way door?
**What to check:**
- Is this a new shared primitive that will shape how the system evolves (new HTTP client, ORM, job queue, validation library, cache layer)?
- Does it create a second foundation alongside an existing one for the same concern?
- Is it being introduced for a local use case but likely to become a system-wide dependency?
- Is there a convergence story if it coexists with an existing primitive?
- Would future contributors know which technology to use for new work?

Foundational choices compound — they become the default that everything else builds on. Evaluate them as architectural one-way doors even when they appear as "just a dependency."

### Schema design
**Question:** Will this data model age well?
**What to check:**
- Is the normalization level appropriate for the access patterns? (Over-normalized → join-heavy queries; over-denormalized → update anomalies)
- Are relationships, cardinality, and ownership semantics correct? Will cascading deletes or orphaned records be a problem?
- Are indexes justified by actual query patterns? Missing indexes on frequently-queried columns? Redundant indexes that slow writes?
- Is the schema forward-compatible? Will it be painful to migrate later? Are nullable columns, defaults, and constraints set up for evolution?
- Is there a strategy for data lifecycle — archival, soft-delete, unbounded growth?

Schema changes are one-way doors. Treat new tables and columns as architectural decisions that deserve the same scrutiny as API shape.

---

## Additional facets (scan for relevance)
- External prior art (product + technical)
- Internal prior art (codebase patterns)
- Current system behavior (end-to-end trace)
- Dependency capabilities (verified from source)
- Security & trust boundaries
- Reversibility (1-way door vs phaseable)
- Blast radius and cascading effects
- Phased validation strategy
- Vision alignment
- Deployment context awareness (hosted vs self-hosted vs local — different behavior, configuration, failure modes)
