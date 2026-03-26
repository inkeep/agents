Use when: "Update" or "refactor" requests for existing skills; preserving author intent during changes
Priority: P0
Impact: Intent drift; accidental semantic changes; broken skill behavior

---

# Updating Existing Skills Without Semantic Drift

This playbook is for **updating/refactoring** an existing skill while preserving the skill author's original intent, nuance, and safety posture.

Update = improve **clarity, structure, redundancy, maintainability, and alignment with skill best practices**
without changing the skill's "meaning" unless the author explicitly requests it or consents.

---

## Core invariant: preserve author intent (high fidelity)

When updating, treat the existing skill as the **source of truth**.

### Default posture (non-negotiable)
- Preserve the original skill's **intent**, **scope**, and **non-goals**.
- Preserve the original skill's **routing posture** (what it triggers on) unless the author explicitly agrees to expand/contract triggers.
- Preserve the original skill's **behavioral constraints** (e.g., what is MUST vs SHOULD).
- Preserve user-facing "API surface":
  - skill `name`
  - `$ARGUMENTS` semantics (if used)
  - whether it's user-invocable / model-invocable
  - tool restrictions (`allowed-tools`)
  - execution mode (`context: fork`, `agent:`)
- Keep the resulting skill **standalone**:
  - do not embed update commentary inside SKILL.md
  - explain changes outside the skill (e.g., in an update report)
- Avoid "oversampling":
  - Do **not** add extra content, extra rules, extra rationale, or extra edge-case coverage that is *not already implied by the author's intent*.
  - Do **not** normalize tone into your personal style if tone affects how the skill behaves.

### When substantive change is allowed
Only when working **with the skill author** (often the user) who:
- explicitly asks for a change in substance, or
- consents to a proposed change after reviewing options.

If author intent is unclear, do **not guess**. Use targeted questions and present plausible interpretations.

---

## Change classification (determines framing and attention level)

Classify each proposed change before implementing.

### A) Fidelity-preserving changes (low-risk; group concisely in update plan)
These should not change meaning—only readability and maintainability.

Examples:
- Reformatting (headings, lists, checklists) without changing requirements.
- Reducing redundancy and merging duplicated text.
- Reordering sections to improve scanability (keeping the same requirements).
- Splitting large content into `references/` or `rules/` while keeping SKILL.md as navigation/workflow.
- Adding a table of contents to long reference files.
- Tightening language where intent is already clear (e.g., remove filler words).
- Making implicit structure explicit (e.g., adding "Workflow" headings around already-existing steps).
- Converting long prose requirements into bullet points without changing scope.

### B) Drift-risk changes (require explicit author confirmation OR implement only as "suggested")
These might *appear* structural but can change behavior, routing, or interpretation.

Examples:
- Expanding or narrowing `description` triggers (changes when it auto-loads).
- Changing MUST/SHOULD wording, severity levels, or priority order.
- Adding new examples that introduce new norms not present in the original.
- Adding new validation requirements ("always run X") that weren't already implied.
- Changing tool access (`allowed-tools`) or invocation controls (`disable-model-invocation`, `user-invocable`).
- Changing `context: fork` behavior or `agent:` selection.
- Renaming skill `name` or directory (breaks workflows and references).

### C) Substantive changes (only implement when explicitly requested/approved)
These change what the skill *means* or what it *optimizes for*.

Examples:
- Adding new rules, new scope, new responsibilities, new domains.
- Changing the recommended strategy or default workflow.
- Introducing new scripts that materially change behavior or side effects.
- Changing safety posture (e.g., making risky workflows model-invokable).

---

## Decision Support Protocol (progressive depth; only when needed)

When you need input/consent from the skill author (typically for **B/C changes** or unresolved ambiguities), switch into a "decision support" posture:

- Explain **why** the decision matters (behavioral consequence, drift risk, safety/tooling implications).
- Present **options** (including "keep as-is"), with pros/cons and fidelity impact.
- Suggest **what additional context** would materially improve the choice (if applicable).
- Ask a **targeted question** that makes it easy to choose.

