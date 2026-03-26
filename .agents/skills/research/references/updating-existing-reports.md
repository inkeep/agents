Use when: The user wants to update/refresh/extend an existing report in <reports-dir>/ (add new dimensions, answer follow-up questions, correct facts, or incorporate new evidence).
Priority: P0
Impact: Without this, updates tend to (a) restart research from scratch, (b) overfit to new info, (c) rewrite unrelated sections, and/or (d) break fidelity to the original report's scope/stance.

---

# Updating Existing Research Reports Without Overfitting

This playbook is for **incremental research updates** to an existing report while minimizing unnecessary changes and avoiding recency bias.

Update = add/correct findings and evidence **surgically**, preserving the existing report's:
- primary question + decision context
- stance (Conclusions vs Factual/Academic)
- scope + explicit non-goals
- structure and evidence-linking conventions

If the user's request changes the primary question materially, prefer **forking a new report** (or performing a full re-scope) rather than patching.

---

## Core invariant: preserve baseline intent + stance

Treat the existing report as the **baseline contract**.

Default posture:
- Preserve the original report's **primary question**, **rubric**, and **stance** unless the user explicitly requests a change.
- Preserve the original report's **scope boundaries** and **non-goals** (unless the user expands scope).
- Avoid rewriting parts of the report that are not impacted by the update request.
- Evidence discipline stays the same: every new/changed high-impact claim links to evidence.
- Avoid "recency over-weighting": new information does not automatically supersede older findings unless it is stronger evidence, more relevant, or clearly indicates staleness.

---

## Deliverables are current-state; history lives in the changelog

All reader-facing artifacts should be readable as **coherent current-state snapshots**.

| Artifact | Updated on iterations? | History tracked in |
|---|---|---|
| `REPORT.md` | Yes — edit to reflect current findings | `meta/_changelog.md` |
| `evidence/` | Yes — surgical edits, appends, or deletions | `meta/_changelog.md` |
| `meta/_changelog.md` | Append-only | (itself) |

- REPORT.md should not require a reader to understand "passes," "updates," or chronology to interpret the content.
- Avoid duplication that forces readers to guess "which is current."
- Use `meta/_changelog.md` for audit trail instead of cluttering deliverables.

---

## Changelog artifact (recommended): `meta/_changelog.md`

To preserve historical context without cluttering the report itself:

- Maintain a changelog artifact at: `<reports-dir>/<report-name>/meta/_changelog.md`
- **Ownership:** Only the parent/orchestrating agent maintains this file. Subagents do **not** write to it.
- **Purpose:** Process/history documentation (what changed, what was searched, what was updated), not a reader-facing "current state" narrative.

### If the report has no `meta/` directory

Create `meta/` to hold `_changelog.md`:

```bash
mkdir -p <reports-dir>/<report-name>/meta
```

### Minimal template (append an entry per research pass)

```md
# Changelog

## YYYY-MM-DD — <short label>
**Update type:** Additive | Corrective | Refresh
**Why this pass happened:** <1 sentence user request / trigger>

### Scope (delta only)
- <dimensions/facets investigated>

### What changed (current-state)
- REPORT.md — sections touched: <list>
- Evidence — added: <files> | edited-in-place: <files> | deleted (stale): <files>

### Notes on confidence / contradictions (if relevant)
- <1–3 bullets>

### Open questions / gaps
- <bullets>
```

Keep entries short. Do not paste raw evidence here.

---

## Run-scoped coordination for update passes (recommended when coordinating)

If an update pass uses subagents or requires explicit coordination, treat the pass as a **run** with a single run context file:

```
<reports-dir>/<report-name>/
  meta/
    _changelog.md
    runs/
      <run-id>/
        RUN.md                  # run-scoped context (single file)
```

### Run ID convention

Format: `YYYY-MM-DD-<short-label>`

Examples:

* `2026-02-02-add-sso`
* `2026-02-03-fix-mfa`

### RUN.md purpose + ownership

`RUN.md` should contain everything workers need to understand what *this pass* is doing:

