---
name: write-agent
description: "Design and write high-quality Claude Code agents and agent prompts. Use when creating or updating .claude/agents/*.md for (1) single-purpose subagents (reviewers, implementers, researchers) and (2) workflow orchestrators (multi-phase coordinators like pr-review, feature-development, bug-fix). Covers delegation triggers, tool/permission/model choices, Task-tool orchestration, phase handoffs, aggregation, iteration gates, and output contracts. Also use when deciding between subagents vs skills vs always-on repo guidance."
---

<example>
Context: User asks for a single-purpose reviewer
user: "Create a security reviewer agent that checks my code changes"
assistant: "This is a single-purpose review task—I'll create a subagent with read-only tools."
<commentary>
Single job (security review) + one output type → subagent, not orchestrator.
</commentary>
assistant: "I'll use the write-agent skill to create a security-reviewer subagent."
</example>

<example>
Context: User asks for a multi-phase workflow coordinator
user: "I need an agent that can plan features, implement them, run reviews, and iterate until quality gates pass"
assistant: "This is a multi-phase workflow with coordination, dispatch, and iteration—I'll create a workflow orchestrator."
<commentary>
Multiple phases + subagent dispatch + iteration → workflow orchestrator pattern.
</commentary>
assistant: "I'll use the write-agent skill to create a workflow orchestrator."
</example>

<example>
Context: User asks about repo conventions (not an agent)
user: "How should I document the commit message format for this repo?"
assistant: "This is about repo-wide conventions, not agent design. I'll add it to CLAUDE.md instead."
<commentary>
Always-on repo constraint → CLAUDE.md, not an agent. Don't trigger write-agent.
</commentary>
assistant: "I'll add commit message conventions to CLAUDE.md."
</example>

<example>
Context: User asks to update or refactor an existing agent
user: "Can you clean up the security-reviewer agent? It's getting verbose and I think the routing is off."
assistant: "This is an update to an existing agent—I need to preserve intent while improving clarity and routing."
<commentary>
Update/refactor request → use the update procedure to avoid drift. Load references/updating-existing-agents.md.
</commentary>
assistant: "I'll use the write-agent skill with the update procedure to refactor the security-reviewer agent."
</example>

# Write Agent Skill

Design agents that are **focused, safe, and reliable** without over-constraining them.

Key principle: **treat tokens and attention as a shared budget**. Prefer small, high-signal prompts plus strong *output contracts* over long prose.

---

## How this skill uses supporting files

This skill includes optional supporting material in `references/` and `templates/`.

- When a workflow step says **Load:** `path/to/file.md`, open that file before continuing.
- If you feel uncertain about a decision point, jump to the **Reference Index** at the end to find the right deep-dive.
- Templates are starting points to customize, not rigid formats.

**For non-trivial agent design:** Consider reading all files in this skill folder before starting. Partial context can lead to inconsistent agents or missed patterns. This is especially valuable when designing orchestrators, updating existing agents, or working in an unfamiliar domain.

---

## Operating Principles (for the agent designer)

These principles guide *you* as you write agent prompts:

1. **Treat attention as scarce.** The model's attention is O(n²) with context length. Every token competes for attention with every other token. Front-load critical instructions; move reference material to `references/` files loaded on demand.

2. **Optimize for reliability, not elegance.** If a step is fragile or easy to mess up, add guardrails: a checklist, a validation loop, a "do X, not Y" constraint. Don't rely on the model inferring correct behavior.

3. **Default to one strong path, with escape hatches.** Provide a recommended default workflow. If alternatives exist, name them explicitly, but avoid option overload.

4. **Write for execution.** Use clear imperatives: "Do X. Then do Y." Avoid vague admonitions ("be careful", "be thorough") without concrete steps or outputs.

5. **Match certainty to expression.** Use "must" / "never" for hard requirements. Use "should" / "prefer" for strong defaults with exceptions. Use "consider" / "may" for suggestions. The agent parses this calibration.

6. **Make agent prompts standalone.** Assume a first-time reader with zero context. Don't rely on the agent inferring from prior conversation or parent state. For subagents specifically: don't reference other agents by name — write each as if it's the only agent that exists. (Orchestrators are the exception; they coordinate subagents by design.) If a subagent needs orchestration context, the parent passes it via handoff, not in the permanent prompt.

7. **Use positive and negative framing appropriately.** For routine guidance, positive framing ("Do X") is often clearer than prohibition ("Don't do Y"). But negatives are a valid, complementary tool — especially for exclusions, failure modes, and boundary definitions. When using negatives, make them concrete (not vague), pair with contrastive examples where helpful, and position critical constraints at section boundaries. See `references/prompt-structure.md` for technique details.

