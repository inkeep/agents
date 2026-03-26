---
name: research
description: "Conduct technical research and produce formal reports by default. Can also deliver findings directly or update/extend an existing report. Reports default to <repo-root>/reports/ when in a git repo, or ~/reports/ otherwise. Use when investigating technologies, comparing systems, analyzing codebases, documenting architectures, gathering context for decisions, or when asked to refresh/update prior research."
argument-hint: "[research topic OR existing report] (optional: specific questions, scope constraints, output format)"
---

# Technical Research

Conduct **evidence-driven technical research**. Default output is a **Formal Report** (Path A) — a persistent artifact with evidence files. Other paths require explicit user signals:

- **Path A — Formal Report (DEFAULT):** Persistent artifact in the resolved reports directory with evidence files. This is the default unless the user explicitly opts out.
- **Path B — Direct Answer:** Findings delivered in conversation only. **Requires explicit user request** (e.g., "just tell me", "no report needed", "quick answer").
- **Path C — Update Existing Report:** Surgical additions/corrections to an existing report. Triggered when the user references an existing report or says "update/refresh/extend."

## Mandatory Execution Order

When this skill is invoked, execute these steps **in order**. Steps marked ⛔ are **hard gates** — you MUST complete each one before proceeding to the next. Do NOT skip ahead.

1. **Step 0: Create workflow checkpoint tasks** — Immediately create tasks for each step below (see Step 0 section). This is always the first action.
2. ⛔ **Routing Gate** — Check existing research. Do NOT start any web searches or research before completing this step.
3. ⛔ **Step 1: Collaborative Scoping** — Propose a research rubric. **STOP and WAIT for user confirmation.** Do NOT proceed to research until the user explicitly confirms the rubric.
4. **Step 2: Create Report Directory** — Set up the report structure (Path A only).
5. **Step 3: Research + Evidence Capture** — Conduct research and capture evidence.
6. **Step 4: Write REPORT.md** — Synthesize findings (Path A only).
7. **Step 5: Validate** — Run the validation checklist.
8. **Step 6: Recap + Follow-up** — Present findings and offer follow-up directions.

**Path B shortcut:** If the user explicitly requests a direct answer (Step 1 determines this), skip Steps 2, 4, 5 — but the Routing Gate and Scoping are still mandatory.

### Reports directory

