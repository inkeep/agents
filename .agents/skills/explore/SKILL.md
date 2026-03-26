---
name: explore
description: |
  Build deep, structured understanding of a codebase area or system topic before acting on it. Three complementary lenses: (1) Surface mapping — enumerate product and internal surfaces a topic touches, trace connections and blast radius across the system. (2) Pattern inspection — discover conventions, shared abstractions, and the "grain" of a code area by reading siblings. (3) System tracing — follow call chains, map transitive dependencies, identify cross-boundary contracts and implicit coupling.
  Use before spec work, implementation, review, debugging, or any task that needs understanding of what a feature touches and how the code works. Subsumes find-similar.
  Triggers: explore, inspect, discover, what does this touch, map the surfaces, world model, surface areas, what's affected, what patterns exist here, how does this area do X, before implementing, check conventions, find similar, trace the flow, blast radius, what would break, dependency tree, codebase inspection, feature scope, what would this change.
argument-hint: "[area or topic] (optional: purpose — speccing|implementing|reviewing|testing|debugging|tracing|mapping)"
---

# Explore

## What this is

Explore builds structured understanding through three complementary lenses:

- **Surface mapping** — which product and internal surfaces does this topic touch? How do they connect? Where does blast radius fan out? Answers: *"What does this affect across the system?"*
- **Pattern inspection** — what conventions, shared abstractions, and naming does this code area follow? What's the shared vocabulary? Answers: *"What patterns should I follow and what should I build on?"*
- **System tracing** — what do the call chains, dependency graphs, and data flows look like? Answers: *"What does this connect to and what breaks if I change it?"*

Surface mapping is wide (system-level). Pattern inspection is horizontal (what do peers look like?). System tracing is vertical (what does this flow through?). An exploration can use any combination of lenses, calibrated to purpose.

**Explore is factual, not prescriptive.** It reports what exists — surfaces, conventions, flows, dependencies. It does not evaluate whether patterns are good, recommend changes, or propose architecture.

**Output defaults to conversation.** Saving to a file is fine when it serves a consumer (e.g., feeding an implementation prompt, anchoring a spec). But default to ephemeral — codebases change and saved output gets stale.

## What this is NOT

- **Not architecture evaluation** — describes what exists, does not judge it
- **Not a spec** — traces current behavior factually but does not design new behavior or make decisions (that's `/spec`)
- **Not external research** — scoped to this repo's product and system, not docs/blogs/APIs (that's `/research`)
- **Not a gate** — invocable on-demand from any context, never a mandatory phase

---

## Stance

- **Existing knowledge first, investigation second.** Check for repo-level catalogs, skills, and architecture docs before investigating from scratch. Original investigation fills gaps — it does not replace structured knowledge.
- **Factual and code-grounded.** Read actual code. Do not assume architecture based on naming or expected patterns. Every claim traces to observable evidence.
- **Transitive thinking.** Follow dependency chains to their end. If A depends on B depends on C, the topic touches all three. Map the full chain until you hit stable boundaries.
- **Explicit about unknowns.** Gaps are as valuable as findings. Name what you don't know and what it would take to find out.

---

## Lens selection

Determine which lenses to activate based on purpose:

| Context | Primary lens(es) | Depth |
|---|---|---|
| Pre-spec: understanding what a feature touches | Surface mapping + Tracing | Broad — L1-L3, sometimes L4 |
| Pre-implementation: what conventions to follow | Pattern inspection | Focused — L1-L3, L2 is critical |
| Reviewing PR or evaluating feedback | Pattern inspection | Targeted — L1-L2, just enough to answer |
| Writing or modifying tests | Pattern inspection | Focused — L1-L2 in test directories |
| Debugging / tracing a failure | System tracing | Focused — call chains through the failing path |
| "Find similar" / "do we do X elsewhere?" | Pattern inspection | Varies — start L1, expand as needed |
| "What connects to X" / "blast radius" | System tracing | Deep — entry point to system boundaries |
| "What surfaces does this touch?" / impact analysis | Surface mapping | Exhaustive — both product and internal |
| Changing a core primitive or shared abstraction | Surface mapping + Tracing | Deep — map all consumers and fan-out |
| Full world model for a topic | All three | Broad — full enumeration + code verification |

When the purpose is not stated, infer from context using this table.

---

## Workflow

### Phase 1: Scope

Determine what to investigate and why.

**Input:** A target (files, directories, domain, module, feature, topic) and optionally a purpose and consumer.

