Use when: Writing/editing frontmatter, choosing invocation controls, or composing skills with subagents
Priority: P0
Impact: Skill may not trigger correctly; wrong execution model; missed safety constraints

---

# Frontmatter and Invocation

This reference summarizes common frontmatter fields and how they affect discovery, invocation, tool access, and subagent execution.

## Core idea

Frontmatter is the **router** and **execution configuration**:
- It determines when the model discovers a skill
- It controls whether Claude can invoke it automatically
- It can constrain tools and permissions
- It can turn a skill into an isolated subagent task (`context: fork`)

## Recommended defaults

For most skills:
- Include `name` and `description`
- Leave other fields unset unless you need them

For risky workflows:
- Prefer `disable-model-invocation: true`
- Restrict tools with `allowed-tools`

---

## Field reference

### name (recommended)
A short identifier (typically hyphen-case). Prefer matching the directory name.

**Guidance**
- Keep it stable over time; it becomes part of users' workflows.
- Avoid generic names like `helper` or `utils`.

Example:
```yaml
name: write-skills
```

---

### description (critical)
This is the primary routing signal. It should include:
- what the skill does
- when it should be used
- key trigger terms

Example:
```yaml
description: Create or revise Claude Code–compatible Agent Skills (SKILL.md + optional references/, scripts/, assets/). Use when asked to design a new skill, improve an existing skill, or integrate skills with subagents.
```

---

### argument-hint (optional)
A UI hint for how to call the skill as a command.

Example:
```yaml
argument-hint: "[topic] (optional: constraints)"
```

---

## Invocation controls

### disable-model-invocation: true (optional)
**Meaning:** only the user can invoke the skill (manual `/skill-name`).

**Use when**
- the skill has side effects
- you want the user to decide timing (deploy, commit, send-message)
- you don't want Claude "opportunistically" running it

Example:
```yaml
disable-model-invocation: true
```

---

### user-invocable: false (optional)
**Meaning:** Claude can invoke the skill automatically, but the user won't see it as a manual command.

**Use when**
- it's background knowledge that should guide work
- it's not meaningful as an explicit action

Example:
```yaml
user-invocable: false
```

---

## Tool control

### allowed-tools (optional)
Restrict which tools this skill can use when invoked.

**Use when**
- you want to harden safety
- you want deterministic, minimal capability

Example patterns:
```yaml
allowed-tools: Read, Grep, Glob
```

Tool patterns can sometimes be scoped (e.g., CLI subcommands) depending on the runtime:
```yaml
allowed-tools: Bash(gh:*)
```

**Design guidance**
- Prefer minimal allowlists for risky skills.
- If a skill needs broad power, consider placing the risky part behind a manual-only command.

---

## Forked execution (skills as "tasks")

### context: fork (optional)
Run the skill in an isolated context (like a subagent). The skill body becomes the subagent prompt.

**Use when**
- you want isolation from the main conversation
- you want a dedicated agent type (Explore/Plan)
- the skill is best expressed as a complete task prompt

Example:
```yaml
context: fork
agent: Explore
```

**Critical note**
If you set `context: fork`, the skill body must include a real task prompt. Pure guidelines without a task often produce empty output.

---

### agent (optional)
Select which subagent configuration executes the forked skill.

Common options:
- `Explore` for read-only exploration
- `Plan` for planning research
- `general-purpose` for full toolset

You can also target a custom agent from `.claude/agents/`.

---

## Prompt preprocessing in skills (advanced)

Some runtimes support "preprocessing placeholders" that execute before the model sees the prompt.
If you use this pattern:
- ensure commands are read-only (or use manual-only invocation)
- ensure outputs are safe to inject (avoid secrets)

---

## Extended thinking (optional)

If you need deeper deliberation, you can explicitly request it in the skill body.
Use sparingly: it increases cost and latency.

---

## Subagent composition: the reverse direction

Instead of `context: fork`, you can preload skills into a subagent (in subagent frontmatter):

```yaml
skills: write-docs, data-model-changes
```

This injects skill bodies into that subagent's context as reference material.
