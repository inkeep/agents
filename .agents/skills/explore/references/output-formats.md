# Output Formats

Use when: Phase 6 (Synthesize) — choose the format that matches which lenses were active.

All formats: organize by concern/surface/flow, never by file. Calibrate length to what the consumer needs — typically 15-50 lines.

---

## Pattern Brief

Use when pattern inspection was the primary lens. Answers: *"If I were about to write new code in this area, what conventions would I follow and what abstractions would I build on?"*

**Area overview**
What this area does, how files are organized, entry points. 2-3 sentences.

**Patterns observed**
The conventions that hold across files in this area. Only include categories where you found clear patterns:

- **Naming** — File, function, type, and variable naming conventions. Prefixes, suffixes, casing.
- **Error handling** — How errors are created, thrown, caught, or returned. Error types used.
- **Validation** — How input is validated. Schemas, manual checks, where validation happens (route, service, data access).
- **Data access** — How data is read/written. ORM patterns, query builders, transaction handling.
- **File organization** — File structure conventions. One export per file, barrel exports, index files.
- **Import conventions** — What's imported from where. Relative vs. absolute. Shared modules.
- **Logging / observability** — How logging, tracing, or metrics are handled.

**Shared vocabulary**
Types, utilities, helpers, and abstractions this area uses — things to build on, not duplicate. Format each as: `name` — what it does — where it's defined.

**Test patterns** *(when relevant)*
How tests are structured. What's mocked vs. real. Test utilities, setup/teardown, naming conventions.

**Non-obvious**
Things you'd miss reading one file but see across several. Implicit contracts, order-of-operations dependencies, gotchas.

**Search coverage**
What you read, what you didn't, and where patterns might be incomplete.

---

## Trace Brief

Use when system tracing was the primary lens. Answers: *"What does this connect to, how does data flow through it, and what's the blast radius?"*

**Entry point**
What you traced and why. The specific function, route, or module and the question being answered.

**Flow**
The path data/control takes: entry → step → step → exit. Note what happens at each step (validation, transformation, persistence, side effects). Keep it to load-bearing steps — not every function call.

**Dependencies**
What this area depends on (upstream) and what depends on it (downstream). Call out transitive dependencies that aren't obvious from direct imports.

**Cross-boundary transitions**
Where control crosses package, domain, or service lines. For each: what's the contract (types? API? events?), and is the coupling tight or loose?

**Blast radius**
What would be affected by a change here:
- **Direct:** imports or calls this code
- **Transitive:** depends on something that depends on this
- **Surface area:** product surfaces (API, SDK, UI, docs) and internal surfaces (DB, auth, telemetry) in the dependency chain. If the repo has surface area inventories, reference them.

**Non-obvious**
Hidden dependencies, implicit contracts, side effects not visible from the direct call chain.

**Search coverage**
What paths you traced, what you didn't, where the map might be incomplete.

---

## World Model Brief

Use when surface mapping was the primary lens. Answers: *"What does this topic touch across the system, how do those things connect, and what exists today?"*

### 1. Topic & scope
What was investigated and why. The driving question. Who consumes this world model.

### 2. Knowledge sources
- Repo-level skills/catalogs loaded (paths, what they cover)
- Code areas inspected (paths, depth reached)
- Gaps in existing knowledge (areas the repo doesn't document)

### 3. Product surface-area map

| Surface | What changes | User impact | Dependencies | Breaking? | Confidence |
|---|---|---|---|---|---|

### 4. Internal surface-area map

| Surface | What changes | Coupling | Blast radius | Failure mode | Confidence |
|---|---|---|---|---|---|

### 5. Connection graph
How surfaces connect for this topic. Key dependency chains: Surface → depends on → Surface.

Amplifier nodes. Implicit coupling. Cross-boundary contracts.

### 6. Current state (code-verified)
For each inspected surface: what exists today. Code paths, behavior, constraints, patterns.

Organized by surface, not by file.

### 7. Constraints
What limits design options for this topic. Discovered from code, catalogs, or dependency structure.

### 8. Gaps & unknowns
What we don't know. Surfaces not investigated or not verified. What it would take to resolve each gap.
