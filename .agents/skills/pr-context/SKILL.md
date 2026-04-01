---
name: pr-context
description: Local review context generated from git state.
---

# PR Review Context

(!IMPORTANT)

Use this context to:
1. Get an initial sense of the purpose and scope of the local changes
2. Review the current branch against the target branch without relying on GitHub APIs
3. Identify what needs attention before the changes are pushed

---

## PR Metadata

| Field | Value |
|---|---|
| **PR** | Local review — feat/multi-user-triggers vs main |
| **Author** | miles-kt-inkeep |
| **Base** | `main` |
| **Repo** | inkeep/agents |
| **Head SHA** | `2094861cf0d86e972a888ae96adc51eb4796cceb` |
| **Size** | 41 commits · +7562/-323 · 31 files (7 untracked) |
| **Labels** | _None — local review._ |
| **Review state** | LOCAL |
| **Diff mode** | `summary` — reviewers must read tracked file diffs on-demand |
| **Event** | `local:manual` |
| **Trigger command** | `local-review` |
| **Review scope** | `full` — local review uses the full branch diff against the target branch |

## Description

Local review — no PR description is available.

## Linked Issues

_No linked issues in local review mode._

## Commit History

Commits reachable from HEAD and not in the target branch (oldest → newest). Local staged and unstaged changes may also be present in the diff below.

```
02eb244af Bugfix/reordered cost UI (#2905)
0f0247e51 fix: prevent delegation metadata api key leaks (#2894)
7dc35b694 fix: set initiatedBy for app credential auth to resolve user-scoped MCP credentials (#2912)
4141e2662 fix: return 403 Forbidden for origin validation failures (#2911)
7f70ee5eb Version Packages (#2914)
21311f8c4 ci: harden Railway preview provisioning (#2900)
8e2f1e071 fix(manage): add `wasm-unsafe-eval` to CSP for Monaco WebAssembly (#2915)
722ad5c7d fix (#2917)
e91b902e6 fix(ci): add gate jobs so required checks pass on changeset PRs (#2918)
c458b0e83 Adds fonts.googleapis.com to CSP (#2916)
dc818c0fc Support nested files and folders for Skills (#2719)
47168c319 Client-execution-mode (#2853)
a8fe9209d Bump agents-ui, add example for authed users in widget (#2903)
614acc864 Version Packages (#2919)
566a9571e fix(ci): teardown Vercel preview env vars on PR close (#2921)
cfcdc30e8 Fix tenant injection vulnerability in anonymous auth path for global apps (#2922)
c278ea489 Version Packages (#2925)
704026c89 Bind tenant/project into anonymous session JWTs for global apps (#2924)
f61fcd38b Prevent header injection into anonymous session JWT tenant/project claims (#2927)
abc3b5dd2 feat: org entitlement system (seat limits + quota:project) (#2845)
80da01aa0 fix(agents-core): remove scheduled triggers tables from manage db (#2929)
1512a7be2 fix Uncaught Error: Previous layout not found for panel index 2 (#2933)
2ebe1c411 Add fallback models support and capabilities-gated UI features (#2850)
1cfdbc1a8 Document mcp pass through (#2936)
981ba48be fix active sidebar item when file/folder contains whitespace (#2932)
ba40c53f7 fix breadcrumbs in cost page (#2935)
47915b3b6 Implementation/datasets (#2889)
ce81cd26a add backfill utilities (#2937)
68a55f5ce Fix false positive 'Needs Login' for connected MCP servers (#2931)
55b3a9f2c [US-001] Add scheduled_trigger_users join table, dispatchDelayMs, invocation runAsUserId, and indexes
732c123b6 [US-002] Data access layer for scheduled_trigger_users join table
65cafbed3 [US-003] Validation schemas and types for multi-user triggers
1a8a9d278 [US-004] Update TriggerPayload and runner workflow for multi-user
13bb5c992 [US-005] Dispatcher fan-out for multi-user triggers
87d7d9065 [US-006] API create/update with runAsUserIds and auth rules
857f6120e [US-007] Sub-resource endpoints for trigger user management (GET/PUT/POST/DELETE)
6fea7b561 [US-008] Response schema changes and run info grouping for multi-user
da373bd43 [US-009] Update Run Now and Rerun endpoints for multi-user
3cc4382e3 [US-010] Cleanup hook on project member removal
ecf234ac7 [US-011] UI: wire multi-user create and edit to new API
2094861cf [US-012] Backfill migration script for existing runAsUserId data
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 agents-api/__snapshots__/openapi.json              |  722 ++-
 .../crud/userScopedScheduledTriggers.test.ts       |    1 +
 .../manage/routes/__tests__/triggerHelpers.test.ts |  191 +
 .../src/domains/manage/routes/projectMembers.ts    |    8 +
 .../src/domains/manage/routes/scheduledTriggers.ts |  782 +++-
 .../src/domains/manage/routes/triggerHelpers.ts    |   76 +-
 .../services/__tests__/triggerDispatcher.test.ts   |   84 +-
 .../src/domains/run/services/triggerDispatcher.ts  |   75 +-
 .../workflow/functions/scheduledTriggerRunner.ts   |   36 +-
 .../run/workflow/steps/scheduledTriggerSteps.ts    |   15 +
 .../project-scheduled-triggers-table.tsx           |   40 +-
 .../scheduled-triggers/scheduled-trigger-form.tsx  |  155 +-
 .../src/lib/actions/scheduled-triggers.ts          |  111 +
 agents-manage-ui/src/lib/api/scheduled-triggers.ts |   78 +
 .../drizzle/runtime/0029_chubby_the_call.sql       |   17 +
 .../drizzle/runtime/meta/0029_snapshot.json        | 4909 ++++++++++++++++++++
 .../agents-core/drizzle/runtime/meta/_journal.json |    7 +
 .../agents-core/scripts/backfill-trigger-users.ts  |  113 +
 packages/agents-core/src/data-access/index.ts      |    1 +
 .../runtime/scheduledTriggerInvocations.ts         |  146 +-
 .../data-access/runtime/scheduledTriggerUsers.ts   |  188 +
 .../agents-core/src/db/runtime/runtime-schema.ts   |   51 +
 packages/agents-core/src/types/entities.ts         |   11 +
 packages/agents-core/src/validation/schemas.ts     |   68 +-
 24 files changed, 7562 insertions(+), 323 deletions(-)
new file | specs/2026-03-31-multi-user-scheduled-triggers/SPEC.md
new file | specs/2026-03-31-multi-user-scheduled-triggers/evidence/adversarial-review.md
new file | specs/2026-03-31-multi-user-scheduled-triggers/evidence/current-system.md
new file | specs/2026-03-31-multi-user-scheduled-triggers/evidence/design-constraints.md
new file | specs/2026-03-31-multi-user-scheduled-triggers/evidence/existing-patterns.md
new file | specs/2026-03-31-multi-user-scheduled-triggers/evidence/permission-change-gap.md
new file | specs/2026-03-31-multi-user-scheduled-triggers/meta/_changelog.md
```