* pass intent (additive/corrective/refresh)
* delta rubric (what you are changing in this run)
* source anchors (repo commit/tag; docs URLs + access date)
* canonical sources + ownership map (avoid overlap)

Rules:

* **Parent/orchestrator owns all writes** to `RUN.md`.
* **Workers read `RUN.md`** and return findings via their responses.
* **Workers do not write files** to the run folder.
* When the pass is done, set `Status: Closed` and treat `RUN.md` as immutable.

### Coverage tracking (via tasks, not files)

Do not create `_coverage.md`. Instead, the parent/orchestrator:

* creates a task for each P0 dimension/facet cluster at run start
* marks tasks complete when coverage is confirmed (evidence captured + conflicts resolved)
* reviews task status during gap analysis to identify remaining gaps

Use natural "task" terminology; do not assume any specific task tooling.

---

## Update types (classify early)

### 1) Additive updates (most common)

User wants new dimensions/facets added:
- "Add deployment options"
- "Include licensing and cost"
- "Research SSO support"
- "Compare against another alternative"

Default behavior:
- Add new evidence and report sections only where needed.
- Do not rewrite existing conclusions/summary unless the new info materially changes them.

### 2) Corrective updates

New evidence contradicts or refines a prior claim:
- "We discovered SSO is available"
- "That benchmark was incorrect"
- "New release changed behavior"

Default behavior:
- Verify the contradiction (prefer primary sources).
- Update the specific claim(s) and the evidence link(s).
- Make the correction explicit in the update summary (outside REPORT.md unless the report format requires it).

### 3) Refresh / staleness updates

User wants a "current as of" refresh:
- "Update this for the latest version"
- "Is this still true today?"

Default behavior:
- Time-bound the update: capture "as of" date/version.
- Re-verify only the claims that are likely to have changed.
- Do not churn stable content.

---

## Decide: Update vs Fork vs Full Re-scope

Use this decision table to avoid the common failure mode: patching a report that should be re-authored.

| Condition | Recommended action | Why |
|---|---|---|
| Same primary question; new facets/dimensions | **Update** | Surgical additions are appropriate |
| Same primary question; new evidence contradicts a few claims | **Update (corrective)** | Small targeted fix; preserve rest |
| Primary question changed materially | **Fork or full re-scope** | Patch would cause semantic drift |
| Stance changes (factual → conclusions, or vice versa) | **Require explicit user decision** | This changes how findings are expressed |
| The report's scope expands significantly (many new P0 dimensions) | **Consider fork** | Minimizes confusing mixed intent/history |
| Report is very old AND core system changed | **Consider fork or full refresh** | Avoid piecemeal churn and hidden inconsistencies |

---

## Change classification (for update work)

Use this to decide what you can do by default vs what needs explicit user confirmation.

### A) Fidelity-preserving update changes (generally OK)

- Adding new evidence files for new facets/dimensions.
- Adding new report sections that map to the delta request.
- Editing existing sections **surgically** to reflect the best current understanding, when the edit:
  - stays within scope/stance, and
  - does not require broad restructuring.
- Editing existing evidence files **surgically** when doing so makes the proof surface clearer/less duplicated, and when the change is recorded in `meta/_changelog.md`.
- Deleting stale/deprecated evidence files when they are no longer relevant (record in `_changelog.md`).
- Updating citations, adding time-bounds ("as of version X / date Y").
- Fixing typos/formatting without meaning changes.
- Adding gaps/open questions for newly requested facets.

### B) Drift-risk changes (get explicit confirmation or present as options)

- Changing the report's stance (Conclusions vs Factual/Academic).
- Changing the primary question framing in the report header/summary.
- Rewriting the Executive Summary substantially (beyond minimal updates).
- Removing/downgrading prior sections (especially previously confirmed findings).
- Re-ordering rubric dimensions or major report structure (large reshuffles increase review risk).
- Large consolidations/rewrites of evidence files that change organization materially (audit trail risk).

### C) Substantive changes (only if the user explicitly asks/approves)

