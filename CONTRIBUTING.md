# Contributing to Agent Framework

## Human contributors
- Full contribution guide: [https://docs.inkeep.com/community/contributing/overview](https://docs.inkeep.com/community/contributing/overview)
- We intentionally avoid duplicating coding rules here; use the docs above for end-to-end process details (issues, branches, PRs, release cadence).

## How public PRs flow

This repository is maintained by Inkeep and mirrored from our source tree. When you open a PR here:

1. Automation mirrors your PR into Inkeep's maintainer review flow.
2. The bridge workflow waits for Inkeep to approve its `inkeep-oss-sync` environment deployment before it runs, so the bot comment may not appear immediately.
3. **Reviewer comments are not currently auto-mirrored back to your public PR.** If you don't hear from us within a few business days, please comment on your PR to nudge — that's the right thing to do, not annoying.
4. Once accepted, the change syncs back to this repository and your public PR is closed automatically (not merged). Accepted changes land on `main` with your contribution credited through co-author trailers.

## AI coding assistants / coding practices
- Our canonical coding standards and automation guidance live in `AGENTS.md`. This is the single source of truth for agent rules and best practices.
- Raw file reference (rendered by GitHub): https://github.com/inkeep/agents/blob/main/AGENTS.md

Anything not covered in `AGENTS.md` should be specific to human-only workflows (e.g., team communication, PR etiquette, roadmap context) and should be documented in the docs link above, not repeated here.