---

## What to Produce When This Skill Is Used

When asked to "create an agent" / "write a subagent" / "make a reviewer" / "make an orchestrator":

1. **Agent Brief** (concise) — include assumptions if needed.
2. **A ready-to-paste agent file** (`.claude/agents/<name>.md`).
   - If it's a **subagent**: single-purpose executor/reviewer.
   - If it's a **workflow orchestrator**: multi-phase coordinator that uses the **Task** tool to spawn subagents.
3. **Optional companion artifacts** (only if they materially help):
   - A skill (reusable workflow/knowledge)
   - An **output contract skill** (shared schema for orchestrator aggregation — e.g., all reviewers preload `pr-review-output-contract`)
   - A CLAUDE.md / .claude/rules addition (always-on constraints)
   - A hook (for conditional tool gating / quality gates)

Keep explanation short. Prioritize concrete artifacts (files, templates, checklists).

## Workflow

### 0) Identify the request type

Determine which you're doing:

- **Create** a new agent from scratch → continue with Steps 1–8 below
- **Update/refactor** an existing agent → **Load:** `references/updating-existing-agents.md` and follow that procedure

If updating/refactoring an existing agent:

**Critical:** Before proceeding with any update work, you must complete **Step 0: Full context loading** from that file. This means reading:
1. Every file in the `write-agent/` folder (SKILL.md + all references/ + all templates/ + all scripts/)
2. Every file related to the target agent (the agent file + any supporting files)
3. Any orchestrators that spawn this agent (if applicable)

Do not skip this step. Partial context loading is the primary cause of routing drift, capability creep, and broken output contracts during updates.

---

### 1) Choose the agent pattern: subagent vs workflow orchestrator

**Quick gate:** If you're unsure whether an agent is the right mechanism at all (vs a skill or CLAUDE.md rule), jump to Step 3 first. Otherwise, pick the lightest agent pattern that fits:

| Need | Choose | Practical effect |
|---|---|---|
| One job, one output (review, implement, diagnose, summarize) | **Subagent** | Simple scope, easier to validate; usually no Task tool |
| Multi-phase workflow (research → plan → implement → judge → iterate) | **Workflow orchestrator** | Needs Task tool; coordinates phases, dispatches subagents, aggregates results |
| Isolation for a single task, but no multi-phase orchestration | **Subagent** (or a `context: fork` skill) | Avoid writing orchestration logic unless needed |

**Hard constraint:** Subagents cannot spawn other subagents.
So a **workflow orchestrator must run as the top-level session agent** (e.g., `claude --agent feature-development …`), not as a Task-spawned subagent.

Templates:
- Subagents: `templates/subagent-template.md`, `templates/subagent-reviewer-template.md`, `templates/subagent-worker-template.md`
- Orchestrators: `templates/workflow-orchestrator-template.md`
- Deep guidance: `references/workflow-orchestrators.md`

### 2) Build an Agent Brief (fast, minimal)

Fill these fields. Ask questions only if missing info is *blocking*; otherwise assume sensible defaults and label them.

- **Pattern:** Subagent | Workflow orchestrator
- **Job-to-be-done:** What should it reliably accomplish?
- **Delegation triggers:** What should cause Claude to use it?
- **Inputs:** What context/files will it need? What can it assume is available?
- **Outputs:** What format, audience, and verbosity?
- **Quality bar:** What makes an output "done" vs "needs revision"?
- **Constraints:** Hard rules (must/never) vs soft guidance (should/could)
- **Tools & permissions:** Least-privilege tool access; permission mode choice
- **Model choice:** Cost/speed vs reasoning needs
- **Failure strategy:** When to ask vs proceed with assumptions

**If it's a workflow orchestrator**, also capture: phases, subagent roster, artifact strategy, quality gates, and iteration policy.

**Load:** `references/workflow-orchestrators.md` for the full orchestrator checklist.

If useful, copy/paste the brief template from `references/prompt-structure.md`.

**Default starting point:** Pick the closest template under `templates/` and fill every `[TODO]` before you return the agent file.

#### Clarification strategy (when gathering info for the brief)

Use this decision table to reduce both under-asking and over-asking:

| Situation | Do |
|---|---|
| Missing info that affects **routing** (delegation triggers), **tool power**, **side effects**, or **compatibility** | Ask 1-3 targeted questions before drafting. |
| User says "whatever you think is best" / signals indifference | Provide a specific recommendation plus 1-2 alternatives, then confirm the non-trivial choice. |
| Details are **low-stakes and reversible** (example wording, minor section names) | Use sensible defaults; list assumptions briefly so the user can correct if needed. |

