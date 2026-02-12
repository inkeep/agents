---
"@inkeep/agents-manage-ui": patch
---

Use local timezone for all user-facing datetime displays

- Added `{ local: true }` to `formatDateTime`/`formatDateTimeTable` calls in evaluation results, dataset items table, dataset run details, and GitHub installation pages
- Created `LocalDateTimeTable` client component for server component contexts (evaluation job page)
- Replaced three local `formatDate` implementations (MCP server details, GitHub installations list, trigger invocations) with the shared `format-date.ts` utilities using `{ local: true }` to avoid hydration mismatches while showing local time
