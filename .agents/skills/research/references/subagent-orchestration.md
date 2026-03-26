Use when: You will use subagents (especially in parallel) for research and want to reduce overlap, control verbosity, enable gap-closure, and produce evidence that is truly primary-source grounded
Priority: P1
Impact: Without this, parallel agents duplicate discovery, produce verbose outputs, and evidence files often become reformatting of agent prose rather than primary-source proof

---

# Subagent Orchestration for Deep Research

Parallelism saves wall-clock time only if you add lightweight coordination.

This reference defines:
- execution patterns (foundation → parallel → gap closure)
- ownership rules to prevent redundancy
- strict Markdown output contracts (unambiguous + evidence-first)
- prompt templates (short, coordination-aware)
- guidance for the orchestrator/evidence-writer

---

## 1) Choose an orchestration pattern

Default recommendation when using subagents:
- **Foundation → Parallel Deep Dives → Gap closure → Evidence writing → Synthesis**

Alternatives:
- **Two-phase: Discovery → Deep Dives** when you don't yet know which files answer the rubric.
- **Sequential deep dive** when dimension B depends on A and early assumptions matter.

Rule of thumb:
- If you expect overlap (CHANGELOG, schema, entrypoints, shared docs), do a foundation pass first.

---

## 2) Run-scoped coordination ("shared state surface")

Subagents can't share context directly. Coordination only works if there is a small, explicit shared state surface.

**Core model:** Each coordinated research pass is a **run** with one run context file:

- `<reports-dir>/<report-name>/meta/runs/<run-id>/RUN.md`

`RUN.md` is the **single file workers must read** to understand what *this pass* is doing.

### Placement (proof vs process separation)

- `evidence/` is **proof only** — primary-source snippets, citations, negative searches
- Run coordination is **process** and lives under: `meta/runs/<run-id>/RUN.md`

### What stays at meta/ level (cross-run)

Some artifacts should not be run-scoped:

| Artifact | Purpose | Ownership | Notes |
|---|---|---|---|
| `meta/_changelog.md` | Append-only history | Parent/orchestrator only | Recommended for updates + multi-session work |

### What not to create (current model)

Do **not** create these as first-class coordination artifacts:
- `meta/_shared-context.md` (merge into `RUN.md`)
- `meta/_coverage.md` (track coverage via tasks instead)

### Run ID convention

Format: `YYYY-MM-DD-<short-label>`

Examples:
- `2026-02-02-initial`
- `2026-02-03-add-sso`
- `2026-02-04-corrective-mfa-fix`

### Run lifecycle + ownership rules

- **Parent/orchestrator owns all writes** to:
  - `meta/runs/<run-id>/RUN.md`
  - `meta/_changelog.md`
- **Workers do not write files** to `meta/` or `meta/runs/`.
- **Lifecycle:**
  1. Run start: create `RUN.md` with **Status: Active**
  2. During run: update `RUN.md` to coordinate ownership + anchors
  3. Run close: set **Status: Closed** and treat `RUN.md` as immutable

### Coverage tracking (via tasks, not files)

Instead of `_coverage.md`, the parent/orchestrator:
- creates a **task** for each P0 dimension (or P0 facet cluster)
- marks tasks complete once evidence is captured and conflicts are resolved
- reviews task status during gap analysis to identify missing P0 coverage

Use natural "task" terminology; do not assume any specific task tooling.

---

## 3) RUN.md template (single-file run context)

Create at: `<reports-dir>/<report-name>/meta/runs/<run-id>/RUN.md`

Recommended template:

```md
# Run: <run-id>

**Status:** Active | Closed
**Intent:** Additive | Corrective | Refresh | Initial
**Created:** YYYY-MM-DD
**Closed:** YYYY-MM-DD (when closed)

## Purpose
Why this run exists (1–2 sentences).

## Scope
What this run will and will not do (run-scoped).

**In-scope (delta only):**
- ...

**Out-of-scope (avoid drift):**
- ...

## Delta Rubric
If this is the initial run, this can be the full rubric. Otherwise, list only what this pass covers.

| # | Dimension / facet | Depth | Priority |
|---|-------------------|-------|----------|
| 1 | ... | Deep | P0 |

## Source Anchors
Pin the specific sources for this run (so evidence is reproducible).
- Repo: `<path-or-url>` @ commit `<hash>` (or tag/version)
- Docs: `<url>` (accessed YYYY-MM-DD)
- Issues/PRs: `<url>` (accessed YYYY-MM-DD)

## Shared Context
### Canonical sources and owners
Non-owners may cite but should not deep-analyze.

| Source | Owner (Dimension) | Notes |
|--------|-------------------|-------|
| CHANGELOG.md | ... | ... |
| ... | ... | ... |

### Notes / decisions (optional)
- Any coordination decisions that help workers avoid overlap.
```

