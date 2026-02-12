Use when: "Update" or "refactor" requests for existing agents; preserving author intent during changes
Priority: P0
Impact: Intent drift; broken routing; capability creep; downstream orchestrator failures

---

# Updating Existing Agents Without Drift

This playbook is for **updating/refactoring** an existing agent while preserving the agent author's original intent, routing behavior, capability surface, and output contracts.

Update = improve **clarity, structure, routing precision, and alignment with agent design best practices** without changing the agent's "meaning" unless the author explicitly requests it or consents.

---

## Core invariant: preserve author intent (high fidelity)

When updating, treat the existing agent as the **source of truth**.

### Default posture (non-negotiable)

- Preserve the original agent's **purpose**, **scope**, and **non-goals**.
- Preserve the original agent's **routing posture**: what triggers delegation (description + `<example>` blocks).
- Preserve the original agent's **behavioral calibration**: personality, strictness, escalation thresholds.
- Preserve the original agent's **capability surface**: tools, permissions, model choice.
- Preserve the original agent's **output contract**: return packet format, severity levels, evidence expectations.
- Preserve user-facing "API surface":
  - agent `name`
  - whether it's a subagent vs workflow orchestrator
  - `tools` / `disallowedTools`
  - `permissionMode`
  - `skills` preloaded
  - output contract schema (especially if an orchestrator depends on it)
- Keep the resulting agent **standalone**:
  - do not embed update commentary inside the agent file
  - explain changes outside the agent (e.g., in an update report)
- Avoid "oversampling":
  - Do **not** add extra content, extra rules, extra failure modes, or extra edge-case coverage that is *not already implied by the author's intent*.
  - Do **not** normalize tone into your personal style if tone affects behavioral calibration (e.g., reviewer strictness).

### When substantive change is allowed

Only when working **with the agent author** (often the user) who:
- explicitly asks for a change in substance, or
- consents to a proposed change after reviewing options.

If author intent is unclear, do **not guess**. Use targeted questions and present plausible interpretations.

---

## Change classification (use this to decide what you can do "by default")

Classify each proposed change before implementing.

### A) Fidelity-preserving changes (generally OK to implement)

These should not change meaning, routing, or capability—only readability and maintainability.

Examples:
- Reformatting (headings, lists, checklists) without changing requirements.
- Reducing redundancy and merging duplicated text.
- Reordering sections to improve scanability (keeping the same requirements).
- Splitting large content into `references/` while keeping the agent file as navigation/workflow.
- Tightening language where intent is already clear (e.g., remove filler words).
- Making implicit structure explicit (e.g., adding "Workflow" headings around already-existing steps).
- Converting long prose requirements into bullet points without changing scope.
- Fixing typos, grammar, or formatting inconsistencies.

### B) Routing/calibration drift risk (require explicit author confirmation)

These might *appear* structural but can change when the agent fires or how it judges.

Examples:
- Expanding or narrowing `description` triggers (changes when delegation happens).
- Adding, removing, or modifying `<example>` blocks (changes routing precision).
- Changing MUST/SHOULD wording, severity levels, or priority order.
- Adding new examples that introduce new norms not present in the original.
- Adding new validation requirements ("always run X") that weren't already implied.
- Modifying personality statements or "Role & mission" framing.
- Adding or removing failure modes from the prompt.
- Changing escalation thresholds (when to ask vs proceed).

### C) Capability/contract changes (only implement when explicitly approved)

These change what the agent *can do* or what it *returns*.

Examples:
- Adding or removing `tools` / `disallowedTools`.
- Changing `permissionMode` (default, acceptEdits, bypassPermissions, etc.).
- Changing `model` selection.
- Adding or removing `skills` from preload.
- Modifying output contract schema (headings, severity levels, evidence format).
- Adding new workflow phases (for orchestrators).
- Adding or removing subagent dispatch targets (for orchestrators).

### D) Downstream-breaking changes (require impact analysis + approval)

These can break orchestrators or consumers that depend on this agent.

Examples:
- Renaming agent `name` (breaks Task tool references, orchestrator dispatch tables).
- Changing return packet format when an orchestrator aggregates this agent's output.
- Changing the dedup key or severity levels when an orchestrator sorts/filters findings.
- Removing required sections from output contract.
- Changing from subagent to orchestrator pattern (or vice versa).

