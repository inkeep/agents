Use when: Skills with many discrete rules that need priority ordering and on-demand loading
Priority: P1
Impact: Poor rule organization; hard to navigate; rules loaded unnecessarily

---

---
name: <skill-name>
description: <Large rule set. Include key triggers and what domains it covers.>
---

# <Skill Title>

## Audience assumptions
- Default: the reader has **no prior context**. This index must stand alone.
- Default format: **Markdown**, optimized for human scanning (headings, lists, short bullets).
- The index should be concise: avoid repeating the full content of rules here.

## How to use this skill
- Start from the user's goal and constraints; use the user's terminology where it clarifies what they mean.
- Use this file to pick relevant rules quickly.
- Load individual rule files only when needed (avoid pulling in irrelevant rules).
- If the task includes large unstructured artifacts (notes/logs/transcripts/tool outputs), treat them as **fallible evidence**:
  - extract what supports the task's scope and success criteria
  - set aside the rest unless the user explicitly asks you to use it

## Priorities (default ordering)
1. **CRITICAL**: <category>
2. **HIGH**: <category>
3. **MEDIUM**: <category>
4. **LOW**: <category>

## Rule selection guidance
- Prefer the smallest set of rules that covers the task correctly.
- Match strictness to intent:
  - "must/never" → prioritize CRITICAL/HIGH rules and enforce them
  - "generally/typically" → treat as defaults with explicit escape hatches
- Avoid unnecessary repetition across rules:
  - keep each rule focused on one enforceable constraint
  - use the index line to summarize the rule in one sentence (don't restate the whole rule)

## Rule index
### CRITICAL
- [rule-name](rules/rule-name.md): <one-sentence summary of what it enforces/prevents>

### HIGH
- [rule-name](rules/rule-name.md): <one-sentence summary>

### MEDIUM
- [rule-name](rules/rule-name.md): <one-sentence summary>

### LOW
- [rule-name](rules/rule-name.md): <one-sentence summary>