---

## 4) Strict Markdown output contract (REQUIRED for subagents)

Workers must return Markdown using **exactly** this structure.

### Output template

````md
# Dimension: <Dimension name>

## Scope
**Facets to cover (from rubric/run):**
- ...
- ...

**Non-goals / avoid overlap with:**
- ...
- ...

## Top sources (max 10)
List the most relevant sources you used.
- <file path or URL> — why it matters
- ...

## Findings (max 10, ordered by confidence and impact — highest first)
Each finding MUST be a declarative claim with evidence.

### Finding 1: <Declarative claim>
**Confidence:** CONFIRMED | INFERRED | UNCERTAIN | NOT FOUND
**Evidence:** <file:line-range OR URL + access date>

```text
<minimum snippet/quote/output needed to justify the claim>
```

**Implications (for the primary question):**
- ...

### Finding 2: ...
...

## Negative searches (required for NOT FOUND)
If you claim something is NOT FOUND, document the search.

* **Searched for:** <terms>
  * **Locations:** <paths/dirs/docs>
  * **Result:** no matches | inconclusive
  * **Notes:** <anything important>

## Gaps / follow-ups (max 5)
List what you could not confirm and where to look next.

* <gap> — why it matters — next places to check: <...>

## Possible overlaps / conflicts
Call out anything that might overlap another dimension or contradict another finding.

* Overlap: <topic> — likely owned by <dimension>
* Potential conflict: <topic> — why you think it conflicts
````

### Unambiguity rules

Workers MUST:

* Write claims that are falsifiable ("X loads Y from Z") rather than vague summaries ("X supports Y well").
* Cite exact file:line ranges when possible.
* If unsure, mark **UNCERTAIN** and describe what you searched.
* Avoid "implied" conclusions that go beyond evidence.

---

## 5) Prompt templates (short, coordination-aware)

### 5.1 Deep dive worker prompt

```
Research Dimension: <DIMENSION> for report <REPORT_NAME>.

Read first (required):
* <reports-dir>/<REPORT_NAME>/meta/runs/<RUN_ID>/RUN.md

Scope (facets to cover):
* <facet 1>
* <facet 2>

Non-goals (avoid overlap):
* <explicit exclusions>

Other agents cover:
* <list of dimensions>

Canonical sources you should NOT deep-read (owned by others), unless required:
* <file list from RUN.md ownership map>

Sources / repo locations:
* <repo path(s) or URLs>

Web search (see references/web-search-guidance.md):
* After code research, check web for P0 categories: open issues, official docs, CVEs, maintenance signals
* For this dimension, also check P1 categories: <from dimension-aware table in web-search-guidance.md>
* Prioritize T1/T2 sources; cross-reference T3/T4

Output requirements:
* Use the STRICT Markdown output contract in references/subagent-orchestration.md
* Top sources: max 10
* Findings: max 10, ordered by confidence and impact (highest first)
* Gaps: max 5
* Include negative searches for NOT FOUND claims
```

### 5.2 Discovery prompt (optional)

```
Do DISCOVERY for dimension: <DIMENSION>.

First read:
* <reports-dir>/<REPORT_NAME>/meta/runs/<RUN_ID>/RUN.md

Return ONLY:
* Top 5–10 relevant file paths / URLs (with 1-line why)
* Key findings (max ~8 bullets)
* Gaps / what to investigate next (max ~5 bullets)

Avoid:
* exhaustive inventories
* re-analyzing canonical sources owned by other agents
```

### 5.3 Follow-up prompt (gap closure)

```
Follow-up research to close this gap:

First read:
* <reports-dir>/<REPORT_NAME>/meta/runs/<RUN_ID>/RUN.md

* Gap: <specific facet/question>
* Why it matters: <1 sentence>
* Where to look: <paths/files/URLs>

Return:
* STRICT Markdown output contract
* Only the findings needed to close the gap (max 3–5 findings)
```

---

## 6) Orchestrator responsibilities (what workers cannot reliably do)

Workers have narrow scope; the orchestrator must:

* resolve conflicts across dimensions/sources
* decide whether evidence quality is sufficient for the stakes
* translate worker findings into evidence files that contain primary-source snippets
* ensure the report answers the rubric's primary question and stance rules

### Clarification loop (when worker output is ambiguous)

If a worker is ambiguous (missing citations, unclear claim boundaries, or over-interpretation):

1. Ask 1–3 targeted follow-up questions to the same worker:

   * "Which exact file/lines show X?"
   * "Is this implemented or only referenced?"
   * "What did you search to conclude NOT FOUND?"
2. If still unclear, open the cited sources directly and correct the claim + confidence.

---