When asking for a decision, make selection easy:
- Label options **Option 1 / Option 2 / Option 3 / …**
- Keep each option's consequence concrete and short.
- At the end of your output, include a **Quick Reference** section that recaps all pending decisions in a scannable format. This lets the author respond quickly without re-reading the full analysis.

Example format:
```
## Quick Reference

**Decision 1: <short title>**
- Option 1: Keep as-is
- Option 2: <change> — <one-line consequence>
- Option 3: <change> — <one-line consequence>
- Recommendation: Option 2

**Decision 2: <short title>**
- Option 1: ...
- Recommendation: Option 1
```

### Depth ladder (choose the lightest level that fits)

Use the smallest adequate level; do not over-explain by default.

**Level 0 — No additional questions needed**
- The update is purely "A class" (clarity/structure) and there is no ambiguity.
- Include these changes in the update plan without flagging for special attention. The standard confirmation gate (Step 6) still applies.

**Level 1 — Targeted question (brief)**
Use when:
- There's a single clear likely intent, and
- The consequence is low/medium, and
- You mainly need confirmation.

Do:
- Ask 1–2 questions, briefly explain why it matters.

**Level 2 — Decision brief (options + tradeoffs)**
Use when:
- Multiple plausible interpretations exist, OR
- The change affects routing, strictness, or output contract, OR
- There's non-trivial drift risk.

Do:
- Provide 2–4 options with consequences and drift risk.

**Level 3 — Decision brief + suggested research/context gathering**
Use when:
- High-stakes domain (security, prod deploy, destructive ops), OR
- Significant semantic change is under consideration, OR
- Author intent is unclear and consequences are large, OR
- The author expresses uncertainty / asks for recommendation confidence.

Do:
- Include "What else we could check" (only high-signal checks).
- Make clear what would change your recommendation.

### What counts as "relevant enough" to justify Level 2–3

Escalate depth when any of these are true:
- The decision changes **when** the skill triggers (frontmatter `description`, invocation controls).
- The decision changes **what's required** (MUST/SHOULD, severity, validation steps).
- The decision changes **power/safety** (allowed-tools, side effects posture, fork execution).
- The decision introduces **new content** not clearly implied by the original.
- The decision is **hard to reverse** or would cause compatibility breaks (renames, argument semantics).
- The existing skill text is **ambiguous** and multiple interpretations are defensible.

### Default recommendation bias (when in doubt)

- Prefer **status quo** when intent is unclear.
- Prefer **reversible** changes.
- Prefer **smaller diffs** that reduce review risk.
- Prefer **suggesting** B/C changes rather than applying them without consent.

---

## Update workflow (procedural)

### Step 0: Full context loading (mandatory before every update round)

**Both skills must be fully loaded before proceeding. Re-read all files fresh — even if previously read earlier in this conversation or in a prior round of changes.**

This step must be repeated at the start of each update round (i.e., each time you begin a new set of changes to a skill). Context compression, partial recall, and stale mental models are the primary causes of drift during updates. A fresh read takes minutes; fixing drift takes longer.

**Load the `write-skill` skill in full:**
1. Read `SKILL.md` completely
2. Read **every file** in the `write-skill/` folder:
   - all `references/*.md` files — in particular, `content-patterns.md` and `structure-patterns.md` contain quality standards you must apply when evaluating and drafting changes
   - all `templates/*.md` files
   - all `scripts/*` files
3. Do not proceed until all files have been read

**Load the target skill in full:**
1. List all files in the target skill folder (use `Glob` or `ls`)
2. Read **every file** in the folder:
   - `SKILL.md`
   - all `references/*.md` files (if present)
   - all `templates/*.md` files (if present)
   - all `scripts/*` files (if present)
   - all `rules/*.md` files (if present)
   - any other supporting files
3. Do not proceed until all files have been read

