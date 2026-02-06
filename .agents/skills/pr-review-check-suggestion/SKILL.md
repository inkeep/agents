---
name: pr-review-check-suggestion
description: |
  Pre-output validation for PR review subagents. When web search is available, verifies findings against
  current best practices. Otherwise, calibrates confidence based on knowledge dependencies.
user-invocable: false
disable-model-invocation: true
---

# PR Review: Check Suggestion

## Intent

This skill is a **pre-output validation step** for PR review subagents. Before returning findings, use this checklist to:
1. **Verify** findings via web search (when available)
2. **Calibrate** confidence based on what you can prove

**Core principle:** Only claim HIGH confidence when you can prove the issue from the code diff OR confirm it via web search. When findings depend on unverified external knowledge, calibrate confidence accordingly.

---

## When to Apply This Checklist

Apply this validation when a finding depends on **external knowledge** that could be outdated:

| Category | Example | Why Verify |
|----------|---------|------------|
| **Framework directives** | "'use memo' is not valid" | New syntax may postdate training |
| **Library API claims** | "This zod method doesn't exist" | APIs change between versions |
| **Deprecation claims** | "moment.js is deprecated" | Status may have changed |
| **Version-specific behavior** | "Doesn't work in React 18" | May work in newer versions |
| **Security advisories** | "Has known vulnerabilities" | May have been patched |
| **Best practice assertions** | "Recommended approach is X" | Community consensus shifts |

**Skip this checklist for:**
- Pure logic bugs (provable from code)
- Type mismatches (visible in diff)
- Codebase-internal consistency
- Obvious security issues (SQL injection, XSS)

---

## Validation Workflow

### Step 1: Source Check

Ask: *"Can I prove this issue from the code diff alone?"*

| Answer | Action |
|--------|--------|
| **Yes** — Logic bug, type error, null check | HIGH confidence (code is proof) |
| **No** — Depends on external knowledge | Continue to Step 2 |

### Step 2: Web Search Verification (if available)

If you have access to a web search tool, verify the finding:

**Formulate a specific query:**
```
Good: "React 19 use memo directive 2024"
Good: "Next.js 15 server actions caching behavior"
Good: "zod v3 fromJSONSchema method deprecated"
Bad:  "React hooks" (too vague)
Bad:  "is moment.js bad" (opinion-seeking)
```

**Evaluate sources (priority order):**
1. Official documentation (react.dev, nextjs.org, library GitHub)
2. GitHub issues/discussions (version-specific details)
3. Reputable tech blogs with dates (Vercel blog, library maintainers)

**Take action based on results:**

| Result | Action |
|--------|--------|
| **Confirms issue** | Keep finding, HIGH confidence. Optionally cite source. |
| **Contradicts finding** | **DROP the finding.** Do not include in output. |
| **Inconclusive** | Keep finding, MEDIUM confidence. Note uncertainty. |

### Step 3: Confidence Calibration (no web search, or inconclusive)

When you cannot verify via web search, calibrate based on knowledge dependency:

| Category | Confidence Ceiling |
|----------|-------------------|
| Library API claims | MEDIUM max |
| Framework directives | MEDIUM max |
| Deprecation claims | MEDIUM max |
| Version-specific behavior | LOW (unless version confirmed) |
| Security advisories | LOW (may be patched) |
| Best practice assertions | MEDIUM max |

### Step 4: Acknowledge Uncertainty

When confidence is MEDIUM or LOW, add a brief note:

**Good notes:**
- "Verify against project's React version"
- "Based on general best practices; confirm against current docs"
- "May have changed in recent versions"

**Bad notes:**
- "I'm not sure about this" (too vague)
- "This might be wrong" (undermines finding)

---

## Examples

### Example 1: Web search confirms → HIGH confidence

```
Finding: "'use memo' is not a valid React directive"
Step 1: Can't prove from diff (framework knowledge)
Step 2: Search "React 19 use memo directive 2024"
Result: Official docs confirm 'use memo' IS valid with React Compiler

Action: DROP finding (code is correct)
```

### Example 2: Web search confirms issue → Keep with source

```
Finding: "moment.js should be replaced with date-fns"
Step 1: Can't prove from diff (ecosystem knowledge)
Step 2: Search "moment.js maintenance mode 2024"
Result: moment.js docs confirm maintenance mode since 2020

Action: Keep finding, HIGH confidence
        Add to implications: "moment.js has been in maintenance mode since 2020"
```

### Example 3: No web search available → Calibrate confidence

```
Finding: "This Next.js caching pattern causes stale data"
Step 1: Can't prove from diff (framework behavior)
Step 2: No web search available
Step 3: Version-specific behavior → LOW confidence ceiling

Action: Keep finding, confidence: LOW
        Add note: "Verify against project's Next.js version and cache configuration"
```

### Example 4: Code-provable → HIGH confidence (skip checklist)

```
Finding: "user.profile accessed without null check"
Step 1: Type shows `user: User | undefined` — provable from diff

Action: HIGH confidence (no verification needed)
```

---

## Integration Notes

This skill is preloaded into PR review subagents. It does NOT change:
- Your output format (still JSON array per `pr-review-output-contract`)
- Your role (still read-only reviewer)
- Your scope (still your specific domain)

**Web search availability:** Use whatever web search tool is available to you (e.g., `web_search_exa`, `firecrawl_search`, `WebSearch`). If no web search is available, fall back to confidence calibration only.

---

## Why This Matters

**Verified findings build trust:**
- Web-confirmed issues can be HIGH confidence
- Developers trust the review system more

**Unverified over-confidence causes harm:**
- Wastes time investigating non-issues
- Erodes trust when findings are wrong
- Real issues get dismissed with false positives

**Calibrated confidence is actionable:**
- HIGH = "definitely fix this"
- MEDIUM = "likely an issue, worth checking"
- LOW = "flagging for awareness, verify before acting"
