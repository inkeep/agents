---
"@inkeep/agents-docs": patch
---

Update Skills documentation to reflect nested file and folder support.

**TypeScript SDK — `skills.mdx`:**
- Updated file structure examples to show nested `reference/` and `templates/` subdirectories alongside `SKILL.md`.
- Updated `loadSkills()` description: the function now recursively discovers every file in each skill directory and includes them with paths relative to the skill root.
- Added note that `inkeep push` syncs the full skill directory including nested files, with `SKILL.md` remaining the source of truth for name, description, metadata, and prompt content.
- Updated on-demand skills description: the built-in `load_skill` tool now loads full content and any synced nested files when the agent determines a skill is relevant.

**Visual Builder — `skills.mdx`:**
- Added new **"Browse and edit synced files"** section explaining the file-tree UI: the Skills view shows the full file tree for every synced skill directory; opening a skill navigates to its `SKILL.md` entry file; nested reference files open in a read-only editor with an **Edit** button to enter the full-page editor.
- Documented editing behavior: editing `SKILL.md` re-parses and updates the skill's description, metadata, and body; removing `SKILL.md` deletes the entire skill; removing any other file removes only that file from the synced directory.
- Added note that `inkeep push` syncs the full skill directory and `SKILL.md` remains the entry file.
- Updated on-demand skills description to mention that `load_skill` retrieves full content and synced nested files.
