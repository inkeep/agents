Use when: Creating a new report directory (Step 2) or renaming an existing one during normalization
Priority: P1
Impact: Without this, directory names will be inconsistent and harder to scan in ls output

---

# Report Directory Conventions

## Directory naming

Format: `<scope>-<aspect>`, kebab-case, max ~5 segments.

- **`<scope>`** (1-3 words): the dominant subject or topic area. Use a specific subject when one dominates (e.g., `claude-code`, `better-auth`). Use the topic area when multiple subjects share the stage or no single subject dominates (e.g., `hitl-coding-agent`, `devops`).
- **`<aspect>`** (1-2 words): what angle the report takes on the scope. Common examples: `architecture`, `practices`, `patterns`, `assessment`, `comparison`, `integration`, `research`, `growth`. These are illustrative — use whatever fits the report naturally.
- **Comparisons:** `<subject1>-vs-<subject2>` is acceptable (no aspect suffix needed).
- **Drop filler words:** `best-practices` → `practices`.

Examples: `claude-skills-architecture`, `devops-practices`, `mcp-host-patterns`, `openhands-vs-openclaw`, `better-auth-multi-tenant`.

## Directory structure

```
<reports-dir>/<scope>-<aspect>/
├── REPORT.md              # Required — the report itself (with YAML frontmatter)
├── evidence/              # Required — primary-source proof files
│   ├── <dimension-1>.md
│   └── <dimension-2>.md
└── meta/                  # Optional — process/history artifacts
    ├── _changelog.md      # Append-only history of changes
    └── runs/              # Optional — run-scoped coordination
        └── YYYY-MM-DD-<label>/
            └── RUN.md
```

**Allowed at report root:** `REPORT.md` only. No backup files, no alternate report files.

**evidence/:** Only `.md` files. Named after the dimension they cover (kebab-case).

**meta/:** Created when needed (multi-pass research, changelog tracking). Not required for single-pass reports.

## YAML frontmatter schema

Every `REPORT.md` must start with YAML frontmatter:

```yaml
---
title: "Report Title"                    # REQUIRED — matches H1 heading
description: "1-3 sentence summary"      # REQUIRED — primary AI routing signal
createdAt: YYYY-MM-DD                    # REQUIRED — original creation date
updatedAt: YYYY-MM-DD                    # REQUIRED — last modification date
subjects:                                # OPTIONAL — proper nouns (companies, frameworks, technologies)
  - Subject 1
  - Subject 2
topics:                                  # OPTIONAL — qualitative areas, <=3 words each
  - topic area
  - another topic
---
```

- **`description`** is the primary signal for AI discoverability. Write it for an agent scanning reports to decide relevance — include what the report covers, what questions it answers, and key domain terms.
- **`subjects`** = proper nouns explicitly discussed in the report. Used for queries like "do we have research on Supabase?"
- **`topics`** = qualitative areas, <=3 words each. Used for queries like "do we have research on developer experience?"
- **`createdAt`** never changes after initial creation.
- **`updatedAt`** is set to today's date on every update pass.
