# Ralph Loop Instructions

You are an autonomous coding agent running in a loop. Each iteration you get a fresh context but memory persists via git history, `progress.txt`, and `prd.json`.

## Your Task

1. **Read the PRD**: Check `prd.json` for user stories and their completion status
2. **Check Progress**: Read `progress.txt` for learnings from previous iterations
3. **Verify Branch**: Ensure you're on the correct feature branch
4. **Select Story**: Pick the highest-priority incomplete user story (`passes: false`)
5. **Implement**: Write the code to complete the story
6. **Verify Quality**: Run typecheck, lint, and tests - all must pass
7. **Commit**: Create a focused commit with message format: `[story-id] description`
8. **Update PRD**: Set `passes: true` for completed stories in `prd.json`
9. **Log Progress**: Append to `progress.txt` with:
   - What you implemented
   - Files changed
   - Learnings section (patterns discovered, gotchas, insights)

## Progress Log Format

Append to `progress.txt`:

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

## Completion

When ALL user stories in `prd.json` have `passes: true`:

1. Verify all tests pass one final time
2. Output exactly this on its own line: `<promise>COMPLETE</promise>`

**CRITICAL**: If stories remain incomplete, simply end your response. Do NOT mention, quote, or reference the completion signal in your output - the detection is literal string matching, so even discussing it triggers false completion!

## Important Rules

- One story per iteration - keep changes focused
- Always run tests before committing
- Never skip the progress log
- If stuck, document the blocker in progress.txt and move to next story
- Follow existing code patterns in the codebase
