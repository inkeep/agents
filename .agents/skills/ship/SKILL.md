---
name: ship
description: "Orchestrate any code change from requirements to merge-ready PR — scope-calibrated from small fixes to full features. Composes /spec, /implement, /review, and /research with depth that scales to the task: lightweight spec and direct implementation for bug fixes and config changes, full rigor for features. Use for ALL implementation work regardless of perceived scope — the workflow adapts depth, never skips phases. Triggers: ship, ship it, feature development, implement end to end, spec to PR, implement this, fix this, let's implement, let's go with that, build this, make the change, full stack implementation, autonomous development."
argument-hint: "[feature description or path to SPEC.md] [--implement-docker [compose-file]]"
---

# Ship

This skill has two modes. During **spec authoring** (Phase 1), you are a collaborative thought partner — the user is the product owner, and you work together to define what to build. Once the spec is finalized and the user hands off to implementation, you become an **autonomous engineer** who owns the entire remaining lifecycle: from spec.json through merge-ready PR. `/implement`, reviewers, and CI/CD are tools and inputs. You make every final decision.

---

## Ship Loop re-entry

If your prompt starts with `[SHIP-LOOP]`, you are mid-workflow — the stop hook re-injected you after context compaction or an exit attempt. Do NOT restart from Phase 0. The prompt includes:

- **Header:** current phase, completed phases, branch, spec path, PR number
- **State files (auto-injected):** `state.json`, SPEC.md, `spec.json`, and `progress.txt` (tail) — all between `=== STATE FILES ===` delimiters.
- **Git state (auto-injected):** filtered `git status`, `git diff --stat`, branch-scoped commit log, and branch tracking status — between `=== GIT STATE ===` delimiters. Noise is pre-filtered (lock files, build artifacts, `tmp/ship/`).

- **SKILL.md** in the system message for full phase reference

All auto-injected content is already in your prompt — do not re-read state files or re-run git commands (`git status`, `git log`, `git diff`).

Jump directly to the section for your current phase. Your first action is to continue from where you left off — the state files and git state give you everything you need.

---

## Context is managed — never rush phases

The ship loop has an automatic state save and reboot mechanism. If your context runs low, the stop hook saves your full state (`state.json`, SPEC.md, `spec.json`, progress log) and re-injects you into the correct phase with everything you need to continue. This is by design, not a failure.

**What this means for you:** Context is not a resource you need to ration across phases. Never compress, rush, or skip a phase because you anticipate running out of context. Go as deep as needed on every single phase — load every required skill, run every checklist, delegate to subagents for investigation. If context runs out mid-phase, the system handles continuity automatically.

**The failure mode this prevents:** An agent that rushes Phases 3-6 (testing, docs, review, completion) because "context was running low" ships incomplete work. A clean reboot that re-enters Phase 3 with full context produces better outcomes than a compressed pass through four phases on fumes.

---

## Ship working directory

All execution state lives in a configurable working directory (gitignored). Resolution priority:

| Priority | Source | Default |
|----------|--------|---------|
| 1 | **Env var `CLAUDE_SHIP_DIR`** | — |
| 2 | **Default** | `tmp/ship` |

Throughout this skill and its child skills (/implement, /cancel-ship), `tmp/ship/` refers to the resolved ship directory. If `CLAUDE_SHIP_DIR` is set, use that path instead. The shell scripts (`ship-init-state.sh`, `implement.sh`) read this env var automatically.

## State files

All execution state lives in `tmp/ship/` (gitignored). The only committed artifact is SPEC.md. Child skills (/spec, /implement) manage their own internal artifacts — see their SKILL.md files for details.

| File | What it holds | Created | Updated | Read by |
|---|---|---|---|---|
| `tmp/ship/state.json` | Workflow state — current phase, feature name, spec path, PR #, branch, capabilities, quality gates, amendments | Phase 1 (Ship) | Every phase transition (Ship) | Stop hook (re-injection), Ship (re-entry) |
| `tmp/ship/loop.md` | Loop control — iteration counter, max iterations, completion promise, session_id (for isolation) | Phase 1 (Ship) | Each re-entry (stop hook increments iteration, stamps session_id) | Stop hook (block/allow exit) |
| `tmp/ship/last-prompt.md` | Last re-injection prompt — the full prompt the stop hook constructed on its most recent re-entry, for debugging | Stop hook | Each re-entry (overwritten) | Debugging only |
| `tmp/ship/spec.json` | User stories — acceptance criteria, priority, pass/fail status | Phase 2 (/implement) | Each iteration (sets `passes: true`) | implement.sh, iterations, Ship |
| `tmp/ship/progress.txt` | Iteration log — what was done, learnings, blockers | Phase 2 start (implement.sh) | Each iteration (append) | Iterations, Ship |
| `tmp/ship/qa-progress.json` | QA scenarios and results — status, notes | Phase 3 (/qa) | Each scenario execution (/qa) | /pr (renders Manual QA), Ship (phase gate) |
| SPEC.md *(committed)* | Product + tech spec — requirements, design, decisions, non-goals | Phase 1 (/spec or user) | Phase 1 only | All phases, iterations |

