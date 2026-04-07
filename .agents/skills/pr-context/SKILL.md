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
| **PR** | Local review — feat/logger-scoped-context vs main |
| **Author** | Andrew Mikofalvy |
| **Base** | `main` |
| **Repo** | inkeep/agents |
| **Head SHA** | `956653d6e02336d2b8fa1d9c60a826b5c3060a4e` |
| **Size** | 15 commits · +12282/-2143 · 135 files |
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
78c78d7cc fix(agents): make model fallback skip empty settings and honor project defaults (#3001)
dbee04b62 feedback (#2940)
4077b674a Bump agents UI 0.15.29 (#3031)
16fb544fd batch `useWatch` calls (#3030)
3735393a3 Stricter project ID validation to prevent branch deletion collisions (#3033)
6f2619d8d Fix/execution route openapi paths (#3038)
76f5e5f77 Version Packages (#3027)
070b9acf2 fix migration timestamp (#3039)
259797c83 fix `useFormState` on agent page was not updated with enabled react compiler (#3040)
a9511788e feat: durable delegated tool approval flow (#2966)
34e1d6797 fix(agents-core): improve Doltgres error observability and fix silent data loss (#3034)
ce94912a5 fix (#3044)
6b19fb5b5 feat(agents-core): add scoped logger context via AsyncLocalStorage
2f0b3b832 chore: add changesets for logger scoped context
956653d6e fixup! local-review: baseline (pre-review state)
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 .changeset/dry-shoes-attend.md                     |    5 +
 .changeset/fix-use-form-state-compiler.md          |    5 +
 .changeset/joyous-turquoise-sailfish.md            |    5 +
 .changeset/parental-copper-cat.md                  |    6 +
 .changeset/roasted-aqua-blackbird.md               |    5 +
 .changeset/tiny-eels-burn.md                       |    5 +
 AGENTS.md                                          |    6 +-
 agents-api/CHANGELOG.md                            |   14 +
 agents-api/__snapshots__/openapi.json              | 2813 +++++++----
 agents-api/package.json                            |    2 +-
 .../__tests__/manage/routes/crud/feedback.test.ts  |  256 +
 .../src/__tests__/manage/routes/github.test.ts     |    4 +
 .../handlers/executionHandler-run-as-user.test.ts  |   73 +-
 agents-api/src/__tests__/run/routes/chat.test.ts   |    1 +
 .../src/__tests__/run/routes/webhooks.test.ts      |   26 +-
 .../src/__tests__/run/utils/model-resolver.test.ts |   59 +-
 agents-api/src/__tests__/setup.ts                  |    4 +
 agents-api/src/createApp.ts                        |   29 +-
 agents-api/src/domains/manage/index.ts             |    4 +
 agents-api/src/domains/manage/routes/feedback.ts   |  287 ++
 agents-api/src/domains/manage/routes/github.ts     |  452 +-
 agents-api/src/domains/run/agents/Agent.ts         |    4 +-
 agents-api/src/domains/run/agents/agent-types.ts   |   20 +-
 .../src/domains/run/agents/generateTaskHandler.ts  |   66 +-
 .../tool-result-for-conversation-history.ts        |   11 +-
 agents-api/src/domains/run/agents/relationTools.ts |   36 +-
 .../src/domains/run/agents/tools/relation-tools.ts |    1 +
 .../src/domains/run/agents/tools/tool-approval.ts  |   12 -
 .../src/domains/run/agents/tools/tool-wrapper.ts   |  100 +-
 .../src/domains/run/handlers/executionHandler.ts   |   23 +-
 agents-api/src/domains/run/index.ts                |    2 +
 agents-api/src/domains/run/routes/chat.ts          |    6 +-
 .../src/domains/run/routes/chatDataStream.ts       |    6 +-
 agents-api/src/domains/run/routes/executions.ts    |    6 +-
 agents-api/src/domains/run/routes/feedback.ts      |  102 +
 .../src/domains/run/services/TriggerService.ts     |  905 ++--
 .../services/__tests__/triggerDispatcher.test.ts   |   14 +-
 .../src/domains/run/services/triggerDispatcher.ts  |    7 +-
 agents-api/src/domains/run/session/AgentSession.ts |  134 +-
 agents-api/src/domains/run/utils/model-resolver.ts |   30 +-
 .../run/workflow/functions/agentExecution.ts       |   37 +-
 .../run/workflow/steps/agentExecutionSteps.ts      |  184 +-
 agents-api/src/logger.ts                           |    4 +-
 agents-api/src/middleware/branchScopedDb.ts        |   13 +-
 agents-api/src/middleware/errorHandler.ts          |    4 +-
 agents-api/src/openapi.ts                          |    1 +
 agents-cli/CHANGELOG.md                            |   12 +
 agents-cli/package.json                            |    2 +-
 .../_snippets/generated/style-classnames.mdx       |    1 -
 .../content/api-reference/(openapi)/executions.mdx |    2 +-
 .../content/api-reference/(openapi)/feedback.mdx   |   59 +
 .../api-reference/(openapi)/scheduled-triggers.mdx |   22 +-
 agents-docs/package.json                           |    4 +-
 agents-docs/scripts/generate-openapi-docs.ts       |    1 +
 .../src/components/inkeep/inkeep-script.tsx        |   13 +-
 agents-manage-ui/CHANGELOG.md                      |   11 +
 agents-manage-ui/package.json                      |    4 +-
 .../projects/[projectId]/feedback/page.tsx         |   65 +
 .../traces/conversations/[conversationId]/page.tsx |   39 +-
 .../traces/conversations/[conversationId]/route.ts |    6 +-
 .../agent/error-display/agent-error-summary.tsx    |    6 +-
 .../components/agent/nodes/function-tool-node.tsx  |    2 +-
 .../src/components/agent/nodes/mcp-node.tsx        |    7 +-
 .../src/components/agent/nodes/sub-agent-node.tsx  |   17 +-
 .../components/agent/playground/chat-widget.tsx    |   63 +-
 .../agent/playground/feedback-dialog.tsx           |  140 +-
 .../agent/sidepane/metadata/metadata-editor.tsx    |   15 +-
 .../agent/sidepane/nodes/mcp-node-editor.tsx       |    5 +-
 .../agent/sidepane/nodes/sub-agent-node-editor.tsx |   10 +-
 .../components/agent/use-grouped-agent-errors.ts   |   60 +-
 .../credentials/views/credential-form.tsx          |    6 +-
 .../evaluation-run-config-form-dialog.tsx          |    7 +-
 .../feedback/delete-feedback-confirmation.tsx      |   72 +
 .../src/components/feedback/feedback-table.tsx     |  362 ++
 .../mcp-servers/form/mcp-server-form.tsx           |   12 +-
 .../mcp-servers/form/tool-override-dialog.tsx      |    7 +-
 .../src/components/projects/form/project-form.tsx  |    2 +-
 .../projects/form/project-models-section.tsx       |   22 +-
 .../projects/form/project-stopwhen-section.tsx     |   16 +-
 .../scheduled-triggers/scheduled-trigger-form.tsx  |    6 +-
 .../src/components/sidebar-nav/app-sidebar.tsx     |    6 +
 .../traces/timeline/hierarchical-timeline.tsx      |    7 +
 .../traces/timeline/render-panel-content.tsx       |   29 +
 .../components/traces/timeline/timeline-item.tsx   |    6 +-
 .../traces/timeline/timeline-wrapper.tsx           |   26 +
 .../src/components/traces/timeline/types.ts        |    1 +
 .../src/components/triggers/trigger-form.tsx       |   50 +-
 agents-manage-ui/src/constants/theme.ts            |    1 +
 .../src/hooks/use-processed-errors.tsx             |   27 +-
 .../src/lib/actions/__tests__/feedback.test.ts     |   90 +
 agents-manage-ui/src/lib/actions/feedback.ts       |   80 +
 agents-manage-ui/src/lib/api/feedback.ts           |   73 +
 agents-ui-demo/package.json                        |    2 +-
 packages/agents-core/CHANGELOG.md                  |    7 +
 .../drizzle/runtime/0034_simple_sphinx.sql         |   17 +
 .../drizzle/runtime/meta/0034_snapshot.json        | 5288 ++++++++++++++++++++
 .../agents-core/drizzle/runtime/meta/_journal.json |    9 +-
 packages/agents-core/package.json                  |    2 +-
 .../__tests__/data-access/projectLifecycle.test.ts |   52 +-
 .../src/__tests__/dolt/ref-scope.test.ts           |  102 +
 .../agents-core/src/constants/otel-attributes.ts   |    1 +
 packages/agents-core/src/data-access/index.ts      |    1 +
 .../src/data-access/runtime/feedback.ts            |  174 +
 .../agents-core/src/db/manage/manage-client.ts     |   21 +-
 .../agents-core/src/db/runtime/runtime-client.ts   |   10 +-
 .../agents-core/src/db/runtime/runtime-schema.ts   |   39 +
 packages/agents-core/src/dolt/merge.ts             |   16 +-
 packages/agents-core/src/dolt/ref-scope.ts         |   34 +-
 packages/agents-core/src/types/entities.ts         |    7 +
 .../agents-core/src/utils/__tests__/error.test.ts  |   62 +-
 .../agents-core/src/utils/__tests__/logger.test.ts |  202 +
 packages/agents-core/src/utils/error.ts            |  112 +-
 packages/agents-core/src/utils/logger.ts           |   77 +-
 packages/agents-core/src/validation/schemas.ts     |   41 +-
 .../agents-core/src/validation/schemas/shared.ts   |   17 +
 packages/agents-email/CHANGELOG.md                 |    2 +
 packages/agents-email/package.json                 |    2 +-
 packages/agents-mcp/CHANGELOG.md                   |    2 +
 packages/agents-mcp/package.json                   |    2 +-
 packages/agents-sdk/CHANGELOG.md                   |    8 +
 packages/agents-sdk/package.json                   |    2 +-
 packages/agents-work-apps/CHANGELOG.md             |    8 +
 packages/agents-work-apps/package.json             |    2 +-
 packages/agents-work-apps/src/__tests__/setup.ts   |    2 +
 packages/ai-sdk-provider/CHANGELOG.md              |    8 +
 packages/ai-sdk-provider/package.json              |    2 +-
 packages/create-agents/CHANGELOG.md                |    8 +
 packages/create-agents/package.json                |    2 +-
 specs/2026-04-06-logger-scoped-context/SPEC.md     |  371 ++
 .../evidence/als-performance.md                    |   48 +
 .../evidence/context-propagation.md                |   54 +
 .../evidence/current-logger-usage.md               |   40 +
 .../meta/_changelog.md                             |   46 +
 .../meta/audit-findings.md                         |  134 +
 .../meta/design-challenge.md                       |  126 +
 135 files changed, 12282 insertions(+), 2143 deletions(-)
```

Full file list (including untracked files when present):

```
.changeset/dry-shoes-attend.md
.changeset/fix-use-form-state-compiler.md
.changeset/joyous-turquoise-sailfish.md
.changeset/parental-copper-cat.md
.changeset/roasted-aqua-blackbird.md
.changeset/tiny-eels-burn.md
AGENTS.md
agents-api/CHANGELOG.md
agents-api/__snapshots__/openapi.json
agents-api/package.json
agents-api/src/__tests__/manage/routes/crud/feedback.test.ts
agents-api/src/__tests__/manage/routes/github.test.ts
agents-api/src/__tests__/run/handlers/executionHandler-run-as-user.test.ts
agents-api/src/__tests__/run/routes/chat.test.ts
agents-api/src/__tests__/run/routes/webhooks.test.ts
agents-api/src/__tests__/run/utils/model-resolver.test.ts
agents-api/src/__tests__/setup.ts
agents-api/src/createApp.ts
agents-api/src/domains/manage/index.ts
agents-api/src/domains/manage/routes/feedback.ts
agents-api/src/domains/manage/routes/github.ts
agents-api/src/domains/run/agents/Agent.ts
agents-api/src/domains/run/agents/agent-types.ts
agents-api/src/domains/run/agents/generateTaskHandler.ts
agents-api/src/domains/run/agents/generation/tool-result-for-conversation-history.ts
agents-api/src/domains/run/agents/relationTools.ts
agents-api/src/domains/run/agents/tools/relation-tools.ts
agents-api/src/domains/run/agents/tools/tool-approval.ts
agents-api/src/domains/run/agents/tools/tool-wrapper.ts
agents-api/src/domains/run/handlers/executionHandler.ts
agents-api/src/domains/run/index.ts
agents-api/src/domains/run/routes/chat.ts
agents-api/src/domains/run/routes/chatDataStream.ts
agents-api/src/domains/run/routes/executions.ts
agents-api/src/domains/run/routes/feedback.ts
agents-api/src/domains/run/services/TriggerService.ts
agents-api/src/domains/run/services/__tests__/triggerDispatcher.test.ts
agents-api/src/domains/run/services/triggerDispatcher.ts
agents-api/src/domains/run/session/AgentSession.ts
agents-api/src/domains/run/utils/model-resolver.ts
agents-api/src/domains/run/workflow/functions/agentExecution.ts
agents-api/src/domains/run/workflow/steps/agentExecutionSteps.ts
agents-api/src/logger.ts
agents-api/src/middleware/branchScopedDb.ts
agents-api/src/middleware/errorHandler.ts
agents-api/src/openapi.ts
agents-cli/CHANGELOG.md
agents-cli/package.json
agents-docs/_snippets/generated/style-classnames.mdx
agents-docs/content/api-reference/(openapi)/executions.mdx
agents-docs/content/api-reference/(openapi)/feedback.mdx
agents-docs/content/api-reference/(openapi)/scheduled-triggers.mdx
agents-docs/package.json
agents-docs/scripts/generate-openapi-docs.ts
agents-docs/src/components/inkeep/inkeep-script.tsx
agents-manage-ui/CHANGELOG.md
agents-manage-ui/package.json
agents-manage-ui/src/app/[tenantId]/projects/[projectId]/feedback/page.tsx
agents-manage-ui/src/app/[tenantId]/projects/[projectId]/traces/conversations/[conversationId]/page.tsx
agents-manage-ui/src/app/api/traces/conversations/[conversationId]/route.ts
agents-manage-ui/src/components/agent/error-display/agent-error-summary.tsx
agents-manage-ui/src/components/agent/nodes/function-tool-node.tsx
agents-manage-ui/src/components/agent/nodes/mcp-node.tsx
agents-manage-ui/src/components/agent/nodes/sub-agent-node.tsx
agents-manage-ui/src/components/agent/playground/chat-widget.tsx
agents-manage-ui/src/components/agent/playground/feedback-dialog.tsx
agents-manage-ui/src/components/agent/sidepane/metadata/metadata-editor.tsx
agents-manage-ui/src/components/agent/sidepane/nodes/mcp-node-editor.tsx
agents-manage-ui/src/components/agent/sidepane/nodes/sub-agent-node-editor.tsx
agents-manage-ui/src/components/agent/use-grouped-agent-errors.ts
agents-manage-ui/src/components/credentials/views/credential-form.tsx
agents-manage-ui/src/components/evaluation-run-configs/evaluation-run-config-form-dialog.tsx
agents-manage-ui/src/components/feedback/delete-feedback-confirmation.tsx
agents-manage-ui/src/components/feedback/feedback-table.tsx
agents-manage-ui/src/components/mcp-servers/form/mcp-server-form.tsx
agents-manage-ui/src/components/mcp-servers/form/tool-override-dialog.tsx
agents-manage-ui/src/components/projects/form/project-form.tsx
agents-manage-ui/src/components/projects/form/project-models-section.tsx
agents-manage-ui/src/components/projects/form/project-stopwhen-section.tsx
agents-manage-ui/src/components/scheduled-triggers/scheduled-trigger-form.tsx
agents-manage-ui/src/components/sidebar-nav/app-sidebar.tsx
agents-manage-ui/src/components/traces/timeline/hierarchical-timeline.tsx
agents-manage-ui/src/components/traces/timeline/render-panel-content.tsx
agents-manage-ui/src/components/traces/timeline/timeline-item.tsx
agents-manage-ui/src/components/traces/timeline/timeline-wrapper.tsx
agents-manage-ui/src/components/traces/timeline/types.ts
agents-manage-ui/src/components/triggers/trigger-form.tsx
agents-manage-ui/src/constants/theme.ts
agents-manage-ui/src/hooks/use-processed-errors.tsx
agents-manage-ui/src/lib/actions/__tests__/feedback.test.ts
agents-manage-ui/src/lib/actions/feedback.ts
agents-manage-ui/src/lib/api/feedback.ts
agents-ui-demo/package.json
packages/agents-core/CHANGELOG.md
packages/agents-core/drizzle/runtime/0034_simple_sphinx.sql
packages/agents-core/drizzle/runtime/meta/0034_snapshot.json
packages/agents-core/drizzle/runtime/meta/_journal.json
packages/agents-core/package.json
packages/agents-core/src/__tests__/data-access/projectLifecycle.test.ts
packages/agents-core/src/__tests__/dolt/ref-scope.test.ts
packages/agents-core/src/constants/otel-attributes.ts
packages/agents-core/src/data-access/index.ts
packages/agents-core/src/data-access/runtime/feedback.ts
packages/agents-core/src/db/manage/manage-client.ts
packages/agents-core/src/db/runtime/runtime-client.ts
packages/agents-core/src/db/runtime/runtime-schema.ts
packages/agents-core/src/dolt/merge.ts
packages/agents-core/src/dolt/ref-scope.ts
packages/agents-core/src/types/entities.ts
packages/agents-core/src/utils/__tests__/error.test.ts
packages/agents-core/src/utils/__tests__/logger.test.ts
packages/agents-core/src/utils/error.ts
packages/agents-core/src/utils/logger.ts
packages/agents-core/src/validation/schemas.ts
packages/agents-core/src/validation/schemas/shared.ts
packages/agents-email/CHANGELOG.md
packages/agents-email/package.json
packages/agents-mcp/CHANGELOG.md
packages/agents-mcp/package.json
packages/agents-sdk/CHANGELOG.md
packages/agents-sdk/package.json
packages/agents-work-apps/CHANGELOG.md
packages/agents-work-apps/package.json
packages/agents-work-apps/src/__tests__/setup.ts
packages/ai-sdk-provider/CHANGELOG.md
packages/ai-sdk-provider/package.json
packages/create-agents/CHANGELOG.md
packages/create-agents/package.json
specs/2026-04-06-logger-scoped-context/SPEC.md
specs/2026-04-06-logger-scoped-context/evidence/als-performance.md
specs/2026-04-06-logger-scoped-context/evidence/context-propagation.md
specs/2026-04-06-logger-scoped-context/evidence/current-logger-usage.md
specs/2026-04-06-logger-scoped-context/meta/_changelog.md
specs/2026-04-06-logger-scoped-context/meta/audit-findings.md
specs/2026-04-06-logger-scoped-context/meta/design-challenge.md
```

## Diff

> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~664491 bytes across ~135 files) exceeds the inline threshold (~100KB).
> The full diff is written to `.claude/pr-diff/full.diff`.
>
> **How to read diffs on-demand:**
> - Specific file: `git diff a9ad835071d281e33a2c3bb0ad2bcaead6df03fb -- path/to/file.ts`
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
