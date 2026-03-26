Use when: Executing autonomous investigation to validate assertions; deciding when to dispatch /research or /explore; matching investigation depth to priority; ensuring product research gets equal rigor.
Priority: P0
Impact: Decisions are made on vibes; prior art is missed; dependency constraints are discovered too late.

---

# Research playbook

## Philosophy
Investigation is the agent's default response to evidence gaps. When uncertainty can be resolved by looking at accessible information — code, dependencies, prior art, web — investigate autonomously.

The user's role is **judgment**: product vision, priority, risk tolerance, scope decisions. Not approving obvious investigation.

### Autonomy boundary

| Always investigate (evidence gap) | Always stop for (judgment gap) |
|---|---|
| Current system behavior traces | Product vision / strategy choices |
| Dependency capability checks (types/source) | Priority between competing requirements |
| Internal prior art (codebase patterns) | Risk tolerance decisions |
| External prior art (web, comparable products) | 1-way door confirmations |
| Blast radius mapping | Business constraints (timeline, budget, team) |
| Verifying claims against primary sources | Scope decisions (Phase 1 vs defer) |
| Negative searches (documenting NOT FOUND) | Persona / consumer prioritization |

**Gray area** (bias toward investigating):
- Heavy external research (competitor deep-dives) — do it if it directly informs a P0 decision; otherwise surface as an open thread
- Performance implications — check code patterns, but can't run benchmarks
- UX patterns — search for patterns, but product context determines the final call

## When to load `/research` skill
Use it when you need **evidence-backed** answers (especially for 1-way doors), including:
- Internal current-state traces (end-to-end code path)
- Internal prior art (existing patterns in the codebase)
- OSS/library capability checks (types/source)
- External technical prior art (similar OSS systems and architecture patterns)
- Security/auth boundaries and threat-model-relevant behavior

Use it especially when:
- a decision depends on "does our system currently do X?"
- a decision depends on "does dependency Y support capability Z?"
- you need an auditable evidence trail (high-stakes)

## Product research with technical rigor
Product research should get the same depth discipline:
- Competitor/product prior art (positioning + UX, not just tech)
- User complaints/issues (forums, GitHub issues, docs friction)
- Terminology/naming conventions in the ecosystem
- Common onboarding flows and failure modes

If the product research needs citations/evidence, it's valid to use `/research` as the execution engine (web/OSS + evidence capture), but keep the outputs framed as product learning.

## Investigation types (execute autonomously; match scope to priority)

These are the agent's investigation tools. Execute them as part of autonomous investigation — don't propose them as options for the user to approve. Match depth to priority: P0 blocking items get thorough investigation across multiple types; P2 items get a quick check at most.

### A) External prior art (product + technical)
- 3-5 comparable products/projects
- What they chose
- Why (if knowable)
- Where their context differs from ours
- What we can reuse vs where we should diverge

### B) Internal prior art (pattern reuse)
- Where in our codebase we solved analogous problems
- What parts are reusable
- What parts must differ (because constraints changed)

**Execution:** Dispatch `general-purpose` Task subagents that load `/explore` skill with the **pattern lens**. Each subagent receives the target area and what kind of similarity to search for (structural, analogous, conceptual). Returns a pattern brief inline with shared vocabulary and reusable abstractions. The spec agent persists load-bearing findings to `evidence/`.

### C) Current-state trace (end-to-end reality)
Trace from entrypoint → runtime → config → storage → UI/UX → ops.
Goal: discover hidden constraints and latent bugs.

**Execution:** Dispatch `general-purpose` Task subagents that load `/explore` skill with the **tracing lens**. Each subagent receives the entry point and the trace question (what does this connect to, what's the full flow, what crosses boundaries). Returns a trace brief inline with dependencies, cross-boundary transitions, and surface area touched.

### D) Dependency constraints
Verify with types/source (not just docs):
- capability present?
- extension points?
- failure semantics?
- performance implications?

When the dependency is OSS, verify from source code (see Type E "OSS source access" for the cloning protocol).

### E) Third-party dependency investigation
When the spec depends on packages, libraries, frameworks, or external software outside the source repo, investigate thoroughly before making design decisions that rely on them. The goal: build an accurate mental model of what the 3P system actually provides for your scenario — and sanity-check that it's the right choice.

**Scope:** Target the investigation to the spec's scenario and the capabilities under consideration. Not a general survey of the library — focus on dimensions and details relevant to what we're building.

**What to investigate:**
- **Relevant capabilities:** What does the 3P system offer for our specific use case? Map the surface area that applies — not everything the library does.
- **Source code analysis:** Read types, interfaces, and implementation for the relevant modules. Verify behavior from source — docs may be incomplete or outdated.
- **Documentation and community patterns:** What do their docs, guides, issues, and community discuss about scenarios like ours? Look for recommended patterns, known gotchas, and migration/upgrade considerations.
- **Best practices for our scenario:** How do experienced users approach the kind of problem we're solving with this library? Blog posts, GitHub issues/discussions, official examples, StackOverflow patterns.
- **Version-specific behavior:** Verify against the version we're using or targeting.
- **Gaps and limitations:** What doesn't the 3P system support that we might need? Known issues or missing features relevant to our use case.
- **Sanity check — is this the right choice?** Given what we've learned, is this 3P system the best fit for our scenario? Are there better-suited alternatives we should consider? If the investigation reveals significant gaps or friction, surface this as a decision for the user.

**Execution model:**
Dispatch as **Task subagents** (one per dependency or dependency cluster) that load the `/research` skill for its methodology, evidence standards, and source code analysis patterns. This gives each subagent research-grade rigor without the overhead of creating standalone reports.

Each subagent should be instructed to:
1. **Load `/research` skill** and run its routing gate — check if an existing report on this 3P system already exists in the resolved reports directory.
2. **If an existing report exists** → use Path C (update/append) to add findings relevant to the spec's scenario. This enriches shared knowledge.
3. **If no existing report exists** → use Path B (direct answer). Do **not** create a new standalone report. Return full findings in the response.
4. **In both cases**, return complete findings inline to the spec agent — the spec agent needs the results in-context to inform design decisions.

Each subagent receives:
- The spec's scenario context (what we're building, what we need from this dependency)
- Specific questions or capabilities to investigate, scoped to the spec's use case
- Instructions to search source code, documentation, and web for relevant patterns

