---
"@inkeep/agents-core": patch
"@inkeep/agents-sdk": patch
"@inkeep/agents-cli": patch
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-api": patch
---

Add support for nested files and folders within Skills. Each skill is now a directory containing a `SKILL.md` entry file plus any number of nested reference files (templates, checklists, examples). The SDK `loadSkills()` function recursively discovers all files under each skill directory. The CLI `pull` command writes one file per skill file path. The Visual Builder shows a file-tree sidebar with per-file editing, context menus for adding and removing files, and breadcrumb navigation. The API accepts a `files` array for skill create and update, with four new file-level endpoints for individual CRUD operations. `SKILL.md` frontmatter remains the source of truth for skill name, description, and metadata.