### When to update what

| Event | state.json | Other files |
|---|---|---|
| **Phase 1 end** | **Run** `ship-init-state.sh` — creates both `state.json` and `loop.md` (see Phase 1, Step 3) | — |
| **Phase 2 start** | — | `/implement` creates `tmp/ship/spec.json`, `tmp/ship/implement-prompt.md`, `tmp/ship/progress.txt` |
| **Any phase → next** | Set `currentPhase` to next phase, append completed phase to `completedPhases`, refresh `lastUpdated` | — |
| **User amendment** (any phase) | Append to `amendments[]`: `{"description": "...", "status": "pending"}` | — |
| **Iteration completes a story** | — | `tmp/ship/spec.json`: set story `passes: true`. `tmp/ship/progress.txt`: append iteration log. |
| **PR created** (after Phase 2) | Set `prNumber` | Draft PR created on GitHub |
| **Phase 3 QA execution** | — | `/qa` creates `tmp/ship/qa-progress.json` with planned scenarios, then updates status incrementally during execution |
| **Phase 6 → completed** | Set `currentPhase: "completed"` | Stop hook deletes `loop.md` |
| **Stop hook re-entry** | — | `loop.md`: iteration incremented. Prompt re-injected from `state.json` + SKILL.md. |
| **`/cancel-ship`** | Preserved for inspection | Delete `loop.md` |

### PR description

The PR body is a living document — not write-once. A draft PR with a stub body is created after Phase 2 (implementation). The full PR body is written after Phase 3 (testing is complete) by loading `/pr`. It then evolves as documentation and review phases proceed.

Load `/pr` skill for all PR body work — writing the full body and updating it after subsequent phases. The skill owns the template, section guidance, and principles (self-contained, stateless).

**Update rule:** After any phase that changes code or documentation, check whether the PR description is now stale and re-load `/pr` skill to update it. Phase 6 verifies the description is comprehensive and current.

---

## Workflow

### Phase transitions

Before moving from any phase to the next:

1. Verify all open questions for the current phase are resolved.
2. Confirm you have high confidence in the current phase's outputs.
3. **In collaborative phases** (where the user is actively providing input): explicitly ask whether they are ready to move on. Do not proceed until they confirm.
4. **In autonomous phases**: use your judgment — but pause and consult the user when a decision requires human judgment you cannot make autonomously (architectural choices with significant trade-offs, product/customer-facing decisions, scope changes, ambiguous requirements where guessing wrong is costly).

   **Before pausing:** thoroughly research the situation — gather all relevant context, explore options, and assess trade-offs. The user should receive a complete decision brief, not a vague question.

   **To pause:** output `<input>Input required</input>` at the **beginning** of your message, followed by:
   - **Situation**: what happened and why you need a decision
   - **Context gathered**: what you researched, what you found, what you attempted
   - **Options**: concrete choices with trade-offs for each
   - **Your recommendation**: which option you'd pick and why (if you have one)
   - **Prompt**: "Would you like me to research any of these options more deeply before you decide?"

   The stop hook detects `<input>` and lets you wait for the user's response. The loop stays active — when they respond and you finish acting on it, the loop resumes automatically.

   **Do NOT pause for:** routine engineering decisions you can make with evidence, questions answerable by reading code or docs, anything you could resolve with `/research` or `/explore`. The bar: would a senior engineer on this team make this call alone, or escalate to a product owner?

5. Update `tmp/ship/state.json` per the "When to update what" table above (does not exist before end of Phase 1).
   - **Amendments:** When the user requests a change not in the original spec — ad-hoc tasks, improvements, tweaks, or user-approved scope expansions from review feedback — append to `amendments` before acting: `{ "description": "<brief what>", "status": "pending" }`. Set `status` to `"done"` when completed. This log survives compaction and tells a resumed agent what post-spec work was requested.
6. Update the task list: mark the completing phase's task as `completed` and the next phase's task as `in_progress`.

---

### Create phase task list (first action on every fresh run)