The spec agent persists key findings to spec-local `evidence/<dependency-name>.md` files and incorporates them into the world model and design decisions. Findings that were appended to existing reports via Path C live in both places — the report for reuse, the spec evidence for local context.

**OSS source access:** Subagents that load `/research` inherit the source code research protocol — cloning OSS repos to `~/.claude/oss-repos/` for persistent, cross-session reuse. See `/research` skill's `references/source-code-research.md` for the full cloning, validation, and subagent orchestration patterns. For closed-source dependencies, web search and official docs are the primary sources.

**When to use this vs. Type D (targeted capability checks):**
- **Type D:** "Does dependency X support capability Y?" — quick, per-decision verification.
- **Type E:** "What does dependency X actually offer for our scenario, and is it the right choice?" — thorough, upfront investigation before design decisions.

### F) Risk and blast radius research
For changes with wide impact:
- List every system that directly or indirectly depends on the changed area
- For each: what's the coupling? Tight (shared DB) or loose (API contract)?
- What's the worst-case failure mode?
- Can the change be deployed independently or does it require coordination?
- Identify silent failure modes (things that break without producing errors)

**Execution:** Dispatch `general-purpose` Task subagents that load `/explore` skill with the **tracing lens** focused on blast radius. Each subagent receives the changed area and traces forward/backward to identify direct and transitive dependents, surface area touched, and coupling tightness.

### G) Repo-level structured knowledge
Before original investigation, check whether the repo provides pre-built domain knowledge — surface area catalogs, system maps, dependency graphs — as skills or structured documents.

**Discovery protocol:**
1. Scan `.agents/skills/`, `.claude/agents/`, and similar directories for skill files (SKILL.md or *.md with frontmatter).
2. Read frontmatter descriptions. Look for skills that provide:
   - **Product surface-area catalogs** — customer-facing surfaces (UIs, APIs, SDKs, CLIs, docs, config formats)
   - **Internal surface-area catalogs** — infrastructure, shared code, CI/CD, database, auth, runtime, observability
   - **Dependency graphs** or **impact matrices** — what breaks when X changes
   - **Audience/persona impact catalogs** — who is affected by changes and how fast impacts propagate to them
   - **Domain glossaries** or **system architecture maps**
3. Load the relevant skills (e.g., `Load /product-surface-areas`, `Load /internal-surface-areas`). They replace from-scratch enumeration for the areas they cover.
4. Identify gaps — surfaces or system areas the loaded skills don't cover — and flag those for original investigation (types B, C, E, F).

**What to persist:** Reference the loaded skills in evidence files (e.g., "Product surfaces grounded from `/product-surface-areas`; gaps identified: [list]"). Do not duplicate the catalog content — point to it.

**When no repo-level skills exist:** Fall back entirely to original investigation. The world model still needs both product and internal surface-area maps — build them from `/explore` traces, product research, and the enumeration guidance in the product discovery and technical design playbooks.

---

## How to convert research into decision inputs
After research completes, translate findings into this format before presenting options:

1. **What we learned** (2-6 bullets) — key facts, confirmed behaviors, capabilities/limitations
2. **What constraints this creates** (1-3 bullets) — options eliminated, requirements imposed, boundaries discovered
3. **What options remain viable** (2-4 bullets) — only options that survive the evidence
4. **Recommendation** + confidence + what would change it

Then update: Decision Log, Open Questions, Risks, and Phasing (if research changes feasibility or sequencing).

Do not paste raw research into the spec. Summarize the load-bearing findings and link to evidence files for the full trail.

## Negative searches
If you tried to verify something and couldn't find it:
- record "NOT FOUND" (what you searched, where)
- treat it as uncertainty, not as a fact

## Parallelization (when available)
If there are multiple independent research tracks:
- split into 3-6 parallel investigations
- each returns findings + evidence
- you synthesize into decisions