- Broadening the report's scope beyond the original rubric/non-goals.
- Turning a capability assessment into a comparative analysis (or similar type changes).
- Introducing new recommendations if the original stance was factual/academic.
- Replacing the report's organization pattern wholesale.

---

## Update workflow (procedural)

### Step 1: Identify the target report and inventory baseline artifacts

Find and read:
- `<reports-dir>/<report-name>/REPORT.md`
- `<reports-dir>/<report-name>/evidence/` files referenced by REPORT.md
- `<reports-dir>/<report-name>/meta/_changelog.md` (if it exists)
- any other coordination artifacts (if present)
- any existing `meta/runs/<run-id>/RUN.md` files (if present)

**Coordination artifact location:** `<reports-dir>/<report-name>/meta/` (e.g., `runs/<run-id>/RUN.md`)

If the report name/path is not provided, ask a targeted question:
- "Which report directory should I update (exact `<reports-dir>/<name>/`)?"

### Step 2: Capture a Baseline Snapshot (BEFORE)

This is the anti-drift anchor. Keep it compact.

```md
## Baseline Snapshot (Existing Report)

- Report: <reports-dir>/<report-name>/
- Frontmatter: createdAt: <date> | updatedAt: <date>
- Primary question / purpose:
- Reader cares most about: [2-4 priorities from rubric — guides what additional research is most valuable]
- Stance: Conclusions | Factual/Academic
- In-scope dimensions (from rubric):
- Explicit non-goals:
- Key findings (top 3–5):
```

If something is unclear, mark it as ambiguous (do not guess).

### Step 3: Delta scoping + mapping

Goal: determine **what is being added or corrected**, map it to the existing report structure, and decide (per item) whether to append or edit-in-place.

#### Optional (recommended): Start a run for this pass

If coordinating (subagents / multi-session / high-stakes), create:

* `<reports-dir>/<report-name>/meta/runs/<run-id>/RUN.md`

Populate it with:

* run intent
* delta rubric
* source anchors
* canonical sources + owners

#### When the user's intent is already explicit

If the user's request is already clear (e.g., "add dimensions X, Y, Z, go deep" or "correct the claim about SSO"), you may collapse the scoping artifacts:

- **Baseline snapshot** can be an in-chat block (not a separate file).
- **Delta rubric** can be a table in conversation (not a separate artifact).
- **Skip confirmation** if the user already approved the scope in their request.
- **Proceed directly** to targeted research (Step 5).

**What you still must do:** Evidence capture, surgical edits, drift check, update summary, and (recommended) `_changelog.md` entry.

**What stays required if you started a run:** ensure workers read `RUN.md`, and close the run at the end.

#### A) Clarify the update request (only when needed)

If the user's intent is already explicit, skip asking and instead *record the answers* in the Update Request Snapshot (Step 3C).

If clarification is needed, ask only the minimum targeted questions:

* "Is this update meant to be **additive**, **corrective**, or a **refresh**?"
* "Does this change the report's **primary question** or **stance**?"
* "Do you want the existing report updated on disk, or just the findings in-chat?"

#### B) Map request → report (include the update decision)

Create a concrete map from "what the user wants" to which parts of the report are affected, plus the planned update style.

```md
## Delta Map

| Requested item | Type (add/correct/refresh) | Existing coverage? | Planned REPORT.md action | Planned evidence action | Impacted section(s) | Notes / rationale |
|---|---|---|---|---|---|---|
| ... | ... | Covered / Partial / Not covered | Edit-in-place / Append new section | Edit-in-place / Append new file / Delete stale | ... | ... |
```

#### C) Capture as Update Request Snapshot

```md
## Update Request Snapshot

- Update type: Additive | Corrective | Refresh
- Requested changes: <bullets>
- Sections untouched: <list>
- Output: Update report on disk | Chat-only | Both
- Changelog: Create/append `meta/_changelog.md` (recommended)
- Run (if coordinating): `meta/runs/<run-id>/RUN.md` created? Yes/No
```

### Step 4: Produce a Delta Rubric (not a full rubric restart)

