# Skill Collections

Skill collections are curated sets of documentation rules exported as standalone markdown files. They're designed for use with AI agents, LLMs, or any system that needs structured reference documentation.

## How It Works

1. Tag docs with collections — Add `skillCollections` to any MDX file's frontmatter
2. Create templates — Define how each collection's `skill.md` looks
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

## Creating Custom Templates

### Root README Template

Customize the root `README.md` by editing `_templates/README.mdx`:

| Variable | Description |
|----------|-------------|
| `{{COLLECTIONS_LIST}}` | Auto-generated list of collections with links |

### Collection Templates

Templates control the `skill.md` file generated for each collection.

- Default template: `_templates/default.mdx` (fallback)
- Collection-specific: `_templates/<collection-name>.mdx`

| Variable | Description | Example |
|----------|-------------|---------|
| `{{COLLECTION_NAME}}` | Title-cased collection name | `Typescript Sdk` |
| `{{RULES_COUNT}}` | Number of rules in collection | `5` |
| `{{RULES_TABLE}}` | Auto-generated markdown table of rules | |

## Output Structure

```
.generated/
├── README.md
└── skills/
    └── <collection-name>/
        ├── skill.md
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

## Publishing

Generated skills are automatically published to https://github.com/inkeep/skills via GitHub Action when changes to docs, snippets, templates, or the generator script are pushed to `main`.

Manual trigger:

```bash
gh workflow run publish-skills.yml --repo inkeep/agents
```
