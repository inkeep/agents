Use when: Adding test prompts, defining pass criteria, iterating on skill behavior
Priority: P1
Impact: Regressions go unnoticed; no baseline for quality; hard to debug failures

---

# Testing and Iteration

## Why test skills?

A skill is a "prompt program." You should expect:
- brittle edge cases
- behavior differences across models/runtimes
- regressions when you edit structure

Testing catches these early.

---

## Minimal test plan (recommended baseline)

Create 3–8 test prompts that cover:
- the most common use cases
- one or two known failure modes
- one tricky edge case

For each test prompt:
- define what "pass" means (short checklist)
- store the prompt somewhere stable (issue, doc, or references file)

---

## A practical iteration loop

1. Run without the skill → note failure modes
2. Add the smallest instruction that fixes the failure
3. Re-run tests
4. If the skill grows too large, split into references/ or rules/

---

## Cross-model / cross-runtime considerations

Behavior can differ when:
- model differs (smaller models may need more scaffolding)
- tool availability differs (CLI vs CI reviewers vs SDK)
- permissions differ (tool denials can break workflows)

Test where you deploy.

---

## Avoid time-sensitive rules

Prefer patterns like:
- "If you see legacy patterns, do X"
instead of:
- "If it's before 2025, do X"

If you must include time sensitivity:
- isolate it under an "Old patterns / migrations" section
- keep it concise
