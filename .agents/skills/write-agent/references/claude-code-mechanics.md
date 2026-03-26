Use when: Configuring agent frontmatter; understanding subagent constraints, routing, permissions, or composition patterns
Priority: P0
Impact: Incorrect frontmatter or misunderstanding of constraints leads to broken routing, permission errors, or failed spawning

---

# Claude Code Mechanics (Reference)

This file summarizes practical mechanics that affect subagent design.

## Subagents: What They Are

- Each subagent runs in its **own context window** with a **custom system prompt** (the markdown body of the agent file).
- Claude routes delegation using the subagent's **description** (it acts as a semantic router).
- Subagents are good for **isolating high-volume output**, enforcing **tool restrictions**, and running **parallel work**.

## Description-based routing and `<example>` blocks

In Claude Code, the `description` field is not just a label — it teaches delegation behavior.

**Guidance**
- Include **2–4** `<example>` blocks.
- Use `<commentary>` to explain *why* the example should (or should not) trigger delegation.
- Include at least one **near-miss / exclusion** example to prevent over-triggering.

**Canonical pattern**
```md
description: Use this agent when <conditions>. Avoid using it when <exclusions>.

<example>
Context: <situation>
user: "<message>"
assistant: "<response before delegating>"
<commentary>
Why this matches the delegation triggers.
</commentary>
assistant: "I'll use the <agent-name> agent to..."
</example>
```

If your agent triggers too often or never triggers, the first thing to adjust is:

* the `description` trigger language, and
* the coverage/clarity of `<example>` blocks.

## Key Constraints

* **Subagents cannot spawn other subagents.**

  * If you need multi-step delegation, chain from the main conversation.

* **Workflow orchestrators must run at the top level (flat orchestration).**

  * Orchestrators coordinate phases and spawn subagents via the **Task** tool.
  * Because nested spawning is disallowed, an orchestrator must run as the **session agent** (not as a Task-spawned subagent).
  * Practical design: only orchestrators have the Task tool; subagents should omit Task.

* Subagents run in **fresh context**. Do not assume access to:

  * parent chat history,
  * previously-read files,
  * skills (unless preloaded via `skills:`).

## Foreground vs Background

Foreground vs background is controlled by the **invoker** (the Task invocation or user action), not by agent frontmatter.

Practical implications:

* Foreground: can ask clarifying questions; permission prompts can be interactive.
* Background:

  * clarifying questions can fail,
  * unapproved permissions can be denied,
  * MCP tools are not available (environment-dependent, but treat as "not available" unless verified).

Design for graceful degradation:

* If blocked, return partial findings + what's needed to proceed (instead of relying on a back-and-forth).

## Where Subagents Live (Scope / Priority)

Common locations (highest priority wins when names collide):

1. `--agents` CLI flag (session-only)
2. `.claude/agents/` (project-level; check into version control)
3. `~/.claude/agents/` (user-level; all projects)
4. plugin `agents/` directory (where enabled)

## Subagent Frontmatter Fields

Required:

* `name` (lowercase letters + hyphens)
* `description` (delegation triggers + `<example>` blocks)

Optional:

