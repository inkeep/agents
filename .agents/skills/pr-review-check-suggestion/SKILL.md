---
name: pr-review-check-suggestion
description: |
  Pre-output validation checklist for PR review subagents. Helps verify findings against current best practices
  before including them in output. Use when a finding depends on external knowledge (library APIs, framework
  features, deprecated patterns) that could be outdated.
user-invocable: false
disable-model-invocation: true
---

# PR Review: Check Suggestion

## Intent

This skill is a **pre-output validation step** for PR review subagents. Before returning your findings, use this checklist to catch cases where your knowledge may be outdated or incomplete.

**What this does:**
- Helps you avoid false positives from stale knowledge (APIs change, frameworks evolve, best practices shift)
- Gives you a structured way to verify uncertain findings via web search
- Increases confidence in findings that are confirmed by current sources

**What this does NOT do:**
- Change your output format (you still return the same JSON array)
- Spawn subagents or invoke external tools beyond WebSearch
- Apply to every finding (most findings don't need this)

---

## When to Use This Checklist

Apply this validation **only when BOTH conditions are true:**

1. **External knowledge dependency** — The finding's correctness depends on facts outside this codebase (library behavior, framework features, community best practices)
2. **Plausible uncertainty** — There's a reasonable chance your knowledge is stale or incomplete

### Trigger Examples

| Category | Example Finding | Why Verify |
|----------|----------------|------------|
| **Framework directives** | "'use memo' is not a valid directive" | New syntax may postdate training data |
| **Library API claims** | "This zod method doesn't exist" | APIs change between versions |
| **Deprecation claims** | "moment.js is deprecated, use date-fns" | Need to confirm current status |
| **Version-specific behavior** | "This pattern doesn't work in React 18" | May work in newer versions |
| **Security advisories** | "This package has known vulnerabilities" | May have been patched |
| **Performance claims** | "This causes unnecessary re-renders" | Framework optimizations evolve |
| **Best practice assertions** | "The recommended approach is X" | Community consensus shifts |

### Skip This Checklist When

- **Pure logic bugs** — null checks, off-by-one errors, race conditions (determinable from code)
- **Type mismatches** — visible in the code itself
- **Codebase-internal consistency** — naming conventions, patterns within this repo
- **Obvious security issues** — SQL injection with string concat, XSS with innerHTML
- **HIGH confidence from code analysis** — you can prove it from the diff alone
- **Architecture/design opinions** — judgment calls, not verifiable facts

---

## Validation Workflow

For each finding before including it in your output:

### Step 1: Trigger Check

Ask: *"Does this finding depend on external knowledge that could be outdated?"*

- **No** → Include finding as-is, move to next finding
- **Yes** → Continue to Step 2

### Step 2: Formulate Search Query

Create a specific, time-bounded query:

**Good queries:**
- `"React 19 use memo directive 2024"`
- `"Next.js 15 server actions best practices"`
- `"zod v3 fromJSONSchema method"`
- `"moment.js maintenance mode 2024"`

**Bad queries:**
- `"React hooks"` (too vague)
- `"is moment.js bad"` (opinion-seeking)
- `"best JavaScript library"` (not specific to the finding)

### Step 3: Search and Evaluate

Use WebSearch with 1-2 queries maximum per finding.

**Source priority:**
1. Official documentation (react.dev, nextjs.org, library GitHub)
2. GitHub issues/discussions (often has version-specific details)
3. Reputable tech blogs (Vercel blog, Kent C. Dodds, etc.)

**Ignore:**
- Random Medium posts without dates
- Stack Overflow answers older than 2 years
- Sources that don't cite versions

### Step 4: Decision

Based on research results:

| Result | Action |
|--------|--------|
| **Research confirms issue** | Keep finding. Optionally add source to `implications` field. |
| **Research contradicts finding** | **DROP the finding.** Do not include it in output. |
| **Research is inconclusive** | Keep finding with `confidence: "MEDIUM"`. Add note about uncertainty in `issue` field. |

---

## Examples

### Example 1: Should verify → DROP

```
Finding: "'use memo' is not a valid React directive"
Trigger: Framework directive I'm uncertain about

Step 2 query: "React compiler use memo directive 2024"
Step 3 result: Official React docs confirm 'use memo' is valid with React Compiler
Step 4: DROP finding (code is correct)
```

### Example 2: Should verify → KEEP with higher confidence

```
Finding: "Use date-fns instead of moment.js for better bundle size"
Trigger: "Best practice" claim about library preference

Step 2 query: "moment.js vs date-fns 2024 recommendation"
Step 3 result: moment.js in maintenance mode since 2020, date-fns recommended
Step 4: KEEP finding, confidence: HIGH
```

### Example 3: Should verify → KEEP with uncertainty noted

```
Finding: "This Next.js caching pattern may cause stale data"
Trigger: Framework-specific behavior I'm unsure about

Step 2 query: "Next.js 15 cache revalidation patterns"
Step 3 result: Mixed signals, behavior depends on configuration
Step 4: KEEP finding, confidence: MEDIUM, add note: "Behavior depends on cache configuration"
```

### Example 4: Skip verification

```
Finding: "Possible null pointer: user.name accessed without null check"
Trigger check: No — determinable from code analysis alone

Action: Include finding as-is (no web search needed)
```

---

## Integration Notes

This skill is preloaded into PR review subagents. It does NOT change:
- Your output format (still JSON array per `pr-review-output-contract`)
- Your role (still read-only reviewer)
- Your scope (still your specific domain)

Think of this as a mental checklist you run before finalizing your output — a quality gate that catches knowledge-dependent false positives.

---

## Failure Modes to Avoid

| Failure Mode | Why It's Bad | Instead |
|--------------|--------------|---------|
| Searching for every finding | Wastes time, most findings don't need it | Only search when trigger conditions met |
| Vague queries | Returns unhelpful results | Be specific: library name + version + feature + year |
| Trusting random blogs | May be outdated or wrong | Prioritize official docs and GitHub |
| Dropping findings without research | May discard valid issues | Only drop if research contradicts |
| Over-qualifying with uncertainty | Makes findings less actionable | Only add uncertainty notes when genuinely unsure |