**Before implementing D changes:**
1. Identify who spawns this agent (check orchestrator dispatch tables, Task tool usages).
2. Check if the output contract is referenced elsewhere.
3. Assess blast radius: how many things break?
4. Present impact analysis to the author.

---

## Decision Support Protocol (progressive depth; only when needed)

When you need input/consent from the agent author (typically for **B/C/D changes** or unresolved ambiguities), switch into a "decision support" posture:

- Explain **why** the decision matters (routing consequence, capability impact, downstream breakage).
- Present **options** (including "keep as-is"), with pros/cons and drift risk.
- Suggest **what additional context** would materially improve the choice (if applicable).
- Ask a **targeted question** that makes it easy to choose.

When asking for a decision, make selection easy:
- Label options **Option 1 / Option 2 / Option 3 / …**
- Keep each option's consequence concrete and short.
- At the end of your output, include a **Quick Reference** section that recaps all pending decisions in a scannable format.

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

**Level 0 — No question needed**
- The update is purely "A class" (clarity/structure) and there is no ambiguity.
- Proceed without asking.

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
- The change affects routing, calibration, or output contract, OR
- There's non-trivial drift risk.

Do:
- Provide 2–4 options with consequences and drift risk.

**Level 3 — Decision brief + impact analysis**
Use when:
- High-stakes change (capability, permissions, output contract), OR
- Downstream consumers exist (orchestrators that spawn this agent), OR
- Author intent is unclear and consequences are significant, OR
- The author expresses uncertainty / asks for recommendation confidence.

Do:
- Include downstream impact analysis (who uses this? what breaks?).
- Include "What else we could check" (only high-signal checks).
- Make clear what would change your recommendation.

### What counts as "relevant enough" to justify Level 2–3

Escalate depth when any of these are true:
- The decision changes **when** the agent triggers (description, `<example>` blocks).
- The decision changes **how** the agent judges (personality, strictness, failure modes).
- The decision changes **what the agent can do** (tools, permissions, model).
- The decision changes **what the agent returns** (output contract schema).
- The decision affects **downstream consumers** (orchestrators, aggregation).
- The decision is **hard to reverse** or would cause compatibility breaks (renames, output format changes).
- The existing agent text is **ambiguous** and multiple interpretations are defensible.

### Default recommendation bias (when in doubt)

- Prefer **status quo** when intent is unclear.
- Prefer **reversible** changes.
- Prefer **smaller diffs** that reduce review risk.
- Prefer **suggesting** B/C/D changes rather than applying them without consent.

---

## Update workflow (procedural)

### Step 0: Full context loading (mandatory before any other work)

**Both skills must be fully loaded before proceeding.**

This step is foundational. An agent updating another agent must have both the `write-agent` skill and the target agent completely "loaded" into context. Partial reads lead to drift, missed constraints, and broken updates.

**Load the `write-agent` skill in full:**
1. Read `SKILL.md` completely
2. Read **every file** in the `write-agent/` folder:
   - all `references/*.md` files
   - all `templates/*.md` files
   - all `scripts/*` files
3. Do not proceed until all files have been read

**Load the target agent in full:**
1. Read the agent file completely (frontmatter + body)
2. If the agent references supporting files (e.g., `references/`, companion skills), read those too
3. Do not proceed until all relevant files have been read

**If this agent is spawned by an orchestrator:**
1. Identify the orchestrator(s) that dispatch to this agent
2. Read the orchestrator's dispatch rules and aggregation logic
3. Note any output contract dependencies

**Why this matters:**
- Agents have constraints, calibration, and contracts distributed across the prompt
- The `write-agent` skill contains critical guidance for how to design agents correctly
- Partial reads cause:
  - Accidental routing drift (`<example>` blocks modified without understanding their function)
  - Broken output contracts (format changed when orchestrator expects specific schema)
  - Capability creep (tools added without understanding permission posture)
  - Lost calibration (personality/strictness normalized during reformatting)