For updates, do not re-run the entire rubric unless required.

**Delta rubric format:** Typically an **in-chat block** (not a separate file):

```md
## Delta Rubric (Update Scope Only)

Baseline preserved from existing report. This update covers only:

| # | Dimension / facet | Change type (add/correct/refresh) | Depth | Priority |
|---|-------------------|-----------------------------------|-------|----------|
| 1 | ... | add | Moderate | P0 |
| 2 | ... | correct | Deep | P0 |
```

If the delta implies scope expansion beyond the original non-goals, present options (keep as-is vs expand). Update the "Research Rubric" section in REPORT.md to reflect the current full scope. Record the scope delta in `meta/_changelog.md`.

### Step 5: Research execution (focused on delta)

Reuse the same research rules as the main skill:

* Use source code as ground truth when available.
* Capture evidence with file:line or URL + access date.
* Label confidence (CONFIRMED/INFERRED/UNCERTAIN/NOT FOUND).
* Document negative searches for "NOT FOUND".

Choose mode:

* **Solo mode** if delta is small (≤2 dimensions).
* **Deep research mode** if delta is large or parallelism helps (load `references/subagent-orchestration.md`).

---

## Decision framework: Append vs edit-in-place (per item)

The goal is not to follow a rigid default. The goal is to produce:
- a **coherent current-state** REPORT.md
- a **clear proof surface** in evidence files
- a **clean audit trail** in `meta/_changelog.md` regardless of which approach you used

### 1) First classify the new information

For each delta item, decide what it is:
- **New facet/dimension** (net-new content)
- **Refinement** (adds precision/constraints/edge conditions to an existing claim)
- **Contradiction/correction** (prior claim is wrong or outdated)
- **Refresh** (time/version drift check; prior claim might now be stale)
- **Tentative/uncertain** (signal, rumor, partial evidence; not safe to overwrite a confident claim)

### 2) Then decide separately for REPORT.md and evidence files

#### REPORT.md decision prompts

Choose **Edit-in-place** when:
- there is an existing section where the reader expects this information, and
- you can make a **small local edit** that improves correctness/clarity, and
- leaving the old wording would mislead the reader.

Choose **Append a new section** when:
- it is a genuinely new dimension/facet not covered anywhere, or
- the report structure already has a "slot" for an additive section (e.g., a new dimension entry), and adding it will not duplicate/contradict existing content.

Guardrail (report coherence):
- Do not leave two competing statements without consolidating. If old and new are both relevant (e.g., version differences), rewrite into a **single consolidated presentation** (conditional/versioned), not "pass-based" duplication.

#### Evidence decision prompts

Choose **Edit evidence in place** when:
- the evidence file is meant to be the canonical proof surface for that dimension, and
- the update is **surgical** (replace weak evidence with stronger primary proof, fix incorrect citations, tighten a claim), and
- you can do it without rewriting the file's organization wholesale.

Choose **Append a new evidence file** when:
- the new information is tentative and you do not want to overwrite established proof,
- you need to preserve multiple time/version snapshots explicitly, or
- the existing evidence file would require heavy restructuring to incorporate the change cleanly.

Choose **Delete stale evidence** when:
- the evidence is no longer relevant (superseded, outdated, or incorrect), and
- keeping it would confuse future readers/agents about what is current, and
- you have recorded the deletion in `meta/_changelog.md`.

Apply the same care to evidence deletion as to any edit-in-place decision. If uncertain whether evidence is truly stale vs still partially relevant, prefer surgical edit (remove stale parts, keep valid parts) over wholesale deletion.

Naming guidance for appended evidence:
- New dimension: `evidence/<new-dimension>.md`
- Update to existing dimension: `evidence/<dimension>-update-YYYY-MM-DD.md`

### 3) Tie-breaker when uncertain

If an edit-in-place would require **broad rewrite** (risking semantic drift), prefer:
1. **Append a new evidence file** with the current-state proof, and
2. **Make a minimal REPORT.md edit** to link to the new evidence (so the report stays coherent), and
3. **Record the nuance** in `meta/_changelog.md` (e.g., "old evidence file X superseded by Y; keeping X for historical reference" or "deleted X as stale").

