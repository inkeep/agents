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
1. **Verify issues** via web search (is this really a problem?)
2. **Verify fixes** via web search (what's the best solution?)
3. **Calibrate** confidence based on what you can prove

**Core principle:** Only claim HIGH confidence when you can prove the issue from the code diff OR confirm it via web search. When findings depend on unverified external knowledge, calibrate confidence accordingly. The same applies to fixes — look up current best practices before prescribing solutions.

---

## When to Apply This Checklist

### For Issue Validation

Apply when a finding depends on **external knowledge** that could be outdated:

| Category | Example | Why Verify |
|----------|---------|------------|
| **Framework directives** | "'use memo' is not valid" | New syntax may postdate training |
| **Library API claims** | "This zod method doesn't exist" | APIs change between versions |
| **Deprecation claims** | "moment.js is deprecated" | Status may have changed |
| **Version-specific behavior** | "Doesn't work in React 18" | May work in newer versions |
| **Security advisories** | "Has known vulnerabilities" | May have been patched |
| **Best practice assertions** | "Recommended approach is X" | Community consensus shifts |

**Skip issue validation for:**
- Pure logic bugs (provable from code)
- Type mismatches (visible in diff)
- Codebase-internal consistency
- Obvious security issues (SQL injection, XSS)

### For Fix Verification

Apply when proposing a fix that depends on **current best practices**:

| Category | Example | Why Verify |
|----------|---------|------------|
| **Idiomatic patterns** | "Use useCallback here" | Hook patterns evolve |
| **Library-specific APIs** | "Use zod.coerce() instead" | API may have better alternatives |
| **Migration paths** | "Upgrade to App Router" | Migration guides have specific steps |
| **Security fixes** | "Sanitize with DOMPurify" | Recommended libraries change |
| **Performance patterns** | "Use React.memo()" | Optimization guidance evolves |
| **Error handling** | "Use Result type" | Patterns vary by ecosystem |

**Skip fix verification for:**
- Obvious fixes (add null check, fix typo)
- Codebase-internal patterns (follow existing conventions)
- Simple refactors (extract function, rename variable)

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

**Version check (for library/package-specific searches):**
Before formulating your query, confirm the relevant package version(s) from the repo (e.g., `package.json`, lockfile, framework config). Use the actual version in your search queries and reasoning — not assumed versions from training data. Not all searches require this; skip for general patterns, language-level issues, or non-versioned concerns.

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
| **Confirms issue** | Keep finding, HIGH confidence. Cite the authoritative source in `references`. |
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

## Fix Verification Workflow

After validating the issue, verify your proposed fix is current best practice.

### Step F1: Does the fix require external knowledge?

| Answer | Action |
|--------|--------|
| **No** — Obvious fix (null check, typo, simple refactor) AND does not change how a third-party library/framework/SDK is called or configured | HIGH fix_confidence |
| **Yes** — Requires knowing current patterns/APIs, OR changes how a third-party library/framework/SDK is used (imports, method calls, configuration, hook usage, etc.) | Continue below |

**Rule: any fix that changes third-party library/framework usage MUST go through Step F2 (web search) before the finding can claim `fix_confidence: HIGH`.** Codebase prior art alone is insufficient — the existing code may itself use outdated patterns. Check the codebase first to understand context and existing conventions, then verify against current upstream documentation.

**Before external search:** Look for existing patterns, utilities, or conventions in the codebase that address the same concern. Cite any prior art as a "related code elsewhere" reference. Then proceed to Step F2 to verify the pattern is current best practice — even if you found codebase prior art.

### Step F2: Web Search for Best Practice (REQUIRED for third-party code)

**This step is mandatory** when the fix changes how any third-party library, framework, or SDK is used — regardless of whether codebase prior art exists. If no web search tool is available, cap `fix_confidence` at MEDIUM (see Step F3).

**Version check:** Before formulating your query, confirm the relevant package version(s) from the repo (e.g., `package.json`, lockfile, framework config). Use the actual version in your search queries — APIs, patterns, and recommended practices vary between versions. If the version you confirmed differs from what you assumed, re-evaluate your fix before searching.

**Formulate a version-specific query for the solution:**
```
Good: "React 19 recommended way to memoize components 2024"
Good: "Next.js 15 server actions error handling pattern"
Good: "drizzle-orm 0.35 query builder best practice"
Bad:  "how to fix React" (too vague, no version)
Bad:  "best library for X" (opinion-seeking)
```

**Evaluate sources for fix quality:**
1. Official documentation (canonical patterns)
2. Library maintainer blogs/guides (authoritative)
3. GitHub examples from the library itself (real usage)
4. Source code for open source libraries

**Take action based on results:**

| Result | Action |
|--------|--------|
| **Found authoritative pattern** | Use it. HIGH fix_confidence. **Cite the source in references.** |
| **Multiple valid approaches** | Pick one, mention alternatives. MEDIUM fix_confidence. |
| **Outdated or conflicting info** | Describe approach, note uncertainty. LOW fix_confidence. |

### Step F3: Fix Confidence Calibration (no web search, or inconclusive)

When you cannot verify the fix approach via web search, **you cannot claim HIGH fix_confidence for any fix that changes third-party library/framework usage**:

| Category | Fix Confidence Ceiling |
|----------|------------------------|
| Third-party library/framework API usage | MEDIUM max (HIGH requires Step F2 verification) |
| Framework-specific patterns | MEDIUM max |
| Security remediation | LOW (unless verified) |
| Performance optimization | MEDIUM max |
| Migration/upgrade paths | LOW (version-specific) |

### Step F4: Cite Sources in Fix

When you verify a fix via web search, **include the source in your references**:

```json
{
  "references": [
    "[src/components/VirtualList.tsx:88 — memoization pattern](https://github.com/.../VirtualList.tsx#L88)",
    "[React useMemo docs](https://react.dev/reference/react/useMemo)",
    "[When to use useMemo](https://react.dev/reference/react/useMemo#should-you-add-usememo-everywhere)"
  ]
}
```

This grounds your fix recommendation in authoritative sources.

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
        references: Add "[Moment.js docs: project status](https://momentjs.com/docs/#/-project-status/)"
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

### Example 5: Fix verification → Found authoritative pattern

```
Issue: "Expensive computation in render loop"
Fix needed: Memoization pattern

Step F1: Requires knowing current React patterns
Step F2: Search "React 19 useMemo vs React Compiler 2024"
Result: React docs show useMemo still valid, but React Compiler may auto-optimize

Action: fix_confidence: HIGH
        fix: "Wrap in useMemo() for explicit memoization"
        references: Add "[React useMemo docs](https://react.dev/reference/react/useMemo)"
```

### Example 6: Fix verification → Multiple valid approaches

```
Issue: "Date parsing is brittle"
Fix needed: Date library recommendation

Step F1: Requires knowing ecosystem options
Step F2: Search "JavaScript date library comparison 2024"
Result: Multiple valid options (date-fns, dayjs, Temporal API)

Action: fix_confidence: MEDIUM
        fix: "Consider date-fns (lightweight) or dayjs (moment-compatible API)"
        references: Cite the docs/specs for the options you mention (e.g., Temporal proposal, date-fns docs, dayjs docs)
        Add note: "Choice depends on bundle size constraints and API preferences"
```

### Example 7: Fix verification → No web search available

```
Issue: "Server action doesn't handle errors"
Fix needed: Error handling pattern for Next.js App Router

Step F1: Requires knowing Next.js patterns
Step F2: No web search available
Step F3: Framework-specific pattern → MEDIUM max

Action: fix_confidence: MEDIUM
        fix: "Wrap in try-catch and return { error: string } union type"
        Add note: "Verify against Next.js App Router error handling docs"
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

**Verified fixes are actionable:**
- Cited sources let developers verify recommendations
- Current best practices avoid outdated advice
- Official docs > training data assumptions

**Unverified over-confidence causes harm:**
- Wastes time investigating non-issues
- Erodes trust when findings are wrong
- Real issues get dismissed with false positives
- Outdated fix recommendations create new problems

**Calibrated confidence is actionable:**
- HIGH = "definitely fix this"
- MEDIUM = "likely an issue, worth checking"
- LOW = "flagging for awareness, verify before acting"

**Calibrated fix_confidence guides effort:**
- HIGH = "apply this fix as-is"
- MEDIUM = "directionally correct, may need adjustment"
- LOW = "starting point, verify approach before implementing"