**Question design (when you need human input):**
- Offer **2-4 clearly labeled options** (not 5+, which creates decision fatigue).
- Put your **recommended** option first and label it "(Recommended)" with a 1-sentence rationale.
- Include "Other" when your options might not cover reality.
- Frame questions around **what changes** based on the answer, not abstract preferences.

If you proceed with assumptions, label them as **Assumptions:** so they're easy to spot and correct.

### 3) Decide: agent vs skill vs always-on rules

Choose the *lightest* mechanism that reliably achieves the goal.

| If you need… | Prefer | Why |
|---|---|---|
| Always-on repo constraints (commands, conventions, non-negotiables) | **CLAUDE.md / .claude/rules** | Applied everywhere; no routing needed |
| Reusable instructions that should run in the **main** conversation context | **Skill** | Reuse without context isolation; easy to invoke interactively |
| A single specialized worker/reviewer with tool restrictions | **Subagent** | Isolated context + least-privilege tools |
| A multi-phase pipeline that coordinates other agents | **Workflow orchestrator** | Encodes phase order, dispatch, aggregation, iteration |

Notes:
- Subagents **cannot spawn other subagents**. If you need multi-step specialization, orchestration must live in the **top-level** agent/session.
- If you want a reusable workflow that runs "out of band", prefer:
  - a **skill with `context: fork`**, or
  - a **workflow orchestrator agent** invoked as the session agent.
  (Be aware some environments have reliability issues with `context: fork`.)

### 4) Pick the right strictness level (the "Goldilocks zone")

Agent prompts should hit the **right altitude** — specific enough to guide, general enough to generalize:

| Failure mode | Symptom | Example |
|--------------|---------|---------|
| **Too rigid** | Brittle enumeration; breaks on unexpected inputs | "If .ts do X. If .tsx do Y. If .js do Z..." |
| **Too vague** | Abstract principles without concrete signals | "Be helpful and thorough." |
| **Just right** | Heuristics that generalize + clear escalation | "Prioritize correctness over style. When uncertain, ask." |

Map task characteristics to strictness:

- **High freedom:** heuristics + output contract (reviews, audits, brainstorming)
- **Medium:** step sequence + required checks (refactors, migrations)
- **Low:** scripts/commands + strict validation loops (fragile ops)

### 5) Author the agent configuration (frontmatter)

