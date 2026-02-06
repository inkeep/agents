---
name: pr-review-subagents-guidelines
description: |
  Best practices for writing and improving pr-review-* subagents.
  Use when creating new reviewers, improving existing ones, or understanding reviewer design patterns.
user-invocable: false
disable-model-invocation: true
---

# PR Review Subagent Guidelines

## Intent

This skill documents best practices for designing and improving `pr-review-*` subagents.

**Use this skill when:**
- Creating a new pr-review-* subagent
- Improving an existing pr-review-* subagent
- Understanding what makes a good reviewer prompt
- Proposing changes to reviewer prompts (e.g., from the auto-improver)

---

## Structural Patterns

All `pr-review-*` agents should follow this structure:

### 1. Frontmatter

```yaml
---
name: pr-review-{domain}
description: |
  {Brief description of what this reviewer does}
  {When it should be spawned}
  {Focus statement}

<example>
Context: {situation that SHOULD delegate}
user: "{user message}"
assistant: "{assistant response before delegating}"
<commentary>
{Why this matches the trigger conditions}
</commentary>
assistant: "I'll use the pr-review-{domain} agent."
</example>

<example>
Context: {near-miss that SHOULD NOT delegate}
user: "{user message}"
assistant: "{assistant response that stays in the main thread}"
<commentary>
{Why this is a near-miss / exclusion}
</commentary>
</example>

tools: Read, Grep, Glob, Bash
disallowedTools: Write, Edit, Task
skills:
  - pr-context
  - product-surface-areas
  - pr-review-output-contract
model: {opus|sonnet}
permissionMode: default
---
```

**Key requirements:**
- Include **2+ examples** in the description (at least one positive, one near-miss)
- Use `disallowedTools: Write, Edit, Task` — reviewers are read-only
- Always include `pr-review-output-contract` in skills
- Choose model based on reasoning demand (Opus for Tier 1, Sonnet for Tier 2-3)

### 2. Role & Mission (2-4 sentences)

Define what excellence looks like for this reviewer:

```markdown
# Role & Mission

You are a **{Role Title}** responsible for {primary responsibility}.

You focus on {specific focus area}. Your value is {what makes this reviewer valuable}.
```

**Good example:**
> You are a **Consistency Reviewer** responsible for keeping the codebase coherent and predictable as it evolves.
>
> Your job is to answer: **"Does this change fit the existing world?"**

**Bad example:**
> You review code for quality issues.

### 3. Scope (In/Out)

Explicitly define boundaries:

```markdown
# Scope

**In scope ({domain}):**
- {Specific concern 1}
- {Specific concern 2}
- {Specific concern 3}

**Out of scope:**
- {Explicit exclusion 1}
- {Explicit exclusion 2}
- {Explicit exclusion 3}
```

**Important:** Keep agents standalone. Don't reference other agents by name (e.g., "see pr-review-types"). Say "out of scope" instead.

### 4. Checklist Sections

Concrete, actionable checks organized by concern area:

```markdown
## {Concern Area}

For each {thing being checked}:
- {Specific check 1}
- {Specific check 2}
- {Specific check 3}

**Detection signals:**
- {Pattern that indicates this concern}
- {Another pattern}
```

### 5. Failure Modes to Avoid

Select 3-5 most relevant for this reviewer:

| Failure Mode | Description | Most Relevant For |
|--------------|-------------|-------------------|
| Flattening nuance | Treating ambiguous situations as definitively wrong | All reviewers |
| Asserting when uncertain | Stating uncertain things as facts | All reviewers |
| Padding and burying the lede | Restating same concern multiple ways | All reviewers |
| Source authority | Preferring external best practices over codebase patterns | consistency, standards |
| Speculative fearmongering | Flagging theoretical issues without plausible path | security-iam |

---

## Adding Content to Existing Reviewers

When improving a pr-review-* agent (e.g., from auto-improver findings):

### Where to Add

| Addition Type | Where to Add |
|---------------|--------------|
| New checklist item | Existing checklist section (NOT new section) |
| New failure mode | "Failure Modes to Avoid" section |
| New detection pattern | Sub-bullet under relevant checklist item |
| New example | Existing example patterns area |

**Don't create new top-level sections** unless the pattern represents an entirely new dimension of review.

### Style Matching

Before adding content, note the target file's:
- **Section structure** (how are checklist items formatted?)
- **Specificity level** (concrete examples vs abstract principles?)
- **Code snippet style** (TypeScript? Comments? Good/bad contrast?)
- **Length of items** (1-line bullets vs multi-paragraph explanations?)

Your addition MUST match the existing style.

### Duplication Check

Before adding, search the target file for:
- Similar concepts (even if phrased differently)
- Related checklist items
- Overlapping failure modes

If 80%+ overlap exists, consider refining existing content instead of adding new.

---

## Quality Bar

Every checklist item should:
- Be **actionable** (reviewer can check it mechanically)
- Have **detection signals** (what patterns indicate this concern)
- Include **examples** where helpful (good vs bad)
- Avoid **vague admonitions** ("be careful", "be thorough")

Every failure mode should:
- Be **specific to this domain** (not generic advice)
- Include **contrastive examples** where helpful
- Explain **why it's a failure** (not just what it is)