## 7) Evidence writing workflow (recommended default)

Default strategy: workers return structured findings; orchestrator/evidence-writer writes evidence files.

Rules for evidence writing:

* Do not paste worker narrative as "evidence."
* Re-capture key proof from the primary source:

  * code snippet with file:line
  * docs excerpt with URL + access date
  * changelog entry with version context
* If two workers disagree:

  * document both claims + evidence
  * resolve by direct source read, or mark UNCERTAIN
* Carry over gaps into the evidence file's "Gaps / follow-ups."

---

## 8) Conditional verification (only when needed)

Verification is optional. Do it when:

* High stakes (architecture selection, security posture, expensive migration)
* Evidence quality is weak or thin
* Conflicts exist across agents
* A claim is foundational ("if wrong, decision flips")
* A worker likely overreached beyond evidence

Suggested verification action:

* Spot-check 2–3 foundational claims per P0 dimension by opening cited sources directly.
* Correct citations and adjust confidence labels.

---

## 9) Verbosity discipline (token efficiency)

Hard limits (default):

* Top sources: max 10
* Findings: max 10, ordered by confidence and impact (highest first)
* Gaps: max 5

Avoid:

* entire-file dumps (especially changelogs)
* exhaustive inventories of directories
* repeating canonical file summaries across agents (use ownership map in RUN.md)

---

## 10) Phase-by-phase execution details

### Phase 1: Foundation pass (required in deep research mode)

Goal: establish shared context and prevent redundant discovery **for this run**.

Do:

* Create a run folder and `RUN.md`:

  * `<reports-dir>/<report-name>/meta/runs/<run-id>/RUN.md`
* Read 3–5 canonical sources yourself (examples):

  * primary README / docs index
  * schema/manifest definitions (if applicable)
  * the main loader/entrypoint code path
  * CHANGELOG/release notes if version-sensitive
* Populate `RUN.md` with:

  * source anchors (repo path + commit/tag; docs URLs + access date)
  * canonical sources + ownership map (assign cross-cutting concepts to one owner)
  * run-scoped delta rubric (or full rubric for initial run)
* Create a task for each P0 dimension/facet cluster and assign owners (worker mapping).

If prior related reports exist, skim them to accelerate discovery, but treat them as secondary.

### Phase 2: Parallel subagent work (structured Markdown returns)

Dispatch 4–6 workers (typical sweet spot). Each worker gets:

* the exact facets to cover
* explicit non-goals (to avoid overlap)
* a strict output template (Markdown) with evidence expectations and verbosity limits
* the run context path (`meta/runs/<run-id>/RUN.md`)

**Important constraint (default):**

* Workers return **structured Markdown findings** (they do NOT author final evidence files).
* Workers do **not** write to `meta/` or `meta/runs/`.
* The orchestrator/evidence-writer writes evidence files from worker outputs and primary sources.

If a worker is ambiguous, incomplete, or seems to over-interpret:

* Ask a targeted follow-up question to the same worker (preferred when it's truly a misunderstanding), OR
* Open the cited sources directly and correct the claim yourself.

### Phase 3: Gap analysis checkpoint (required in deep research mode)

Before writing evidence files or REPORT.md, explicitly check:

* Are all P0 facets covered with primary-source citations?
* Any UNCERTAIN P0 items that could change the report's conclusion?
* Any contradictions across agents?
* Any "NOT FOUND" claims missing documented searches?
* Any partial/shallow sources (e.g., repo clone only has README/CHANGELOG)? If yes:

  * re-clone or obtain the missing sources, OR
  * explicitly record the limitation in evidence and the report

Use task status to guide gap closure:

* Review which P0 tasks are incomplete.
* Dispatch targeted follow-ups to close gaps (one facet per task).

### Phase 4: Evidence writing (orchestrator/evidence-writer)

Create `evidence/<dimension>.md` files from:

* worker structured findings
* direct reads of the cited primary sources (code/docs/changelog)

Rules:

* Evidence files should contain primary-source snippets/quotes, not just rephrased agent narratives.
* Cross-reference conflicts: if two agents disagree, document both and resolve (or mark UNCERTAIN).
* Apply confidence labels based on the strength of evidence.

### Phase 5 (optional): Targeted verification (only when needed)

Verification is not mandatory by default. Do it when any of the following are true:

* High-stakes decision (architecture selection, security posture, costly migration)
* Evidence quality is weak (thin snippets, unclear citations, stale sources)
* Conflicts exist across agents/sources
* The worker likely over-reached (interpretation out of scope or beyond evidence)
* The claim is foundational to the primary question ("if wrong, decision flips")

When verifying:

* Spot-check 2–3 high-impact claims per P0 dimension by opening the cited source directly.
* Correct wording/citations and adjust confidence labels.