Full file list (including untracked files when present):

```
agents-api/__snapshots__/openapi.json
agents-api/src/__tests__/manage/routes/crud/userScopedScheduledTriggers.test.ts
agents-api/src/domains/manage/routes/__tests__/triggerHelpers.test.ts
agents-api/src/domains/manage/routes/projectMembers.ts
agents-api/src/domains/manage/routes/scheduledTriggers.ts
agents-api/src/domains/manage/routes/triggerHelpers.ts
agents-api/src/domains/run/services/__tests__/triggerDispatcher.test.ts
agents-api/src/domains/run/services/triggerDispatcher.ts
agents-api/src/domains/run/workflow/functions/scheduledTriggerRunner.ts
agents-api/src/domains/run/workflow/steps/scheduledTriggerSteps.ts
agents-manage-ui/src/components/project-triggers/project-scheduled-triggers-table.tsx
agents-manage-ui/src/components/scheduled-triggers/scheduled-trigger-form.tsx
agents-manage-ui/src/lib/actions/scheduled-triggers.ts
agents-manage-ui/src/lib/api/scheduled-triggers.ts
packages/agents-core/drizzle/runtime/0029_chubby_the_call.sql
packages/agents-core/drizzle/runtime/meta/0029_snapshot.json
packages/agents-core/drizzle/runtime/meta/_journal.json
packages/agents-core/scripts/backfill-trigger-users.ts
packages/agents-core/src/data-access/index.ts
packages/agents-core/src/data-access/runtime/scheduledTriggerInvocations.ts
packages/agents-core/src/data-access/runtime/scheduledTriggerUsers.ts
packages/agents-core/src/db/runtime/runtime-schema.ts
packages/agents-core/src/types/entities.ts
packages/agents-core/src/validation/schemas.ts
specs/2026-03-31-multi-user-scheduled-triggers/SPEC.md
specs/2026-03-31-multi-user-scheduled-triggers/evidence/adversarial-review.md
specs/2026-03-31-multi-user-scheduled-triggers/evidence/current-system.md
specs/2026-03-31-multi-user-scheduled-triggers/evidence/design-constraints.md
specs/2026-03-31-multi-user-scheduled-triggers/evidence/existing-patterns.md
specs/2026-03-31-multi-user-scheduled-triggers/evidence/permission-change-gap.md
specs/2026-03-31-multi-user-scheduled-triggers/meta/_changelog.md
```

## Diff

> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~271578 bytes across ~31 files) exceeds the inline threshold (~100KB).
> The full diff is written to `.claude/pr-diff/full.diff`.
>
> **How to read diffs on-demand:**
> - Specific file: `git diff e222844e317f407947f56eb6f657dc090d831940 -- path/to/file.ts`
> - Full diff: read `.claude/pr-diff/full.diff`
> - Untracked files: inspect the file directly in the working tree

> **Note:** 7 untracked file(s) are listed above. Review them directly in the working tree if they are relevant.

## Changes Since Last Review

_N/A — local review (no prior GitHub review baseline)._

## Prior Feedback

> **IMPORTANT:** Local review mode does not load prior PR threads or prior review summaries. Treat this as a first-pass review of the current local changes unless the invoker provided additional context elsewhere.

### Automated Review Comments

_None (local review)._

### Human Review Comments

_None (local review)._

### Previous Review Summaries

_None (local review)._

### PR Discussion

_None (local review)._

## GitHub URL Base (for hyperlinks)

No GitHub PR context is available in local review mode.
- For in-repo citations, use repo-relative `path:line` or `path:start-end` references instead of GitHub blob URLs.
- External docs may still use standard markdown hyperlinks.