1. **Name the target precisely.** If vague (e.g., "the API layer"), narrow: which domain? Which operations? Which consumers?
2. **Identify the driving question.** What does the consumer need to understand?
3. **Select lenses.** Use the lens selection table above. Most explorations need one or two lenses, not all three.
4. **Identify the consumer** (if relevant): `/spec`, `/ship`, `/docs`, `/debug`, direct user — this determines emphasis and output format.

---

### Phase 2: Load existing knowledge

Before any original investigation, find what the repo already knows.

**Scan locations** (check all that exist):
- `.agents/skills/`, `.claude/agents/` — skills with surface area catalogs, system maps, dependency graphs
- `AGENTS.md`, `CLAUDE.md` — may reference architecture docs or conventions
- Architecture documentation — READMEs, architecture decision records, system diagrams

**Record:** What was found and what it covers (reference by path — don't duplicate catalog content). What gaps remain. How current the knowledge appears (check dates, verify a few claims against code).

**When nothing is found:** Fall back entirely to original investigation. Note the absence — the repo would benefit from surface area documentation.

---

### Phase 3: Map surfaces

*Active when surface mapping lens is selected.*

**Load:** `references/surface-categories.md`

Identify which customer-facing and internal surfaces the topic touches. Start from repo-level catalogs if available; enumerate from scratch for gaps. Use the canonical category tables as enumeration scaffolding — they prevent missing surfaces.

**For each product surface touched:**
1. Name the surface specifically — not "the UI" but "the agent configuration panel in the management dashboard"
2. Describe the change — what behavior, content, or interface changes?
3. Assess user impact — visible to users? Changes workflow? Breaking change?
4. Map dependencies — what internal surfaces does it depend on? What other product surfaces depend on it?
5. Identify consistency requirements — naming, terminology that must stay consistent across surfaces

**For each internal surface touched:**
1. Name the surface specifically — not "the database" but "the `conversations` table and its migration history"
2. Describe the change — what code, schema, config, or behavior changes?
3. Assess coupling: **Tight** (shared DB tables, shared types across domains, direct calls — changes here force changes there), **Medium** (API contracts, event schemas, config keys — requires coordination), **Loose** (conventions, docs — independent)
4. Map blast radius: direct dependents → transitive dependents → fan-out (is this an amplifier node?)
5. Identify failure modes — if this breaks, what happens? Silent failure (data corruption, wrong results) is worse than loud failure (errors, crashes)

**Both maps, always.** Every topic touches product AND internal surfaces. Never produce one map without the other.

Don't just list surfaces — **trace why each is affected.** A surface is touched because something upstream in the dependency chain connects it to the topic. Name that connection.

**Scope control for investigation depth:**
- **Always inspect** — surfaces with high coupling to the topic, surfaces where the connection is unclear, surfaces critical to the topic's success
- **Inspect if relevant** — surfaces where catalog knowledge exists but hasn't been verified against current code
- **Note without inspecting** — peripheral surfaces with low coupling and clear catalog documentation

#### Trace connections between surfaces

After identifying surfaces, map how they connect for this topic. This turns two flat lists into a dependency graph.

- Start from the topic's primary entry points. Trace which surfaces depend on which — forward (what does this surface feed?) and backward (what feeds this surface?).
- Identify **amplifier nodes** — shared primitives where a change fans out to many surfaces. These are where blast radius grows exponentially.
- Identify **implicit coupling** between surfaces — shared database tables, event-driven communication, config values that affect distant surfaces, telemetry contracts downstream dashboards depend on. These are highest-risk because they're invisible in the import graph.
- Note the **contract at each connection** — types, APIs, events, DB schemas — and whether coupling is tight or loose.

Build the connection map: Surface → depends on → Surface. This is the skeleton of the world model brief's connection graph.

---

### Phase 4: Search and trace

*Active for pattern inspection and system tracing lenses.*

#### Progressive depth search

Start narrow. Expand only when needed. Stop when patterns emerge or the flow is mapped.

**Level 1 — Direct search.** Find the specific files, functions, or types mentioned or implied. Exact names, type names, import/export statements, known synonyms. **Stop if:** found clear matches.

**Level 2 — Sibling discovery.** Find files that serve the same role. Same directory, same naming pattern (`*.handler.ts`, `*.route.ts`, `use*.ts`), parallel directories. **Read 3-5 sibling files.** This is the minimum to distinguish patterns (consistent across files) from one-offs. One file is an anecdote; three files showing the same thing is a convention.

- **When siblings disagree:** Report the divergence — don't pick one and call it "the pattern." Use `git log --oneline <path>` to identify which convention is newer (active migration) vs. older (legacy). The consumer decides which to follow.
- **When there are no siblings:** Note the absence. Elevate Level 4 to find analogues in other domains, and flag reduced confidence ("patterns borrowed from `<other domain>`, not confirmed locally").

**Stop if:** patterns are emerging (or confirmed absent).

**Level 3 — Reference tracing.** Follow the dependency graph. What does this area import? (shared types, utilities, helpers, services.) What imports this area? (consumers, dependents.) Where are the shared abstractions defined? This reveals the **shared vocabulary** — the types and helpers the codebase expects you to use.

**Stop if:** you understand the shared abstractions and import conventions.

**Level 4 — Conceptual expansion.** Broaden to find analogous patterns in other domains. Same concept different domain, same pattern shape different names, cross-domain analogues. **Use sparingly.** Only go here when L1-L3 didn't reveal clear patterns or you need to confirm whether a pattern is area-local or repo-wide.

**Supplementary signals:** Git history (`git log --oneline <path>`, `git log --diff-filter=M <path>`) — files that change together are related; recent changes reveal active patterns vs. legacy. Git blame (`git log --follow <file>`) — helps distinguish intentional conventions from accidental one-offs.

#### System tracing methodology

*When the goal is flow, dependencies, or blast radius rather than pattern discovery.*

**Think in graphs, not chains.** A codebase is a dependency graph — changes propagate non-linearly. A change to a shared type fans out to every consumer, and each consumer's dependents in turn. Notice where the graph fans out — **amplifier nodes** where blast radius grows exponentially.

**Start from an entry point** — a specific function, route, handler, type, or module.

**Trace forward (downstream):** What does this call? Where does data go? What transformations happen? What side effects are triggered? (DB writes, events, external calls.)

**Trace backward (upstream):** What calls this? Where does input data originate? What triggers this code path? (API routes, event handlers, cron jobs.)

**Map cross-boundary transitions:** Where does control cross package or domain lines? What are the contracts at each boundary? (types, APIs, events, DB schemas.) Which transitions are tight coupling (shared types, direct imports) vs. loose coupling (API contracts, events)?

**Trace implicit coupling** (highest-risk — invisible in the import graph):
- Shared database tables read or written by multiple domains
- Event-driven or message-based communication
- Config values that change behavior in distant code
- Telemetry contracts that downstream dashboards or alerts depend on
- Shared validation schemas or error codes that consumers match on

**Identify surface area touched:** Product surfaces (API endpoints, SDK methods, UI components, CLI commands, docs, error messages) and internal surfaces (database tables, auth/permissions, telemetry spans, build/CI, configuration). If the repo provides **surface area inventories**, use them as the authoritative map — they're far more reliable than ad hoc enumeration.

**Stop conditions:**
- You've hit **stable boundaries** — versioned APIs, well-defined schemas, explicit contracts that absorb change
- You've mapped the full chain from entry to exit for the paths that matter
- You've identified all direct and key transitive dependents

Keep tracing through **leaky boundaries**: shared types across domains, internal utilities without versioning, implicit contracts (convention-based, not enforced).

**Depth control:** Calibrate to the question. "What does this touch?" → one level. "Blast radius?" → transitive to stable boundaries. "Full flow?" → entry to system boundary, both directions.

---

### Phase 5: Inspect patterns

*Active when pattern inspection lens is selected. Runs after search has found the area.*

Synthesize what the sibling files and reference tracing revealed about the area's conventions.

**Patterns to look for** (include only categories where you found clear patterns):
- **Naming** — file, function, type, variable naming conventions. Prefixes, suffixes, casing.
- **Error handling** — how errors are created, thrown, caught, or returned. Error types used.
- **Validation** — how input is validated. Schemas, manual checks, where validation happens.
- **Data access** — how data is read/written. ORM patterns, query builders, transaction handling.
- **File organization** — one export per file, barrel exports, index files.
- **Import conventions** — what's imported from where. Relative vs. absolute. Shared modules.
- **Logging / observability** — how logging, tracing, or metrics are handled.

**Shared vocabulary:** Types, utilities, helpers, and abstractions this area uses — things to build on, not duplicate. Format each as: `name` — what it does — where it's defined.

**When patterns diverge:** Report both and indicate which appears to be the active convention based on recency. Do not flatten the divergence — the consumer needs to know the area is mid-migration.

#### Similarity types

When searching for specific patterns (especially "find similar" queries), classify what kind of similarity:

| Type | Search strategy | Example |
|---|---|---|
| **Lexical** — same names, keywords | Grep for exact terms | "Where else do we call `formatDate`?" |
| **Structural** — same code shape, different names | Read siblings, look for repeating structure | "Where else do we have retry logic?" |
| **Analogous** — same role, different domain | Check parallel directories | "Equivalent handler in `run/` vs. `manage/`?" |
| **Conceptual** — same purpose, possibly different approach | Level 4 expansion | "How do we handle validation elsewhere?" |

For each match: location, similarity type, confidence (HIGH/MEDIUM/LOW), why similar.

---

### Phase 6: Synthesize

**Load:** `references/output-formats.md`

After investigating, synthesize findings into a coherent brief. Choose the format based on which lenses were active:

- **Pattern brief** — when pattern inspection was primary. Organized by concern, not by file.
- **Trace brief** — when system tracing was primary. Organized by flow.
- **World model brief** — when surface mapping was primary. Organized by surface with connection graph.
- **Combined** — when multiple lenses were used. Use section headers from each relevant format.

**Confidence provenance** — label every finding:
- **Code-verified** — confirmed by reading actual code this session
- **Catalog-sourced** — from repo-level knowledge, not code-verified this session
- **Inferred** — reasonable inference from evidence, not directly confirmed

**Gap discipline** — for every surface or area you couldn't verify: name it, state what you checked, state what investigation would resolve it.

Typically 15-50 lines, not a full report. Calibrate to what the consumer needs.

**Save vs. inline:** Default to inline. Save to a file when the output will be consumed by a downstream skill (e.g., `/spec` needs the world model, `/implement` needs the pattern brief) or when the user explicitly asks. Saved briefs are snapshots — they go stale as the codebase changes.

---

## Quality bar

**Good exploration:**
- Reads 3-5 sibling files before generalizing (pattern lens)
- Both maps present — product AND internal surfaces (surface lens)
- Connections traced transitively, not just one level (tracing lens)
- Implicit coupling identified (not just import-visible dependencies)
- Distinguishes patterns from one-offs; reports divergence honestly
- Key surfaces code-verified, not just catalog-referenced
- Gaps explicitly named with resolution paths
- Findings labeled by confidence provenance
- Organized by concern/surface/flow — never file-by-file
- Calibrates depth to purpose — not every exploration needs all lenses at full depth
- Reports search coverage so the consumer can judge completeness

**Bad exploration:**
- Reads one file and treats it as the pattern / the whole flow
- Only one map (product without internal, or vice versa)
- Surface list without connections — just flat lists, no graph
- Stops at direct dependencies instead of tracing transitively
- Confuses one-off implementations with conventions
- Ignores imports and shared utilities
- File-by-file summary instead of synthesized findings
- No gaps section — implies complete knowledge when uncertainty exists
- Guessed at surface behavior instead of reading code

---

## Anti-patterns

- **Single-file generalization.** One file is an anecdote. Read siblings before declaring a pattern.
- **Boiling the ocean.** Exploration is scoped — not the whole repo. If you're reading more than 15 files without synthesis, narrow the target.
- **Judging what you find.** "This pattern is bad" is architecture evaluation, not exploration. Report what exists.
- **Starting from code instead of existing knowledge.** Always check for repo-level catalogs first.
- **File-centric organization.** "File A is affected, File B is affected" is not useful. "The auth surface is affected because the token validation chain connects to the API gateway surface" is.
- **Ignoring implicit coupling.** The highest-risk dependencies are invisible in the import graph — shared DB tables, events, config values, telemetry contracts.
- **Assuming architecture instead of tracing.** Follow actual imports and call chains. Don't assume "this probably calls that" based on naming.
- **Skipping Level 2.** Sibling discovery is the highest-signal search activity. Going straight to conceptual expansion produces shallow findings.
- **Inventing patterns.** If you saw something once, it's not a pattern. Say so in search coverage.
- **Flattening divergence.** If half the files do X and half do Y, report both. The consumer needs to know the area is mid-migration.
- **Saving by default.** Prefer inline output unless the consumer asks for a file or the context clearly benefits from one.
- **Treating catalog knowledge as ground truth.** Catalogs may be stale. Verify key claims against code, especially for high-coupling surfaces.
