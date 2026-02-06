---
name: pr-review-check-suggestion
description: |
  Pre-output confidence calibration for PR review subagents. Helps calibrate confidence levels when
  findings depend on external knowledge (library APIs, framework features, best practices) that may
  be version-specific or have evolved since training.
user-invocable: false
disable-model-invocation: true
---

# PR Review: Check Suggestion (Confidence Calibration)

## Intent

This skill is a **pre-output confidence calibration step** for PR review subagents. Before returning findings, use this checklist to ensure your confidence levels accurately reflect what you can prove from the code vs what depends on external knowledge.

**Core principle:** Only claim HIGH confidence when you can prove the issue from the code diff alone. When findings depend on external facts (library behavior, framework features, best practices), acknowledge uncertainty.

---

## Confidence Calibration Rules

### HIGH Confidence — Use only when:

- Issue is **provable from the code diff** (type errors, null checks, logic bugs)
- Issue is a **clear code smell** (empty catch blocks, obvious XSS)
- Issue involves **codebase-internal consistency** (naming within this repo)
- You have **zero reliance on external knowledge** about library/framework behavior

### MEDIUM Confidence — Use when:

- Finding depends on **library API behavior** you're confident about but can't prove
- Finding involves **framework patterns** that may have version-specific nuances
- Finding is a **best practice** that has general consensus but may have exceptions
- You're **reasonably sure** but the claim depends on facts outside the diff

### LOW Confidence — Use when:

- Finding depends on **version-specific behavior** and version is unclear
- Finding involves **evolving best practices** where consensus may have shifted
- You're **uncertain** whether the pattern is correct in the current ecosystem
- The claim is based on **general knowledge** that could be stale

---

## Pre-Output Checklist

For each finding before including it in your output:

### Step 1: Source Check

Ask: *"Can I prove this issue from the code diff alone?"*

| Answer | Action |
|--------|--------|
| **Yes** — Logic bug, type error, null check, codebase convention | Use HIGH confidence (code is proof) |
| **No** — Depends on library/framework/ecosystem knowledge | Continue to Step 2 |

### Step 2: Knowledge Dependency Classification

Classify the external knowledge your finding depends on:

| Category | Confidence Ceiling | Notes |
|----------|-------------------|-------|
| **Library API claims** ("this method doesn't exist") | MEDIUM max | APIs change between versions |
| **Framework directives** ("this isn't valid syntax") | MEDIUM max | New syntax may postdate training |
| **Deprecation claims** ("this is deprecated") | MEDIUM max | Status may have changed |
| **Version-specific behavior** ("doesn't work in v18") | LOW unless version confirmed | May work in other versions |
| **Security advisories** ("has known vulnerabilities") | LOW | May have been patched |
| **Best practice assertions** ("recommended approach is X") | MEDIUM max | Community consensus shifts |

### Step 3: Acknowledge Uncertainty

When confidence is MEDIUM or LOW due to external knowledge dependency, include a brief note in the `issue` or `implications` field:

**Good uncertainty notes:**
- "Assuming no external validation, this type constraint is too loose"
- "This pattern may be correct in newer React versions — verify against project's React version"
- "Based on general best practices; confirm against library's current recommendations"

**Bad uncertainty notes:**
- "I'm not sure about this" (too vague)
- "This might be wrong" (undermines the finding)

---

## When to Skip This Checklist

Apply normal confidence ratings without this process for:

- **Pure logic bugs** — determinable from code (off-by-one, race conditions, null errors)
- **Type mismatches** — visible in the code itself
- **Codebase-internal consistency** — naming/patterns within this repo
- **Obvious security issues** — SQL injection with string concat, XSS with innerHTML
- **Architecture/design opinions** — judgment calls, not verifiable facts

---

## Examples

### Example 1: Knowledge-dependent finding → Calibrate to MEDIUM

```
Original finding: "'use memo' is not a valid React directive" (confidence: HIGH)

Check: Can I prove this from the diff? No — depends on React version/compiler support.
Classification: Framework directive → MEDIUM max

Calibrated: confidence: MEDIUM
            issue: "...(Note: may be valid with React Compiler — verify React version)"
```

### Example 2: Code-provable finding → Keep HIGH

```
Finding: "user.profile accessed without null check when user can be undefined"

Check: Can I prove this from the diff? Yes — type shows `user: User | undefined`

Action: Keep confidence: HIGH (code is proof)
```

### Example 3: Best practice claim → Calibrate to MEDIUM

```
Original finding: "Use date-fns instead of moment.js" (confidence: HIGH)

Check: Can I prove this from the diff? No — depends on current ecosystem recommendations.
Classification: Best practice assertion → MEDIUM max

Calibrated: confidence: MEDIUM
            implications: "...moment.js has been in maintenance mode; consider migration"
```

### Example 4: Version-specific claim → Calibrate to LOW

```
Original finding: "This caching pattern causes stale data in Next.js 15"

Check: Can I prove this from the diff? No — depends on Next.js version and cache config.
Classification: Version-specific behavior → LOW unless version confirmed

Calibrated: confidence: LOW
            issue: "...(verify against project's Next.js version and cache configuration)"
```

---

## Integration Notes

This skill is preloaded into PR review subagents. It does NOT change:
- Your output format (still JSON array per `pr-review-output-contract`)
- Your role (still read-only reviewer)
- Your scope (still your specific domain)

Think of this as a mental checklist that prevents over-confident claims about external facts. **Your findings are more valuable when confidence levels are honest.**

---

## Why This Matters

**Over-confident findings cause harm:**
- Developers waste time investigating non-issues
- Trust in the review system erodes
- Real issues get dismissed along with false positives

**Calibrated confidence builds trust:**
- HIGH confidence means "definitely fix this"
- MEDIUM confidence means "likely an issue, worth checking"
- LOW confidence means "flagging for awareness, verify before acting"
