Use when: Choosing what artifacts to create (one doc vs multiple), where to store them, how to cross-reference research, and when/how to persist insights to files during the iterative spec process.
Priority: P0
Impact: Specs become untraceable across sessions; decisions get lost; research isn't connected to the plan; insights accumulate only in chat and are lost when context compresses.

---

# Artifact strategy

## The four-layer model

The spec process operates across four layers. Each has a different audience, attention cadence, and content posture.

| Layer | Primary audience | When they look | Content posture | Mutability |
|---|---|---|---|---|
| **Conversation** | The user | Every turn — primary interface | Decision-relevant substance: what shifted, what needs input, what to decide next | Ephemeral (context window) |
| **SPEC.md** | User + downstream consumers | End of session or periodically | Stateless current-state snapshot — "what we believe right now." Not a log of how we got there. | Surgical edits to reflect latest understanding |
| **evidence/** | Primarily the agent; secondarily human-inspectable | Agent reads for memory/grounding; human reads to audit or reference | Primary-source proof: code traces, dependency checks, prior art, negative searches | Append new findings; surgical edit to correct/supersede |
| **meta/_changelog.md** | Primarily the agent; secondarily human-inspectable | Agent reads at session start to re-orient; human reads to trace evolution | Append-only process history: what changed, when, why, what it affected | Append only — never edit past entries |

**Key implications:**
- The conversational output is about decision-relevant substance, not file operations. The user steers via conversation; artifacts update silently as agent discipline.
- SPEC.md is a snapshot, not a journal. Its Decision Log records "what we decided and why" — not "how we evolved through three positions." The evolution narrative belongs in `meta/_changelog.md`.
- evidence/ and meta/ are agent memory first. The primary consumer is a future agent session resuming this spec. Human readability is a nice-to-have, not the design target.

---

## Default artifact set (recommended)
**One canonical spec artifact** that contains both PRD + Technical Spec content:

- `SPEC.md` (PRD section + Technical Spec section)
  - includes: Open Questions, Decision Log, Assumptions, Risks, Appendices/Deferrals

Optional supporting artifacts (only if they reduce friction):
- `OPEN_QUESTIONS.md` (if the backlog is large and changes frequently)
- `DECISIONS.md` (if you want a clean diffable log)
- `CONSUMER_MATRIX.md` and `USER_JOURNEYS.md` (if those are large)

**Process artifacts (always created):**
- `meta/_changelog.md` — append-only process history (what changed, when, why, what it affected)

**Research artifacts:**
- Use `/research` when deep evidence is required.
- Route findings to the right bucket (see "Where evidence goes" below).

## Where to store artifacts

**Default:** `<repo-root>/specs/<YYYY-MM-DD>-<spec-name>/SPEC.md`

The directory name is prefixed with the **current date** (when the spec is first created) in `YYYY-MM-DD` format. This makes specs sort chronologically in file browsers. Example: `specs/2026-02-25-bundle-template-in-create-agents/SPEC.md`.

Override sources (checked in priority order):

| Priority | Source | Example |
|----------|--------|---------|
| 1 | User says so in the current session | "Put the spec in `docs/rfcs/`" |
| 2 | Env var `CLAUDE_SPECS_DIR` | `CLAUDE_SPECS_DIR=./my-specs` → `./my-specs/<YYYY-MM-DD>-<spec-name>/SPEC.md` |
| 3 | AI repo config (`CLAUDE.md`, `AGENTS.md`, etc.) | `specs-dir: .ai-dev/specs` |
| 4 | Default (in a repo) | `<repo-root>/specs/<YYYY-MM-DD>-<spec-name>/SPEC.md` |
| 5 | Default (no repo) | `~/.claude/specs/<YYYY-MM-DD>-<spec-name>/SPEC.md` |

Do **not** auto-detect repo directories (`docs/`, `rfcs/`) — only use them when explicitly configured. When inside a git repo, specs default to the repo-local `specs/` directory. When not inside a git repo, fall back to `~/.claude/specs/`.

If the user wants "chat-only": produce Markdown in chat, but still keep a single canonical artifact in the thread.

## "What goes where" (avoid duplication)

**Keep in SPEC (synthesis):**
- Problem, goals, personas/journeys (as needed)
- Requirements + acceptance criteria
- Options + tradeoffs + decision rationale
- Phases + rollout + risks
- References/links to evidence and research reports (not raw evidence dumps)

**Keep in evidence files (proof):**
- code-path traces, file:line references
- dependency type signatures / source excerpts
- codebase pattern analysis (e.g., `/explore` findings that informed the design)
- transitive dependency chains, blast radius analysis
- external prior art citations
- negative searches ("NOT FOUND")

Evidence should contain primary source material (code snippets, exact output, API shapes) — not just summaries.

**Keep in meta/_changelog.md (process history):**
- Decision evolution ("D3 was initially Option A; switched to B after auth-flow evidence")
- Assumption lifecycle events ("A2 stated Feb 12 → refuted Feb 14 → cascade: §8, §9 updated")
- Phase reorganization, scope changes, evidence additions
- Open Question decomposition and promotions
- Session summaries and pending items carried forward

## Where evidence goes

When a substantive finding emerges during spec work, route it to the right place:

| Finding type | Destination | Example |
|---|---|---|
| Fits an existing report's topic | Append to existing report's `evidence/` | "We already have a report on auth patterns — add this finding there" |
| Large domain area warranting standalone research | New `/research` report (confirm with user if unsure) | "MCP integration patterns — this is broader than our spec" |
| Spec-specific context that doesn't generalize | Spec-local `evidence/` directory | "How our current webhook handler works — relevant only to this feature's design" |

**Spec-local evidence** lives alongside the spec:

```
~/.claude/specs/<YYYY-MM-DD>-<spec-name>/
├── SPEC.md
├── evidence/                  # Spec-local findings (granular, with frontmatter)
│   ├── auth-middleware-flow.md
│   ├── webhook-infra-patterns.md
│   └── ...
└── meta/
    └── _changelog.md          # Append-only process history
```

Use spec-local evidence for findings that are specific to this feature's design context and wouldn't be useful in a standalone report. Use `/research` reports for findings that have value beyond this spec.

### Evidence file conventions

**Granularity:** Create granular evidence files from the start — one file per semantically distinct topic area at medium scope. Not one file per function call (too narrow), not one catch-all file (too broad). Scope by the system area or investigation thread that's cohesive for this spec. Evidence files can grow incrementally as new findings in the same area emerge — the initial scope isn't frozen.

**Frontmatter:** Every evidence file gets frontmatter so agents can reason about relevance without reading the full file:

```markdown
---
title: Auth Middleware Flow
description: Traces the 4-layer auth middleware chain. Covers request-scoped auth model and token propagation.
created: YYYY-MM-DD
last-updated: YYYY-MM-DD
---
```

**Format:** Same structure as `/research` evidence files — with findings, confidence levels (CONFIRMED / INFERRED / UNCERTAIN / NOT FOUND), and source references. See the research skill's conventions.

**Confidence ceilings:** Certain claim types have a maximum confidence regardless of how sure the agent feels. Apply these caps when writing findings:

| Claim type | Max confidence | Why |
|---|---|---|
| Recalled best practices (not verified this session) | INFERRED | Memory is not evidence |
| Version-specific behavior (API, library, framework) | UNCERTAIN unless verified against current source/types | Versions change; docs lag |
| Predictions about runtime behavior at scale | INFERRED | Estimates, not measurements |
| Analogical claims ("X works like Y") | INFERRED | Analogies break at boundaries |

If a finding would be marked CONFIRMED but falls into one of these categories, cap it and note what verification would raise confidence.

### meta/_changelog.md format

Append-only. Never edit past entries. Each session appends a dated entry:

```markdown
## YYYY-MM-DD

### Changes
- **D4 created:** Chose webhook-based approach over polling
  - Evidence: `evidence/auth-middleware-flow.md`
  - Affected sections: SPEC.md §8, §9
- **A2 refuted:** Auth is request-scoped, not session-scoped
  - Cascade: §8, §9 auth sections updated; D2 rationale revised
- **evidence/auth-middleware-flow.md:** Created — 4-layer middleware trace
- **Q5 resolved → D4**

### Pending (carried forward)
- Retry policy configurability — needs product priority input
- Q7: Cache invalidation strategy — blocked on D5
```

## Write triggers and cadence

Write cadence is **event-driven**, not time-based. The trigger is the nature of the insight, not the turn boundary.

**The principle:**
- **Evidence (factual, observable)** → write to files immediately. Facts don't need user input.
- **Synthesis (interpretive, judgment-dependent)** → write to SPEC.md after user confirmation. Don't persist premature judgments.
- **Structural SPEC.md updates** (new requirement, phase change, design revision) → write as soon as the underlying information is confirmed, whether by evidence or user decision.
- **File operations are silent agent discipline.** The user steers via conversation. Don't announce file writes as output — surface the substance of what shifted instead (see output format §5 "What evolved").

### Write trigger protocol

#### Research/inspection produces a factual finding

| Scenario | Where | Write mode |
|---|---|---|
| New finding, no evidence file for this topic | `evidence/<topic>.md` | **New file** with frontmatter |
| New finding, evidence file exists | `evidence/<topic>.md` | **Append** new finding entry |
| Finding contradicts a prior finding | `evidence/<topic>.md` | **Surgical edit** the claim + `[Revised YYYY-MM-DD]` annotation |
| Finding updates current system understanding | SPEC.md §8 (Current State) | **Surgical edit** the specific bullet/paragraph |
| Finding belongs in an existing `/research` report | Existing report's `evidence/` | **Append** per research skill conventions |
| Finding implies large standalone research need | Chat only — propose to user | **No write yet** |

#### User makes a decision

| Scenario | Where | Write mode |
|---|---|---|
| New decision | SPEC.md §10 (Decision Log) | **Append** new row |
| Resolves an Open Question | SPEC.md §11 | **Surgical edit** Status → "Resolved" + link to decision |
| Impacts requirements | SPEC.md §6 | **Surgical edit** affected rows |
| Impacts proposed solution | SPEC.md §9 | **Surgical edit** the specific subsection |
| Validates an assumption | SPEC.md §12 + §10 | **Surgical edit** status → "Confirmed" + **append** Decision Log entry |
| Refutes an assumption | SPEC.md §12 + all dependent sections | **Surgical edit** status → "Refuted" + **full transitive cascade** (see Cascade protocol) |
| Creates cascading new questions | SPEC.md §11 | **Append** new rows |
| Changes risk profile | SPEC.md §14 | **Surgical edit** or **append** |
| All of the above | `meta/_changelog.md` | **Append** session entry |

#### New question/uncertainty surfaces

| Scenario | Where | Write mode |
|---|---|---|
| New open question | SPEC.md §11 | **Append** new row with tags and research angles (in "Plan to resolve" column) |
| Question splits into sub-questions | SPEC.md §11 | **Surgical edit** parent → "Decomposed → Q7, Q8" + **append** children |
| Question is actually a decision | SPEC.md §10 + §11 | **Append** to Decision Log (Pending) + **surgical edit** OQ → "Promoted to D5" |

#### Assumption lifecycle

| Scenario | Where | Write mode |
|---|---|---|
| New assumption stated | SPEC.md §12 | **Append** new row (confidence, verification plan, expiry) |
| Assumption validated | SPEC.md §12 + §10 | **Surgical edit** → "Confirmed" + **append** Decision Log with evidence link |
| Assumption refuted | SPEC.md §12 + dependents | **Surgical edit** → "Refuted" + **full transitive cascade** |
| Expiry reached without resolution | SPEC.md §12 + §11 | **Surgical edit** → "OVERDUE" + **append** Open Question to force resolution |

#### Current system behavior discovered

| Scenario | Where | Write mode |
|---|---|---|
| First trace of a system area | `evidence/<system-area>.md` | **New file** with frontmatter |
| Additional findings in same area | `evidence/<system-area>.md` | **Append** |
| Contradicts prior trace | `evidence/` + SPEC.md §8 | **Surgical edit** both |
| Reveals latent bug/gap unrelated to spec | Chat + SPEC.md §14 or §11 | **Append** to Risks or Open Questions |

#### Confirmed interpretive insight (synthesis ready to persist)

| Scenario | Where | Write mode |
|---|---|---|
| New requirement emerges | SPEC.md §6 | **Append** new row |
| Existing design element refined | SPEC.md §9 | **Surgical edit** the subsection |
| New section needed (not in template) | SPEC.md | **Append** under most relevant parent |
| Evidence strengthens existing decision | SPEC.md §10 | **Surgical edit** evidence/links column |
| Phasing changes | SPEC.md §13 | **Surgical edit** / **append** / move to §15 as appropriate |

#### Interpretive insight that needs user input

| Scenario | Where | Write mode |
|---|---|---|
| Raw observation + possible interpretation | Chat only (§2 or §3) | **No write** — premature synthesis pollutes the spec |
| After user confirms direction | Per the relevant protocol above | Per confirmed insight rules |

### Write-mode decision tree (summary)

```
New insight →
  Factual/observable?
    YES → evidence file exists for topic?
      NO  → NEW FILE (with frontmatter)
      YES → contradicts existing? → SURGICAL EDIT : APPEND
      Changes SPEC.md understanding? → SURGICAL EDIT affected section
      Log to meta/_changelog.md → APPEND

  Interpretive/synthetic?
    Enough context to confirm?
      NO  → CHAT ONLY (route to §2/§3)
      YES → new content? → APPEND : SURGICAL EDIT
      Log to meta/_changelog.md → APPEND
```

### Cascade protocol

When an assumption is refuted or a decision invalidates prior work:

**Default: full transitive cascade.** Trace direct dependencies (what relied on this), then transitive dependencies (what relied on those). For each affected section:

1. Assess whether the section is actually affected (not just possibly)
2. If confident → surgical edit immediately
3. If uncertain → research further to reach high confidence (uncertainty is a signal to dig deeper, not to skip)
4. If genuinely a gray area after research → flag to user before editing

User input is the escape hatch for genuinely ambiguous judgment calls, not for cases the agent could resolve with more investigation.

---

## Multi-session discipline
When a spec spans many interactions:
- Treat `SPEC.md` as the single source of truth for current state.
- At the start of a new session:
  1) read `SPEC.md`, `evidence/` files, and `meta/_changelog.md`
  2) summarize current state from the spec
  3) review changelog for pending items carried forward from prior sessions
  4) restate top P0 Open Questions
  5) propose the next decision batch + research plan
- Never rely on "memory" when artifacts exist — re-read and update.

## Updating an existing spec (delta posture)
If the user is revisiting a spec:
- Read `SPEC.md`, `evidence/` files, and `meta/_changelog.md` first.
- Log changes to `meta/_changelog.md` (append-only) — do not embed change commentary inside SPEC.md.
- Prefer surgical edits to SPEC.md over rewriting — update only the sections affected by new information.
- SPEC.md should always read as a clean current-state snapshot, not a document with revision annotations scattered through it.

## When to split PRD and tech spec into two files
Split only if:
- different audiences genuinely require separation, or
- the doc is too large to reason about in one place

Rule of thumb: if the spec is too large to hold in working context alongside the conversation, consider splitting. But prefer unified unless there's a clear audience separation — a long unified doc is better than two short docs with broken cross-references.

If you split:
- `PRD.md` holds problem, personas, journeys, requirements, success metrics
- `TECH_SPEC.md` holds architecture, data/API, rollout, risks
- both link to a shared `DECISIONS.md` and `OPEN_QUESTIONS.md` (optional)
