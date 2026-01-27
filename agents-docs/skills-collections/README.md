# Skill Collections

Skill collections are curated sets of documentation rules exported as standalone markdown files. They follow the [Agent Skills specification](https://agentskills.io/specification) for compatibility with AI agents like Claude, Cursor, and other LLM-powered tools.

## Philosophy: Skills Are Selective

**Skills are not a documentation dump.** They are curated, actionable references for coding agents.

When an agent helps someone build with your SDK, it needs practical guidance: API patterns, configuration options, code examples. It doesn't need marketing pages, changelogs, or conceptual overviews designed for human learning.

Ask yourself: *"Would this help an AI write correct code?"* If yes, include it. If it's primarily for human understanding or context, leave it out—agents can still access your full docs via `llms.txt`.

## How It Works

1. Add rules — Use `<SkillRule>` blocks, file frontmatter, or folder `meta.json`
2. Create templates — Define each skill's `SKILL.md` with required metadata
3. Generate — Automatically handled by the `publish-skills.yml` GitHub workflow on merge to main (or run `pnpm generate-skill-collections` locally to preview)

## Adding Rules to a Skill

There are three ways to add rules to a skill, from most selective to least selective. **Choose the approach that matches your content.**

### Inline Rules with `<SkillRule>` (Most Selective)

**Use when:** A doc is primarily descriptive but contains specific procedural sections worth extracting.

The `<SkillRule>` component wraps content that should become a skill rule. It renders transparently in docs—readers see no difference—but the generator extracts it as a standalone rule.

```mdx
# Getting Started

General intro content... (not included in skill)

<SkillRule
  id="project-setup"
  skills="typescript-sdk"
  title="Project Setup Checklist"
  description="Essential steps when starting a new project"
>

## Before You Begin

1. Run `npx @inkeep/create-agents`
2. Configure your `inkeep.config.ts`
3. Set up credentials via `inkeep auth`

</SkillRule>

More intro content... (not included)
```

**Props:**

| Prop | Required | Description |
|------|----------|-------------|
| `id` | Yes | Unique identifier, becomes the rule filename |
| `skills` | Yes | Target skill(s) — string or array |
| `title` | Yes | Human-readable title for the rules table |
| `description` | No | Brief description for the rules table |

**Best for:**
- Checklists and step-by-step procedures within larger docs
- Quick reference tables (parameter lists, option tables)
- Decision frameworks ("when to use X vs Y")
- Code patterns that agents should follow

**Note:** JSX elements like `<Note>`, `<Tabs>`, or `<br/>` inside `<SkillRule>` are preserved as raw text in the output. The AI agent will see them as literal XML-like tags.

### File-Level (Selective)

**Use when:** An entire file is procedural/reference content suitable for agents.

Add `skills` to a file's frontmatter:

```yaml
---
title: MCP Tools Reference
description: How to register and configure MCP servers
skills:
  - typescript-sdk
---
```

The entire file becomes a single rule in the skill.

**Best for:**
- API reference pages
- Configuration guides
- Tool/integration documentation
- Files that are entirely "how-to" content

**Override inherited skills:**

```yaml
---
title: Internal Notes
skills: []    # Exclude this file from any inherited skills
---
```

### Folder-Level (Broadest)

**Use when:** An entire folder contains purely procedural/reference content.

Add `skills` to the folder's `meta.json`:

```json
{
  "skills": ["typescript-sdk"],
  "pages": ["overview", "configuration", "..."]
}
```

All files in that folder (and subfolders) inherit the skill. Child folders can override with their own `skills`.

**Best for:**
- SDK reference sections where every page is actionable
- API documentation folders
- Tool/integration directories

**Use with caution:** Folder-level tagging can easily include too much content. Ask yourself if *every* file in the folder is genuinely useful for an agent writing code.

## Exclusive Logic

Files use either **full-file mode** OR **SkillRule extraction**—never both:

- If a file has `skills` (frontmatter or inherited) → entire file becomes a rule
- If a file has NO `skills` → only `<SkillRule>` blocks are extracted

This prevents duplication and keeps the mental model simple.

## When to Use Each Approach

| Scenario | Approach |
|----------|----------|
| Tutorial with one useful checklist | `<SkillRule>` around the checklist |
| Conceptual doc with a reference table | `<SkillRule>` around the table |
| Pure API reference page | File-level `skills` frontmatter |
| Configuration options page | File-level `skills` frontmatter |
| Entire SDK reference folder | Folder-level `skills` in meta.json |
| Marketing/overview page | Don't include—leave for `llms.txt` |
| Changelog or release notes | Don't include |
| Tutorials with external dependencies | Don't include |

## Page Ordering

Rules appear in the order defined by `meta.json` `pages` arrays, following Fumadocs conventions:

- Explicit order from `pages` array
- `"..."` includes remaining files alphabetically
- `"z...a"` includes remaining in reverse order
- Nested folders respect their own `meta.json` ordering

For `<SkillRule>` blocks, ordering follows their position in the source file.

## Creating Skill Templates

Templates define both the skill metadata (frontmatter) and content for each skill's `SKILL.md` file.

### Agent Skills Spec (Required Frontmatter)

Each template **must** include frontmatter following the [Agent Skills spec](https://agentskills.io/specification):

```yaml
---
name: my-skill-name
description: What this skill does and when to use it. Include keywords for agent discovery.
license: MIT                    # Optional
compatibility: Requires Node.js # Optional, max 500 chars
metadata:                       # Optional key-value pairs
  author: your-org
  version: "1.0"
allowed-tools: Bash Read Write  # Optional, experimental
---

# Content goes here...
```

### Schema Requirements

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | 1-64 chars, lowercase letters/numbers/hyphens only, must match directory name |
| `description` | Yes | 1-1024 chars, describe what the skill does and when to use it |
| `license` | No | License name or reference to bundled license file |
| `compatibility` | No | Max 500 chars, environment requirements |
| `metadata` | No | Key-value pairs for additional metadata |
| `allowed-tools` | No | Space-delimited list of pre-approved tools (experimental) |

### Template Location

Each skill **must** have a template at `_templates/skills/<skill-name>/SKILL.mdx`.

**Important**: The `name` field must exactly match the skill name (directory name).

### Content Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{COLLECTION_NAME}}` | Title-cased collection name | `Typescript Sdk` |
| `{{RULES_COUNT}}` | Number of rules in collection | `5` |
| `{{RULES_TABLE}}` | Auto-generated markdown table of rules | |
| `{{INCLUDE:path}}` | Include processed content from a doc file | `{{INCLUDE:typescript-sdk/overview.mdx}}` |

### Example Template

```yaml
---
name: typescript-sdk
description: Reference for building AI agents with the Inkeep TypeScript SDK. Use when working with agent configuration, tools, or structured outputs.
license: MIT
metadata:
  author: inkeep
  version: "1.0"
---

# {{COLLECTION_NAME}}

## Rules ({{RULES_COUNT}})

{{RULES_TABLE}}
```

## Directory Structure

```
content/
├── typescript-sdk/
│   ├── meta.json                     # Can add "skills": ["typescript-sdk"]
│   ├── agent-settings.mdx            # May contain <SkillRule> blocks
│   ├── tools/
│   │   ├── meta.json
│   │   └── mcp-tools.mdx
│   └── ...

skills-collections/
├── _templates/
│   ├── README.mdx                    # Template for root README
│   └── skills/
│       └── <skill-name>/
│           └── SKILL.mdx             # Template for skill's SKILL.md
├── .generated/                       # Output (gitignored)
│   ├── README.md
│   └── skills/
│       └── <skill-name>/
│           ├── SKILL.md
│           └── rules/
│               └── <rule>.md
└── README.md                         # This documentation
```

## Rule File Format

Generated rule files include frontmatter with metadata:

```yaml
---
title: "Doc Title"
description: "Doc description"
topic-path: "typescript-sdk/tools"    # Parent path in docs
---
```

### Filename Conflict Resolution

When rules have the same base filename, the generator prefixes with parent folder names:

- `tools/overview.mdx` → `overview.md`
- `credentials/overview.mdx` → `credentials-overview.md` (conflict resolved)

For `<SkillRule>` blocks, the `id` is the base filename:

- `<SkillRule id="setup">` in `intro.mdx` → `setup.md` (if unique)
- `<SkillRule id="setup">` in `advanced.mdx` → `intro-setup.md` / `advanced-setup.md` (conflict)

## Running the Generator

```bash
# From agents-docs directory
pnpm generate-skill-collections

# Runs automatically as part of prebuild
pnpm prebuild
```

## Validation

The generator validates templates against the Agent Skills spec at build time. Invalid templates fail the build with helpful error messages.

## Publishing

Generated skills are automatically published to https://github.com/inkeep/skills via GitHub Action on pushes to `main`.

Manual trigger:

```bash
gh workflow run publish-skills.yml --repo inkeep/agents
```
