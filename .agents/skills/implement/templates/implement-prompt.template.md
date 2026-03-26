Use when: Phase 2 — crafting the implementation prompt for `tmp/ship/implement-prompt.md`
Priority: P0
Impact: Without this template, the iteration prompt must be reconstructed from memory — risk of missing critical sections (completion signal, TDD guidance, progress format, stuck handling)

---

# Implementation Prompt Template

This file contains two complete prompt variants for the iteration agents. The Phase 2 agent selects **ONE** variant, fills all `{{PLACEHOLDERS}}`, and saves the result to `tmp/ship/implement-prompt.md`.

**Do NOT include both variants in the saved prompt.** The iteration agent sees a single, unconditional workflow — never both variants, never conditional "if spec is available" logic.

## Placeholders

| Placeholder | Source | Used in |
|---|---|---|
| `{{SPEC_PATH}}` | Path to SPEC.md relative to working directory (e.g., `.claude/specs/my-feature/SPEC.md`) | Variant A only |
| `{{TYPECHECK_CMD}}` | `--typecheck-cmd` input or default `pnpm typecheck` | Both |
| `{{LINT_CMD}}` | `--lint-cmd` input or default `pnpm lint` | Both |
| `{{TEST_CMD}}` | `--test-cmd` input or default `pnpm test --run` | Both |
| `{{CODEBASE_CONTEXT}}` | Key patterns, shared vocabulary, and abstractions from the target codebase area — see SKILL.md Phase 2 for guidance on what to include | Both |

---

## Variant A — SPEC.md available

Use when a spec path is known. Copy everything from the horizontal rule below through "End of Variant A", fill all placeholders, and save.

---

You are implementing a feature based on a SPEC.md and spec.json. Follow this workflow exactly each iteration.

### 1. Read the SPEC

**FIRST ACTION — do this before anything else.**

Read the SPEC.md at `{{SPEC_PATH}}`. This is your primary implementation reference — architecture decisions, non-goals (what NOT to build), current system state (file paths, code traces), and design constraints.

Focus on:
- Non-goals (what NOT to build)
- Current state and integration points
- Proposed solution design
- Settled decisions with rationale

### 2. Check status

Read `tmp/ship/spec.json` for user stories and their completion status.

Read `tmp/ship/progress.txt` for learnings from previous iterations.

### 3. Select story

Select the highest-priority incomplete story (`passes: false`).

### 4. Implement

Implement the story. **One story per iteration** — keep changes focused.

**Before writing tests:** Discover the repo's testing conventions — check project config (CLAUDE.md, AGENTS.md), repo-level skills, existing test files, and CI config. Follow what exists; incorporate the principles below as contextually relevant.

**TDD approach** (where practical):
- Write one test, then implement to pass it, repeat
- Do NOT write all tests first — one vertical slice at a time
- Start with a tracer bullet: one test proving one end-to-end path works before adding breadth
- Mock at system boundaries only (external APIs, databases, time/randomness) — never mock your own modules or internal collaborators
- Test names describe WHAT ("user can filter by status"), not HOW ("calls filterHandler")

**Codebase context:**

{{CODEBASE_CONTEXT}}

### 5. Verify quality

Run these commands — ALL must pass:
- Typecheck: `{{TYPECHECK_CMD}}`
- Lint: `{{LINT_CMD}}`
- Test: `{{TEST_CMD}}`

Do NOT set `passes: true` or commit if any gate fails. Fix failures first. If you cannot fix them, treat the story as stuck (step 9).

### 6. Update spec.json

Set `passes: true` for the completed story in `tmp/ship/spec.json`. Do this before committing so progress is captured even if context runs out before the commit step.

### 7. Commit

Commit implementation changes only (source code, tests, configs) with message format: `[story-id] description`

Do NOT commit files in `tmp/` — they are gitignored execution state.

### 8. Log progress

Append to `tmp/ship/progress.txt` using this format:

```
## Iteration N - [timestamp]

### Story: [story-id] - [title]

**Implementation:**
- [what you did]

**Files Changed:**
- [list of files]

**Learnings:**
- [patterns discovered]
- [gotchas encountered]
- [insights for future iterations]

---
```

### 9. If stuck

If stuck on a story:
1. Set `notes` on that story in `tmp/ship/spec.json` with the blocker description
2. Log the blocker to `tmp/ship/progress.txt`
3. Move to the next story

### 10. Completion check

When ALL user stories have `passes: true`, output exactly:

<promise>IMPLEMENTATION COMPLETE</promise>

Output this ONLY when the statement is genuinely true. Do not output false promises.

**CRITICAL:** NEVER mention, quote, or reference the completion signal string anywhere in your output except when actually signaling completion. Do not write "when done, I will output IMPLEMENTATION COMPLETE" or similar in progress.txt or in conversation. Detection is literal string matching — any occurrence terminates the loop.

---

*End of Variant A*

---

## Variant B — No SPEC.md

Use when only spec.json is available. The `implementationContext` field is the sole implementation reference. Copy everything from the horizontal rule below through "End of Variant B", fill all placeholders, and save.

---

You are implementing a feature based on spec.json. Follow this workflow exactly each iteration.

### 1. Check status

Read `tmp/ship/spec.json` for user stories, their completion status, and the `implementationContext` field. This is your sole implementation reference — pay close attention to every detail in implementationContext: architecture, constraints, design decisions, integration points, and non-goals.

Read `tmp/ship/progress.txt` for learnings from previous iterations.

### 2. Select story

Select the highest-priority incomplete story (`passes: false`).

### 3. Implement

Implement the story. **One story per iteration** — keep changes focused.

**Before writing tests:** Discover the repo's testing conventions — check project config (CLAUDE.md, AGENTS.md), repo-level skills, existing test files, and CI config. Follow what exists; incorporate the principles below as contextually relevant.

**TDD approach** (where practical):
- Write one test, then implement to pass it, repeat
- Do NOT write all tests first — one vertical slice at a time
- Start with a tracer bullet: one test proving one end-to-end path works before adding breadth
- Mock at system boundaries only (external APIs, databases, time/randomness) — never mock your own modules or internal collaborators
- Test names describe WHAT ("user can filter by status"), not HOW ("calls filterHandler")

**Codebase context:**

{{CODEBASE_CONTEXT}}

### 4. Verify quality

Run these commands — ALL must pass:
- Typecheck: `{{TYPECHECK_CMD}}`
- Lint: `{{LINT_CMD}}`
- Test: `{{TEST_CMD}}`

Do NOT set `passes: true` or commit if any gate fails. Fix failures first. If you cannot fix them, treat the story as stuck (step 8).

### 5. Update spec.json

Set `passes: true` for the completed story in `tmp/ship/spec.json`. Do this before committing so progress is captured even if context runs out before the commit step.

### 6. Commit

Commit implementation changes only (source code, tests, configs) with message format: `[story-id] description`

Do NOT commit files in `tmp/` — they are gitignored execution state.

### 7. Log progress

Append to `tmp/ship/progress.txt` using this format:

```
## Iteration N - [timestamp]

### Story: [story-id] - [title]

**Implementation:**
- [what you did]

**Files Changed:**
- [list of files]

**Learnings:**
- [patterns discovered]
- [gotchas encountered]
- [insights for future iterations]

---
```

### 8. If stuck

If stuck on a story:
1. Set `notes` on that story in `tmp/ship/spec.json` with the blocker description
2. Log the blocker to `tmp/ship/progress.txt`
3. Move to the next story

### 9. Completion check

When ALL user stories have `passes: true`, output exactly:

<promise>IMPLEMENTATION COMPLETE</promise>

Output this ONLY when the statement is genuinely true. Do not output false promises.

**CRITICAL:** NEVER mention, quote, or reference the completion signal string anywhere in your output except when actually signaling completion. Do not write "when done, I will output IMPLEMENTATION COMPLETE" or similar in progress.txt or in conversation. Detection is literal string matching — any occurrence terminates the loop.

---

*End of Variant B*