This keeps the report coherent without forcing an all-or-nothing rewrite.

### 4) Edit-in-place rules (when chosen)

Edits should be surgical and conservative:

1. **Don't overfit to new information.** If the evidence is not definitive, incorporate it as uncertainty (or keep it as appended evidence) rather than rewriting confident claims.
2. **Minimum viable changes.** Touch only what the delta map requires.
3. **No decorative markers** in REPORT.md like "(New!)" or "(Updated)."
4. **Avoid duplication without losing fidelity.** Consolidate where it reduces reader confusion, but do not "compress for its own sake."
5. **Respect scope boundaries.** Do not change sections/evidence the delta did not intend to touch.
6. **Record the change in `meta/_changelog.md`.** This is the audit trail for edit-in-place work.

---

## Hybrid update examples (illustrating hard edge cases)

### Example 1: Correction with version-conditional behavior

**Scenario:** User asks to correct the SSO claim — "SSO is now available as of v2.5."

**The hard part:** The original report said "SSO: NOT FOUND" for v2.4. Both statements are true for their versions.

**Solution (hybrid):**
- **REPORT.md:** Edit the SSO finding in place to present version-conditional behavior: "SSO is available in v2.5+; not available in v2.4 and earlier." This avoids two competing claims.
- **Evidence:** Append a new file `evidence/sso-update-2025-02-02.md` documenting the v2.5 release notes, because the original evidence file accurately reflects what was true for v2.4 (and might be useful if someone is still on v2.4).
- **Changelog:** Record both the report edit and the evidence append.

### Example 2: Stronger evidence replaces weak evidence

**Scenario:** Original evidence for "Performance" was based on a third-party benchmark blog post (T3 source). You now have first-party benchmark data from the official docs (T1 source).

**The hard part:** The conclusion is the same, but the proof quality is much better.

**Solution (hybrid):**
- **REPORT.md:** No change needed (conclusion unchanged).
- **Evidence:** Edit `evidence/performance.md` in place — replace the T3 citation with the T1 citation, update the snippet. This makes the proof surface cleaner without duplication.
- **Changelog:** Record the evidence edit: "Replaced T3 benchmark source with official T1 data; conclusion unchanged."

### Example 3: Partial staleness in evidence file

**Scenario:** `evidence/integration-patterns.md` has 5 findings. Findings 1-3 are still valid. Findings 4-5 are outdated (API changed in v3.0).

**The hard part:** Deleting the whole file loses valid content; keeping it as-is misleads readers.

**Solution (surgical edit):**
- **Evidence:** Edit `evidence/integration-patterns.md` in place — remove findings 4-5, add a note at the top: "Last verified: YYYY-MM-DD (v3.0). Findings 4-5 from original research removed as outdated."
- **REPORT.md:** If the report referenced findings 4-5, edit those sections to reflect current state.
- **Changelog:** Record what was removed and why.

---

## Step 6: Apply evidence strategy (based on the decision framework)

Default approach: implement the Delta Map decisions item-by-item.

- For appended evidence: create the new evidence file(s), link them from REPORT.md.
- For edit-in-place evidence: update citations/snippets/claims surgically, and record the file touch in `_changelog.md`.
- For deleted evidence: remove the file, update any REPORT.md links, and record in `_changelog.md`.

Avoid "half updates":
- If you update a claim in REPORT.md, ensure the evidence link supports it.
- If evidence changes materially, ensure REPORT.md reflects the best current understanding.

---

## Step 7: Surgical report edits (minimum viable changes)

Edit `REPORT.md` with these constraints:

* Preserve the report's stance unless explicitly changed.
* Only edit sections that the delta map identifies.
* Only update the Executive Summary if:
  * the primary answer changes materially, OR
  * a key caveat/trade-off changes materially.

When adding new sections:
* Prefer inserting adjacent to related existing dimensions.
* Ensure each new "Finding" links to new/updated evidence.