Before starting Phase 0, create a task for every phase using `TaskCreate`. This makes the full workflow visible upfront and ensures no phase is skipped.

Create these tasks in order:

1. **Phase 0: Detect context and starting point** — Recovery check, feature name, worktree, capability detection, scope calibration
2. **Phase 1: Spec authoring and handoff** — Scaffold spec, investigate, Load /spec skill, validate, activate state
3. **Phase 2: Implementation** — Build understanding, Load /implement skill, post-implementation review
4. **Create draft PR** — Push branch, create draft PR, set prNumber in state.json
5. **Phase 3: Testing** — Load /qa skill, run test plan, verify exit gate
6. **Write PR body** — Capture screenshots if applicable, Load /pr skill to write full body
7. **Phase 4: Documentation** — Load /docs skill, write/update all affected documentation surfaces
8. **Phase 5: Review iteration loop** — Mark PR ready, Load /review skill, iterate until all threads resolved and CI green
9. **Phase 6: Completion** — Run completion checklist, report to user, output completion promise

As each phase begins, mark its task `in_progress`. When the phase completes, mark it `completed`.

**On Ship Loop re-entry (`[SHIP-LOOP]`):** Check `TaskList` first. If tasks already exist, resume — mark completed phases as `completed` if not already, and continue from the current phase's task. If no tasks exist (session predates this step), create them and mark already-completed phases as `completed` based on `state.json`'s `completedPhases`.

---

### Phase 0: Detect context and starting point

#### Recovery from previous session

Before anything else, check if `tmp/ship/state.json` exists. If found:

1. Read it and present the recovered state to the user: feature name, current phase, completed phases, and any pending amendments.
2. Ask: "A previous `/ship` session for **[feature]** was interrupted at **[phase]**. Resume from there, or start fresh?"
3. If resuming: load the state (spec path, PR number, branch, worktree path, quality gates, capabilities, amendments) and skip to the recorded phase. Re-read the SPEC.md and any artifacts referenced in the state file. Check the amendments array for pending items — these are post-spec changes the user requested that may still need work. If `tmp/ship/loop.md` does not exist (loop was not active), re-activate it per Phase 1, Step 3.
4. If starting fresh: delete the state file, delete `tmp/ship/loop.md` if it exists, and proceed normally.

#### Step 1: Establish feature name and starting point

Determine what the user wants to build and whether a spec already exists. **A quick explore is fine here** — a few `Grep`/`Glob`/`Read` calls to orient yourself (e.g., find the relevant directory, confirm a module exists). But do not run extended investigation, spawn Explore subagents, or load skills. Deep investigation happens in Phase 1 after the scaffold exists.

| Condition | Action |
|---|---|
| User provides a path to an existing SPEC.md | Load it. Derive the feature name from the spec. |
| User provides a feature description (no SPEC.md) | A quick explore of the relevant area is fine to orient yourself. Then derive a short feature name (e.g., `revoke-invite`, `org-members-page`, `auth-flow`). If the description is too vague to name, ask 1-2 targeted questions — just enough for a semantic name, not deep scoping. |
| Ambiguous | Ask: "Do you have an existing SPEC.md, or should we spec this from scratch?" |

#### Step 2: Create isolated working environment

Now that you have a feature name, establish an isolated working directory so all artifacts live in the feature workspace from the start.

**Load:** `references/worktree-setup.md` — contains the decision table (worktree vs. feature branch vs. skip), setup procedure, and dependency installation.

#### Step 3: Detect execution context

**Load:** `references/capability-detection.md` — probe table for all capabilities (GitHub CLI, quality gates, browser, macOS, Docker, skills) with degradation paths.

Record results. If any capability is unavailable, briefly state what's missing as a negotiation checkpoint — the user may be able to fix it before work proceeds.

#### Step 4: Calibrate workflow to scope

Assess the task and determine the appropriate depth for each phase. **Every phase is always executed** — scope calibration adjusts rigor, not whether a phase runs. The sole exception: a missing capability from Step 2 (e.g., no GitHub CLI → skip PR creation and `/review`).