**Verification checkpoint:**
Before moving to Step 1, confirm:
- [ ] I have read every file in `write-agent/` (SKILL.md + all references/ + all templates/ + all scripts/)
- [ ] I have read the target agent file completely
- [ ] I have identified any orchestrators that spawn this agent (if applicable)
- [ ] I can summarize the agent's purpose, routing posture, capability surface, and output contract without re-reading

---

### Step 1: Inventory the current agent (do not edit yet)

Read:
- Agent file (frontmatter + body)
- Any supporting files referenced by the agent
- Any orchestrators that spawn this agent (if known)

Create a quick inventory:

**Frontmatter inventory:**
- `name`:
- `description` (first 50 chars):
- Number of `<example>` blocks:
- Near-miss/exclusion example present? (yes/no):
- `tools` / `disallowedTools`:
- `permissionMode`:
- `model`:
- `skills`:
- `hooks`:

**Body inventory:**
- Sections present (e.g., Role & mission, Scope, Workflow, Output contract):
- Failure modes addressed:
- Escalation rules present? (yes/no):
- Output contract specificity (vague / moderate / strict):

**Dependency inventory:**
- Spawned by orchestrator? (which?):
- Output used by? (aggregation, display, downstream action):

If you receive large "artifact dumps" (notes, logs, transcripts), treat them as evidence:
- extract what supports the intent snapshot
- ignore irrelevant details unless instructed otherwise

---

### Step 2: Capture an "Intent Snapshot" (before changes)

Write a compact snapshot that will be used to prevent drift:

**Intent Snapshot (BEFORE)**

- **Purpose** (1–2 sentences):
- **Pattern**: Subagent | Workflow orchestrator
- **In-scope tasks**:
- **Out-of-scope / non-goals**:

- **Routing posture**:
  - Description triggers (key phrases/conditions):
  - `<example>` coverage (count, near-miss included?):
  - Delegation frequency expectation (aggressive / moderate / conservative):

- **Behavioral calibration**:
  - Personality / tone:
  - Strictness level (lenient / moderate / strict):
  - Escalation thresholds (when to ask vs proceed):

- **Capability surface**:
  - Tools allowed:
  - Tools disallowed:
  - Permission mode:
  - Model:
  - Skills preloaded:

- **Output contract**:
  - Return packet structure:
  - Severity levels (if any):
  - Evidence expectations:
  - Verbosity bounds:

- **Orchestrator dependencies** (if any):
  - Spawned by:
  - Output aggregated by:
  - Contract assumptions:

- **Failure modes explicitly addressed**:

