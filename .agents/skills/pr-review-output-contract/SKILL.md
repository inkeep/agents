---
name: pr-review-output-contract
description: Output contract for PR review agents. Defines four finding types based on scope.
user-invocable: false
disable-model-invocation: true
---

# PR Review Output Contract

## Intent

This skill defines **how to format your output** when returning findings.

Goals:
- **machine-parseable** — output can be `JSON.parse()`'d directly
- **self-describing** — each finding declares its type and scope
- **actionable** — structured issue + implications + fixes

Preload this skill via `skills: [pr-review-output-contract]` into any `pr-review-*` agent.

## Scope

**This contract covers:** Your return format (the JSON you output)

**Out of scope:** File discovery, diff computation, or how you analyze code

---

## Finding Types

Findings are a **discriminated union** based on the `type` field. Choose the type that matches the **scope** of your finding.

| Type | When to Use |
|------|-------------|
| `inline` | Specific line(s), proposed fix, small scope |
| `file` | Whole-file concern, no specific line |
| `multi-file` | Cross-cutting issue spanning multiple files |
| `system` | Architectural/pattern concern, no specific files |

### Decision Tree

```
Is this about a specific line or small line range (≤20 lines)?
├─ YES → Can you propose a fix?
│        ├─ YES, unambiguous   → type: "inline" (fix_confidence: HIGH)
│        ├─ YES, but uncertain → type: "inline" (fix_confidence: MEDIUM/LOW)
│        └─ NO fix, just guidance → type: "file"
└─ NO  → Does this involve specific files?
         ├─ YES → How many files?
         │        ├─ ONE  → type: "file"
         │        └─ MANY → type: "multi-file"
         └─ NO  → type: "system" (pattern/architectural)
```

---

## Output Rules

### R1. Return valid JSON only

- Use **double quotes** for strings and keys.
- No comments, no trailing commas.
- No surrounding prose, headings, or code fences.

Your output must be directly parseable via `JSON.parse()`.

### R2. Return a JSON array of Finding objects

Always return an array, even if empty:

```json
[]
```

### R3. Use the correct type for each finding

The `type` field determines which other fields are required. Do not mix schemas.

---

## Finding Schemas

### Common Fields (All Types)

These fields are **required on all finding types**.

| # | Field | Type | Description |
|---|-------|------|-------------|
| 1 | `type` | `"inline"` \| `"file"` \| `"multi-file"` \| `"system"` | Discriminator. Determines schema shape. |
| 2 | `category` | string | Your domain (e.g., `"standards"`, `"architecture"`). |
| 3 | `issue` | string | What's wrong. Thorough description. |
| 4 | `references` | string[] | **Required.** Citations that justify both the finding and the proposed fix. See Reference Types below. |
| 5 | `implications` | string | Why it matters. Consequence, risk, user impact. (write AFTER citing evidence) |
| 6 | `severity` | `"CRITICAL"` \| `"MAJOR"` \| `"MINOR"` \| `"INFO"` | How serious is this issue? (classify AFTER implications) |
| 7 | `confidence` | `"HIGH"` \| `"MEDIUM"` \| `"LOW"` | How certain are you this is a real issue? (rate AFTER citing evidence) |
| 8 | `fix` | string | Suggestion[s] for how to address it. If simple, give the full solution as a code block. If bigger-scoped, interweave brief code examples into the explanation. Don't over-engineer — give a starting point/direction. |
| 9 | `fix_confidence` | `"HIGH"` \| `"MEDIUM"` \| `"LOW"` | How confident are you in the proposed fix? |
| 10 | `pre_existing` | boolean | **(Optional.)** Set to `true` if this issue existed before this PR — it was NOT introduced by the PR's changes. Omit or set `false` for issues introduced by the PR. See guidance below. |

### Reference Types

Every finding **must** include at least one reference (outside of the line numbers a suggestion applies to). References ground and justify both the issue and the proposed fix in verifiable sources, and prevent hallucinated recommendations.

**Important:** References are **not** for pointing to the file or lines where the finding is located — the finding's own `file` and `line` fields already capture that. Instead, references cite **other sources** that justify *why* the finding is valid and *why* the fix is appropriate: related code elsewhere in the codebase, project standards (skills, AGENTS.md), reviewer-defined rules, or external documentation.

**In-repo reference rule:** All references to files within this repo (code, skills, AGENTS.md, reviewer agents, etc.) **must** include specific line number(s) and a brief (<1 sentence) description of what's at those lines that relates to the issue or fix. This makes the reasoning traceable — a reader should be able to click through and immediately see the justification.