**Why this matters:**
- Skills often have constraints, nuances, and patterns distributed across multiple files
- The `write-skill` skill contains critical guidance for how to update skills correctly
- Partial reads cause agents to miss important context, leading to:
  - Accidental semantic drift
  - Broken references between files
  - Duplicated or contradictory content
  - Lost constraints or safety posture

**Verification checkpoint:**
Before moving to Step 1, confirm:
- [ ] I have read every file in `write-skill/` (SKILL.md + all references/ + all templates/ + all scripts/) **in this round** — not relying on prior reads
- [ ] I have read every file in the target skill folder **in this round**
- [ ] I can summarize the target skill's purpose, constraints, and structure without re-reading

---

### Step 1: Inventory the current skill (do not edit yet)
Read:
- `SKILL.md` (frontmatter + body)
- all supporting files referenced by `SKILL.md`
- any scripts that are executed by the skill

Create a quick inventory:
- What files exist?
- What files are referenced by SKILL.md?
- Does it use `$ARGUMENTS`?
- Any `allowed-tools`, `disable-model-invocation`, `user-invocable`, `context: fork`, `agent`, `model`, or `hooks`?

If you receive large "artifact dumps" (notes, logs, transcripts), treat them as evidence:
- extract what supports the intent snapshot
- ignore irrelevant details unless instructed otherwise

### Step 2: Capture an "Intent Snapshot" (before changes)
Write a compact snapshot that will be used to prevent drift:

**Intent Snapshot (BEFORE)**
- Purpose (1–2 sentences):
- In-scope tasks:
- Out-of-scope / non-goals:
- Top priorities / invariants (3–7 bullets):
- User framing / key terms (optional but valuable):
- Safety posture:
  - invocation expectations (who/when)
  - tool restrictions
  - side-effects policy
- Tone/voice constraints (if relevant to behavior):
- Output consumers (who reads/uses it) + assumptions (if relevant):
- Expected output contract (if present):

