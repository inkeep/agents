# Skill with Forked Context Template

**When to use:** Reusable `/slash-command` workflows where you want execution isolated from the main conversation context. Good for high-volume operations or when you want subagent-like isolation without creating a standalone subagent.

Create at: `.claude/skills/<skill-name>/SKILL.md`

---

```markdown
---
name: [TODO: skill-name]
description: [TODO: what it does + when to use it]
disable-model-invocation: true
context: fork
agent: [TODO: subagent-type OR omit to use default fork agent]
# allowed-tools: Read, Grep, Bash
---

# [TODO: Skill Title]

[TODO: Write step-by-step workflow instructions here.]

## Workflow
- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

## Output contract
[TODO: Define required output format]
```

---

**Notes:**

* `context: fork` runs this skill in a forked subagent context.
* Use `agent:` to pick a specific subagent type (e.g., `Explore`, `Plan`).
* `disable-model-invocation: true` makes it manual-only (user must invoke with `/skill-name`).
* Keep the skill body focused; move large references to supporting files in the same directory.
* If you observe the skill running inline (no isolation), treat `context: fork` as unavailable in your current environment and fall back to a subagent (or explicit Task invocation) until isolation works.
