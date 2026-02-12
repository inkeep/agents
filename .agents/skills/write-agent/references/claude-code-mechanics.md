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

## Operational tips for reliability

* Keep the description neither too broad (delegates constantly) nor too narrow (never delegates).
* Use `<example>` blocks as your primary delegation tuning tool.
* Prefer explicit output contracts so the parent can integrate results without rework.
* Use handoff packets so the subagent has enough context without pasting whole transcripts.
