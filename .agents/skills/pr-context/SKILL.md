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
| **PR** | Local review — feat/enforce-app-auth vs main |
| **Author** | Andrew Mikofalvy |
| **Base** | `main` |
| **Repo** | inkeep/agents |
| **Head SHA** | `78d1cdc2444014d0c61df49615fcd6e16d3b7a25` |
| **Size** | 20 commits · +11399/-675 · 82 files |
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
704026c89 Bind tenant/project into anonymous session JWTs for global apps (#2924)
f61fcd38b Prevent header injection into anonymous session JWT tenant/project claims (#2927)
abc3b5dd2 feat: org entitlement system (seat limits + quota:project) (#2845)
80da01aa0 fix(agents-core): remove scheduled triggers tables from manage db (#2929)
3020e9de6 Add Require Authentication toggle for web client apps
83ce60a5b Update app credentials docs with Require Authentication toggle
402134c64 Add changesets for enforce-app-auth feature
b8cf6b5fd fixup! local-review: address findings (pass 1)
3a15a8655 fixup! local-review: baseline (pre-review state)
b6810478a Fix: revert auth spread destructure that caused data loss
07c376e74 fixup! local-review: address findings (pass 1)
ba69649be Remove generated pr-context skill from PR
421ad8f0a Default allowAnonymous to false and enforce across all auth paths
9717753dc Move allowAnonymous to app PATCH with config merge
90d72dabe Update changeset message for agents-api
285fd4291 Fix dialog close on key delete; show toggle unconditionally
770673dd1 Remove all revalidatePath calls from auth key/settings actions
69ae1ee7f Unify create and edit app forms with batched save
d3f030059 Make default agent required in create and edit app forms
78d1cdc24 Add comprehensive allowAnonymous enforcement tests
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 .changeset/abundant-bronze-dragon.md               |    5 +
 .changeset/tasteless-rose-ostrich.md               |    5 +
 .changeset/then-gold-deer.md                       |    5 +
 .changeset/written-aquamarine-sawfish.md           |    7 +
 agents-api/__snapshots__/openapi.json              |  137 +
 .../manage/routes/crud/appAuthKeys.test.ts         |  155 +-
 .../__tests__/manage/routes/invitations.test.ts    |    9 +
 .../middleware/requireEntitlement.test.ts          |  126 +
 agents-api/src/__tests__/run/routes/auth.test.ts   |  129 +
 agents-api/src/domains/manage/index.ts             |    4 +
 .../src/domains/manage/routes/appAuthKeys.ts       |    2 +
 agents-api/src/domains/manage/routes/apps.ts       |   27 +
 .../src/domains/manage/routes/entitlements.ts      |   53 +
 .../src/domains/manage/routes/invitations.ts       |   30 +-
 .../src/domains/manage/routes/projectFull.ts       |  111 +-
 agents-api/src/domains/manage/routes/projects.ts   |    8 +
 agents-api/src/domains/run/routes/auth.ts          |   21 +-
 agents-api/src/middleware/errorHandler.ts          |   23 +-
 agents-api/src/middleware/requireEntitlement.ts    |   79 +
 agents-api/src/middleware/runAuth.ts               |   13 +-
 agents-api/src/openapi.ts                          |    1 +
 .../content/api-reference/(openapi)/apps.mdx       |    9 +-
 .../api-reference/(openapi)/entitlements.mdx       |   23 +
 .../(chat-components)/app-credentials.mdx          |   12 +-
 agents-docs/scripts/generate-openapi-docs.ts       |    1 +
 .../src/app/[tenantId]/billing/layout.tsx          |   16 +
 .../src/app/[tenantId]/billing/loading.tsx         |   31 +
 .../src/app/[tenantId]/billing/page.tsx            |  165 +
 .../src/app/[tenantId]/members/page.tsx            |    3 +-
 .../src/app/[tenantId]/settings/page.tsx           |    3 +-
 .../[invitationId]/components/accept-decline.tsx   |   76 +
 .../components/auth-method-picker.tsx              |   96 +
 .../components/external-auth-buttons.tsx           |   71 +
 .../components/invitation-layout.tsx               |   39 +
 .../components/invitation-success.tsx              |   22 +
 .../[invitationId]/components/login-form.tsx       |   64 +
 .../[invitationId]/components/signup-form.tsx      |   70 +
 .../app/accept-invitation/[invitationId]/page.tsx  |  492 +-
 .../components/access/hooks/use-project-access.ts  |    8 +-
 .../src/components/apps/auth-keys-section.tsx      |  166 +-
 .../src/components/apps/form/app-create-form.tsx   |   68 +-
 .../src/components/apps/form/app-update-form.tsx   |   77 +-
 .../src/components/apps/form/validation.ts         |   24 +-
 ...uld-properly-highlight-nested-error-state-1.png |  Bin 0 -> 12046 bytes
 .../components/members/invite-member-dialog.tsx    |   20 +-
 .../src/components/members/members-table.tsx       |   47 +-
 .../src/components/members/org-role-selector.tsx   |   37 +-
 .../src/components/projects/form/project-form.tsx  |   12 +-
 .../src/components/sidebar-nav/app-sidebar.tsx     |   32 +-
 agents-manage-ui/src/constants/theme.ts            |    1 +
 agents-manage-ui/src/hooks/use-org-members.ts      |    4 +-
 agents-manage-ui/src/lib/actions/app-auth-keys.ts  |   36 +-
 agents-manage-ui/src/lib/actions/invitations.ts    |    2 +
 agents-manage-ui/src/lib/api/entitlements.ts       |   22 +
 .../drizzle/manage/0016_complex_klaw.sql           |    2 +
 .../drizzle/manage/meta/0016_snapshot.json         | 3530 +++++++++++++++
 .../agents-core/drizzle/manage/meta/_journal.json  |    7 +
 .../drizzle/runtime/0027_seed-playground-app.sql   |    2 +-
 .../drizzle/runtime/0029_burly_satana.sql          |   13 +
 .../{0023_snapshot.json => 0025_snapshot.json}     |    0
 .../drizzle/runtime/meta/0029_snapshot.json        | 4756 ++++++++++++++++++++
 .../agents-core/drizzle/runtime/meta/_journal.json |    7 +
 .../delete-deprecated-scheduled-triggers.ts        |  126 +
 .../scripts/drop-scheduled-trigger-tables.ts       |  125 +
 .../src/auth/__tests__/entitlements.test.ts        |  254 ++
 packages/agents-core/src/auth/auth.ts              |   50 +-
 .../agents-core/src/auth/entitlement-constants.ts  |   10 +
 packages/agents-core/src/auth/entitlement-lock.ts  |   23 +
 packages/agents-core/src/auth/entitlements.ts      |   84 +
 packages/agents-core/src/auth/init.ts              |    4 +-
 packages/agents-core/src/client-exports.ts         |    5 +
 packages/agents-core/src/data-access/index.ts      |    1 +
 .../src/data-access/runtime/entitlements.ts        |   86 +
 .../agents-core/src/db/manage/manage-schema.ts     |   89 -
 .../agents-core/src/db/runtime/runtime-schema.ts   |   28 +-
 packages/agents-core/src/index.ts                  |    3 +
 .../src/middleware/create-protected-route.ts       |   21 +-
 .../agents-core/src/middleware/entitlement-meta.ts |   14 +
 packages/agents-core/src/middleware/index.ts       |    5 +
 packages/agents-core/src/utils/error.ts            |    4 +
 packages/agents-core/src/validation/schemas.ts     |    2 +-
 specs/enforce-app-auth/SPEC.md                     |  124 +
 82 files changed, 11399 insertions(+), 675 deletions(-)
```

Full file list (including untracked files when present):

```
.changeset/abundant-bronze-dragon.md
.changeset/tasteless-rose-ostrich.md
.changeset/then-gold-deer.md
.changeset/written-aquamarine-sawfish.md
agents-api/__snapshots__/openapi.json
agents-api/src/__tests__/manage/routes/crud/appAuthKeys.test.ts
agents-api/src/__tests__/manage/routes/invitations.test.ts
agents-api/src/__tests__/middleware/requireEntitlement.test.ts
agents-api/src/__tests__/run/routes/auth.test.ts
agents-api/src/domains/manage/index.ts
agents-api/src/domains/manage/routes/appAuthKeys.ts
agents-api/src/domains/manage/routes/apps.ts
agents-api/src/domains/manage/routes/entitlements.ts
agents-api/src/domains/manage/routes/invitations.ts
agents-api/src/domains/manage/routes/projectFull.ts
agents-api/src/domains/manage/routes/projects.ts
agents-api/src/domains/run/routes/auth.ts
agents-api/src/middleware/errorHandler.ts
agents-api/src/middleware/requireEntitlement.ts
agents-api/src/middleware/runAuth.ts
agents-api/src/openapi.ts
agents-docs/content/api-reference/(openapi)/apps.mdx
agents-docs/content/api-reference/(openapi)/entitlements.mdx
agents-docs/content/talk-to-your-agents/(chat-components)/app-credentials.mdx
agents-docs/scripts/generate-openapi-docs.ts
agents-manage-ui/src/app/[tenantId]/billing/layout.tsx
agents-manage-ui/src/app/[tenantId]/billing/loading.tsx
agents-manage-ui/src/app/[tenantId]/billing/page.tsx
agents-manage-ui/src/app/[tenantId]/members/page.tsx
agents-manage-ui/src/app/[tenantId]/settings/page.tsx
agents-manage-ui/src/app/accept-invitation/[invitationId]/components/accept-decline.tsx
agents-manage-ui/src/app/accept-invitation/[invitationId]/components/auth-method-picker.tsx
agents-manage-ui/src/app/accept-invitation/[invitationId]/components/external-auth-buttons.tsx
agents-manage-ui/src/app/accept-invitation/[invitationId]/components/invitation-layout.tsx
agents-manage-ui/src/app/accept-invitation/[invitationId]/components/invitation-success.tsx
agents-manage-ui/src/app/accept-invitation/[invitationId]/components/login-form.tsx
agents-manage-ui/src/app/accept-invitation/[invitationId]/components/signup-form.tsx
agents-manage-ui/src/app/accept-invitation/[invitationId]/page.tsx
agents-manage-ui/src/components/access/hooks/use-project-access.ts
agents-manage-ui/src/components/apps/auth-keys-section.tsx
agents-manage-ui/src/components/apps/form/app-create-form.tsx
agents-manage-ui/src/components/apps/form/app-update-form.tsx
agents-manage-ui/src/components/apps/form/validation.ts
agents-manage-ui/src/components/form/__tests__/__screenshots__/form.browser.test.tsx/Form-should-properly-highlight-nested-error-state-1.png
agents-manage-ui/src/components/members/invite-member-dialog.tsx
agents-manage-ui/src/components/members/members-table.tsx
agents-manage-ui/src/components/members/org-role-selector.tsx
agents-manage-ui/src/components/projects/form/project-form.tsx
agents-manage-ui/src/components/sidebar-nav/app-sidebar.tsx
agents-manage-ui/src/constants/theme.ts
agents-manage-ui/src/hooks/use-org-members.ts
agents-manage-ui/src/lib/actions/app-auth-keys.ts
agents-manage-ui/src/lib/actions/invitations.ts
agents-manage-ui/src/lib/api/entitlements.ts
packages/agents-core/drizzle/manage/0016_complex_klaw.sql
packages/agents-core/drizzle/manage/meta/0016_snapshot.json
packages/agents-core/drizzle/manage/meta/_journal.json
packages/agents-core/drizzle/runtime/0027_seed-playground-app.sql
packages/agents-core/drizzle/runtime/0029_burly_satana.sql
packages/agents-core/drizzle/runtime/meta/0025_snapshot.json
packages/agents-core/drizzle/runtime/meta/0029_snapshot.json
packages/agents-core/drizzle/runtime/meta/_journal.json
packages/agents-core/scripts/delete-deprecated-scheduled-triggers.ts
packages/agents-core/scripts/drop-scheduled-trigger-tables.ts
packages/agents-core/src/auth/__tests__/entitlements.test.ts
packages/agents-core/src/auth/auth.ts
packages/agents-core/src/auth/entitlement-constants.ts
packages/agents-core/src/auth/entitlement-lock.ts
packages/agents-core/src/auth/entitlements.ts
packages/agents-core/src/auth/init.ts
packages/agents-core/src/client-exports.ts
packages/agents-core/src/data-access/index.ts
packages/agents-core/src/data-access/runtime/entitlements.ts
packages/agents-core/src/db/manage/manage-schema.ts
packages/agents-core/src/db/runtime/runtime-schema.ts
packages/agents-core/src/index.ts
packages/agents-core/src/middleware/create-protected-route.ts
packages/agents-core/src/middleware/entitlement-meta.ts
packages/agents-core/src/middleware/index.ts
packages/agents-core/src/utils/error.ts
packages/agents-core/src/validation/schemas.ts
specs/enforce-app-auth/SPEC.md
```

## Diff

> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~431248 bytes across ~82 files) exceeds the inline threshold (~100KB).
> The full diff is written to `.claude/pr-diff/full.diff`.
>
> **How to read diffs on-demand:**
> - Specific file: `git diff c278ea489c61d807679a60bcb95df13bf0a93c38 -- path/to/file.ts`
> - Full diff: read `.claude/pr-diff/full.diff`
> - Untracked files: inspect the file directly in the working tree

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