| Task scope | Spec depth (Phase 1) | Implementation depth (Phase 2) | Testing depth (Phase 3) | Docs depth (Phase 4) | Review depth (Phase 5) |
|---|---|---|---|---|---|
| **Feature** (new capability, multi-file, user-facing) | Full `/spec` → SPEC.md → spec.json | Full `/implement` iteration loop | Full `/qa` | Full docs pass — product + internal | Full `/review` loop |
| **Enhancement** (extending existing feature, moderate scope) | SPEC.md with problem + acceptance criteria + test cases; `/spec` optional | `/implement` iteration loop | `/qa` (calibrated to scope) | Update existing docs if affected | Full `/review` loop |
| **Bug fix / config change / infra** (small scope, targeted change) | SPEC.md with problem statement + what "fixed" looks like + acceptance criteria | `/implement` iteration loop (calibrated to scope) | Targeted `/qa` if user-facing | Update docs only if behavior changed | `/review` loop |

A SPEC.md is always produced — conversational findings alone do not survive context loss.

Note the scope level internally — it governs phase depth throughout. Do not present a detailed phase-by-phase plan or wait for approval here; proceed directly to Phase 1 and let the SPEC.md scaffold capture the initial scope. The user confirms scope through the spec handoff (Phase 1, Step 2), not through a separate plan approval step.

---

### Phase 1: Spec authoring and handoff (collaborative)

The user is the product owner — your job is to help them think clearly about what to build, surface considerations they may have missed, and produce a rigorous spec together.

#### Step 1: Author the spec

**Scaffold first, refine second.** Ask at most 1-2 scoping questions if the user's description is genuinely too vague to scaffold (e.g., "improve the system" with no specifics). If the request is concrete enough to write a problem statement — even an incomplete one — skip questions and write the scaffold immediately. Do not run an extended scoping conversation before the scaffold exists.

Write it to `specs/<feature-name>/SPEC.md` (relative to repo root). This follows the `/spec` skill's default path convention — see `/spec` "Where to save the spec" for the full override priority (env var, AI repo config, user override). The scaffold captures:

- Problem statement (what you understand so far)
- Initial requirements and acceptance criteria (even if incomplete)
- Known constraints or technical direction
- Open questions (what still needs clarification)

The scaffold doesn't need to be complete — it needs to exist on disk so it survives compaction and anchors the refinement conversation. The deep dive (investigation, open questions, decisions, `/spec`) happens *after* the scaffold exists, not before.

**After the scaffold exists — investigate.** Now that the scaffold anchors the conversation, do the deep investigation that informs the spec:

1. **Trace the existing system.** Load `/explore` skill to understand how the relevant area works today — patterns, shared abstractions, data flow, blast radius. For bug fixes, use the system tracing lens to follow execution from entry point to where the error occurs and identify the root cause (not just the symptom).
2. **Research third-party dependencies.** If the feature involves third-party libraries, frameworks, packages, APIs, or external services, load `/research` skill to verify their capabilities, constraints, and correct usage *before* designing the solution. Do this every time — not just when the dependency feels unfamiliar. Even dependencies you've used before may have changed, have undocumented constraints, or behave differently in this context. Do not spec against assumed API shapes — verify them.
3. **Update the scaffold.** Revise the SPEC.md with findings: root cause (for bugs), system constraints, API shapes, dependency capabilities, and refined acceptance criteria grounded in what you learned.

This investigation is not optional — it's what separates a spec grounded in reality from one built on assumptions. A spec that assumes an API works a certain way, or that a module has a certain interface, leads to implementation surprises that cost more to fix later.

**Then refine.** Load `/spec` skill to deepen and complete the spec through its interactive process. The scaffold and investigation findings give `/spec` a grounded starting point rather than a blank slate.

During the spec process, ensure these are captured with evidence (not aspirationally):
- All test cases and acceptance criteria. Criteria should describe observable behavior, not internal mechanisms (see /tdd for examples).
- Failure modes and edge cases
- Third-party dependency constraints and API shapes (verified via `/research`, not assumed)

**If scope calibration indicated a lighter spec process** (enhancement or bug fix): refine the scaffold directly instead of invoking `/spec`. The investigation step above still applies — lighter spec does not mean lighter investigation. The final SPEC.md must still capture: problem statement, root cause (for bug fixes), what "done" looks like (acceptance criteria), and what you will test.

**If the user provided an existing SPEC.md** (detected in Phase 0): skip to Step 2.

#### Step 2: Validate the spec

Read the SPEC.md. Verify it contains sufficient detail to implement:

- [ ] Problem statement and goals are clear
- [ ] Scope, requirements, and acceptance criteria are defined
- [ ] Test cases are enumerated (or derivable from acceptance criteria)
- [ ] Technical design exists (architecture, data model, API shape — at least directionally)

If any are missing, fill the gaps by asking the user targeted questions or proposing reasonable defaults (clearly labeled as assumptions).

Do not proceed until the user confirms the SPEC.md is ready for implementation. This confirmation is the handoff — from this point forward, you own execution autonomously.