* `tools` (allowlist)
* `disallowedTools` (denylist; removed from inherited or specified list)
* `model` (`sonnet`, `opus`, `haiku`, `inherit`)
* `permissionMode` (`default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan`)
* `skills` (preload skill content into the subagent's context)
* `hooks` (lifecycle hooks scoped to this subagent)

## Skills + Subagents: Two Composition Patterns

### Pattern A: Preload skills into a subagent

* Use `skills:` in subagent frontmatter.
* Full skill content is injected into the subagent's context.
* Subagents do not inherit skills from the parent; list them explicitly.

### Pattern B: Run a skill in a subagent context

* In a skill's frontmatter, set `context: fork`.
* Optionally set `agent: <subagent-type>` to choose which subagent runs it.
* Use `allowed-tools:` in the skill frontmatter to restrict tools for the forked run.

## Permission modes: Practical guidance

* `default`: safest default; prompts as needed.
* `acceptEdits`: good for trusted "implementation" agents that will edit many files; risky if mis-scoped.
* `dontAsk`: good for read-only agents where you want to hard-fail on any attempt to go beyond explicit tools.
* `bypassPermissions`: only for fully trusted environments; avoid for shared repos/CI unless you *really* mean it.
* `plan`: best for read-only exploration agents; encourages "propose a plan" before edits.

**Important interaction:** If the parent/session is running in an environment that effectively bypasses permissions, the subagent cannot reliably "re-tighten" that safety posture. Treat permission constraints as an end-to-end property.

## Hooks (optional)

If you define `hooks:` in an agent frontmatter, treat them as **scoped to that agent**.
Do not assume the subagent inherits parent hooks; wire hooks intentionally.

Hooks can be useful for:

* conditional tool gating (e.g., allow Bash only for specific commands),
* lightweight policy enforcement,
* structured logging of tool usage.

## CLI Invocation: Running Claude Code as a Process

Beyond the Task tool (in-process subagents), you can invoke `claude` as a standalone CLI process. This matters for orchestrators, scripts, CI/CD pipelines, and multi-session workflows.

### Key CLI flags for programmatic invocation

| Flag | Purpose | Example |
|---|---|---|
| `-p` / `--print` | Non-interactive mode: execute prompt, print result, exit | `claude -p "analyze this file"` |
| `--agent <name>` | Run as a specific agent (by name from `.claude/agents/`) | `claude --agent security-reviewer` |
| `--agents '<json>'` | Define custom agents inline (session-only) | `claude --agents '{"reviewer":{"description":"...","prompt":"..."}}'` |
| `--model <model>` | Set model (`sonnet`, `opus`, `haiku`, or full ID) | `claude -p --model haiku "summarize"` |
| `--output-format <fmt>` | Control output: `text` (default), `json`, `stream-json` | `claude -p --output-format json "query"` |
| `--allowedTools <tools>` | Auto-approve specific tools (no permission prompts) | `claude -p --allowedTools "Bash,Read" "query"` |
| `--max-turns <n>` | Cap agentic turns before stopping | `claude -p --max-turns 5 "implement X"` |
| `--max-budget-usd <n>` | Cap API spend for the session | `claude -p --max-budget-usd 1.00 "query"` |
| `-r` / `--resume <id>` | Resume a previous session by ID | `claude --resume abc123` |
| `--system-prompt <prompt>` | Override system prompt entirely | `claude -p --system-prompt "You are a linter" "check code"` |
| `--append-system-prompt <prompt>` | Append to default system prompt | `claude -p --append-system-prompt "Focus on security" "review"` |
| `--permission-mode <mode>` | Set permission mode for the session | `claude -p --permission-mode bypassPermissions "query"` |
| `--no-session-persistence` | Don't save session to disk (ephemeral) | `claude -p --no-session-persistence "one-off query"` |
| `--json-schema <schema>` | Enforce structured output via JSON Schema | `claude -p --json-schema '{"type":"object",...}' "extract"` |

### Running as a specific agent

Use `--agent` to target an agent file by name:

```bash
# Run the security-reviewer agent against a file
claude --agent security-reviewer -p "Review src/auth.ts for vulnerabilities"

# Run an orchestrator as the session agent (interactive)
claude --agent feature-development

# Combine with model and output format
claude --agent code-reviewer -p --model haiku --output-format json "Review the diff"
```

The `--agent` flag looks up agents by `name` from the standard resolution order (CLI flag → `.claude/agents/` → `~/.claude/agents/` → plugins). There is no `--agent-file` flag for arbitrary paths — agents must be discoverable by name.

For one-off or dynamic agents, use `--agents` with inline JSON:

```bash
claude --agents '{"quick-lint":{"description":"Lint check","prompt":"You are a linter. Check for style issues only."}}' \
  --agent quick-lint -p "Check src/utils.ts"
```

### Recursive invocation: spawning Claude Code subprocesses

Claude Code sets two environment variables — `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` — to detect when it's already running inside another instance. A naive `claude -p "..."` from within a running session's Bash tool will be blocked by this guard.

**Bypassing the guard with `env -u`:**

The guard is deliberately bypassable. Use `env -u` to strip the detection env vars before spawning a child process:

```bash
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT claude \
    -p "$(cat "$PROMPT_FILE")" \
    --dangerously-skip-permissions \
    --max-turns "$MAX_TURNS" \
    --output-format json \
    < /dev/null \
    2>&1 | tee "$OUTPUT_FILE" || true
```

The `< /dev/null` is **required** for nested invocations (Level 2+) — without it, the subprocess hangs on the inherited unix socket stdin. See "Critical: redirect stdin" below for details.

This pattern is based on the **implement skill** (`plugins/eng/skills/implement/scripts/implement.sh`), which spawns fresh Claude Code subprocesses in an iteration loop.

**Why each flag matters:**

| Flag | Reason |
|---|---|
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` | Strips the nesting guard so the child process can start |
| `-p "prompt"` | Non-interactive mode — execute and exit (no REPL) |
| `--dangerously-skip-permissions` | No TTY available for permission prompts in subprocess mode |
| `--max-turns N` | **Critical** — prevents runaway iterations; cap at every level |
| `--output-format json` | Structured output for programmatic consumption |

Additional bash idioms in the canonical pattern:
- `2>&1 | tee "$OUTPUT_FILE"` — capture output to file while streaming to stdout
- `|| true` — don't fail the parent script if the subprocess exits non-zero

**Multi-level nesting (grandchild instances):**

The child Claude Code process also sets `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` in its own environment. So if the child tries to spawn a grandchild, it hits the same guard — unless the grandchild invocation also uses `env -u`. Since the env var unsetting happens at the command level (not inherited), each nesting level applies the same pattern. There is no hard depth limit beyond the env var check.

```
Level 0: Parent session (interactive)
  └─ Level 1: env -u ... claude -p "..."     ← child subprocess
       └─ Level 2: env -u ... claude -p "..."  ← grandchild subprocess
```

**Practical considerations for nested invocation:**

- **`--max-turns`:** Must be set at **every** level. A missing cap at any level risks runaway loops.
- **`--dangerously-skip-permissions`:** Required at every level since subprocesses have no TTY for interactive approval.
- **Context isolation:** Each level starts completely fresh — no shared conversation history. Only filesystem state carries across levels.
- **`--agent`:** Works with `env -u` — you can spawn a subprocess as a specific agent: `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT claude --agent security-reviewer -p "Review src/auth.ts"`

**Critical: redirect stdin with `< /dev/null` for nested invocations:**

Grandchild (Level 2+) subprocesses hang indefinitely during startup if stdin is not redirected. The root cause: Claude Code's Bash tool connects stdin via a unix socket, and the nested `claude` process blocks trying to read from or configure that socket.

The fix is `< /dev/null` on the subprocess command:

```bash
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT claude \
    -p "$(cat "$PROMPT_FILE")" \
    --dangerously-skip-permissions \
    --max-turns "$MAX_TURNS" \
    --output-format json \
    < /dev/null \
    2>&1 | tee "$OUTPUT_FILE" || true
```

Without `< /dev/null`, the subprocess starts (visible via `ps`) but hangs at 0% CPU producing 0 bytes of output. With it, the subprocess completes in seconds.

### Monitoring child processes from the parent

Child Claude Code subprocesses run in isolation — no shared memory, no IPC channel. The parent monitors progress through **filesystem-based coordination** and **output parsing**.

#### Pattern 1: Shared state file (recommended for iteration loops)

The parent and child agree on a known file path. The child reads and writes it each iteration; the parent polls it between runs.

```
Parent                          Child (subprocess)
──────                          ──────────────────
writes spec.json (initial)
spawns child ──────────────────→ reads spec.json
                                 does work, commits code
                                 updates spec.json (marks stories done)
                                 writes progress.txt (learnings, blockers)
                                 exits
reads spec.json ←───────────────
reads progress.txt
decides: re-run or done?
```

This is the pattern used by `implement.sh`. The state files are:

| File | Written by | Read by | Purpose |
|---|---|---|---|
| `spec.json` | Both (parent seeds, child updates) | Both | Tracks which stories/tasks are complete (`passes: true/false`) |
| `progress.txt` | Child (append-only) | Parent | Learnings, blockers, and notes across iterations |
| Git state (commits, branches) | Child | Parent | Durable work product; parent can `git log` to verify |

**Completion detection:** The child emits a sentinel string (e.g., `IMPLEMENTATION COMPLETE`) in its output. The parent captures output via `tee` and greps for it:

```bash
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT claude \
    -p "$(cat "$PROMPT_FILE")" \
    --dangerously-skip-permissions \
    --max-turns "$MAX_TURNS" \
    --output-format json \
    < /dev/null \
    2>&1 | tee "$OUTPUT_FILE" || true

# Check for completion
if grep -q "IMPLEMENTATION COMPLETE" "$OUTPUT_FILE"; then
    # verify spec.json agrees, then stop
fi
```

**Cross-verification:** Don't trust the sentinel alone. Always verify the state file agrees:

```bash
INCOMPLETE=$(jq '[.userStories[] | select(.passes == false)] | length' spec.json)
if [[ "$INCOMPLETE" -gt 0 ]]; then
    echo "False completion signal — $INCOMPLETE stories still incomplete"
    continue  # re-run
fi
```

#### Pattern 2: Output file + polling (for background execution)

When the child runs in the background (via `run_in_background: true` on the Bash tool), the parent can't block on it. Instead:

```bash
# Parent spawns child in background
Bash(command: "scripts/implement.sh --max-iterations 15 --force",
     run_in_background: true)
# Returns task_id immediately

# Parent polls periodically
TaskOutput(task_id: "<id>", block: false)  # non-blocking check
# Returns status: running | completed | failed
```

Between polls, the parent can read the shared state files to gauge progress without waiting for the child to finish.

#### Pattern 3: Structured JSON output (for single-shot children)

For one-off subprocess calls (not iteration loops), use `--output-format json` and parse the result:

```bash
OUTPUT=$(env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT claude \
    -p "Analyze src/auth.ts and return findings" \
    --dangerously-skip-permissions \
    --max-turns 5 \
    --output-format json \
    < /dev/null \
    2>&1)

# Extract the result field from the JSON output
RESULT=$(echo "$OUTPUT" | jq -r 'select(.type == "result") | .result')
COST=$(echo "$OUTPUT" | jq -r 'select(.type == "result") | .total_cost_usd')
```

The JSON output includes: `result` (the assistant's final text), `duration_ms`, `num_turns`, `total_cost_usd`, `session_id` (for `--resume`), and `is_error`.

#### Pattern 4: Multi-level monitoring (grandchild coordination)

When Level 1 spawns Level 2, monitoring compounds. The recommended approach:

```
Level 0 (parent session)
  │
  ├── spawns Level 1 via Bash tool
  │     │
  │     ├── Level 1 writes to /tmp/l1-progress.txt
  │     ├── Level 1 spawns Level 2 with </dev/null
  │     │     │
  │     │     └── Level 2 writes to /tmp/l2-output.txt
  │     │
  │     ├── Level 1 reads /tmp/l2-output.txt after Level 2 exits
  │     └── Level 1 appends results to /tmp/l1-progress.txt
  │
  └── Level 0 reads /tmp/l1-progress.txt after Level 1 exits
```

Key rules for multi-level:
- **Each level writes to its own file.** Don't have grandchildren write to the grandparent's file — it creates race conditions if multiple children run in parallel.
- **Each level must add `< /dev/null`** when spawning the next level. This is the `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT ... < /dev/null` pattern.
- **Each level must set `--max-turns`.** This is the primary safeguard against runaway recursion at any depth.
- **Aggregate upward.** Each level reads its children's output and summarizes into its own progress file. The grandparent never needs to know about the grandchild's internal files.

### Choosing the right invocation model

| Invocation pattern | How | When to use |
|---|---|---|
| `env -u ... claude -p` from Bash tool | Subprocess with guard bypass | Iteration loops, long-running autonomous work, when you need a fresh full session with tool access |
| Task tool (in-process subagent) | Built-in delegation | Quick subtask delegation within a session; lighter weight than subprocess |
| `claude -p` from external script/CI | Top-level (no guard) | CI/CD pipelines, shell script orchestration |
| `claude --resume <id>` | Session continuity | Multi-phase workflows that need shared context across invocations |
| Agent SDK (Python/TypeScript) | Programmatic | Complex orchestration with tool approval callbacks and structured output |

**Multi-phase via `--resume`:**
```bash
# Phase 1: analyze
result=$(claude -p --output-format json "Analyze the codebase structure")
session_id=$(echo "$result" | jq -r '.session_id')

# Phase 2: continue with context from phase 1
claude -p --resume "$session_id" "Now implement the refactoring plan"
```

**External orchestration via shell scripts:**
```bash
#!/bin/bash
# Each invocation is a fresh top-level process (no env -u needed)
claude --agent planner -p --output-format json "Plan the migration" > /tmp/plan.json
claude --agent implementer -p "Implement the plan in /tmp/plan.json"
claude --agent reviewer -p "Review the changes from the last commit"
```

### Design implications for agent authors

- **For skills/agents that need iteration loops** (like implement): Use the `env -u` subprocess pattern. Set `--max-turns` and `--dangerously-skip-permissions` at every level.
- **For one-off subtask delegation**: Prefer the Task tool — it's faster (no startup overhead) and doesn't consume a separate rate limit slot.
- **For orchestrators coordinating subagents**: Run as the session agent (`claude --agent orchestrator`), use the Task tool internally for in-process subagents, or use `env -u` subprocess spawning for heavier isolated work.
- **Never nest without `--max-turns`** at every level. This is the primary safeguard against runaway recursion.

## Operational tips for reliability

* Keep the description neither too broad (delegates constantly) nor too narrow (never delegates).
* Use `<example>` blocks as your primary delegation tuning tool.
* Prefer explicit output contracts so the parent can integrate results without rework.
* Use handoff packets so the subagent has enough context without pasting whole transcripts.
