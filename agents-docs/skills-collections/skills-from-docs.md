# Deriving Agent Skills from Your Documentation

Your documentation is already the best reference for how to use your product. So why write it twice for AI agents?

We built a system that automatically generates [Agent Skills](https://agentskills.io/specification) from our existing Fumadocs documentation. Tag a folder, run a build, and it's available for any agent that supports the spec—Claude Code, Cursor, Windsurf, Codex, and [17+ others](https://skills.sh/).

## The Agent Skills Ecosystem

Agent Skills started as an internal format at Anthropic for Claude Code, then got [released as an open spec](https://agentskills.io/specification). Vercel recently launched [skills.sh](https://skills.sh/)—essentially npm for agent capabilities—with a CLI that works across the major AI coding assistants.

The format is simple: a directory with a `SKILL.md` file containing YAML frontmatter (name, description, license) and markdown instructions. Agents load the metadata at startup for discovery, then pull full content when activated. Progressive disclosure keeps context windows efficient.

```
typescript-sdk/
├── SKILL.md          # Frontmatter + table of contents
└── rules/            # Individual reference files (flattened)
    ├── agent-settings.md
    ├── mcp-tools.md
    └── ...
```

## The Problem with Manual Skill Authoring

Most skills today are hand-written. That works for procedural knowledge ("how to do X"), but reference documentation is different. You already have it. Maintaining two copies—one in your docs, one in skills—creates drift and doubles the work.

We wanted our SDK documentation to be available as skills without manual duplication.

## Architecture: Docs → Skills Pipeline

Our generator runs at build time, processing MDX files through the same remark pipeline we use for our docs site:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  meta.json      │────▶│  Remark Pipeline │────▶│  Agent Skills   │
│  (Fumadocs)     │     │  - remarkGfm     │     │  (SKILL.md +    │
│                 │     │  - remarkMdx     │     │   rules/*.md)   │
│  skillCollections:    │  - mdx-snippets  │     │                 │
│    ["typescript-sdk"] │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

**Folder tagging**: Add `skillCollections` to a folder's `meta.json`—Fumadocs' native config format. All docs in that folder (and subfolders) are included. Child folders inherit from parents unless they override.

```json
// content/typescript-sdk/meta.json
{
  "skillCollections": ["typescript-sdk"],
  "pages": ["project-management", "agent-settings", "..."]
}
```

**Page ordering**: Rules appear in the order defined by the `pages` array. The `"..."` wildcard includes remaining files alphabetically—same pattern Fumadocs uses for sidebar ordering.

**Processing**: Content goes through `remark-gfm` (tables), `remark-mdx`, and `remark-mdx-snippets` (snippet expansion). The same pipeline that renders our docs.

**Validation**: Templates define skill metadata with a Zod schema enforcing the Agent Skills spec—name format, description length, required fields. Invalid templates fail the build.

**Templates**: Each skill has a template (`_templates/skills/{name}/SKILL.mdx`) controlling the `SKILL.md` output. Placeholders like `{{RULES_TABLE}}` and `{{INCLUDE:path}}` let you compose content.

## Technical Details Worth Noting

**Fumadocs-native inheritance**: We read `meta.json` files and build an inheritance chain—child folders inherit `skillCollections` from parents. Individual files can still override via frontmatter. This keeps configuration in the same place Fumadocs uses for sidebar organization.

**Snippet inlining**: We use `remark-mdx-snippets` to expand shared content at build time. Skills get the full rendered content, not broken references.

**Fragment stripping**: The snippet plugin wraps multi-child expansions in React fragments (`<>...</>`). We strip these since skills are plain markdown:

```typescript
function stripReactFragments(content: string): string {
  return content
    .replace(/^<>\n/gm, '')
    .replace(/\n<\/>$/gm, '');
}
```

**Rule file metadata**: Each generated rule includes frontmatter with `title`, `description`, and `topic-path` (the parent folder path). Agents can use this for categorization and filtering.

```yaml
---
title: "MCP Tools"
description: "Learn how to add MCP tools to your agents"
topic-path: "typescript-sdk/tools"
---
```

**Filename conflict resolution**: When docs from different paths share a filename (e.g., multiple `overview.mdx` files), the generator prefixes with parent folder names until unique.

**Spec-compliant validation**: The generator validates against the actual Agent Skills spec constraints:

```typescript
const skillMetadataSchema = z.object({
  name: z.string().min(1).max(64)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  description: z.string().min(1).max(1024),
  license: z.string().optional(),
  compatibility: z.string().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  'allowed-tools': z.string().optional(),
});
```

**Content includes**: Templates can pull in processed content from any doc using `{{INCLUDE:path/to/file.mdx}}`. Useful for embedding overview content without duplicating it.

## Publishing

Generated skills are gitignored locally. A GitHub Action publishes to a dedicated repo (`inkeep/skills`) on pushes to main:

```yaml
- name: Publish to skills repo
  uses: cpina/github-action-push-to-another-repository@main
  with:
    source-directory: 'agents-docs/skills-collections/.generated/'
    destination-github-username: 'inkeep'
    destination-repository-name: 'skills'
```

Users install with: `npx skills add inkeep/skills`

## Why This Matters

If you're building developer tools, your documentation is your most valuable asset for AI agents. It's already accurate, maintained, and comprehensive. The Agent Skills spec gives you a portable format. The tooling exists.

We're using this to improve the devex of building on our agent platform. When developers use Claude Code, Cursor, or any other AI assistant with our SDK, the agent has access to accurate, up-to-date reference documentation—derived directly from the source.

The alternative is agents hallucinating your API or users constantly pasting docs into context. Neither scales.

---

*The skill collections generator is part of the [Inkeep Agent Framework](https://github.com/inkeep/agents). See `agents-docs/skills-collections/` for implementation details.*
