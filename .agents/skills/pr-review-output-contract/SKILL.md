---
name: pr-review-output-contract
description: Output contract for PR review subagents returning findings to the parent orchestrator. Category is a freeform string matching reviewer domain.
user-invocable: false
disable-model-invocation: true
---

# PR Review Output Contract

## Intent

This skill defines **how PR review subagents must format their output** when returning findings to the parent orchestrator.

Goals:
- **machine-parseable** — orchestrator can parse without heuristics
- **consistent across reviewers** — easy to aggregate + dedupe
- **actionable** — structured issue + implications + alternatives

Preload this skill via `skills: [pr-review-output-contract]` into any `pr-review-*` subagent.

## Scope

**This contract covers:** Subagent → Orchestrator return format

**This contract does NOT cover:**
- Orchestrator output format (that's the orchestrator's responsibility)
- Human-readable rendering (downstream concern)
- File discovery or diff computation (input concern)

---

## Output rules

### R1. Return valid JSON only

- Use **double quotes** for strings and keys.
- No comments, no trailing commas.
- No surrounding prose, headings, or code fences.

The orchestrator must be able to `JSON.parse()` your output directly.

### R2. Return a JSON array of Finding objects

Always return an array, even if empty:

```json
[]
```

### R3. Do not change the schema

- Do not rename fields.
- Do not add new required fields.
- Optional fields are allowed only if listed below.

---

## Finding schema

A `Finding` is a single actionable issue (or informational note) tied to a file and line.

### Required shape

```json
{
  "file": "path/to/file.ext",
  "line": 42,
  "severity": "MAJOR",
  "category": "security",
  "issue": "SQL query constructed via string concatenation with unsanitized user input from request.query.userId. The userId parameter is passed directly into the query string without parameterization or escaping.",
  "implications": "Attacker can inject arbitrary SQL to read, modify, or delete database contents. This endpoint is public-facing and handles user authentication, so a breach exposes all user credentials and session tokens.",
  "alternatives": "Use parameterized queries to separate SQL structure from user data: db.query('SELECT * FROM users WHERE id = ?', [userId])",
  "confidence": "HIGH"
}
```

### Field definitions

| Field          | Type             | Required | Notes                                                                                     |
| -------------- | ---------------: | :------: | ----------------------------------------------------------------------------------------- |
| `file`         | string           |    ✅    | Repo-relative path. No absolute paths.                                                    |
| `line`         | number \| string |    ✅    | Line number (number), range (`"10-15"`), or `"n/a"` if unknown.                           |
| `severity`     | enum             |    ✅    | `CRITICAL` \| `MAJOR` \| `MINOR` \| `INFO`                                                |
| `category`     | string           |    ✅    | Freeform string matching reviewer domain (e.g., "docs", "security", "api").               |
| `issue`        | string           |    ✅    | What's wrong — thorough description. You're the deep analyst; lean detailed. Orchestrator will paraphrase for headlines. |
| `implications` | string           |    ✅    | Why it matters — consequence, risk, user impact. Explain the "so what" thoroughly; orchestrator condenses for presentation. |
| `alternatives` | string           |    ✅    | How to address it. Include code examples for non-trivial fixes. List multiple options if truly plausible. |
| `confidence`   | enum             |    ✅    | `HIGH` \| `MEDIUM` \| `LOW`                                                               |

**Proportional detail:** Scale depth with severity × confidence. You're doing the in-depth analysis — lean a notch more detailed than the final report needs, since the orchestrator will condense.

| Severity × Confidence | Issue | Implications | Alternatives |
|-----------------------|-------|--------------|--------------|
| CRITICAL + HIGH | Full context: what, where, how it happens | Detailed consequences, attack scenarios, blast radius | Concrete fix with code example, before/after |
| MAJOR + HIGH | Specific description with relevant context | Clear consequences, who/what is affected | Concrete fix, code if non-obvious |
| MAJOR + MEDIUM | Clear description of the problem | 1-2 sentences on impact | Actionable suggestion |
| MINOR | Brief description | Brief impact | Brief fix |

### Optional fields

| Field      | Type   | Use when                                                          |
| ---------- | -----: | ----------------------------------------------------------------- |
| `line_end` | number | Explicit end line when you have numeric start/end.                |
| `details`  | string | One extra sentence of context (keep short).                       |

---

## Enum semantics

### Severity