If any of these are unclear, flag them as ambiguities (don't fill them in with guesses).

---

### Step 3: Identify update opportunities (no new content)

Find:
- redundancy
- unclear structure
- inconsistent terminology
- ambiguous instructions (could be read two ways)
- missing navigation to supporting files
- `<example>` blocks that don't teach routing clearly
- output contract too vague to validate against
- escalation rules missing or unclear

**Important:** If you find "missing edge cases" or "should add this failure mode," treat them as:
- a question to the author, or
- a suggested future enhancement (not implemented),
unless the existing agent clearly implies them.

---

### Step 4: Routing analysis (agent-specific)

For agents, routing is a first-class concern. Analyze:

**Description triggers:**
- Are the trigger conditions concrete? (file types, task verbs, domain nouns)
- Are exclusions explicit? ("Avoid using when...")
- Is scope too broad (over-triggers) or too narrow (never triggers)?

**`<example>` block analysis:**
- How many examples? (2–4 is recommended)
- Does each have `<commentary>` explaining *why*?
- Is there at least one near-miss/exclusion example?
- Do examples cover the main trigger scenarios?

**Routing-specific update opportunities:**
- Examples without commentary
- Missing near-miss example
- Description that's too vague ("use for code tasks") or too specific ("use only for .tsx files in src/components")
- Mismatch between description and example coverage

Flag routing changes as **B class** (require author confirmation).

---

### Step 5: Ambiguity/contradiction analysis (targeted, justified)

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
- Use Level 2–3 when the ambiguity materially affects routing, calibration, capability, or output contract.

---

### Step 6: Draft an Update Plan (with classifications)

Propose changes before applying them.

Use this table. For B/C/D changes, fill the "Consequences / drift risk" column completely:

| Proposed change | Classification (A/B/C/D) | Why (benefit) | Consequences / drift risk | Requires author decision? |
|---|---|---|---|---|

**Guidance for consequence analysis:**

For each B/C/D change, answer:
1. **What else does this touch?** — Does it interact with routing, output contract, orchestrator expectations, or terminology used elsewhere?
2. **How else could this be read?** — Would a different agent interpret this the same way? What assumptions are embedded?
3. **What breaks if this goes wrong?** — What's the symptom? How hard to detect? Reversible?

Don't write "low risk" or "no issues" — explain specifically *why* (e.g., "isolated change to one example commentary; no other sections reference this pattern; does not change when delegation triggers").

**Rules:**
- Implement **A** changes by default.
- For **B**, **C**, and **D**, ask the author (or leave as "suggested, not applied").

---

### Step 7: Get explicit consent for B/C/D changes

For **B/C/D** items, do not implement changes until the author chooses.

When requesting a decision:
- Use the **Decision Support Protocol** (Level 1/2/3 as appropriate).
- Provide a **Decision Brief** when the decision is non-trivial.
- Include downstream impact analysis for D changes.

Goal:
- Make the decision easy, informed, and high-fidelity to the author's intent.
- Avoid "pressuring" the author into changes; clearly preserve a "keep as-is" option.

If the author is *not* available:
- do **A** changes only
- list **B/C/D** as "recommended changes requiring author confirmation"

---

### Step 8: Apply the update (A changes only unless approved)

Implementation guidelines:

- Keep the agent file lean; move deep material to `references/` and link clearly.
- Preserve agent "API surface" (name, routing, capability, output contract) unless approved.
- Prefer small diffs that reduce noise (avoid reflowing everything unless necessary).
- Do not add "Quick Start" or "TL;DR" sections — if the prompt feels too long, shorten it.

**Routing preservation check (before finalizing):**
- [ ] `description` trigger language unchanged (or change was approved)
- [ ] `<example>` blocks unchanged (or changes were approved)
- [ ] Near-miss/exclusion example still present (if it was before)

**Capability preservation check (before finalizing):**
- [ ] `tools` / `disallowedTools` unchanged (or change was approved)
- [ ] `permissionMode` unchanged (or change was approved)
- [ ] `model` unchanged (or change was approved)

**Output contract preservation check (before finalizing):**
- [ ] Return packet structure unchanged (or change was approved)
- [ ] Severity levels unchanged (or change was approved)
- [ ] Evidence format unchanged (or change was approved)

---

### Step 9: Drift check (after changes)

Write:

**Intent Snapshot (AFTER)** — same fields as before.

Then compare:
- If any item differs materially, flag it as **potential drift** and explain why.

**Drift detection checklist:**
- [ ] Purpose unchanged?
- [ ] Routing posture unchanged? (description, examples, delegation frequency)
- [ ] Behavioral calibration unchanged? (personality, strictness, escalation)
- [ ] Capability surface unchanged? (tools, permissions, model)
- [ ] Output contract unchanged? (structure, severity, evidence)
- [ ] Orchestrator compatibility preserved? (if applicable)

If drift is detected:
1. Identify whether it was intentional (approved B/C/D change) or accidental.
2. If accidental, revert and re-apply more carefully.
3. If intentional, document in the update report.

---

### Step 10: Downstream impact check (if applicable)

If this agent is spawned by an orchestrator or has known consumers:

1. **Verify output contract compatibility**: Does the return packet still match what the orchestrator expects?
2. **Check aggregation assumptions**: If severity levels or dedup keys changed, does aggregation still work?
3. **Test mentally (or actually)**: Would the orchestrator's dispatch logic still route to this agent correctly?

If any downstream impact is detected:
- Flag it in the update report
- Recommend updates to the orchestrator (if needed)
- Consider whether the orchestrator author needs to be consulted

---

### Step 11: Deliver an Update Report

Return:

## Update Report

### Intent Snapshot (BEFORE)
...

### Intent Snapshot (AFTER)
...

### Changes applied (A)
- bullet list

### Suggested changes needing author decision (B/C/D)
- bullet list with rationale + options

### Routing analysis
- Current trigger coverage assessment
- `<example>` block quality assessment
- Recommendations (if any)

### Ambiguities / contradictions / edge cases
- table or bullets using the format from Step 5

### Drift check
- "No drift detected" OR a list of potential drift points with explanation

### Downstream impact (if applicable)
- "No downstream impact" OR specific impacts and recommendations

---

## Decision Brief Template (copy/paste)

### Decision: <short title>

**Why this matters**
- <routing impact / calibration impact / capability impact / downstream impact>
- <drift risk>

**What the current agent suggests (evidence of intent)**
- <quote or paraphrase from the existing agent>
- <what this implies about author intent>

**Options**
1) **Option 1: Keep as-is (no change)**
   - Fidelity to intent: High
   - Pros:
   - Cons:
   - Drift risk: None

