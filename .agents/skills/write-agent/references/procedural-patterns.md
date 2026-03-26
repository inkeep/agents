Use when: Writing validation loops, iteration policies, or error handling in agent prompts
Priority: P2
Impact: Without procedural patterns, agents may infinite-loop, skip validation, or fail ungracefully

---

# Procedural Patterns for Agent Prompts

When agent tasks involve iteration, validation, or error handling, use these patterns to make behavior predictable and bounded.

---

## Validation Loops

Use when an agent needs to verify its work before returning.

**Pattern:**
```
Do → Verify → Fix (if needed) → Re-verify → Return
```

**Example in agent prompt:**
```markdown
## Validation loop

1. Complete the implementation
2. Run `npm test` and capture output
3. If tests fail:
   - Fix the failing tests (max 2 fix attempts)
   - Re-run tests after each fix
4. If tests still fail after 2 attempts:
   - Return findings with `status: BLOCKED`
   - Include error output and what you tried
5. If tests pass: return findings with `status: COMPLETE`
```

**Key elements:**
- Bounded iterations (max N attempts)
- Clear termination condition
- Explicit failure path with useful output

---

## Iteration Policies

Use when an agent may need multiple passes to complete a task.

**Pattern:**
```markdown
## Iteration policy

- Max iterations: [N] (e.g., 1-3)
- Loop-back triggers: [conditions that warrant another pass]
- Termination: [when to stop even if incomplete]
- Output on termination: [what to return if hitting max iterations]
```

**Example:**
```markdown
## Iteration policy

- Max iterations: 3
- Loop-back when:
  - New issues discovered that weren't in the original scope
  - Review feedback requires changes
- Terminate when:
  - All issues resolved, OR
  - Max iterations reached, OR
  - Blocked on external dependency
- On termination: return findings with current status and remaining work
```

---

## Error Handling (Graceful Degradation)

Use when an agent might encounter errors that shouldn't crash the entire task.

**Pattern:**
```markdown
## Error handling

- If [action] fails: [fallback behavior]
- If blocked on [dependency]: [what to return]
- Never: [what to avoid doing on error]
```

**Example:**
```markdown
## Error handling

- If file read fails: skip that file, note it in findings, continue with others
- If tests won't run: return what you have with `status: BLOCKED` and the error
- If API calls fail: retry once, then report the failure
- Never: silently swallow errors or proceed as if nothing happened
```

---

## Decision Trees

Use when an agent needs to choose between paths based on conditions.

**Pattern:**
```
If [condition]:
  → Do [action A]
  → Return [format A]
Else if [condition]:
  → Do [action B]
  → Return [format B]
Else:
  → [default action]
```

**Example in agent prompt:**
```markdown
## Handling different file types

If the file is a test file (`*.test.ts`, `*.spec.ts`):
  → Focus on test coverage and assertions
  → Skip style/formatting issues

If the file is a config file (`*.config.*`, `*.json`):
  → Check for security issues (exposed secrets, unsafe defaults)
  → Skip code quality checks

Otherwise:
  → Apply full review checklist
```

---

## Severity Levels

Use when an agent needs to prioritize or categorize findings.

**Standard levels:**
- **CRITICAL:** Must fix before proceeding; blocks the task
- **HIGH:** Should fix; significant impact on quality/safety
- **MEDIUM:** Worth fixing; moderate impact
- **LOW:** Nice to have; minor improvement

**Usage in prompts:**
```markdown
## Severity classification

- CRITICAL: Security vulnerabilities, data loss risks, breaking changes to public APIs
- HIGH: Bugs that affect users, performance regressions, missing error handling
- MEDIUM: Code quality issues, missing tests for new code, inconsistent patterns
- LOW: Style preferences, minor refactoring opportunities, documentation gaps

Prioritize CRITICAL and HIGH findings. Include MEDIUM if time permits. Skip LOW unless specifically asked.
```

---

## Emphasis Markers

Use these markers consistently to signal importance:

| Marker | Meaning | When to use |
|---|---|---|
| **CRITICAL:** | Non-negotiable; failure to follow causes serious harm | Safety constraints, security rules, data integrity |
| **MUST** / **NEVER** | Hard requirement / Hard prohibition | Core correctness rules |
| **SHOULD** | Strong default with exceptions | Best practices with escape hatches |
| **CONSIDER** / **MAY** | Suggestion; use judgment | Optional improvements |

**Example:**
```markdown
## Constraints

- **CRITICAL:** Never commit secrets or credentials
- You MUST run tests before returning
- You SHOULD follow existing patterns in the codebase
- Consider adding inline comments for complex logic
```

---

## Combining Patterns

For complex agents, combine patterns:

```markdown
## Workflow

1. Gather context (read files, understand scope)
2. Perform analysis
3. **Validation loop:**
   - Run automated checks
   - If checks fail: fix and re-run (max 2 attempts)
   - If still failing: return with `status: BLOCKED`
4. Return findings with severity classification

## Iteration policy

- Max iterations: 2
- Loop-back when: new scope discovered or blocking issue resolved
- Terminate when: all P0/P1 issues addressed or max iterations reached

## Error handling

- If file not found: skip and note in findings
- If blocked: return partial findings with clear "what's missing"
```