**Use markdown hyperlinks** `[text](url)` for ALL references. The `pr-context` skill provides the GitHub URL base pattern for constructing links.

| Type | Format | Example |
|------|--------|---------|
| **Related code** | `[file:line — what's there](url#Lline)` | `[src/api/users.ts:28 — parameterized query pattern](https://github.com/.../src/api/users.ts#L28)` |
| **Related code range** | `[file:start-end — what's there](url#Lstart-Lend)` | `[utils.ts:10-15 — shared validation helpers](https://github.com/.../utils.ts#L10-L15)` |
| **Skill reference** | `[skill:Lstart-Lend — what's there](url#Lstart-Lend)` | `[pr-review-security-iam skill:L45-L52 — credential rotation checklist](https://github.com/.../.agents/skills/.../SKILL.md#L45-L52)` |
| **AGENTS.md rule** | `[AGENTS.md:Lline — what's there](url#Lline)` | `[AGENTS.md:L142 — tenant isolation rule](https://github.com/.../AGENTS.md#L142)` |
| **Reviewer instructions** | `[reviewer:Lstart-Lend — what's there](url#Lstart-Lend)` | `[pr-review-security-iam:L28-L35 — auth bypass checklist](https://github.com/.../.claude/agents/pr-review-security-iam.md#L28-L35)` |
| **External URL** | `[descriptive text](url)` | `[React useMemo docs](https://react.dev/...)` |

**Constructing GitHub URLs:**

Use the pattern from `pr-context`:
```
https://github.com/{repo}/blob/{sha}/{path}#L{line}
https://github.com/{repo}/blob/{sha}/{path}#L{start}-L{end}
```

**Examples:**
```json
{
  "references": [
    "[src/api/users.ts:28-35 — parameterized query pattern](https://github.com/org/repo/blob/abc123/src/api/users.ts#L28-L35)",
    "[pr-review-security-iam skill:L45-L52 — credential rotation checklist](https://github.com/org/repo/blob/abc123/.agents/skills/pr-review-security-iam/SKILL.md#L45-L52)",
    "[pr-review-security-iam:L28-L35 — auth bypass checklist](https://github.com/org/repo/blob/abc123/.claude/agents/pr-review-security-iam.md#L28-L35)",
    "[OWASP SQL Injection](https://owasp.org/www-community/attacks/SQL_Injection)"
  ]
}
```

