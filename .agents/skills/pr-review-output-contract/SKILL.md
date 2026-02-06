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
| `inline` | Specific line(s), concrete fix, small scope |
| `file` | Whole-file concern, no specific line |
| `multi-file` | Cross-cutting issue spanning multiple files |
| `system` | Architectural/pattern concern, no specific files |

### Decision Tree

```
Is this about a specific line or small line range (≤10 lines)?
├─ YES → Is there a concrete, unambiguous fix?
│        ├─ YES → type: "inline"
│        └─ NO  → type: "file" (guidance, not fix)
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

These fields are **required on all finding types**:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"inline"` \| `"file"` \| `"multi-file"` \| `"system"` | Discriminator. Determines schema shape. |
| `severity` | `"CRITICAL"` \| `"MAJOR"` \| `"MINOR"` \| `"INFO"` | How serious is this issue? |
| `category` | string | Your domain (e.g., `"standards"`, `"architecture"`). |
| `issue` | string | What's wrong. Thorough description. |
| `implications` | string | Why it matters. Consequence, risk, user impact. |
| `confidence` | `"HIGH"` \| `"MEDIUM"` \| `"LOW"` | How certain are you this is a real issue? |
| `fix` | string | Suggestion[s] (aka "fix" or "fixes") for how to address it. If a simple fix, then just give the full solution as a code block. If a bigger-scoped resolution is needed, but brief code example[s] would be helpful to illustrate, incorporate them as full code block[s] (still minimum viable short) interweaved into the explanation. Otherwise, describe the alternative approaches to consider qualitatively/from a technical perspective. Note: Don't go into over-engineering a solution if wide-scoped or you're unsure, this is more about giving a starting point/direction as to what a resolution may look like. |
| `fix_confidence` | `"HIGH"` \| `"MEDIUM"` \| `"LOW"` | How confident are you in the proposed fix? |
| `references` | string[] | **Required.** Citations that ground the finding. See Reference Types below. |

### Reference Types

Every finding **must** include at least one reference. References ground your analysis in verifiable sources and prevent hallucinated recommendations.

| Type | Format | When to Use |
|------|--------|-------------|
| **Code reference** | `"file:line"` or `"file:line-range"` | Point to specific code that exhibits the issue |
| **Skill/rule reference** | `"per <skill-name> skill"` or `"per AGENTS.md: <rule>"` | Cite internal standards/rules that define the violation |
| **URL reference** | `"https://..."` | Cite external docs, GitHub issues, or web search results |

**Examples:**
```json
"references": [
  "src/api/client.ts:42-48",
  "per vercel-react-best-practices skill",
  "https://react.dev/reference/react/memo"
]
```

**Guidance:**
- **Code issues** → always include the code location as a reference
- **Standards violations** → cite the skill or AGENTS.md rule that defines the standard
- **Best practice claims** → cite official docs or authoritative sources (especially if verified via web search)
- **Multiple references** are encouraged when they strengthen the finding

---

### Type: `inline`

**Use when:** You found an issue at a specific line (or small range ≤10 lines) AND you can propose a concrete fix.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"inline"` | Literal string. |
| `file` | string | Repo-relative path (e.g., `"src/api/client.ts"`). |
| `line` | number \| string | Line number (`42`) or range (`"42-48"`). |
| + common fields | | See above. |

**Optional fields:**

| Field | Type | Description |
|-------|------|-------------|
| `line_end` | number | Explicit end line (alternative to range string). |

---

### Type: `file`

**Use when:** The issue concerns a whole file, a large section, or you have guidance but not a concrete line-level fix.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"file"` | Literal string. |
| `file` | string | Repo-relative path. |
| + common fields | | See above. |

---

### Type: `multi-file`

**Use when:** The issue spans multiple files — e.g., inconsistency between API and SDK, type definitions out of sync, or a pattern that appears across several files.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"multi-file"` | Literal string. |
| `files` | string[] | Array of repo-relative paths (at least 2). |
| + common fields | | See above. |

---

### Type: `system`

**Use when:** The issue is architectural or pattern-related, not tied to specific files — e.g., inconsistent patterns across the codebase, precedent-setting concerns, or design decisions that affect evolvability.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"system"` | Literal string. |
| `scope` | string | Brief description of what area/pattern this concerns. |
| + common fields | | See above. |

---

## Field Semantics

### `severity`

Use the smallest severity that is still honest. Severity indicates **impact**, not certainty.

| Severity | Meaning | Merge Impact |
|----------|---------|--------------|
| `CRITICAL` | Security vulnerability, data loss, broken functionality, likely incident | Blocks merge |
| `MAJOR` | Core standard violation, reliability/maintainability risk, likely bug | Fix before merge |
| `MINOR` | Improvements, consistency issues, "would be better if…" | Can merge; fix later |
| `INFO` | Informational notes, non-actionable observations | No action required |

### `confidence`

How certain you are that this is a real issue. Not how severe it is.

| Confidence | Meaning | Evidence Level |
|------------|---------|----------------|
| `HIGH` | Definite issue. Evidence is unambiguous in the code/diff. | "I can point to the exact line and explain why it's wrong." |
| `MEDIUM` | Likely issue. Reasonable alternate interpretation exists. | "This looks wrong, but there might be context I'm missing." |
| `LOW` | Possible issue. Needs human confirmation or more context. | "This could be a problem, but I'm not sure." |

### `fix_confidence`

How confident you are in the proposed fix. Distinct from `confidence` (issue certainty).

| Fix Confidence | Meaning |
|----------------|---------|
| `HIGH` | Fix is complete and correct. Can be applied as-is. |
| `MEDIUM` | Fix is directionally correct but may need adjustment. |
| `LOW` | Fix is a starting point; human should verify approach. |

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

**Cross-domain findings:** If you find an issue outside your domain, don't flag it unless it has valid cross-over to your domain. And if so, therefore still mark it as a category relevant to you.

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
- `inline` vs `file`: If you can't point to a specific line with a concrete fix, use `file`.
- `file` vs `multi-file`: If only one file is affected, use `file`. If the issue is the *relationship* between files, use `multi-file`.
- `multi-file` vs `system`: If you can enumerate the specific files, use `multi-file`. If it's about a pattern that could affect *any* file, use `system`.

### N3. No duplicates

If two findings describe the same issue differently, keep the more actionable one.

### N4. Repo-relative paths only

Never use absolute paths. Always use paths relative to the repository root.

---

## Validation Checklist

Before returning, verify:

- [ ] Output is valid JSON (no prose, no code fences, no markdown)
- [ ] Output is an array of Finding objects
- [ ] Every finding has a `type` field with valid value
- [ ] Every finding has all required fields for its type
- [ ] `severity`, `confidence`, and `fix_confidence` use allowed enum values
- [ ] `category` is a non-empty string matching your domain
- [ ] `file`/`files` paths are repo-relative (no absolute paths)
- [ ] `inline` findings have numeric `line` or valid range string
- [ ] `multi-file` findings have at least 2 files in the array
- [ ] `system` findings have a descriptive `scope` string
- [ ] No duplicate findings for the same issue
- [ ] Every finding has at least one reference (code location, skill/rule, or URL)
