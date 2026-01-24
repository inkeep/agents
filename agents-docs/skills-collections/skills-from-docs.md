# Deriving Agent Skills from Your Documentation

Your documentation is already the best reference for how to use your product. So why write it twice for AI agents?

We built a system that automatically generates [Agent Skills](https://agentskills.io/specification) from our existing Fumadocs documentation. Tag a folder, run a build, and it's available for any agent that supports the spec—Claude Code, Cursor, Windsurf, Codex, and [17+ others](https://skills.sh/).

## Skills Are Not a Doc Dump

Here's the key insight: we didn't export our entire documentation as a skill. That would defeat the purpose.

Skills are meant to be *practical references for coding agents*. When an agent is helping someone build with your SDK, it needs the API reference, configuration options, and code patterns—not your marketing pages, changelog, or conceptual overviews that require human context.

We deliberately curated what goes into our `typescript-sdk` skill:

- **In**: Agent configuration, tool definitions, sub-agent relationships, structured outputs, MCP integration
- **Out**: Deployment guides, pricing, community docs, tutorials with external dependencies

The goal is high signal-to-noise. An agent should be able to load this skill and immediately have actionable reference material for writing code.

## Skills Complement Your Docs, Not Replace Them

Skills work alongside your existing documentation infrastructure:

| Layer | Purpose | When Used |
|-------|---------|-----------|
| **Skills** | Curated SDK reference for agents | Agent startup, activated by task context |
| **llms.txt** | Full doc index for discovery | When agent needs to find something |
| **Full docs** | Complete reference with examples | Deep dives, edge cases, human readers |

We still point agents to our full docs and `llms.txt` endpoint for anything outside the skill's scope. Skills are the focused subset—the "cheat sheet" an agent keeps loaded while coding.

## The Agent Skills Ecosystem

Agent Skills started as an internal format at Anthropic for Claude Code, then got [released as an open spec](https://agentskills.io/specification). Vercel recently launched [skills.sh](https://skills.sh/)—essentially npm for agent capabilities—with a CLI that works across major AI coding assistants.

The format is simple: a directory with a `SKILL.md` file containing YAML frontmatter (name, description, license) and markdown instructions. Agents load the metadata at startup for discovery, then pull full content when activated. Progressive disclosure keeps context windows efficient.

```
typescript-sdk/
├── SKILL.md          # Frontmatter + table of contents
└── rules/            # Individual reference files (flattened)
    ├── agent-settings.md
    ├── mcp-tools.md
    └── ...
```

## Reusing What You Already Have

The beauty of generating skills from docs is that you've already done the hard work. Every doc has a `title` and `description` in its frontmatter—we reuse those directly:

```yaml
# Original doc frontmatter
---
title: Register MCP Servers as Tools
description: Learn how to add and configure MCP tools for your agents
---
```

This becomes the rule's metadata in the generated skill. No duplication, no drift. Update the doc, the skill updates automatically.

The same applies to organization. Fumadocs uses `meta.json` files to define sidebar structure and page ordering. We piggyback on that:

```json
// content/typescript-sdk/meta.json
{
  "skillCollections": ["typescript-sdk"],
  "pages": ["project-management", "agent-settings", "tools", "..."]
}
```

Rules appear in the same order as your sidebar. The `"..."` wildcard includes remaining files alphabetically—same pattern Fumadocs uses. One config, two outputs.

## Architecture: Docs → Skills Pipeline

The generator runs at build time, processing MDX files through the same remark pipeline we use for the docs site:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Content +      │────▶│  Remark Pipeline │────▶│  Agent Skills   │
│  meta.json      │     │  (shared with    │     │  (SKILL.md +    │
│                 │     │   docs site)     │     │   rules/*.md)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

**Folder-level tagging**: Add `skillCollections` to a folder's `meta.json`. All docs in that folder and subfolders are included. Child folders inherit unless they override. Individual files can opt-out via frontmatter.

**Templates**: Each skill has a template controlling the `SKILL.md` output. Placeholders like `{{RULES_TABLE}}` generate the table of contents. `{{INCLUDE:path}}` lets you embed processed content from any doc.

**Validation**: Templates define skill metadata with a Zod schema enforcing the Agent Skills spec. Invalid templates fail the build—you find out before publishing.

## Publishing

Generated skills are gitignored locally. A GitHub Action publishes to a dedicated repo on pushes to main, keeping the main repo clean:

```yaml
- name: Publish to skills repo
  uses: cpina/github-action-push-to-another-repository@main
  with:
    source-directory: 'agents-docs/skills-collections/.generated/'
    destination-github-username: 'inkeep'
    destination-repository-name: 'skills'
```

Users install with: `npx skills add inkeep/skills`

## Implementation Details

For those interested in the internals:

**Fumadocs-native inheritance**: We read `meta.json` files and build an inheritance chain. This keeps skill configuration in the same place you already configure your docs.

**Snippet inlining**: We use `remark-mdx-snippets` to expand shared content at build time. Skills get complete, standalone files—no broken references.

**Fragment stripping**: The snippet plugin wraps multi-child expansions in React fragments. We strip these since skills are plain markdown:

```typescript
function stripReactFragments(content: string): string {
  return content
    .replace(/^<>\n/gm, '')
    .replace(/\n<\/>$/gm, '');
}
```

**Rule file metadata**: Each generated rule includes frontmatter with `title`, `description`, and `topic-path` (the parent folder path in docs). Agents can use this for categorization.

**Filename conflict resolution**: When docs from different paths share a filename, the generator prefixes with parent folder names until unique.

**Spec validation**: The generator validates against Agent Skills spec constraints—name format (`^[a-z0-9]+(-[a-z0-9]+)*$`), description length (≤1024 chars), required fields.

## Why This Matters

If you're building developer tools, your documentation is your most valuable asset for AI agents. It's already accurate, maintained, and comprehensive. The Agent Skills spec gives you a portable format. The tooling exists.

We're using this to improve the devex of building on our agent platform. When developers use Claude Code, Cursor, or any AI assistant with our SDK, the agent has access to accurate, up-to-date reference documentation—derived directly from the source.

The alternative is agents hallucinating your API or users constantly pasting docs into context. Neither scales.

---

*The skill collections generator is part of the [Inkeep Agent Framework](https://github.com/inkeep/agents). See `agents-docs/skills-collections/` for implementation details.*