Reports are stored in a configurable directory. Resolution priority:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | **User says so** in the current session | "Put the report in `docs/research/`" |
| 2 | **Env var `CLAUDE_REPORTS_DIR`** (pre-resolved by SessionStart hook — check `resolved-reports-dir` in your context) | `CLAUDE_REPORTS_DIR=./my-reports` → `./my-reports/<report-name>/REPORT.md` |
| 3 | **AI repo config** (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/`, etc.) declares a reports directory | `reports-dir: .ai-dev/reports` |
| 4 | **Default (in a repo)** | `<repo-root>/reports/<report-name>/REPORT.md` |
| 5 | **Default (no repo)** | `~/reports/<report-name>/REPORT.md` |

Resolution rules:
- If `CLAUDE_REPORTS_DIR` is set, treat it as the parent directory (create `<report-name>/REPORT.md` inside it).
- Relative paths resolve from the **repo root** (or cwd if no repo).
- When inside a git repo, reports default to the repo-local `reports/` directory. When **not** inside a git repo, fall back to `~/reports/`.
- Do **not** scan for existing directories automatically — only use them when explicitly configured via one of the sources above.
- When in doubt, use the default and tell the user where the report landed.
- The routing gate should check **both** project-level and user-level catalogues when scanning for existing research.

Throughout this skill, `<reports-dir>` refers to the resolved reports directory. The `--reports-dir` flag on catalogue/normalize scripts also overrides all of the above.

---

## When to Use This Skill

| Condition | Use This Skill | Output Format |
|---|---|---|
| Investigating a technology for adoption | ✅ Yes | Report or Direct |
| Comparing two or more systems/approaches | ✅ Yes | Report or Direct |
| Documenting architecture from codebase analysis | ✅ Yes | Report (persistent) |
| Gathering context for system design decisions | ✅ Yes | Usually Direct |
| Research that another agent will consume | ✅ Yes | Report (persistent) |
| Updating / extending an existing report | ✅ Yes | Report update (surgical) or Direct |
| Quick technical question (< 5 min research) | ⚠️ Maybe | Direct (no skill needed) |
| Creating procedural "how to do X" guidance | ❌ No → Use a **skill** | — |
| Defining an operational role/persona | ❌ No → Use a **subagent** | — |
| Setting always-on project constraints | ❌ No → Use **CLAUDE.md** | — |

**When to produce a formal report:**
- Findings need to be referenced later
- Multiple agents or people will consume the research
- Evidence trail is important for audit/verification
- Research is complex enough to warrant structured documentation

**When to deliver findings directly:**
- User just needs an answer now
- Research is for immediate decision-making
- Findings won't be referenced again
- Speed matters more than persistence

**When to update an existing report:**
- User says "update/refresh/extend/add to the report" or references an existing `<reports-dir>/<report-name>/`
- New questions/dimensions need to be added without redoing everything
- Corrections are needed (new evidence changes prior findings)

---

## Step 0: Create Workflow Checkpoint Tasks

⛔ **ALWAYS THE FIRST ACTION.** Before doing anything else, create workflow checkpoint tasks. These provide structural enforcement, persist across context compaction, and are visible to the user.

Create these tasks immediately upon invocation:

```
TaskCreate: "Research: Routing Gate — check existing research"          → start as in_progress
TaskCreate: "Research: Scoping — propose rubric + get confirmation"     → pending, blocked by #1
TaskCreate: "Research: Conduct research + capture evidence"             → pending, blocked by #2
TaskCreate: "Research: Write REPORT.md"                                 → pending, blocked by #3
TaskCreate: "Research: Validate"                                        → pending, blocked by #4
TaskCreate: "Research: Recap + follow-up"                               → pending, blocked by #5
```

Use `addBlockedBy` to enforce ordering. As you complete each step, mark its task `completed` and mark the next task `in_progress`.

**Path B variant:** If scoping determines Path B (direct answer), mark tasks #4 and #5 as `deleted` (they don't apply).

**Path C variant:** If the routing gate sends you to Path C (update existing), mark tasks #2-#6 as `deleted` and create Path C-specific tasks per `references/updating-existing-reports.md`.

> **Why tasks?** The observed failure mode is the agent skipping the routing gate and scoping, jumping straight to web searches. Tasks provide a persistent, user-visible structural enforcement layer that survives context compaction and makes skipped steps immediately obvious.

---

## Routing Gate

⛔ **MANDATORY FIRST STEP.** Before any web searches, before any research, before any analysis — complete this routing gate. If you find yourself about to run a web search or read a codebase, STOP — you have skipped this step.

### Phase 1: Check existing knowledge

Before scoping new research, scan what already exists.

**If the user explicitly references an existing report** (names it, links it, or says "update/refresh/extend"):
→ Skip the scan. Go directly to **Path C** — load `references/updating-existing-reports.md`.

**Otherwise, always check the catalogue first:**

1. Regenerate the catalogue (fast — takes seconds):
   ```bash
   bun ~/.claude/skills/research/scripts/generate-catalogue.ts
   ```
2. Read `<reports-dir>/CATALOGUE.md`. This is a structured index of all reports with title, description, topics, subjects, evidence count, and last-updated date.
3. Scan the summary table and detail cards for **semantic overlap** with the user's topic — match on title, description, topics, and subjects. You are looking for conceptual relevance, not just keyword matches.
4. For the **1–3 most promising candidates**, read the `REPORT.md` Executive Summary and Research Rubric sections to assess actual coverage depth and relevance.

Classify the user's topic against existing reports:

| Coverage | What it means | Example |
|----------|---------------|---------|
| **Fully covered** | An existing report directly answers the user's question with evidence | User asks about MCP connectivity patterns; `mcp-connectivity-provider/` report exists with that dimension covered |
| **Partially covered** | An existing report covers related ground but not the specific question, or the question is a natural extension | User asks about MCP auth; `mcp-connectivity-provider/` covers architecture but not auth specifically |
| **Not covered** | No existing report has meaningful overlap | User asks about container orchestration; nothing relevant exists |

### Phase 2: Route based on coverage

**Fully covered →** Present what's already known before proposing new work:

> "We already have research on this. Here's what the existing report found:
> - [2–4 key findings from the report, with confidence levels]
>
> **Options:**
> 1. **Use as-is** — this answers your question. I can elaborate on any finding.
> 2. **Verify / refresh** — the report is from [date]. Want me to spot-check whether findings still hold?
> 3. **Go deeper** — the existing report covers [scope]. Want to add [specific dimension] or investigate [angle not covered]?
> 4. **New angle entirely** — if your question is actually about [different framing], a new report may be cleaner."

Let the user choose. Do not start new research when existing research already answers the question.

**Partially covered →** Surface the overlap and propose how to build on it:

> "We have related research in `<reports-dir>/<name>/` that covers [what it covers]. Your question about [topic] isn't directly answered, but it's a natural extension.
>
> **Options:**
> 1. **Extend the existing report** (Path C) — add [new dimension/facet] to `<name>/`. Makes sense if the topics are coherent together.
> 2. **Start a new report** (Path A) — if this is a distinct enough topic that it deserves its own report.
>
> I'd recommend [1 or 2] because [reason]."

**Not covered →** Proceed to Path A (default) or Path B:

Default to **Path A** (formal report, Steps 1–6) unless the user explicitly asks for a quick answer, says "just tell me," or the question is clearly trivial (< 5 min research).
- If the user signals they want a direct answer → **Path B** (lighter scoping, no evidence files unless complex)

### Routing principles

- **Do not skip the scan.** Even a 30-second skim prevents duplicate research and gives the user valuable context on what's already known.
- **Bias toward extending** when topics are semantically coherent. One comprehensive report is more useful than two overlapping ones.
- **Bias toward new reports** when the framing, audience, or primary question differs materially — even if some evidence overlaps.
- **Do not downgrade to Path B** without a clear signal. Persistent, evidence-backed reports are the default.

⚠️ **Avoid:** Starting a new report on a topic that's already well-covered. The user may not know what prior research exists — surfacing it is part of the value.

**Success criteria:** (1) Existing knowledge surfaced before new work begins, (2) Rubric confirmed before research starts, (3) Every finding links to evidence, (4) Output format matches user intent.

---

## Step 1: Collaborative Scoping (for Path A/B)

⛔ **HARD GATE.** Do NOT start any research (web searches, code analysis, evidence gathering) until the user explicitly confirms the rubric. After proposing the rubric, **STOP and WAIT for user response.** Mark the Scoping task as `completed` only after receiving user confirmation.

**Load:** `references/scoping-protocol.md`

- For **Formal Report (Path A):** Output a complete research rubric and get explicit user confirmation before proceeding.
- For **Direct Answer (Path B):** Scoping is still required; keep it appropriately sized, but make dimensions/stance explicit and confirm.

> If the user is updating an existing report, skip this step. Use Path C and load `references/updating-existing-reports.md`.

---

## Step 2: Create the Report Directory

Mark the "Conduct research" task as `in_progress` after completing this step.

```bash
mkdir -p <reports-dir>/<report-name>/evidence
```

**Load:** `references/report-directory-conventions.md` for naming rules, directory structure, and frontmatter schema.

**Naming:** `<scope>-<aspect>`, kebab-case, max ~5 segments. E.g., `claude-skills-architecture`, `devops-practices`, `openhands-vs-openclaw`.

### 2.1 Run-scoped coordination (create only when needed)

Coordination artifacts exist to reduce redundancy and manage parallel work. They are **process**, not proof.

**Core rule:** When you do a coordinated research pass (especially with subagents), treat it as a **run** with a single run context file:

* `meta/runs/<run-id>/RUN.md`

This prevents stale coordination context from one pass bleeding into the next.

#### When to create a run

* **Deep research mode (using subagents):** Create a run **by default**.
* **Solo mode:** Create a run only when at least one of these is true:

  * **Multi-session work**: you expect follow-on updates and want durable pass context
  * **High-stakes verification**: you will run a verification pass or need an audit trail for coordination decisions
  * **Large rubric / explicit gap-closure**: many P0 facets and coverage tracking would otherwise be error-prone

#### Placement (proof vs process separation)

* `evidence/` is **proof only** — primary-source snippets, citations, negative searches
* Run coordination lives in: `<reports-dir>/<report-name>/meta/runs/<run-id>/RUN.md`

Create directories only when needed:

```bash
mkdir -p <reports-dir>/<report-name>/meta/runs/<run-id>
```

#### Run ID convention

Format: `YYYY-MM-DD-<short-label>`

Examples:

* `2026-02-02-initial`
* `2026-02-03-add-sso`
* `2026-02-04-corrective-mfa-fix`

#### RUN.md ownership + lifecycle

* **Ownership:** Only the parent/orchestrator writes `RUN.md`.
* **Workers:** Read `RUN.md` at task start; return findings via their responses; do **not** write files to the run folder.
* **Lifecycle:**

  1. Run start: create `RUN.md` with **Status: Active**
  2. During run: update `RUN.md` as needed for coordination (owners, anchors, delta rubric)
  3. Run close: set **Status: Closed** and treat `RUN.md` as immutable

#### Coverage tracking (via tasks, not files)

Do **not** create a persistent `_coverage.md`.

Instead, the parent/orchestrator:

* creates a task for each P0 dimension (or P0 facet cluster) at run start
* marks the task complete when coverage is confirmed (evidence captured + conflicts resolved)
* reviews task status during gap analysis to identify missing coverage

Use natural "task" terminology; do not assume any specific task tool.

#### What stays at the meta/ level (cross-run)

Some artifacts are not run-scoped:

| Artifact                    | Purpose                        | Notes                          |
| --------------------------- | ------------------------------ | ------------------------------ |
| `meta/_changelog.md`        | Append-only history            | Parent/orchestrator-owned only |

Create `meta/` only if you need it:

```bash
mkdir -p <reports-dir>/<report-name>/meta
```

#### What not to create (new model)

Do **not** create these as part of the current coordination model:

* `meta/_shared-context.md` (merge its contents into `RUN.md`)
* `meta/_coverage.md` (use tasks instead)

### 2.2 Evidence standards and reusing existing context

**Reports must be standalone.** Evidence must rely on 1st-party sources (source code, official docs, API references, research papers, direct observations) — not on other reports' conclusions. A reader should be able to verify every claim in the report without consulting another report.

**Evidence can overlap across reports.** Two reports may cite the same 1st-party source independently. This is expected — each report contextualizes the evidence for its own scope and primary question. Do not avoid citing a source just because another report already cited it.

**Cross-references to other reports are allowed as navigation aids only.** When a dimension in report A is covered in more depth by a different report B, and repeating that depth wouldn't fit naturally in report A's scope, you may include a "Related Research" pointer. These are "see also" links for the reader's benefit — not evidence citations. The current report must not depend on the cross-referenced report for any of its claims.

**If prior research exists on similar topics in the resolved reports directory** (during the research process):

* Extract only what is still relevant to the rubric.
* Treat prior reports as **secondary** unless you can re-verify key claims.
* Do not copy claims forward without evidence or a staleness caveat.

---

## Step 3: Conduct Research + Capture Evidence

Mark the "Conduct research" task as `in_progress` (if not already). Mark it `completed` when all P0 dimensions have evidence.

**Load:** `references/citation-formats.md` for evidence substantiation standards
**Load:** `references/web-search-guidance.md` for web source quality standards (applies to all research)
**Load:** `references/source-code-research.md` if rubric includes OSS technologies (source code is ground truth)

### 3.0 Choose research execution mode

| Condition                                          | Mode                   | What to do                                 |
| -------------------------------------------------- | ---------------------- | ------------------------------------------ |
| Small scope (≤2 dimensions), no parallelism needed | **Solo mode**          | Work through rubric dimension-by-dimension |
| Using subagents (any parallel work)                | **Deep research mode** | Load orchestration reference               |
| Many dimensions, shared sources likely             | **Deep research mode** | Load orchestration reference               |

### 3.1 Solo mode (no subagents)

Work through the rubric dimension-by-dimension:

1. Research (OSS: code-first; closed: web-first; partial: hybrid).
2. **Web search checkpoint** (see `references/web-search-guidance.md`):

   * P0: Always check open issues, official docs, CVEs, maintenance signals
   * P1: Check dimension-relevant categories (see dimension-aware table)
   * Prioritize T1/T2 sources; cross-reference T3/T4
3. Capture evidence to `evidence/<dimension>.md` as you find it.
4. Track gaps (especially P0 facets).

### 3.2 Deep research mode (using subagents)

**Load:** `references/subagent-orchestration.md`

This mode uses a 5-phase pattern to reduce redundant discovery, control verbosity, and produce primary-source-grounded evidence:

1. **Foundation pass** — establish shared context for *this run* (minimal if overlap risk is low)
2. **Parallel subagent work** — dispatch 4–6 workers with strict Markdown output contracts
3. **Gap analysis checkpoint** — verify P0 coverage before writing evidence
4. **Evidence writing** — orchestrator creates evidence files from worker findings + primary sources
5. **Targeted verification** (conditional) — spot-check only when high-stakes, weak evidence, or conflicts

#### Run coordination surface (recommended)

For each coordinated pass, create a run folder and run file:

* `<reports-dir>/<report-name>/meta/runs/<run-id>/RUN.md`

`RUN.md` should contain everything workers need to understand what *this pass* is doing (purpose, delta rubric, source anchors, canonical sources + owners).

#### Coverage tracking (via tasks)

At run start, the parent/orchestrator should:

* create a task for each P0 dimension (or P0 facet cluster)
* mark tasks complete as evidence-backed coverage is confirmed
* use task status during gap analysis to identify missing P0 coverage

#### Key constraints

* Workers return **structured Markdown findings** (not final evidence files).
* Workers read `RUN.md` at task start.
* Workers do **not** write files to the run folder.
* The orchestrator owns judgment calls (conflict resolution, sufficiency, scope).
* Verification is conditional—only when needed (see orchestration reference for criteria).

See the orchestration reference for phase details, prompt templates, output contracts, and run coordination guidance.

### 3.3 Evidence capture (applies to all modes)

Evidence files are primary proof. Keep them reproducible.

⚠️ **Avoid:** Claims without evidence links. Every finding must trace to a source.

**Naming convention:**

* Use kebab-case matching the dimension: `evidence/<dimension-name>.md`
* For updates/corrections to existing reports, see `references/updating-existing-reports.md` for guidance on when to:

  * append new evidence files (e.g., `evidence/<dimension>-update-YYYY-MM-DD.md`), vs
  * edit existing evidence files in place (surgically) to maintain a clean current-state proof surface.

**Note:** This template is for **evidence files** (orchestrator-authored). For subagent output contracts, see `references/subagent-orchestration.md`.

Default evidence file structure:

```markdown
# Evidence: <Dimension>

**Dimension:** <Dimension name from rubric>
**Date:** YYYY-MM-DD
**Sources:** <repos/urls searched>

---

## Key files / pages referenced (top 5–15)
- <file path or URL> — why relevant
- ...

---

## Findings

### Finding: <Declarative claim>
**Confidence:** CONFIRMED | INFERRED | UNCERTAIN | NOT FOUND
**Evidence:** <file:line-range OR URL>

```text
<short snippet / quote / output>
```

**Implications:** <what this means for the primary question>

---

## Negative searches (for NOT FOUND)

* Searched: <terms> in <locations> → <result>

---

## Gaps / follow-ups

* <facet not fully answered> — what to check next
```

Evidence capture rules:
* Include file path + line numbers (or URL + access date)
* Capture the minimum snippet needed to justify the claim
* Document negative searches for "NOT FOUND"
* Label confidence consistently
* When a finding comes from a vendor's own data about their own product/feature, flag it in the evidence file: note the vendor name, what they sell, and that product-incentive bias is possible. This prevents post-hoc audit catches and ensures downstream synthesis includes appropriate caveats.
* When a new finding contradicts or tensions with an earlier finding (from a different dimension or earlier in the same pass), note the tension in the evidence file's "Gaps / follow-ups" section. Do not stop to resolve — continue researching. Resolution happens during synthesis (Step 4) or a coherence audit.

---

## Step 4: Write REPORT.md

Mark the "Write REPORT.md" task as `in_progress`. Mark it `completed` when REPORT.md is written.

**Load:** `references/section-templates.md` for report structure patterns
**Load:** `references/diagram-patterns.md` if architecture diagrams are needed

If your draft REPORT.md is coming out repetitive (mirrors evidence files), or if the user's goal is decision-making:

**Load:** `references/report-synthesis-patterns.md`

**Core rule:** REPORT.md is synthesis. Evidence files are proof. Do not dump raw evidence in REPORT.md.

⚠️ **Avoid:** REPORT.md that mirrors evidence files. Add implications, decision triggers, trade-offs, and uncertainty—not just restated facts.

**Coherence cross-check (as you write, not after):**

When synthesizing findings across dimensions, actively cross-check:

* **Cross-finding consistency:** If two dimensions address the same capability or topic, ensure they don't contradict without explanation. Reconcile (one is conditional) or acknowledge the tension explicitly.
* **Stat consistency across sections:** When the same statistic appears in multiple sections (e.g., exec summary + detail section + benchmark table), verify all instances use the same value. Stats drift when copied between sections.
* **Arithmetic and claim fidelity:** When synthesizing quantitative claims from evidence, verify the math (ratios, percentages, multiples) and preserve the exact population, metric type, and qualifiers from the source. Do not mutate "40% of star performers" into "40% more deals" or "74% of respondents" into "74% of teams" — these are different claims.
* **Confidence-prose alignment:** Match prose certainty to evidence strength — declarative statements ("X does Y") for CONFIRMED findings, hedged language ("evidence suggests") for INFERRED. See `report-synthesis-patterns.md` §5.2.
* **Conditionality:** If a finding is version-bound, config-dependent, or context-specific, state the conditions. Do not flatten into unconditional claims. See `report-synthesis-patterns.md` §5.3.

Default report structure:

```markdown
---
title: "[Report Title]"
description: "[1-3 sentence summary: what this report covers, what questions it answers, key domain terms for AI discoverability]"
createdAt: YYYY-MM-DD
updatedAt: YYYY-MM-DD
subjects:       # optional — proper nouns (companies, technologies, frameworks)
  - [Subject 1]
topics:         # optional — qualitative areas, <=3 words each
  - [topic area]
---

# [Report Title]

**Purpose:** [1-2 sentences: why this report exists and what the reader cares about — from rubric]

---

## Executive Summary

[2-4 paragraphs: Lead with the answer. Key findings. Critical caveats.]

**Key Findings:**
- **[Finding 1]:** One-line summary
- **[Finding 2]:** One-line summary
- **[Finding 3]:** One-line summary

---

## Research Rubric

[Include the agreed rubric for transparency]

---

## Detailed Findings

### [Dimension 1 from Rubric]

**Finding:** [Declarative statement]

**Evidence:** [evidence/<file>.md](evidence/<file>.md)

**Implications:**
- [What this means for the decision]

**Decision triggers (when this matters):**
- [If condition, this finding becomes critical]
- [If condition, this finding is less relevant]

**Remaining uncertainty (if any):**
- [What we could not confirm and why]

### [Dimension 2 from Rubric]
...

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- [Dimension]: [What couldn't be confirmed, what was searched]

### Out of Scope (per Rubric)
- [Items explicitly excluded]

---

## References

### Evidence Files
- [evidence/<file1>.md](evidence/<file1>.md) - [What it contains]

### External Sources
- [Title](URL) - [Brief description]

### Related Research (optional)
- [<reports-dir>/<report-name>/](<reports-dir>/<report-name>/) - [What it covers that goes deeper on a relevant topic]
```

**Inline source citations:** When a specific claim maps cleanly to 1–2 identifiable sources, cite inline using named references: `[Proper Noun](URL)`. Link text is just the proper noun — sample sizes and caveats go in surrounding prose. Claims drawing on 3+ sources are synthesis — omit inline refs and let the `**Evidence:**` link carry attribution. Most sentences need no inline citation. See `report-synthesis-patterns.md` §5.5.

**Honor stance** (see `scoping-protocol.md` §G for details). Factual reports avoid recommendations; Conclusions reports link recommendations to evidence.

---

## Step 5: Validate

Mark the "Validate" task as `in_progress`. Mark it `completed` when all checklist items pass.

**Load:** `references/citation-formats.md` to verify evidence citations meet standards

Before delivering:

* [ ] Executive Summary answers the rubric's primary question
* [ ] Every rubric dimension has a corresponding finding section
* [ ] Every finding links to an evidence file
* [ ] Evidence files contain primary source material (snippets/quotes/outputs)
* [ ] "NOT FOUND" claims include documented searches
* [ ] Gaps are documented with what was searched
* [ ] Non-goals from rubric are respected (no scope creep)
* [ ] No unacknowledged contradictions across dimension sections (cross-finding coherence)
* [ ] Quantitative claims have correct arithmetic (verify ratios, percentages, multiples against evidence)
* [ ] Stats cited in multiple sections use consistent values (exec summary, detail sections, tables)
* [ ] Prose certainty matches evidence confidence — no "clearly" or "definitively" for INFERRED findings
* [ ] External Sources are hyperlinks; inline citations use named refs (`[Proper Noun](URL)`) selectively (1–2 source claims only; 3+ sources = synthesis, no inline refs)
* [ ] Report is in `<reports-dir>/<report-name>/`

If validation fails, fix and re-check.

---

## Step 6: Research Recap & Follow-up

Mark the "Recap + follow-up" task as `in_progress`. Mark it `completed` after presenting the recap and follow-up options.

After delivering findings (any path), present a concise recap and naturally surface opportunities to go deeper. The goal is a **collaborative research conversation**, not a one-shot dump.

### 6.1 Recap (always do this)

Summarize what was covered in a compact block:

> **What we investigated:** [1–3 sentence summary of scope and approach]
>
> **Key findings:** [3–5 bullet points — the headline answers]
>
> **Confidence gaps:** [1–3 bullets — what remains UNCERTAIN or NOT FOUND, if any]

Keep this short. The user already has the full report/answer — the recap is a conversation pivot, not a repeat.

### 6.2 Surface follow-up directions (always do this)

Based on what emerged during research, offer **2–4 natural follow-up options**. These should feel like a knowledgeable colleague saying "here's what I'd look at next" — not a generic menu.

**Where follow-ups come from (research angles only):**
- Gaps/open questions that emerged during research (the "we couldn't confirm X" items)
- Adjacent dimensions the rubric didn't cover but findings suggest matter (e.g., "performance didn't come up in scoping, but the architecture we found has known scaling concerns")
- Deeper dives into findings that were covered at moderate depth but could go deeper (e.g., "we confirmed the auth model at a high level — a deeper dive into token lifecycle and revocation semantics would sharpen the security assessment")
- Cross-cutting perspectives that would reframe or stress-test existing findings (e.g., "we assessed features from the builder's perspective — investigating from the operator/SRE perspective might reveal different trade-offs")
- Emerging questions that the research itself surfaced — things you didn't know to ask before starting (e.g., "the codebase revealed an undocumented plugin system — investigating its stability and API surface could change the extensibility assessment")
- **Coherence review** — proactively suggest this (not just list as a generic option) when you observed 2+ of these signals during research:
  - Conflicting evidence across dimensions (sources disagree, or findings tension with each other)
  - High density of UNCERTAIN findings on pivotal claims
  - Late-breaking findings that reframe or undermine earlier conclusions
  - Complex cross-dimension interactions (same capability assessed differently in different contexts)

  When signals are present, frame it specifically:
  > "This research surfaced [specific tension]. A coherence audit would help reconcile these findings. Want me to run one?" (load `references/coherence-audit.md`)

  When signals are absent, omit — don't offer a coherence audit as a default follow-up on every report.

**Stay in the research lane.** Follow-ups must be *further research* — additional angles, deeper investigation, adjacent domains, unexplored dimensions. Never suggest derivative deliverables (checklists, templates, scorecards, playbooks, audits of the user's own assets) or productized outputs that belong to other skills. If a research finding naturally implies a downstream action ("this finding suggests you'd benefit from X"), name the implication in the report's findings — but the follow-up option should be "investigate X further," not "let me build X for you."

**When the user asks "anything else to research?" / "what else should we look at?" / "is there more?":**

This is an invitation to exercise deep judgment — not just recite the gap list. Re-ground in the report's purpose before responding:

1. Re-read the rubric's **Research Purpose** ("reader cares most about") and the report's current coverage.
2. Ask yourself: given what this report is trying to accomplish, what angles would most improve its value? Think beyond the existing rubric — what perspectives, framings, or cross-cutting concerns would a domain expert consider that the original scoping might have missed?
3. Evaluate candidate angles against the purpose. Rank by constructiveness — which would most move the needle on what the reader cares about? Not just "we have a gap here" but "this gap matters because it directly affects [priority]."
4. Present 2-4 options ranked by value, each tied to the report's purpose. If nothing constructive remains within scope, say so honestly rather than inventing busywork.

The goal is the quality of thinking a senior colleague would bring — "given what you're trying to accomplish, here's what I'd investigate next and why" — not a mechanical scan of unchecked boxes.

**How to present them:**

> **Where we could go from here:**
>
> 1. **[Descriptive direction]** — [why it matters, tied to what we found]. *[Depth: quick check / moderate / deep dive]*
> 2. **[Descriptive direction]** — [why it matters]. *[Depth: ...]*
> 3. **[Descriptive direction]** — [why it matters]. *[Depth: ...]*
>
> Want to dive deeper into any of these, or is there another angle that came to mind?

**Calibration guidance:**
- Match the follow-up tone to the research tone. If the user asked a quick question (Path B), offer lightweight follow-ups. If they commissioned a deep report (Path A), offer substantial next dimensions.
- If research was comprehensive and no meaningful gaps remain, say so: "This covers the scope well. I don't see obvious gaps to chase — but let me know if anything else comes up as you work with this."
- If the user explicitly said "just give me the report" or signals they're done, skip 6.2 and just deliver the recap.

### 6.3 Iterate (if the user engages)

If the user picks a follow-up direction:
- **For additive dimensions:** Treat it as a Path C update (load `references/updating-existing-reports.md`) if a report exists, or continue the conversation if it was a direct answer.
- **For deeper dives:** Narrow scope to the specific facet and re-enter Step 3 with a focused mini-rubric.
- **For action-oriented follow-ups:** Transition out of the research skill naturally — e.g., "That moves us from research into implementation. Want me to [specific next action]?"

Each iteration gets its own recap + follow-up cycle. The conversation continues until the user signals they have what they need.

⚠️ **Avoid:** Offering follow-ups that restate what was already covered. Follow-ups should open new ground, not rehash findings.

---

## Confidence Labels

Use consistently throughout:

* **CONFIRMED** - Direct evidence in evidence/ files
* **INFERRED** - Logical conclusion from patterns
* **UNCERTAIN** - Partial evidence, needs validation
* **NOT FOUND** - Explicitly searched, not present

---

## Anti-Patterns

*Top anti-patterns are inlined as ⚠️ warnings in relevant steps. These remain here for reference:*

* **Proposing dimensions without justification**
* **Skipping non-goals**
* **Evidence files that only restate subagent summaries** (capture primary-source snippets instead)
* **Letting subagent narrow scope become the final judgment** (the orchestrator owns judgment calls)
* **Defaulting to conclusions without asking** (must honor stance)
* **Over-updating**: rewriting a report wholesale when the user asked for a delta (use Path C)
* **Generic follow-ups**: offering "want to learn more?" without tying options to specific findings or gaps from the research
* **Deliverable follow-ups instead of research follow-ups**: suggesting checklists, templates, scorecards, style guides, audits-of-user-assets, or other productized outputs as "where we could go from here" — follow-ups must be further research directions (deeper dives, adjacent dimensions, unexplored angles), not downstream deliverables that belong to other skills
* **Skipping the recap**: dumping a report and going silent — always close with a recap + natural follow-up options unless the user explicitly signals they're done
* **Ignoring existing reports**: starting new research without scanning the resolved reports directory first — the user may not know what prior research exists, and duplicate work wastes time
* **Skipping the routing gate and scoping to jump straight to research**: The most common failure mode. When invoked, the agent immediately starts web searching and delivers informal findings without completing the routing gate or getting rubric confirmation. This bypasses the entire protocol. The routing gate and scoping confirmation are hard gates — not optional steps. If you catch yourself about to run a web search before the routing gate is complete, STOP.
* **Defaulting to Path B without explicit user signal**: Treating conversational phrasing ("I need to understand...", "what does X do?") as a signal for direct answer delivery. These are normal research requests — Path A is the default unless the user explicitly says "just tell me", "no report needed", or similar.

---

## Additional Resources

* **Scoping protocol (rubric-first):** `references/scoping-protocol.md`
* **Updating existing reports (delta/additive/corrective):** `references/updating-existing-reports.md`
* **Dimension frameworks by report type:** `references/dimension-frameworks.md`
* **Section templates:** `references/section-templates.md`
* **ASCII diagram patterns:** `references/diagram-patterns.md`
* **Evidence citation formats:** `references/citation-formats.md`
* **Web search guidance (all research):** `references/web-search-guidance.md`
* **Source code research (OSS):** `references/source-code-research.md`
* **Subagent orchestration (deep research):** `references/subagent-orchestration.md`
* **Analytical synthesis patterns:** `references/report-synthesis-patterns.md`
* **Coherence audit protocol:** `references/coherence-audit.md`
* **Report directory conventions (naming, structure, frontmatter):** `references/report-directory-conventions.md`
* **Catalogue generator:** `scripts/generate-catalogue.ts` — run with `bun run generate-catalogue.ts` to regenerate `<reports-dir>/CATALOGUE.md` from report frontmatter
