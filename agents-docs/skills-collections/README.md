# Skill Collections

Skill collections are curated sets of documentation rules exported as standalone markdown files. They follow the [Agent Skills specification](https://agentskills.io/specification) for compatibility with AI agents like Claude, Cursor, and other LLM-powered tools.

## How It Works

1. Tag docs with collections — Add `skillCollections` to any MDX file's frontmatter
2. Create templates — Define each collection's `SKILL.md` with required metadata
3. Generate — Run `pnpm generate-skill-collections` to produce output

## Adding a Doc to a Collection

In any content MDX file, add `skillCollections` to the frontmatter:

```yaml
---
title: My Doc Title
description: What this doc covers
skillCollections:
  - typescript-sdk      # Adds to "typescript-sdk" collection
  - getting-started     # Adds to "getting-started" collection (creates if new)
---
```

A doc can belong to multiple collections.

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

- Collection-specific: `_templates/<collection-name>.mdx` (recommended)
- Default fallback: `_templates/default.mdx` (no skill metadata, shows warning)

**Important**: The `name` field must exactly match the collection name (directory name).

### Content Variables

Use these placeholders in template content:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{COLLECTION_NAME}}` | Title-cased collection name | `Typescript Sdk` |
| `{{RULES_COUNT}}` | Number of rules in collection | `5` |
| `{{RULES_TABLE}}` | Auto-generated markdown table of rules | |

### Example Template

`_templates/typescript-sdk.mdx`:

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
| `{{COLLECTIONS_LIST}}` | Auto-generated list of collections with links |

## Output Structure

```
.generated/
├── README.md
└── skills/
    └── <collection-name>/
        ├── SKILL.md          # Follows Agent Skills spec
        └── rules/
            └── <path>/<doc-slug>.md
```

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
