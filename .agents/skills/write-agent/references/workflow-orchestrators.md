Use when: Designing workflow orchestrator agents; understanding phase sequencing, dispatch, aggregation, iteration
Priority: P1
Impact: Orchestrator without this guidance may have poor phase design, token bloat, infinite loops, or inconsistent outputs

---

# Workflow Orchestrators (Reference)

This reference covers how to design **workflow orchestrator agents**: multi-phase coordinators that spawn subagents, aggregate results, and iterate with quality gates.

## 1) What makes an orchestrator different?

A subagent:
- Does one job (review OR implement OR diagnose).
- Returns one report.
- Usually does NOT use the Task tool.

A workflow orchestrator:
- Runs a pipeline (phases with explicit inputs/outputs).
- Spawns multiple subagents via the Task tool.
- Aggregates outputs from parallel subagents.
- Implements iteration loops (fix → re-review) with termination conditions.

## 2) Non-negotiable constraints (design around these)

1) **No nesting**
   - Subagents cannot spawn other subagents.
   - Therefore: orchestrators must run as the **top-level session agent** (CLI `--agent <orchestrator>` or equivalent).
   - Avoid building orchestrators that must be Task-spawned.

2) **Fresh context for each spawned agent**
   - Provide a structured handoff packet; do not assume they know "what just happened."

3) **Skills are not inherited**
   - If a reviewer needs `write-docs`, it must declare `skills: [write-docs]` in its own frontmatter (or you must inline standards into its handoff).

4) **Explore/Plan are read-only**
   - If you want durable artifacts (research notes, plans), the orchestrator must write them (if it has Write access) based on the Explore/Plan return packets.

## 2.5) Built-in vs Custom Subagents

Orchestrators can spawn two kinds of subagents:

**Built-in agents** (provided by Claude Code, no file needed):
- Examples as of early 2026: `Explore`, `Plan`, `general-purpose`
- Check current availability via Task tool documentation or by inspecting `subagent_type` options
- Typically optimized for common patterns (exploration, planning, flexible execution)

**Custom role agents** (defined in `.claude/agents/`):
- Your own agents like `pr-review-docs`, `implementer`, etc.
- Preload domain skills via `skills:` field
- Tool-restricted for safety

**When to use which:**
- Use **built-in agents** for generic phases (research, planning) where you don't need domain skills or custom tool restrictions.
- Use **custom role agents** when you need:
  - Domain skills preloaded (e.g., `skills: [write-docs]`)
  - Specific tool restrictions (e.g., reviewers with no Write/Edit)
  - Consistent output format (e.g., all reviewers return same Finding schema)

*Note: Built-in agent types evolve with Claude Code releases. When in doubt, test availability in your environment.*

## 3) Orchestrator design checklist

### A) Phase sequencing
For each phase, define:
- Purpose (1 sentence)
- Inputs (what it needs)
- Outputs (what it must produce)
- Quality gate (what "pass" means)
- Next phase trigger (what condition advances)

Common phase patterns:
- PR review: Analyze diff → Dispatch reviewers → Aggregate → Return status
- Feature dev: Research → Plan → Implement → Judge → Iterate → Validate → Return
- Bug fix: Reproduce → Diagnose → Fix → Verify → Return

### B) Subagent dispatch rules
Make dispatch deterministic:
- Which subagents to run based on changed file patterns / feature type
- What runs in parallel (usually independent reviews)
- What must be sequential (plan must exist before implement)

Practical rule:
- If two tasks don't depend on each other's outputs, run them in parallel.

### C) Aggregation rules
Aggregation is fragile without an output contract.

Recommended:
- Require each reviewer subagent to return findings as JSON (array of findings).
- Use a shared "output contract" skill that is preloaded by every reviewer subagent to prevent drift.

Dedup strategy:
- Key by `(file, line/range, message)` or `(file, rule_id, location)` if you have structured IDs.

Sort strategy:
- Severity first: CRITICAL > MAJOR > MINOR > INFO
- Then file path
- Then line

Counts:
- Always compute counts per severity.

### D) Iteration / retry policy
Define:
- Max iterations (commonly 2–3)
- What triggers iteration (e.g., any CRITICAL/MAJOR findings, or failing tests)
- What gets passed back into implement phase (a minimal fix list)
- Termination behavior when max iterations exceeded (return FAIL with remaining blockers)

Pseudo-flow:
1. Run implement
2. Run judge/review (parallel)
3. If gate passes → PASS
4. Else:
   - Extract actionable fix list
   - If iterations_remaining → implement again
   - Else → FAIL with remaining blockers + evidence

### E) Artifact passing strategy
Use a mixed approach:

- **Small (< ~2–3 KB):** pass in handoff packet text.
- **Large:** write to disk and pass file path forward.

Recommended artifact layout (example):
- `.workflow/feature-development/research.md`
- `.workflow/feature-development/plan.md`
- `.workflow/feature-development/review.json`

Keep artifacts:
- scannable
- stable paths
- referenced explicitly in later phase handoffs

### F) Quality gates
Each phase should have an explicit gate.

Examples:
- Research gate: "returns key files + risks"
- Plan gate: "includes file list + step sequence + validations"
- Implement gate: "changes compiled/tests run (or explicit reason why not)"
- Review gate: "0 critical, 0 major"
- Verify gate: "tests pass"

## 4) Handoff packet patterns for orchestrators

Use a consistent "TASK HANDOFF" block per spawned agent:

- Objective
- Why needed (1 sentence)
- Scope (in/out)
- Target files
- Constraints (must/must-not)
- Output format required (return packet + schema)
- "Done" definition
- If blocked: what to do

Then require the standard return packet:
- TL;DR
- Findings (prioritized)
- Evidence (file:line + minimal excerpt)
- Recommended next actions
- Open questions

## 5) Orchestrator output contract (recommended)

Even if subagents return JSON, orchestrator should return:
- Human-readable summary
- Aggregated findings (sorted)
- Evidence for high-severity items
- A final machine-readable JSON block

Minimum JSON fields:
- status
- phases_completed
- iterations
- subagents_run
- counts
- artifact paths (if any)

## 6) Common failure modes (and guardrails)

1) **Orchestrator accidentally used as subagent**
   - Guardrail: include an explicit constraint in the orchestrator prompt ("must run as top-level session agent").
   - Fallback behavior: if Task tool unavailable, return instructions to invoke correctly.

2) **Inconsistent reviewer outputs**
   - Guardrail: shared output contract skill preloaded in every reviewer subagent.

3) **Token bloat from passing big artifacts**
   - Guardrail: write artifacts to disk and pass paths forward.

4) **Infinite loops**
   - Guardrail: max iterations + clear FAIL output.

5) **Over-triggering orchestration**
   - Guardrail: `<example>` near-miss blocks in description that direct single-step requests to subagents.

## 7) Orchestrator-specific Agent Brief fields

When filling out the Agent Brief (Step 1 of write-agent workflow), add these for orchestrators:

- **Phases:** ordered list (and which can run in parallel)
- **Subagent roster:** which subagents to spawn, and when
- **Artifact strategy:** what gets written to disk vs passed via handoff packets
- **Quality gates:** what must be true to advance / to stop
- **Iteration policy:** max iterations; termination conditions; what to do on repeated failure