If any of these are unclear, flag them as ambiguities (don't fill them in).

### Step 3: Identify update opportunities (no new content)
Find:
- redundancy
- unclear structure
- missing navigation to supporting files
- inconsistent terminology
- ambiguous instructions
- logical contradictions
- overloaded SKILL.md (too long, too much reference material in the body)

**Important:** If you find "missing edge cases," treat them as:
- a question to the author, or
- a suggested future enhancement (not implemented),
unless the existing skill clearly implies them.

### Step 4: Ambiguity/contradiction analysis (targeted, justified)
For each ambiguity/contradiction/edge case, write:

- **Snippet** (short quote or description):
- **Why it's ambiguous / contradictory** (be explicit)
- **Plausible interpretations** (2–3 options)
- **Behavioral consequence** of each interpretation
- **Targeted question** to resolve it
- **Your recommendation** (optional, clearly labeled)

Do not rewrite ambiguous content into a "best guess" without author consent.

When you need author input to resolve an ambiguity, use the **Decision Support Protocol** above.
- Use Level 1 for small clarifications.
- Use Level 2–3 when the ambiguity materially affects routing, required behavior, safety posture, or semantics.

### Step 5: Draft an Update Plan (with classifications)
Propose changes before applying them.

Use this table. For B/C changes, fill the "Consequences / drift risk" column by answering the three questions in the header:

| Proposed change | Classification (A/B/C) | Why (benefit) | Consequences / drift risk (1. What else does this touch? 2. How else could this be read? 3. What breaks if this goes wrong?) | Requires author decision? |
|---|---|---|---|---|

**Guidance for consequence analysis:**
- **What else does this touch?** — Does it interact with frontmatter routing, workflow ordering, terminology used elsewhere, or overall coherence?
- **How else could this be read?** — Would a different agent interpret this the same way? What assumptions are embedded?
- **What breaks if this goes wrong?** — What's the symptom? How hard to detect? Reversible?

Don't write "low risk" or "no issues" — explain specifically *why* (e.g., "isolated change to one example; no other sections reference this pattern").

Rules:
- Classify every change as A, B, or C.
- All changes — including A — are presented to the user for confirmation in Step 6 before any files are modified.
- B/C changes should be flagged with specific attention in the plan (consequences, drift risk, alternatives).

### Step 6: Confirm the update plan with the user

**Do not modify any files until the user confirms the plan.**

Present the update plan to the user. The presentation must include:

1. **Restatement of intent:** Briefly restate what you understood the user's request to be (in your own words, not just echoed back). This lets the user catch misunderstandings early.

2. **The update plan:** Present the change table from Step 5. B/C changes should have their consequences and alternatives clearly visible. A-class changes can be grouped concisely (one-liner each is sufficient).

3. **Clarifying questions (only when genuinely needed):** If you detected ambiguity in the user's intent, tough calls on how to address a change, or multiple defensible interpretations — surface these as numbered questions. Use the **Decision Support Protocol** (Level 1/2/3 as appropriate) for B/C items that need specific decisions. If there are no genuine open questions, do not manufacture them.

4. **Request for confirmation:** If you are highly confident in all changes and the user's intent is clear, simply ask: "Let me know if you'd like me to go ahead and apply these changes." If there are open questions, ask them and wait for answers before proceeding.

**This is a convergence loop, not a one-shot gate.** When the user responds with new information, answers questions, or adjusts priorities — and that response meaningfully changes the plan:

- **Narrow impact:** Re-confirm at minimum the parts of the plan affected by the new context. Briefly restate what changed and why, then ask for confirmation on the adjusted portion.
- **Broad impact:** If the new information affects multiple changes or shifts the overall approach, restate the entire adjusted plan. This is clearer than a patchwork of incremental corrections.
- **New ambiguity:** If the user's response raises new questions or reveals new tough calls, ask them before proceeding. Do not assume.

Continue this loop until there is clear mutual alignment on both intent and specific changes. Only proceed to Step 7 when you are confident you and the user are on the same page — not just that the user said "yes," but that the "yes" was informed by a plan that accurately reflects their current intent.

**Calibration guidance:**
- Do not over-formalize routine updates. If the plan is small and straightforward, a concise summary + confirmation request is fine.
- Do not force the user to review every A-class change individually — group them unless one raises a genuine question.
- Always preserve a "keep as-is" option for any B/C item.
- If the user is not available, do not apply any changes. List the full plan as "pending author confirmation."

### Step 7: Apply the approved changes
Implementation guidelines:
- Keep SKILL.md lean; move deep material to supporting files (references/rules) and link them clearly.
- Avoid deep reference chains (SKILL.md should be the navigation hub).
- Preserve skill "API surface" (name, invocation, argument semantics) unless approved.
- Prefer small diffs that reduce noise (avoid reflowing everything unless necessary).

### Step 8: Drift check + Coherence check (after changes)

**Part 1: Drift check**

Write:

**Intent Snapshot (AFTER)** — same fields as before.

Then compare:
- If any item differs materially, flag it as **potential drift** and explain why.

**Part 2: Coherence check**

Scan the final state of all files that were modified or could be affected by the changes. Verify:

1. **No contradictions:** No two sections of the skill (across all files) make claims that conflict with each other. Pay special attention to:
   - Workflow steps vs. anti-patterns (do the anti-patterns align with what the workflow requires?)
   - Different references that cover related topics (do they agree?)
   - Guidance that was added in multiple places (does it say the same thing everywhere?)

2. **No hollow duplication:** No two sections say the same thing in different words without adding real semantic value. This includes:
   - Anti-patterns that merely restate a workflow rule in negative form without adding a concrete failure mode, example, or nuance not already present
   - "Summary" or "recap" content that duplicates the workflow
   - The same guidance repeated across SKILL.md and a reference file without clear reason (e.g., one is a navigation pointer and the other is the full detail — that's fine; two full explanations is not)

If either check fails, fix the issue before delivering. If the fix requires changes beyond what the user approved, flag it and get confirmation.

### Step 9: Verify structure (if changed)
If you changed structure (split into references), ensure:
- SKILL.md still tells the agent *when to read* each reference.
- Links resolve and are discoverable.

If existing tests or an evals framework exist for this skill, suggest running them to verify behavior is preserved.

### Step 10: Deliver an Update Report
Return:

## Update Report
### Intent Snapshot (BEFORE)
...

### Changes applied
- bullet list (grouped by A/B/C classification)

### Open items (if any B/C changes were deferred or modified during confirmation)
- bullet list with rationale + what was decided

### Ambiguities / contradictions / edge cases
- table or bullets using the format above

### Drift check
- "No drift detected" OR a short list of potential drift points

### Tests (only if applicable)
- If existing tests/evals exist, note which to run

---

## Decision Brief Template (copy/paste)

### Decision: <short title>

**Why this matters**
- <behavioral impact>
- <drift risk / compatibility risk>
- <safety/tooling implications (if any)>

**What the current skill suggests (evidence of intent)**
- <quote or paraphrase from the existing skill>
- <what this implies about author intent>

**Options**
1) **Option 1: Keep as-is (no change)**
   - Fidelity to intent: <High/Medium/Low>
   - Pros:
   - Cons:
   - Drift risk: <Low/Med/High>

2) **Option 2: <option>**
   - What changes (exactly):
   - Fidelity to intent:
   - Pros:
   - Cons:
   - Drift risk:
   - Token/maintenance impact (if relevant):
   - Who this helps / hurts (if relevant):