#### Step 3: Activate execution state

**Load:** `references/state-initialization.md` — contains the initialization script invocation and field reference.

Run `<path-to-skill>/scripts/ship-init-state.sh` with values from Phase 0 (capabilities, scope) and Phase 1 (feature name, spec path, branch). **Do not manually write `state.json` or `loop.md` by hand — always use the script.** Hand-written JSON/YAML is the #1 cause of stop hook failures. See the reference for the full argument list and defaults.

After the script runs, verify both files exist:

```bash
test -f tmp/ship/state.json && test -f tmp/ship/loop.md && echo "State initialized" || echo "ERROR: state files missing"
```

If either file is missing, check the script output for errors and re-run. Do not proceed to Phase 2 without both files.

The script activates the stop hook for autonomous execution. The loop runs until `<complete>SHIP COMPLETE</complete>` or 20 iterations. Cancel manually with `/cancel-ship`.

---

### Phase 2: Implementation

#### Step 1: Build codebase understanding

Verify that you genuinely understand the feature — not just that the spec has the right sections. Test yourself: can you articulate what this feature does, why it matters, how it works technically, what the riskiest parts are, and what you would test first? If not, re-read the spec and investigate the codebase until you can. Load `/explore` skill on the target area (purpose: implementing) to understand the patterns, conventions, and shared abstractions you'll need to work with. Build your understanding from `/explore` findings and the SPEC.md — do not aimlessly browse implementation files; let `/explore` structure your exploration. If you need deeper understanding of a specific subsystem, delegate a targeted question to a subagent (e.g., "How does the auth middleware chain work in src/middleware/? What conventions does it follow?"). Your understanding should be architectural, not line-by-line. This understanding is what you will use to evaluate the implementation output and reviewer feedback later.

#### Step 2: Load /implement skill

Always load `/implement` skill — it owns spec.json conversion, prompt crafting, and the iteration loop regardless of scope. `/implement` calibrates its own depth internally. The only exception: changes so trivial they don't warrant a SPEC.md at all (a one-line typo fix, a config value change) — but those wouldn't go through `/ship` in the first place.

Load `/implement` skill to handle the full implementation lifecycle — from spec conversion (SPEC.md → spec.json) through prompt crafting and execution. Provide it with:
- Path to the SPEC.md — this is the highest-priority input. Do not omit it.
- The codebase context from Step 1 — the patterns, conventions, and shared abstractions you identified via `/explore`
- Quality gate command overrides from Phase 0 (which may differ from pnpm defaults)
- Browser availability from Phase 0 (if browser tools are unavailable, pass `--no-browser` so `/implement` adapts criteria)
- Docker execution from Phase 0 (if `--implement-docker` was passed, forward to `/implement` as `--docker`, including the compose file path if one was provided)

Wait for `/implement` to complete. If it reports that automated execution is unavailable and hands off to the user, wait for the user to signal completion. When they do, re-read the SPEC.md, spec.json, and progress.txt to re-ground yourself.

#### Step 3: Post-implementation review

After implementation completes, verify that you are satisfied with the output before proceeding. You are responsible for this code — the implementation output is your starting point, not your endpoint. Do not review the output by reading every changed file yourself — delegate targeted verification to a subagent: "Does the implementation match the SPEC.md acceptance criteria? Are there gaps, dead code, or unresolved TODOs? Does every acceptance criterion have a corresponding test?" Act on the findings. Fix issues directly for small, obvious problems. For issues where the root cause isn't immediately clear, load `/debug` skill with `--delegated` to diagnose — `/debug` will return structured findings (root cause, recommended fix, blast radius) without implementing the fix itself. Apply the fix based on its findings. For larger rework that requires re-implementing a story, re-load `/implement` skill with specific feedback.

**If you made any code changes** (whether direct fixes or by re-invoking `/implement`): re-run quality gates (test suite, typecheck, lint) and verify green before proceeding. `/implement` exits green, but post-implementation fixes happen outside its loop — you own verification of your own changes.

---

### Create draft PR

After Phase 2 completes and before entering Phase 3. Do not update `currentPhase` — this is Phase 2's final act.

**Load:** `references/pr-creation.md` — push the branch, create a draft PR with a stub body, and set `prNumber` in `tmp/ship/state.json`. If `gh` is unavailable, set `prNumber: null` and continue — the workflow adapts (see the reference file for degradation).

---

### Phase 3: Testing

