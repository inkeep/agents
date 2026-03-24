---
name: find-similar
description: |
  Find similar or analogous code patterns elsewhere in a codebase.
  Use when answering "Do we do something similar elsewhere?" or "What existing patterns match this?"
  Returns factual findings about similar code - locations, similarity type, and confidence.
argument-hint: "[pattern to find] (optional: scope constraints, similarity type)"
user-invocable: false
disable-model-invocation: true
---

# Find Similar Patterns

A conceptual framework for systematically finding similar or analogous code patterns in a codebase.

**This skill is factual, not prescriptive.** It helps find and report what exists. It does not recommend whether to use, ignore, or modify findings.

**Tools available:** Grep, Glob, Read, Bash (git commands)

---

## Similarity Types

"Similar" can mean different things. Identify which type matters before searching.

| Type | What It Means | Example |
|------|---------------|---------|
| **Lexical** | Same names, keywords, identifiers | "Where else do we call `formatDate`?" |
| **Structural** | Same code shape, different names | "Where else do we have retry logic?" |
| **Analogous** | Same role in a different domain | "What's the equivalent handler in another domain?" |
| **Conceptual** | Same purpose, potentially different approach | "How do we handle validation elsewhere?" |

---

## Search Strategy

### Level 1: Direct Search

Search for the thing itself or obvious variations.

- Exact terms, function names, type names
- Known synonyms or alternate spellings
- Import/export statements

**Stop if:** Found clear matches.

### Level 2: Sibling/Peer Discovery

Find files that serve the same role.

- Files in the same directory
- Files with the same naming pattern (e.g., `*.handler.ts`, `use*.ts`)
- Files in parallel directories (e.g., `domains/users/` → `domains/projects/`)

**Stop if:** Found peers that reveal the pattern.

### Level 3: Reference Tracing

Follow the dependency graph.

- Where is X defined?
- What imports/uses X?
- What does X import/use?

**Stop if:** Found the relevant connected files.

### Level 4: Conceptual Expansion

Broaden the search with related concepts.

- Synonyms and related terms
- Different implementations of the same idea
- Cross-domain analogues

**Stop if:** Found conceptually similar code, or exhausted reasonable search terms.

---

## Confidence Levels

| Confidence | Criteria |
|------------|----------|
| **HIGH** | Exact or near-exact match; clearly the same pattern |
| **MEDIUM** | Similar structure or purpose; some differences |
| **LOW** | Conceptually related; different approach or partial match |

**Factors that affect confidence:**
- Same directory/domain → higher
- Same naming conventions → higher
- Same imports/dependencies → higher
- Different structure or approach → lower

---

## What to Capture (adapt to your context)

Useful information to track for each finding:
- **Location** — file path and line range
- **Similarity type** — which of the four types applies
- **Confidence** — how close is the match
- **Why similar** — brief explanation of the relationship

For negative results, note what was searched so coverage can be verified.

---

## Tips

- **Start narrow, expand as needed** — Don't search the entire codebase if a directory search suffices
- **Use file organization as signal** — Sibling files often reveal local conventions
- **Git history can help** — Files that change together are often related
- **Report what you searched** — Helps verify coverage and enables follow-up