2) **Option 2: <option>**
   - What changes (exactly):
   - Fidelity to intent:
   - Pros:
   - Cons:
   - Drift risk:
   - Downstream impact (if any):

3) **Option 3: <option>**
   - ...

**My recommendation (clearly labeled; explain confidence)**
- Recommended option:
- Confidence: <High/Medium/Low>
- What would increase confidence:
- What would change my mind:

**Question for the author**
- Choose: Option 1 / 2 / 3
- If you choose Option 2/3, confirm these specifics: <bullets>

---

## Common anti-patterns when updating agents

### Intent drift

- **Oversampling**: Adding new rules, new failure modes, new edge cases "because it seems good." Only add what the author clearly implied.
- **Tone normalization**: Rewriting personality statements into your style. This can shift strictness (a strict reviewer becomes lenient) or escalation thresholds (an agent that asked becomes one that assumes).
- **Calibration creep**: Subtly shifting MUST → SHOULD or SHOULD → CONSIDER (or vice versa) without realizing the behavioral impact.

### Routing breakage

- **Silent routing changes**: Expanding `description` triggers so the agent fires in new contexts without author consent. This is especially dangerous because it changes behavior without changing the agent's visible "purpose."
- **Example drift**: Modifying `<example>` blocks in ways that change what they teach about delegation. Each example should have clear `<commentary>` explaining *why* it matches or doesn't match.
- **Dropping near-miss examples**: Removing the exclusion example that prevents over-triggering. If the original had one, preserve it.

### Capability creep

- **Tool accumulation**: Adding tools "for convenience" without considering permission posture. More tools = more risk surface.
- **Permission loosening**: Changing `permissionMode` toward less restrictive (e.g., default → acceptEdits) without explicit approval.
- **Model upgrade without consideration**: Changing model to `opus` "for better results" when the original chose `haiku` for cost/speed reasons.

### Output contract breakage

- **Schema drift**: Changing return packet structure when an orchestrator depends on it. Even "minor" changes (reordering sections, renaming headings) can break aggregation.
- **Severity level changes**: Adding, removing, or renaming severity levels when orchestrators sort/filter by them.
- **Evidence format changes**: Changing from "file:line" to "excerpt" format when consumers parse the original format.

### Structural noise

- **Diff noise**: Massive reflow that makes review hard and increases risk of accidental semantic changes. Prefer targeted edits.
- **Adding TL;DR sections**: These duplicate the workflow and waste context tokens. If the agent prompt feels too long, shorten it—don't add a summary.
- **Deep reference chains**: Adding references that require chasing other references. The agent file should be the navigation hub.

### Maintenance

- **Embedded update notes**: Adding "Updated 2026-02-04: changed X" comments inside the agent file. Keep the agent standalone; put changelog in git or a separate file.
- **Over-correcting to feedback**: Adding the same guidance in too many places after one failure. Make targeted fixes, not shotgun edits.

---

## Summary: What to preserve vs. what to improve

| Preserve (do not change without consent) | Improve (A-class changes) |
|---|---|
| `name` | Formatting, structure |
| `description` trigger language | Redundancy reduction |
| `<example>` blocks and their meaning | Clarity of existing requirements |
| `tools` / `disallowedTools` | Section organization |
| `permissionMode` | Navigation to references |
| `model` | Typos, grammar |
| `skills` preloaded | Implicit → explicit structure |
| Output contract schema | |
| Personality / calibration | |
| Escalation thresholds | |
| Failure modes coverage (don't remove) | |
