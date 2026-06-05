# Contributing to Agent Framework

## Human contributors
- Full contribution guide: [https://docs.inkeep.com/community/contributing/overview](https://docs.inkeep.com/community/contributing/overview)
- We intentionally avoid duplicating coding rules here; use the docs above for end-to-end process details (issues, branches, PRs, release cadence).

## How public PRs flow

This repository is mirrored from Inkeep's internal monorepo. When you open a PR here:

1. Automation mirrors your PR into Inkeep's internal monorepo for canonical review and merge.
2. A bot will post a sticky comment on your PR linking to the internal mirror PR (the link is to a private repo and isn't accessible to external contributors — that's expected).
3. **Reviewer comments are not currently auto-mirrored back to your public PR.** If you don't hear from us within a few business days, please comment on your PR to nudge — that's the right thing to do, not annoying.
4. Once the internal PR merges, the change syncs back to this repository and your public PR is closed automatically (not merged). The mirrored commit is attributed to our sync bot for technical reasons; the PR history and internal commit preserve your original authorship.

## AI coding assistants / coding practices
- Our canonical coding standards and automation guidance live in `AGENTS.md`. This is the single source of truth for agent rules and best practices.
- Raw file reference (rendered by GitHub): https://github.com/inkeep/agents/blob/main/AGENTS.md

Anything not covered in `AGENTS.md` should be specific to human-only workflows (e.g., team communication, PR etiquette, roadmap context) and should be documented in the docs link above, not repeated here.