Use the smallest severity that is still honest.

| Severity     | Meaning                                                                  | Merge impact                                 |
| ------------ | ------------------------------------------------------------------------ | -------------------------------------------- |
| **CRITICAL** | Security vulnerability, data loss, broken functionality, likely incident | Blocks merge                                 |
| **MAJOR**    | Core standard violation, reliability/maintainability risk, likely bug    | Fix before merge unless explicitly accepted  |
| **MINOR**    | Improvements, consistency issues, "would be better if…"                  | Can merge; fix later                         |
| **INFO**     | Informational notes, non-actionable observations                         | No action required                           |

### Confidence

How certain you are that this is a real issue (not how severe it is).

| Confidence | Use when                                                         |
| ---------- | ---------------------------------------------------------------- |
| **HIGH**   | Definite violation; evidence is unambiguous in the code/diff.    |
| **MEDIUM** | Likely issue, but there's a reasonable alternate interpretation. |
| **LOW**    | Possible issue; needs human confirmation or more context.        |

### Category

Use **your reviewer's primary domain** as the category. This is a freeform string, not an enum—use whatever domain name best describes your reviewer's focus.

**Common domain examples:**

| Category   | Domain                                                              |
| ---------- | ------------------------------------------------------------------- |
| `docs`     | documentation quality, clarity, formatting, completeness            |
| `security` | authn/authz, secrets, injection, crypto, data exposure              |
| `api`      | request/response semantics, breaking changes, versioning, contracts |
| `style`    | linting, naming, formatting, minor readability                      |
| `test`     | missing/fragile tests, coverage gaps, flaky patterns                |

You are not limited to these examples. Use any string that accurately describes your reviewer's domain (e.g., `"performance"`, `"accessibility"`, `"database"`).

**Cross-domain findings:** If you find an issue outside your domain, still use your domain as the category.

Example: `pr-review-security` finds a README that exposes an API key path.
- Use `category: "security"` — your domain
- Not `category: "docs"` — different reviewer's domain

Why: The orchestrator routes findings by reviewer, not category. Cross-categorization causes ownership confusion during triage.

---

## Normalization rules

### N1. One issue per finding

Do not bundle multiple unrelated issues. Split them.

Why: The orchestrator deduplicates and prioritizes per-finding. Bundled issues get incorrect severity ranking or miss deduplication entirely.

### N2. Stable line references

- Exact line known → use number
- Spans multiple lines → use `"start-end"`
- Cannot determine → use `"n/a"` (do not guess)

Why: Guessed line numbers break IDE navigation and erode trust. `"n/a"` signals the orchestrator to present the finding at file-level.

### N3. No duplicates

If two findings describe the same issue differently, keep the more actionable one.

Why: The orchestrator cannot reliably dedupe semantically-similar findings. Pre-deduplication at the reviewer level reduces noise.

---

## Examples

### Correct

```json
[
  {
    "file": "docs/auth.md",
    "line": 73,
    "severity": "MAJOR",
    "category": "docs",
    "issue": "Code block on line 73 showing the authentication flow is missing a language tag. The fenced code block uses triple backticks but no language identifier, so syntax highlighting is disabled.",
    "implications": "Reduces syntax highlighting and copy-paste usability for developers. Without highlighting, the code example is harder to read and developers may miss syntax errors when adapting it.",
    "alternatives": "Add a language identifier after the opening backticks: ```typescript",
    "confidence": "HIGH"
  }
]
```

### Incorrect

```json
[
  {
    "filepath": "/Users/me/repo/docs/auth.md",
    "severity": "bad",
    "message": "This looks wrong"
  }
]
```

Problems:
- Wrong key (`filepath` vs `file`)
- Absolute path
- Invalid severity enum
- Uses old `message` field instead of `issue` + `implications`
- Missing: `line`, `category`, `alternatives`, `confidence`
- Vague — no specific issue, no implications

---

## Validation checklist

Before returning, verify:

- [ ] Output is valid JSON (no prose, no code fences)
- [ ] Output is an array of Finding objects
- [ ] Every finding has all required fields
- [ ] `severity` and `confidence` use allowed enum values; `category` is a non-empty string
- [ ] `file` is repo-relative (no absolute paths)
- [ ] `issue` states the specific problem; `implications` explains why it matters; `alternatives` provides fix(es)
- [ ] No duplicate findings for the same issue