When correcting/refining:
* Prefer editing the existing claim in place so the report remains a coherent current-state snapshot.
* Avoid leaving duplicated competing claims. Consolidate into one presentation.

#### Frontmatter handling convention

All reports use YAML frontmatter. On every update pass, update the frontmatter fields as follows:

| Update type | Frontmatter changes |
|---|---|
| Additive (new dimensions) | Set `updatedAt` to today. Add new entries to `subjects` and/or `topics` if the delta introduces entities or topic areas not already listed. |
| Corrective (fix claims) | Set `updatedAt` to today. Update `description` only if the correction materially changes what the report covers. |
| Refresh (staleness check) | Set `updatedAt` to today. Optionally note version/release checked in the report body. |

Preserve `createdAt` — it is the report's original creation date and must not change.

**`subjects` and `topics` maintenance:**
- `subjects` = proper nouns (companies, technologies, frameworks). Add any new proper nouns introduced by the update. Remove subjects only if the report no longer covers them.
- `topics` = qualitative areas (<=3 words each). Add new topic areas if the delta introduces a genuinely new dimension. Avoid topic proliferation — prefer reusing existing topics when the new content fits.
- `description` = primary AI routing signal. If the update meaningfully expands what the report covers, update the description to reflect the current scope.

---

## Step 8: Drift + recency-bias check (required)

Before delivering, explicitly check:

* Did we accidentally broaden scope beyond the delta rubric?
* Did we accidentally introduce recommendations into a factual report?
* Did we rewrite unrelated sections?
* Are any "new" claims based on weaker evidence than the old ones?
* Are we over-weighting a single new source (especially if non-primary)?

If any answer is "yes," revert the unnecessary changes or mark the claim as UNCERTAIN and suggest what to verify next.

---

## Step 9: Deliver an Update Summary + update the changelog (recommended)

Always return an update summary in conversation, even if you also edited files.

Template:

```md
## Update Summary

### What changed (additive)
- ...

### What changed (corrective/refined)
- ...

### Evidence actions (by decision)
- Appended evidence: <files> — what they substantiate
- Edited-in-place evidence: <files> — what changed
- Deleted evidence (stale): <files> — why

### Report edits (surgical)
- REPORT.md — sections touched: ...

### Open questions / gaps
- ...

### Drift check
- Baseline preserved? Yes/No (explain any intentional scope/stance change)

### Changelog
- `meta/_changelog.md` updated? Yes/No
```

After producing the update summary, append an entry to `meta/_changelog.md` (if file updates were applied). Keep it short and scoped to the delta.

---

## Decision brief template (when drift-risk choices appear)

**When to use:** Use the full template below for high-impact drift-risk choices (stance changes, scope expansion, removing prior findings, large restructures). For minor drift-risk questions (e.g., "should I reorder these two sections?"), a single sentence asking the user suffices.

### Decision: <short title>

**Why this matters**

* Behavioral impact:
* Drift risk / compatibility risk:
* Stance/scope implications:

**Baseline evidence of intent**

* From existing report: <what it implies>

**Options**

1. **Keep as-is**

   * Pros:
   * Cons:
   * Drift risk:

2. **Apply change**

   * What changes:
   * Pros:
   * Cons:
   * Drift risk:

**Recommendation + confidence**

* Recommended option:
* Confidence: High/Medium/Low
* What would increase confidence:

**Question for the user**

* Choose Option 1 or 2

---

## Common anti-patterns in report updates

* **Restarting full scoping** for a small delta (wastes time and encourages scope creep).
* **Recency overfitting:** rewriting conclusions or tone just because something is "new."
* **Silent stance drift:** adding recommendations to a factual report.
* **Executive Summary churn:** rewriting it even when the primary answer didn't change.
* **Evidence dilution:** adding "facts" without primary-source proof or clear confidence labels.
* **Unbounded updates:** trying to "improve the whole report" instead of addressing the delta map.
* **Pass-based report structures:** forcing readers to infer "which is current" by leaving competing claims in place.