Set (verify each is present before moving on):
- `name`: stable, hyphen-case, descriptive
- `description`: concrete triggers + examples; avoid over-broad routing
- `tools` / `disallowedTools`: least privilege
- `permissionMode`: default unless you have a reason
- `model`: haiku/sonnet/opus/inherit (choose intentionally)
- `skills`: preload needed skills explicitly (don't assume inheritance)

**CRITICAL: routing uses `<example>` blocks.** Include **2–4** `<example>` blocks with `<commentary>` that teaches *why* delegation should (or should not) happen.

**Subagents (recommended defaults):**
- Do **not** include the Task tool (no nested spawning).
- Preload domain skills they use to judge/implement (e.g., `skills: [write-docs]`).
- Strong output contract so an orchestrator can aggregate reliably.

**Workflow orchestrators (recommended defaults):**
- Include the Task tool (plus minimum tools for repo inspection).
- Do not assume spawned subagents inherit your `skills:` (they do not).
- See `references/workflow-orchestrators.md` for dispatch, aggregation, and iteration patterns.

Minimal pattern (copy/paste and customize):
```markdown
---
name: my-agent
description: Use this agent when <trigger conditions>. Avoid using it when <exclusions>.

<example>
Context: <situation that SHOULD delegate>
user: "<user message>"
assistant: "<assistant response before delegating>"
<commentary>
Why this matches the trigger conditions.
</commentary>
assistant: "I'll use the my-agent agent to…"
</example>

<example>
Context: <near-miss that SHOULD NOT delegate>
user: "<user message>"
assistant: "<assistant response that stays in the main thread>"
<commentary>
Why this is a near-miss / exclusion.
</commentary>
assistant: "<continue without delegating>"
</example>

# Optional:
# tools: Read, Grep
# model: sonnet
# permissionMode: default
---

# My Agent
...
```

**Load:** `references/claude-code-mechanics.md` for subagent constraints, permission modes, and skills composition patterns.

### 6) Write the system prompt body

Use a structure that optimizes for correct execution:

1. **Role & mission** (2–4 sentences) — includes personality statement
2. **Scope and non-goals** (avoid accidental overreach)
3. **Operating principles** (directness vs suggestions)
4. **Workflow checklist** (copy/paste-able)
5. **Tool-use policy** (what to read/grep/run; how to keep noise down)
6. **Output contract** (exact headings; verbosity limits; evidence expectations)
7. **Handoff protocol** (what to pass to subagents; what to return)
8. **Questions/escalation** (when to ask; when to proceed)

**Writing the Role & mission section:**

The Role & mission sets the agent's identity and judgment frame. It should:
- Declare what **excellence looks like** for this role (not just what it does)
- Describe behaviors the **best humans** in this role would exhibit
- Avoid escape hatches that could license poor judgment

**Load:** `references/personality-and-intent.md` for patterns on writing effective personality statements.

Quick guidance:
- ✅ "You catch the issues that matter most — correctness, security, data integrity"
- ✅ "You focus on high-impact areas over cosmetic nitpicks" (safe tradeoff: nitpicks are anti-pattern)
- ❌ "You ship working code over perfect code" (risky: "perfect code" isn't an anti-pattern)
- ❌ "You are pragmatic and fast" (vague; can excuse poor work)

**Orchestrator additions:** If writing a workflow orchestrator, add explicit sections for phase plan, dispatch rules, aggregation rules, iteration policy, and artifact passing. See `references/workflow-orchestrators.md` and `references/prompt-structure.md`.

**Style constraint:** Write in second person ("You are…", "Do…"). Avoid first-person commitments ("I will edit files…") unless the agent is allowed and expected to do so.

**Including failure mode awareness:**

Good agent prompts don't just say what to do — they explicitly name the failure modes most likely to occur given the agent's task. This gives the agent self-correction targets.

**Load:** `references/failure-modes.md` for the full catalog of common LLM failure modes.

Include failure modes either:
- As a dedicated **"Failure modes to avoid"** section (explicit, scannable), OR
- Woven into **operating principles** ("Do X. Avoid the tendency to Y.")

Pick the **3-5 most relevant** for the agent's context — don't include all of them.

Quick selection guide:

| Agent type | Commonly relevant |
|---|---|
| Reviewer | Flattening nuance, Source authority, Asserting when uncertain, Padding/burying lede |
| Implementer | Plowing through ambiguity, Downstream effects, Instruction rigidity, Assuming intent |
| Orchestrator | Plowing through ambiguity, Never escalating, Assuming intent, Over-indexing on recency |

**The interpretation test (run on every instruction):**

Before finalizing the prompt, verify each instruction passes these four checks:

1. **Could this be read two ways?** — If yes, add a clarifying example or "do X, not Y" constraint.
2. **Does this assume context the reader won't have?** — Agent prompts should be standalone; make implicit assumptions explicit.
3. **Would a different model or instance interpret this the same way?** — If you're relying on a specific interpretation that isn't explicit, make it explicit.
4. **Is the directive strength clear?** — Distinguish "must" (non-negotiable) from "should" (strong default) from "consider" (suggestion). Don't use vague "be careful" language.

Don't draft loosely and fix later — tighten language as you write.

**Load:** `references/prompt-structure.md` for the full prompt section breakdown.

**Prompting technique notes:**

- **Few-shot examples:** 2–3 well-chosen examples outperform more. Order matters: place the most representative example last (recency effect). One weak example degrades all examples.
- **Positive framing:** See Operating Principle #7. When possible, reframe "Don't respond when uncertain" as "Respond only when confident."
- **Effective negatives:** Negative instructions work well when supported correctly. Use contrastive examples (incorrect vs correct), make constraints concrete (not vague), and position critical constraints at section boundaries. Note: caps/bold emphasis does NOT help — use structural techniques instead. See `references/prompt-structure.md` for details.

### 7) Design bi-directional context handoff

Subagents start "fresh," so **don't rely on them remembering the parent chat**.

* Parent/orchestrator → subagent: provide a **handoff packet** (goal, constraints, target files, what "good" looks like).
* Subagent → parent/orchestrator: return a **return packet** (TL;DR, findings, evidence, next actions, open questions).

**Orchestrator artifact rule of thumb:**
- If a phase output is **small** (< ~2–3 KB), pass it forward in the next handoff packet.
- If a phase output is **large** (plans, research notes, many findings), write it to a file and pass the **path** forward. This prevents token bloat and enables resume/fork workflows.

**Error retention:** When a subagent action fails, keep the failed action and error in the handoff context. This enables implicit belief updating — the agent learns what doesn't work without explicit "don't do X" instructions. Summarize patterns if errors accumulate, but don't strip them entirely.

**Load:** `references/handoff-protocol.md` for packet templates and iteration patterns.

### 8) Add guardrails that pay for themselves

Prefer guardrails that are:

* **Observable** (checklists, validations, concrete criteria)
* **Specific** ("run X and report Y")
* **Low-cost** (don't burn tokens on generic admonitions)

Avoid:

* huge encyclopedic prompts,
* many parallel options with no default,
* vague "be careful" language without steps or outputs.

## Quality bar

Before returning an agent file, confirm:

* [ ] Frontmatter includes: `name`, `description` **with 2–4 `<example>` blocks**, and the intended `tools`/`disallowedTools`.
* [ ] `description` is neither too broad nor too narrow; examples include at least one near-miss exclusion.
* [ ] Role & mission describes what **excellence looks like** (not just what it does); no risky escape hatches.
* [ ] Failure modes: 3-5 contextually relevant failure modes are addressed (dedicated section or woven into principles).
* [ ] Instructions pass the interpretation test: no ambiguous phrasing; no assumed context; explicit "do X, not Y" where needed; directive strength is clear.
* [ ] Prompt body includes: mission, scope/non-goals, workflow, tool policy, output contract, and escalation rules.
* [ ] Handoff + return packet formats are explicit (or referenced).

**If workflow orchestrator**, also confirm:
* [ ] Includes phase plan, dispatch rules, aggregation rules, and iteration policy.
* [ ] Acknowledges no-nesting constraint (must run as top-level session agent).

**Designer self-check (before delivering):**
* [ ] Did I write any instruction that could be read two ways in a different context?
* [ ] Did I assume context the agent won't have?
* [ ] Are there places where I used vague language ("be careful", "be thorough") instead of concrete steps?
* [ ] Did I mix up directive strengths (using "should" where I meant "must", or vice versa)?

If any answer is "yes," fix before delivering. Most agent underperformance traces to designer errors, not model limitations.

## Implementation Output Format

When emitting files, output them like this (paths + code blocks):

* `path/to/file.md`
* (contents in a fenced code block)

Do not embed additional markdown prose inside the file unless it's part of the file's content.

---

## Reference Index

This index helps you quickly find the right deep-dive. In the main workflow, follow the **Load:** pointers.

**Priority legend:**
- **P0** = must for correctness/reliability
- **P1** = improves quality and consistency
- **P2** = optional depth

### References

| Path | Priority | Use when | Impact if skipped |
|---|---|---|---|
| `references/updating-existing-agents.md` | P0 | "Update" or "refactor" requests for existing agents | Intent drift; broken routing; capability creep; downstream orchestrator failures |
| `references/claude-code-mechanics.md` | P0 | Configuring frontmatter, understanding constraints, permissions, or composition | Broken routing, permission errors, failed spawning |
| `references/prompt-structure.md` | P0 | Structuring the system prompt body; writing Role & mission, tool policies, output contracts | Missed steps, inconsistent outputs, unclear escalation |
| `references/failure-modes.md` | P1 | Selecting which failure modes to guard against for this agent type | Agents exhibit predictable LLM blind spots |
| `references/personality-and-intent.md` | P1 | Writing effective Role & mission statements; avoiding escape hatches | Vague identity, risky tradeoff framing |
| `references/workflow-orchestrators.md` | P1 | Designing multi-phase orchestrators; dispatch, aggregation, iteration | Orchestrator missing key coordination patterns |
| `references/handoff-protocol.md` | P1 | Designing handoff packets; structuring return packets; multi-phase chaining | Subagents lack needed context or return unusable results |
| `references/evaluation-and-iteration.md` | P1 | Tuning delegation behavior; debugging over/under-triggering | Agents stay miscalibrated |
| `references/procedural-patterns.md` | P2 | Writing validation loops, iteration policies, or error handling | Agents may infinite-loop, skip validation, or fail ungracefully |
| `references/designer-failure-modes.md` | P2 | Debugging agent underperformance; reviewing prompts before delivery | Blame model for designer errors |

### Templates

| Path | Use when |
|---|---|
| `templates/subagent-template.md` | Starting a generic subagent |
| `templates/subagent-reviewer-template.md` | Read-only reviewer (disallows Write/Edit) |
| `templates/subagent-worker-template.md` | Implementation-focused worker |
| `templates/workflow-orchestrator-template.md` | Multi-phase orchestrator (uses Task tool) |
| `templates/skill-fork-template.md` | Skill that runs in a forked subagent context |

### Scripts

| Path | Purpose |
|---|---|
| `scripts/validate-agent.sh` | Validate agent file structure; catches missing `name`/`description` and warns on missing `<example>` blocks |
