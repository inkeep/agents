# Skill Collections

Skill collections are curated sets of documentation rules exported as standalone markdown files. They follow the [Agent Skills specification](https://agentskills.io/specification) for compatibility with AI agents like Claude, Cursor, and other LLM-powered tools.

## How It Works

1. Tag folders with collections — Add `skillCollections` to `meta.json` (Fumadocs pattern)
2. Create templates — Define each collection's `SKILL.md` with required metadata
3. Generate — Run `pnpm generate-skill-collections` to produce output

## Adding Docs to a Collection

### Folder-Level (Recommended)

Add `skillCollections` to a folder's `meta.json` to include all docs in that folder:

```json
// content/typescript-sdk/meta.json
{
  "skillCollections": ["typescript-sdk"],
  "pages": ["project-management", "agent-settings", "..."]
}
```

All MDX files in `typescript-sdk/` and its subdirectories inherit this collection. Child folders can override with their own `skillCollections`.

### File-Level (Override)

Individual files can override inherited collections via frontmatter:

```yaml
---
title: My Doc Title
skillCollections:
  - typescript-sdk
  - getting-started     # Also add to another collection
---
```

```yaml
---
title: Internal Doc
skillCollections: []    # Exclude from inherited collections
---
```

## Page Ordering

Rules appear in the order defined by `meta.json` `pages` arrays, following Fumadocs conventions:

- Explicit order from `pages` array
- `"..."` includes remaining files alphabetically
- `"z...a"` includes remaining in reverse order
- Nested folders respect their own `meta.json` ordering

## Creating Collection Templates

Templates define both the skill metadata (frontmatter) and content for each collection's `SKILL.md` file.

### Agent Skills Spec (Required Frontmatter)

Each collection template **must** include frontmatter following the [Agent Skills spec](https://agentskills.io/specification):

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

### Template Files

Each skill **must** have a template at `_templates/skills/<skill-name>/SKILL.mdx`.

**Important**: The `name` field must exactly match the skill name (directory name).

### Content Variables

Use these placeholders in template content:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{COLLECTION_NAME}}` | Title-cased collection name | `Typescript Sdk` |
| `{{RULES_COUNT}}` | Number of rules in collection | `5` |
| `{{RULES_TABLE}}` | Auto-generated markdown table of rules | |
| `{{INCLUDE:path}}` | Include flattened content from a doc file | `{{INCLUDE:typescript-sdk/project-management.mdx}}` |

The `{{INCLUDE:path}}` placeholder loads and processes an MDX file from the `content/` directory, expanding snippets and including the full content inline. This is useful for embedding detailed reference content directly in the SKILL.md.

### Example Template

`_templates/skills/typescript-sdk/SKILL.mdx`:

```yaml
---
name: typescript-sdk
description: Reference documentation for building AI agents with the Inkeep TypeScript SDK. Use when working with agent configuration, tools, or structured outputs.
license: MIT
metadata:
  author: inkeep
  version: "1.0"
---

# {{COLLECTION_NAME}}

These rules describe how to build agents using the Inkeep TypeScript SDK.

## Rules ({{RULES_COUNT}})

{{RULES_TABLE}}
```

## Root README Template

Customize the root `README.md` by editing `_templates/README.mdx`:

| Variable | Description |
|----------|-------------|
| `{{COLLECTIONS_LIST}}` | Auto-generated table of skills with name, description, and links |

## Directory Structure

```
content/
├── typescript-sdk/
│   ├── meta.json                     # { "skillCollections": ["typescript-sdk"], "pages": [...] }
│   ├── agent-settings.mdx
│   ├── tools/
│   │   ├── meta.json                 # Inherits skillCollections from parent
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
│           ├── SKILL.md              # Follows Agent Skills spec
│           └── rules/
│               └── <doc-slug>.md     # Flattened rule files
└── README.md                         # This documentation
```

## Rule File Format

Generated rule files include frontmatter with metadata from the source doc:

```yaml
---
title: "Doc Title"
description: "Doc description"
topic-path: "typescript-sdk/tools"    # Parent path in docs
---
```

### Filename Conflict Resolution

When docs from different paths have the same filename, the generator prefixes with parent folder names to avoid conflicts:

- `tools/overview.mdx` → `overview.md`
- `credentials/overview.mdx` → `credentials-overview.md` (conflict resolved)

## Running the Generator

```bash
# From agents-docs directory
pnpm generate-skill-collections

# Runs automatically as part of prebuild
pnpm prebuild
```

## Validation

The generator validates all collection templates against the Agent Skills spec schema at build time. Invalid templates will cause the build to fail with helpful error messages.

## Publishing

Generated skills are automatically published to https://github.com/inkeep/skills via GitHub Action when changes to docs, snippets, templates, or the generator script are pushed to `main`.

Manual trigger:

```bash
gh workflow run publish-skills.yml --repo inkeep/agents
```