Load `/qa` skill with the SPEC.md path (or PR number if no spec). `/qa` handles the full manual QA lifecycle: tool detection, test plan derivation, execution with available tools (browser, macOS, bash), result recording, and gap documentation.

If scope calibration indicated a lightweight scope (bug fix / config change), pass that context so `/qa` calibrates depth accordingly. If ship is running in a worktree or container (isolated environment), pass `--delegated` so `/qa` skips tool-availability negotiation checkpoints and operates autonomously.

**Phase 3 exit gate — verify before proceeding to Phase 4:**

- [ ] `/qa` complete: has run, fixed what it could, and documented results. Remaining gaps and unresolvable issues are documented — they do not block Phase 4.
- [ ] If `/qa` made any code changes: re-run quality gates (test suite, typecheck, lint) and verify green. `/qa` fixes bugs it finds — you own verification that those fixes don't break anything else.
- [ ] You can explain the implementation to another engineer: what was tested, what edge cases exist, how they are handled

---

### Write PR body

After Phase 3's exit gate and before entering Phase 4. Do not update `currentPhase` until Phase 4 begins.

If the implementation includes UI changes and `/screengrabs` is available, Load `/screengrabs` skill before writing the PR body — capture screenshots of affected routes so the PR body's "Screenshots / recordings" section has visual evidence ready. `/screengrabs` supports `--pre-script` for interaction before capture (dismissing modals, navigating tabs, logging in).

Load `/pr` skill with the PR number and `--spec <path/to/SPEC.md>` to write the full PR body. Implementation and testing are now complete — the body can cover approach, changes, architectural decisions, and manual QA results comprehensively.

If no PR exists (`prNumber: null` — GitHub CLI was unavailable during draft PR creation), load `/pr` skill with `new --spec <path/to/SPEC.md>` to create the PR and write the body in one step. Update `prNumber` in `tmp/ship/state.json`. If `gh` is still unavailable, `/pr` will output the body for manual use — skip Phase 5.

---

### Phase 4: Documentation

Load `/docs` skill to write or update documentation for all surfaces touched by the implementation. Documentation should be current *before* the PR enters review — reviewers need to see docs alongside code.

Provide `/docs` with:
- Path to the SPEC.md (primary source for what was built and why)
- PR number (if one exists) so it can report documentation results on the PR

After `/docs` completes, verify that documentation changes are committed in the PR.

#### Docs maintenance rule

Documentation must stay current through all subsequent phases:

- **After Phase 5 (Review):** If reviewer feedback leads to code changes, evaluate whether those changes affect any docs written in this phase. Update docs before pushing the fix.
- **After user-requested amendments:** If the user requests changes after Phase 4, update affected docs alongside the code changes.
- **Phase 6 (Completion) checkpoint:** Verify docs still accurately reflect the final implementation.

---

### Phase 5: Review iteration loop

**If no PR exists** (GitHub CLI unavailable): Skip this phase entirely. The user reviews locally after Phase 6. Proceed to Phase 6.

**Mark the PR as ready for review** before invoking `/review`. The PR was created as draft after Phase 3; now make it visible to reviewers:

```
gh pr ready <pr-number>
```

**Do not self-review the PR.** Your job in this phase is to load `/review` skill and iterate on *external* reviewer feedback — not to generate review feedback yourself. Do not run pr-review agents or subagents to review the code.

**Load `/review` skill at the top level — not in a subagent.** `/review` is a pipeline skill that runs an extended loop (poll → assess → fix → push → repeat). It needs your context: state files, spec path, phase awareness, and the ability to escalate back to you. Delegating it to a subagent strips all of that. Use the Skill tool directly.

Load `/review` skill with the PR number, the path to the SPEC.md, and the quality gate commands from Phase 0:

```
/review <pr-number> --spec <path/to/SPEC.md> --test-cmd "<test-cmd> && <typecheck-cmd> && <lint-cmd>"
```

`/review` manages the full review lifecycle autonomously — resolving all reviewer feedback threads and driving CI/CD to green.

**When `/review` escalates back to you:** If a reviewer requests new functionality or scope expansion, do not implement it directly — pause and consult the user. Only humans can approve scope changes. If approved, record as an amendment in `tmp/ship/state.json` before acting. Phase 5 does not add new stories to `tmp/ship/spec.json` or re-load `/implement` skill.

**Re-trigger rule:** Any new commits pushed after `/review` completes — from escalated feedback, user-requested changes, or fixes discovered in later phases — require re-loading `/review` skill. Do not proceed past this point until `/review` reports completion (all threads resolved, CI/CD green or documented).

---

### Phase 6: Completion

