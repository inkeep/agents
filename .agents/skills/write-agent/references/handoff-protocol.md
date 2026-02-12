Use when: Designing handoff packets between parent and subagent; structuring return packets; multi-phase chaining
Priority: P1
Impact: Missing or malformed handoffs cause subagents to lack needed context or return unusable results

---

# Parent ↔ Subagent Handoff Protocol (Reference)

Subagents start with fresh context, so reliable outcomes depend on structured handoffs.

## Parent → Subagent: Handoff Packet Template

Copy/paste this into the parent's Task prompt (or into your request when invoking a subagent):

---
TASK HANDOFF
- Objective:
- Why this is needed (1 sentence):
- Scope (in-scope):
- Non-goals (out-of-scope):
- Target files / areas:
- Constraints (must / must-not):
- Preferred approach (if any):
- Required checks (tests/linters/commands):
- Output format required:
- Verbosity limit:
- "Done" means:
- If blocked, do:
---

Notes:
- If you already know the files, include them.
- If the agent must avoid edits, say so explicitly and restrict tools in frontmatter.

## Subagent → Parent: Return Packet Template

Require the subagent to respond in this format:

---
RETURN PACKET
## TL;DR (2–5 bullets)

## Findings (prioritized)
- Critical:
- Warnings:
- Suggestions:

## Evidence
- Files + line ranges (or code excerpts kept short)
- Commands run + key outputs (truncate)

## Recommended next actions
1.
2.
3.

## Open questions / assumptions
- (Only list what materially affects next steps)
---

## Bidirectional Iteration Patterns

### Pattern 1: One-shot summary
Best when:
- the task is self-contained,
- the parent will do the implementation.

### Pattern 2: Resume loop
Best when:
- the task is iterative or large,
- you want the same subagent instance to keep its own context/history.

Instruction for the parent:
- "Continue the previous subagent work and now do X. Keep the same output contract."

### Pattern 3: Chain subagents via the parent
Best when:
- you need different expertise phases (review → implement → validate).

Approach:
1) Parent delegates to subagent A; gets return packet.
2) Parent extracts the minimal relevant pieces and passes them into subagent B's handoff.
3) Repeat.

Avoid:
- Copying entire transcripts between subagents (wastes tokens).