3) **Option 3: <option>**
   - ...

**Suggested additional context to gather (only if it could change the decision)**
- <check usage frequency: grep for skill name / slash usage / references>
- <ask the author for 1–2 example prompts and expected outputs>
- <review deployment environment constraints (tool availability/permissions)>
- <inspect supporting files for implicit contracts (output formats, required steps)>

**My recommendation (clearly labeled; explain confidence)**
- Recommended option:
- Confidence: <High/Medium/Low>
- What would increase confidence:
- What would change my mind:

**Question for the author**
- Choose: Option 1 / 2 / 3
- If you choose Option 2/3, confirm these specifics: <bullets>

---

## Common anti-patterns when updating

- **Oversampling**: adding new rules, new rationale, new edge cases "because it seems good."
- **Tone normalization**: rewriting into your style in a way that changes directness/safety.
- **Silent routing changes**: expanding `description` so the skill triggers in new contexts without consent.
- **Breaking the public surface**: renaming `name`, removing `$ARGUMENTS`, changing invocation controls.
- **Diff noise**: massive reflow that makes review hard and increases risk of accidental semantic changes.
- **Over-correcting to the latest feedback**: adding the same new guidance in too many places.
- **Adding "Quick Start" / "TL;DR" / "Recap" sections**: these duplicate the workflow and waste context tokens. If the skill feels too long for repeat use, shorten the workflow—don't add a summary of it.
- **Skipping consequence analysis**: making changes without considering how they interact with other parts of the skill, how they might be interpreted differently, or what failure modes they introduce. Writing "low risk" without explaining why is a red flag.
- **Skipping fresh reads**: relying on earlier reads of `write-skill/` or target skill files instead of re-reading at the start of each update round. Context compression and partial recall cause drift that's hard to detect after the fact.
- **Introducing duplication or contradiction in the final artifact**: adding new content (including anti-patterns) that restates what's already said elsewhere without adding genuine substance — a new failure mode, a concrete example, or nuance not already present. The coherence check (Step 8) catches this, but prevention is better.
- **Editing files before user confirmation**: applying changes — even A-class changes — before presenting the plan and getting explicit user approval. The confirmation gate (Step 6) exists to catch misunderstandings early, when they're cheap to fix.

When in doubt, prefer:
- smaller, reversible changes
- explicit author questions
- "suggested changes" rather than unilaterally applying B/C changes