**Load:** `references/completion-checklist.md` — full verification checklist (quality gates, docs, PR description, CI/CD, reviewer threads) and completion report template.

Run through the checklist. After reporting to the user, output the completion promise to end the ship loop:

<complete>SHIP COMPLETE</complete>

---

## Ownership principles

These govern your behavior throughout:

1. **You are the engineer, not a messenger.** `/implement` produces code; reviewers suggest changes; CI reports failures. You decide what to do about each.
2. **Outcomes over process.** The workflow phases exist to organize your work, not to compel forward motion. Never move to the next step just because you finished the current one — move when you have genuine confidence in what you've built so far. If something feels uncertain, stop and investigate. Build your own understanding of the codebase, the product, the intent of the spec, and the implications of your decisions before acting on them.
3. **Delegate investigation; go deep on each phase.** Default to spawning subagents for information-gathering work: codebase exploration, test failure diagnosis, CI log analysis, code review of implementation output, and pattern discovery. This is an efficiency strategy — not a rationing strategy. Delegation lets you focus on orchestration and decision-making while subagents handle bounded research tasks. Give each subagent a clear question, the relevant file paths or error messages, and the output format you need. Act on their findings — not raw code or logs. Do investigation directly only when it's trivial (one small file, one quick command). The threshold: if it would take more than 2-3 tool calls or produce more than ~100 lines of output, delegate it. If context runs low at any point, the ship loop's automatic save/reboot mechanism handles continuity — do not trade phase depth for speed.

   **What to delegate vs. what to run top-level:** Subagents are for bounded investigation tasks — codebase exploration, test failure diagnosis, CI log analysis, pattern discovery. Pipeline skills (`/implement`, `/review`, `/qa`, `/docs`, `/pr`) must run at the top level via the Skill tool, never in a subagent. They run extended loops, manage state, and need your orchestrator context (state files, spec path, phase awareness, ability to escalate). Delegating them strips all of that.

   **Subagent mechanics:** Subagents do not inherit your skills. For plain investigation, this doesn't matter — just provide a clear question and file paths. When a subagent needs an investigation skill (like `/explore`), use the `general-purpose` type (it has the Skill tool) and start the prompt with `Before doing anything, load /skill-name skill` — this reliably triggers the Skill tool. Follow it with context and the task:

   ```
   Before doing anything, load /explore skill

   Explore src/middleware/auth/ for pattern discovery (purpose: implementing).
   We're adding role-based access control — report existing auth conventions,
   shared abstractions, and middleware chain composition. Return a pattern brief.
   ```
4. **Evidence over intuition.** Use `/research` to investigate codebases, APIs, and patterns before making decisions — not just when they feel unfamiliar. Inspect the codebase directly. Web search when needed. The standard is: could you explain your reasoning to a senior engineer and defend it with evidence? If not, you haven't investigated enough.
5. **Right-size your response.** Research, spec work, and reviews may surface many approaches, concerns, and options. Your job is not to address every possibility — it is to evaluate which are real for this context and act on those. For each non-trivial decision, weigh:
   - **Necessity**: Does this solve a validated problem, or a hypothetical one?
   - **Proportionality**: Does the complexity of the solution match the complexity of the problem?
   - **Evidence**: What concrete evidence supports this approach over alternatives?
   - **Reversibility**: Can we change this later if we're wrong?
   - **Side effects**: What else does this decision affect?
   - **Best practices**: What do established patterns in this codebase and ecosystem suggest?

   If evidence does not warrant the complexity, prefer the simpler approach — but "simpler" means fewer moving parts, not fewer requirements. A solution that skips validated requirements is not simpler; it is broken.

   Over-indexing looks like: implementing every option surfaced by research, building configurability for hypothetical problems.

   Under-indexing looks like: skipping investigation for unfamiliar code paths, declaring confidence without evidence.
6. **Flag, don't hide.** If something seems off — a design smell, a testing gap, a reviewer suggestion that contradicts the spec — surface it explicitly. If the issue is significant, pause and consult the user.
7. **Prefer formal tests.** Manual testing is for scenarios that genuinely resist automation. Every "I tested this manually" should prompt the question: "Could this be a test instead?"

---

## Anti-patterns