**Guidance:**
- **Code issues** → link to *related* code elsewhere that demonstrates the correct pattern or exposes the inconsistency (with line(s) + description)
- **Standards violations** → link to the AGENTS.md rule at the specific line(s) that define the standard (with description)
- **Skill-backed findings** → link to the skill at the specific line(s) that define the pattern or checklist (with description)
- **Reviewer-defined rules** → link to your own agent file at the specific line(s) of the relevant checklist item (with description)
- **Best practice claims** → link to official docs or authoritative sources (external URLs don't need line numbers)
- **Justify both issue and fix** → include references that support *why* the issue matters AND *why* the proposed fix is appropriate. E.g., link to an existing pattern that the fix follows, or to docs that prescribe the recommended approach.
- **Multiple references** are encouraged when they strengthen the finding
---

### Type: `inline`

**Use when:** You found an issue at a specific line (or small range ≤20 lines) AND you can propose a fix. Set `fix_confidence` to reflect certainty — `HIGH` for drop-in fixes, `MEDIUM`/`LOW` when the fix needs adjustment or verification.

**Field order:** `type` → `file` → `line` → common fields (category → issue → references → implications → severity → confidence → fix → fix_confidence)

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"inline"` | Literal string. |
| `file` | string | Repo-relative path (e.g., `"src/api/client.ts"`). |
| `line` | number \| string | Line number (`42`) or range (`"42-48"`). |
| `line_end` | number | (Optional) Explicit end line (alternative to range string). |

---

### Type: `file`

**Use when:** The issue concerns a whole file, a large section, or you have guidance but not a concrete line-level fix.

**Field order:** `type` → `file` → common fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"file"` | Literal string. |
| `file` | string | Repo-relative path. |

---

### Type: `multi-file`

**Use when:** The issue spans multiple files — e.g., inconsistency between API and SDK, type definitions out of sync, or a pattern that appears across several files.

**Field order:** `type` → `files` → common fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"multi-file"` | Literal string. |
| `files` | string[] | Array of repo-relative paths (at least 2). |

---

### Type: `system`

**Use when:** The issue is architectural or pattern-related, not tied to specific files — e.g., inconsistent patterns across the codebase, precedent-setting concerns, or design decisions that affect evolvability.

**Field order:** `type` → `scope` → common fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"system"` | Literal string. |
| `scope` | string | Brief description of what area/pattern this concerns. |

---

## Field Semantics

### `severity`

Use the smallest severity that is still honest. Severity indicates **impact**, not certainty.

| Severity | Meaning | Merge Impact |
|----------|---------|--------------|
| `CRITICAL` | Security or AuthN, Authz, or IAM vulnerability, data loss or corruption, breaking change or broken core functionality, likely incident | Blocks merge |
| `MAJOR` | Core standard violation, reliability/maintainability/deployment risk, likely bug, not addressing all product or internal surface areas that changes affect (e.g. missing docs), etc. | Fix before merge |
| `MINOR` | Improvements, consistency issues, "would be better if…"... I.e. functionally ok but could use cleaner implementation, etc. | Can merge; developer discretion.  |
| `INFO` | Informational notes, non-actionable observations | No action required |

### `confidence`

How certain you are that this is a real issue. Not how severe it is.

| Confidence | Meaning | Evidence Level |
|------------|---------|----------------|
| `HIGH` | Definite issue. Evidence is unambiguous in the code/diff and clearly problematic or would be identified as a real issue by experienced engineers. | "I can point to the exact line and explain why it's wrong." |
| `MEDIUM` | Likely issue. Reasonable alternate interpretation exists. | "This looks wrong, but there might be context I'm missing." |
| `LOW` | Possible issue. Needs human confirmation or more context. | "This could be a problem, but I'm not sure." |

### `fix_confidence`

How confident you are in the proposed fix. Distinct from `confidence` (issue certainty).

| Fix Confidence | Meaning |
|----------------|---------|
| `HIGH` | Fix is drop-in: complete, correct, includes necessary imports/types, doesn't introduce new issues. **Requires web search verification when the fix changes third-party library/framework usage** (see `pr-review-check-suggestion` Step F2) or reference to other existing code in the existing codebase that illustrates the correct approach. Default to `MEDIUM` until substantiated. Only exception are self-evident fixes (null checks, typos, simple refactors) that are intrinsically obvious (rare). |
| `MEDIUM` | Fix is directionally correct but may need certain details confirmed by developer. |
| `LOW` | Fix is a starting point but not sure about exact approach given context; human should verify approach. |

### `category`

Use **your primary domain**. This is a freeform string.

| Category | Domain |
|----------|--------|
| `standards` | code quality, bugs, AGENTS.md compliance |
| `security` | authn/authz, injection, data exposure |
| `architecture` | patterns, abstractions, system design |
| `customer-impact` | API contracts, breaking changes, UX |
| `tests` | coverage, test quality, flaky tests |
| `docs` | documentation quality, accuracy |
| `breaking-changes` | schema, migrations, env variables |
| `types` | type design, invariants |
| `errors` | error handling, silent failures |
| `comments` | comment accuracy, staleness |
| `frontend` | React/Next.js patterns, components |
| `sre` | reliability, retries, timeouts, circuit breakers, observability |
| `llm` | AI/LLM integration: tools, templates, streaming, context management |

**Cross-domain findings:** If you find an issue outside your domain, don't flag it unless it has valid cross-over to your domain. And if so, therefore still mark it as a category relevant to you.

### `pre_existing` (optional)

Set `pre_existing: true` when you encounter a notable issue in your domain that clearly existed **before** this PR — it was not introduced by the PR's changes.

**This is purely opportunistic.** Your primary job is reviewing what this PR introduces or changes. Do NOT actively search for pre-existing issues, expand your review scope, or spend additional cycles hunting for tech debt. Only flag something as `pre_existing` if it clearly stood out while you were doing your normal review.

- Omit the field entirely (or set `false`) for findings about issues introduced by the PR — this is the default
- When `true`, the orchestrator may surface the finding in a "While You're Here" section if it's relevant to the PR's scope
- Use the same quality bar as any other finding: must have references, clear issue/fix, appropriate severity/confidence

### `issue`, `implications`, `fix`

Scale depth with severity × confidence. Lean detailed — thorough analysis and specific resolutions or suggestions to consider are better than vague!

| Severity × Confidence | issue | implications | fix |
|-----------------------|-------|--------------|--------------|
| CRITICAL + HIGH | Full context: what, where, how it happens | Detailed consequences, attack scenarios, blast radius | Concrete fix with code example, before/after |
| MAJOR + HIGH | Specific description with relevant context | Clear consequences, who/what is affected | Concrete fix, code if non-obvious |
| MAJOR + MEDIUM | Clear description of the problem | 1-2 sentences on impact | Actionable suggestion |
| MINOR / LOW | Brief description | Brief impact | Brief suggestion |

---

## Normalization Rules

### N1. One issue per finding

Do not bundle multiple unrelated issues. Split them into separate findings.

### N2. Choose the right type

If you're unsure between types:
- `inline` vs `file`: Use `inline` when you can point to a specific line and propose a fix (even with `fix_confidence: MEDIUM/LOW`). Use `file` when the issue is whole-file or you have guidance but no specific line to anchor to.
- `file` vs `multi-file`: If only one file is affected, use `file`. If the issue is the *relationship* between files, use `multi-file`.
- `multi-file` vs `system`: If you can enumerate the specific files, use `multi-file`. If it's about a pattern that could affect *any* file, use `system`.

### N3. No duplicates

If two findings describe the same issue differently, keep the more actionable one.

### N4. Repo-relative paths only

Never use absolute paths. Always use paths relative to the repository root.

---

## Complete Example (with correct field order)

```json
[
  {
    "type": "inline",
    "file": "src/api/client.ts",
    "line": 42,
    "category": "security",
    "issue": "User input is passed directly to SQL query without sanitization, creating SQL injection vulnerability.",
    "references": [
      "[src/api/users.ts:28 — parameterized query pattern used elsewhere](https://github.com/org/repo/blob/abc123/src/api/users.ts#L28)",
      "[pr-review-security-iam:L40-L42 — SQL injection checklist item](https://github.com/org/repo/blob/abc123/.claude/agents/pr-review-security-iam.md#L40-L42)",
      "[OWASP SQL Injection](https://owasp.org/www-community/attacks/SQL_Injection)"
    ],
    "implications": "Attackers can extract, modify, or delete database contents. Could lead to full database compromise and data breach.",
    "severity": "CRITICAL",
    "confidence": "HIGH",
    "fix": "Use parameterized queries:\n```typescript\nconst result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);\n```",
    "fix_confidence": "HIGH"
  },
  {
    "type": "file",
    "file": "src/utils/logger.ts",
    "category": "standards",
    "issue": "Logger utility swallows errors silently — catch block is empty. This predates this PR but is in the same module being modified.",
    "references": [
      "[AGENTS.md:L48 — error handling must be explicit](https://github.com/org/repo/blob/abc123/AGENTS.md#L48)",
      "[src/utils/logger.ts:15-18 — empty catch block](https://github.com/org/repo/blob/abc123/src/utils/logger.ts#L15-L18)"
    ],
    "implications": "Silent error swallowing can mask bugs and make debugging difficult. Since this file is being modified in this PR, it's a natural cleanup opportunity.",
    "severity": "MINOR",
    "confidence": "HIGH",
    "fix": "Add explicit error handling or re-throw:\n```typescript\ncatch (error) {\n  console.error('Logger failed:', error);\n}\n```",
    "fix_confidence": "HIGH",
    "pre_existing": true
  }
]
```

**Note the order:** type → location → category → issue → references → implications → severity → confidence → fix → fix_confidence → pre_existing (optional)

---

## Validation Checklist

Before returning, verify:

- [ ] Output is valid JSON (no prose, no code fences, no markdown)
- [ ] Output is an array of Finding objects
- [ ] **Field order is correct:** type → location → category → issue → references → implications → severity → confidence → fix → fix_confidence → pre_existing (if applicable)
- [ ] Every finding has a `type` field with valid value
- [ ] Every finding has all required fields for its type
- [ ] `severity`, `confidence`, and `fix_confidence` use allowed enum values
- [ ] `category` is a non-empty string matching your domain
- [ ] `file`/`files` paths are repo-relative (no absolute paths)
- [ ] `inline` findings have numeric `line` or valid range string
- [ ] `multi-file` findings have at least 2 files in the array
- [ ] `system` findings have a descriptive `scope` string
- [ ] No duplicate findings for the same issue
- [ ] Every finding has at least one reference as markdown hyperlink `[text](url)`
- [ ] In-repo references (code, skills, AGENTS.md, agents) include specific line number(s) and a brief description of what's there