- **Deep investigation before setup.** Spawning Explore subagents, loading skills, or running extended codebase exploration during Phase 0. A quick explore (a few Grep/Glob/Read calls) to orient yourself is fine, but the deep dive — `/explore`, `/research`, subagents — happens in Phase 1 after the scaffold exists. A user saying "add invite revocation" gives you the feature name (`revoke-invite`) immediately; you don't need to map the entire invite system first.
- **Implementing before understanding.** Jumping into code before building a mental model of the feature, the codebase area, or the spec's intent.
- Using a different package manager than what the repo specifies
- Force-pushing or destructive git operations without user confirmation
- Leaving the worktree without cleaning up (document how to clean up in PR description)
- **Bypassing /ship for "small" work.** Scope calibration (Phase 0, Step 4) adjusts depth for every task size — bug fixes get a light SPEC.md and calibrated testing. The workflow always runs; rigor scales. Implementing directly outside /ship means no spec (requirements lost on compaction), no state persistence, no QA, no PR, no review loop. A 4-file security fix still needs a spec that captures what "fixed" looks like, tests that verify it, and a PR that documents it.
- **Skipping `/implement` for "simple" changes.** `/implement` always runs — it owns spec.json conversion, the implementation prompt, and the iteration loop. Even small changes benefit from the structured prompt and verification cycle. Direct implementation outside `/implement` loses the spec.json tracking, progress log, and quality gate loop.
- **Hand-writing state files.** Never manually write `tmp/ship/state.json` or `tmp/ship/loop.md` as raw JSON/YAML. Always use `ship-init-state.sh`. Hand-written files are the #1 cause of stop hook failures — malformed JSON, missing fields, wrong YAML frontmatter — and the resulting bug (hook silently exits, loop never activates) is invisible until context compaction, when it's too late.
- **Outputting a false completion promise.** Never output `<complete>SHIP COMPLETE</complete>` until ALL phases have genuinely completed and all Phase 6 verification checks pass. The ship loop is designed to continue until genuine completion — do not lie to exit.
- **Rushing or skipping phases due to context concerns.** Never compress, abbreviate, or skip Phases 3-6 because you feel context is running low. The ship loop's stop hook automatically saves state and reboots you into the correct phase with full context. A clean reboot that re-enters at the right phase produces better outcomes than a compressed pass through multiple phases on fumes. Every phase loads its skill, runs its checklist, and completes fully — context pressure is never a valid reason to skip or abbreviate. If you catch yourself thinking "context is running low, let me quickly cover the remaining phases" — stop. That thought is the anti-pattern.

---

## Appendix: Reference and script index

| Path | Use when | Impact if skipped |
|---|---|---|
| `/implement` skill | Converting spec, crafting prompt, and executing the iteration loop (Phase 2) | Missing spec.json, no implementation prompt, no automated execution |
| `/qa` skill | Manual QA verification with available tools (Phase 3) | User-facing bugs missed, visual issues, broken UX flows, undocumented gaps |
| `/pr` skill | Writing the full PR body (after Phase 3) and updating it after subsequent phases | Inconsistent PR body, missing sections, stale description |
| `/docs` skill | Writing or updating documentation — product + internal surface areas (Phase 4) | Docs not written, wrong format, missed documentation surfaces, mismatched with project conventions |
| `/review` skill | Running the push → review → fix → CI/CD loop (Phase 5) | Missed feedback, unresolved threads, mechanical response to reviews, CI/CD failures not investigated |
| `references/worktree-setup.md` | Creating worktree (Phase 0, Step 1) | Work bleeds into main directory |
| `references/capability-detection.md` | Detecting execution context (Phase 0, Step 2) | Child skills receive wrong flags, phases skipped or run with wrong assumptions |
| `references/state-initialization.md` | Activating execution state (Phase 1, Step 3) | Stop hook cannot recover context, loop cannot activate |
| `references/pr-creation.md` | Creating draft PR after implementation (between Phase 2 and Phase 3) | QA results lost on compaction (no PR to post to), /qa cannot post checklist as PR comment |
| `references/completion-checklist.md` | Final verification (Phase 6) | Incomplete work ships as "done" |
| `/review` skill `scripts/fetch-pr-feedback.sh` | Fetching review feedback and CI/CD status (Phase 5, via /review). Canonical copies live in the `/review` skill — do not duplicate. | Agent uses wrong/deprecated `gh` commands, misses inline review comments |
| `/review` skill `scripts/investigate-ci-failures.sh` | Investigating CI/CD failures with logs (Phase 5, via /review). Canonical copies live in the `/review` skill — do not duplicate. | Agent struggles to find run IDs, fetch logs, or compare with main |
| `/debug` skill | Diagnosing root cause of failures encountered during implementation (Phase 2) or testing (Phase 3) — when the cause isn't obvious from the error | Shotgun debugging: fixing symptoms without understanding root cause, wasted iteration cycles |

