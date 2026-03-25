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
| **PR** | Local review — feat/authenticated-chat-sessions vs main |
| **Author** | Andrew Mikofalvy |
| **Base** | `main` |
| **Repo** | inkeep/agents |
| **Head SHA** | `9b178af392f7968bd8cbd1124fa8fe9f92bfdd1d` |
| **Size** | 17 commits · +14992/-5079 · 190 files |
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
3bcdad34d fix: normalize data component schemas for cross-provider LLM compatibility (#2764)
51d6dfd22 fix work app domain verification (#2808)
a305f9453 Version Packages (#2797)
be7f05632 feat: Doltgres branch merge API (#2646)
6f1c5da84 fix(dashboard): Ensures rounded bottom corners render correctly in dark mode (#1547)
9dec3ffbf `inkeep pull`, split `introspect-generator.ts` in individual generator task.collect functions (#2654)
99b5edf94 update typescript to 6.0.2 (#2809)
6a8a43932 feat(github-work-apps): Add format option to GitHub file tools (#2820)
296c79aeb do not render tooltips for sidebar menu items (#2811)
6b9498616 Update and install Claude Code skills for frontend development (#2824)
551d6dea7 [US-001] Add PublicKeyConfig and WebClientAuthConfig schemas
df3557e00 [US-002] Add public key validation utility
3bb7d5ab4 [US-003] Add public key management API endpoints
bc57e4c21 [US-004] Add asymmetric JWT verification tests for app credential auth
2f8fd9a3a [US-005] Persist authenticated user identity and metadata on conversations
365708108 [US-006] Add public key management UI to app edit page
9b178af39 [US-007] Create global playground app via seed script
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 .agents/skills/emil-design-eng/SKILL.md            |  671 +++++
 .agents/skills/next-cache-components/SKILL.md      |   51 +
 .agents/skills/react/rules/no-dot-provider.md      |   18 -
 .agents/skills/shadcn/SKILL.md                     |    4 +-
 .agents/skills/shadcn/cli.md                       |    2 +
 .../skills/vercel-react-best-practices/AGENTS.md   |  511 +++-
 .../skills/vercel-react-best-practices/SKILL.md    |    9 +-
 .../vercel-react-best-practices/rules/_sections.md |   46 +
 .../vercel-react-best-practices/rules/_template.md |   28 +
 .../rules/js-flatmap-filter.md                     |   60 +
 .../rules/rendering-resource-hints.md              |   85 +
 .../rules/rendering-script-defer-async.md          |   68 +
 .../rules/rerender-no-inline-components.md         |   82 +
 .../rules/rerender-split-combined-hooks.md         |   64 +
 .../rules/rerender-use-deferred-value.md           |   59 +
 .../rules/server-hoist-static-io.md                |  142 ++
 .agents/skills/web-design-guidelines/SKILL.md      |   18 +-
 .changeset/brave-pens-merge.md                     |    6 +
 .changeset/capable-lime-barnacle.md                |    5 +
 .changeset/chilled-deers-listen.md                 |    5 +
 .changeset/clinical-bronze-mammal.md               |    5 -
 .changeset/gentle-lions-glow.md                    |    5 -
 .changeset/remove-sidebar-tooltips.md              |    5 +
 .changeset/shaggy-badgers-learn.md                 |    7 -
 .changeset/upgrade-typescript-six.md               |   12 +
 .changeset/weak-dryers-sneeze.md                   |    5 +
 .changeset/wet-bees-drive.md                       |    5 -
 .env.example                                       |    2 +
 .github/workflows/ci.yml                           |    8 +
 agents-api/CHANGELOG.md                            |   12 +
 agents-api/__snapshots__/openapi.json              |  510 +++-
 agents-api/package.json                            |    4 +-
 .../__tests__/manage/integration/branches.test.ts  |   38 +
 .../src/__tests__/manage/integration/merge.test.ts |  569 +++++
 .../manage/routes/crud/appAuthKeys.test.ts         |  252 ++
 .../crud/userScopedScheduledTriggers.test.ts       |    2 +-
 .../__tests__/manage/routes/merge-preview.test.ts  |  254 ++
 .../middleware/runAuth-appCredentialAuth.test.ts   |  709 ++++++
 .../run/agents/generateTaskHandler.test.ts         |    2 +-
 .../run/routes/chat/userProperties.test.ts         |  163 ++
 .../src/domains/manage/routes/appAuthKeys.ts       |  274 ++
 agents-api/src/domains/manage/routes/branches.ts   |   25 +-
 .../manage/routes/evals/datasetRunConfigs.ts       |    2 +-
 agents-api/src/domains/manage/routes/index.ts      |    4 +
 agents-api/src/domains/manage/routes/merge.ts      |  423 +++
 .../src/domains/manage/routes/projectFull.ts       |    2 +-
 agents-api/src/domains/manage/routes/projects.ts   |    4 +-
 .../src/domains/run/agents/generateTaskHandler.ts  |    2 +-
 .../src/domains/run/agents/generation/generate.ts  |   12 +-
 .../run/agents/generation/schema-builder.ts        |    4 +-
 agents-api/src/domains/run/agents/relationTools.ts |    2 +-
 .../run/artifacts/artifact-component-schema.ts     |    5 +-
 agents-api/src/domains/run/routes/chat.ts          |    7 +
 .../src/domains/run/routes/chatDataStream.ts       |    7 +
 .../run/services/ScheduledTriggerService.ts        |    6 +-
 .../src/domains/run/utils/SchemaProcessor.ts       |   63 +-
 .../workflow/functions/scheduledTriggerRunner.ts   |    2 +-
 .../run/workflow/steps/scheduledTriggerSteps.ts    |    2 +-
 agents-api/src/env.ts                              |    5 +
 agents-api/src/middleware/runAuth.ts               |  218 +-
 agents-api/tsconfig.json                           |    1 -
 agents-cli/CHANGELOG.md                            |   13 +
 agents-cli/package.json                            |    4 +-
 ...hen agent already has local context config.diff |    7 +-
 ... when agent already has local context config.ts |    3 +-
 .../__tests__/artifact-component-generator.test.ts |    2 +-
 .../__tests__/environment-generator.test.ts        |    6 +-
 .../src/commands/pull-v4/collector-common.ts       |  255 ++
 .../pull-v4/collector-reference-helpers.ts         |  839 ++++++
 agents-cli/src/commands/pull-v4/file-scope.ts      |   66 +
 .../commands/pull-v4/generation-resolver.test.ts   |  155 ++
 .../src/commands/pull-v4/generation-resolver.ts    |  586 +++++
 .../src/commands/pull-v4/generation-types.ts       |  157 ++
 .../pull-v4/generators/agent-generator.helpers.ts  |   14 -
 .../commands/pull-v4/generators/agent-generator.ts |  418 +--
 .../generators/artifact-component-generator.ts     |   99 +-
 .../pull-v4/generators/context-config-generator.ts |  481 ++--
 .../pull-v4/generators/credential-generator.ts     |   60 +-
 .../pull-v4/generators/data-component-generator.ts |  106 +-
 .../pull-v4/generators/environment-generator.ts    |  111 +-
 .../generators/environment-settings-generator.ts   |   81 +
 .../pull-v4/generators/external-agent-generator.ts |  101 +-
 .../pull-v4/generators/function-tool-generator.ts  |   96 +-
 .../commands/pull-v4/generators/helpers/agent.ts   |  216 ++
 .../pull-v4/generators/helpers/sub-agent.ts        |  148 ++
 .../src/commands/pull-v4/generators/index.ts       |   11 +
 .../pull-v4/generators/mcp-tool-generator.ts       |   94 +-
 .../pull-v4/generators/project-generator.ts        |  448 ++--
 .../generators/scheduled-trigger-generator.ts      |   91 +
 .../generators/status-component-generator.ts       |  111 +-
 .../pull-v4/generators/sub-agent-generator.ts      |  781 +++---
 .../pull-v4/generators/trigger-generator.ts        |  139 +-
 .../src/commands/pull-v4/import-plan.test.ts       |   33 +
 agents-cli/src/commands/pull-v4/import-plan.ts     |   64 +
 .../src/commands/pull-v4/introspect-generator.ts   | 2683 +-------------------
 .../commands/pull-v4/introspect/batch-pull.test.ts |   68 +
 .../introspect/context-config-regressions.test.ts  |   73 +-
 .../src/commands/pull-v4/introspect/index.ts       |   24 +-
 agents-cli/src/commands/pull-v4/module-merge.ts    |   33 +-
 .../commands/pull-v4/reference-resolution.test.ts  |  108 +
 .../src/commands/pull-v4/reference-resolution.ts   |  220 ++
 .../pull-v4/scheduled-trigger-generator.ts         |   52 -
 .../pull-v4/simple-factory-generator.test.ts       |  182 ++
 .../commands/pull-v4/simple-factory-generator.ts   |  102 +
 .../{generators/skill-generator.ts => skill.ts}    |   22 +-
 .../src/commands/pull-v4/typescript-file-writer.ts |  140 +
 agents-cli/src/commands/pull-v4/utils.ts           |  576 -----
 .../src/commands/pull-v4/utils/code-values.ts      |  123 +
 .../src/commands/pull-v4/utils/factory-writer.ts   |  209 ++
 agents-cli/src/commands/pull-v4/utils/index.ts     |    6 +
 agents-cli/src/commands/pull-v4/utils/naming.ts    |  125 +
 .../src/commands/pull-v4/utils/schema-rendering.ts |   20 +
 agents-cli/src/commands/pull-v4/utils/shared.ts    |   18 +
 agents-cli/src/commands/pull-v4/utils/templates.ts |   94 +
 .../src/commands/pull-v4/{ => utils}/utils.test.ts |  119 +-
 agents-cli/tsconfig.json                           |    3 +-
 .../evals/langfuse-dataset-example/package.json    |    2 +-
 agents-cookbook/package.json                       |    2 +-
 .../content/api-reference/(openapi)/branches.mdx   |   20 +-
 agents-docs/package.json                           |    2 +-
 agents-docs/tsconfig.json                          |    3 +-
 agents-manage-ui/CHANGELOG.md                      |   12 +
 agents-manage-ui/cypress/tsconfig.json             |    1 +
 agents-manage-ui/package.json                      |    4 +-
 agents-manage-ui/src/app/[tenantId]/layout.tsx     |    5 +-
 .../[projectId]/agents/[agentId]/page.client.tsx   |    2 +-
 .../[artifactComponentId]/generate-render/route.ts |    6 +-
 .../[dataComponentId]/generate-render/route.ts     |   10 +-
 .../src/components/apps/auth-keys-section.tsx      |  228 ++
 .../src/components/apps/form/app-update-form.tsx   |   41 +-
 .../src/components/apps/form/validation.ts         |    1 +
 .../src/components/apps/update-app-dialog.tsx      |    2 +-
 .../src/components/sidebar-nav/nav-group.tsx       |    6 +-
 .../src/components/sidebar-nav/nav-item.tsx        |   17 +-
 agents-manage-ui/src/lib/actions/app-auth-keys.ts  |   75 +
 agents-manage-ui/src/lib/api/app-auth-keys.ts      |   63 +
 agents-ui-demo/package.json                        |    2 +-
 .../apps/agents-api/package.json                   |    2 +-
 create-agents-template/apps/mcp/package.json       |    2 +-
 packages/agents-core/CHANGELOG.md                  |    7 +
 packages/agents-core/package.json                  |    4 +-
 .../src/__tests__/dolt/branches-api.test.ts        |  140 +-
 .../agents-core/src/__tests__/dolt/merge.test.ts   |  344 ++-
 .../agents-core/src/__tests__/dolt/pk-map.test.ts  |   44 +
 .../__tests__/dolt/ref-middleware-merge.test.ts    |   22 +
 .../src/__tests__/dolt/resolve-conflicts.test.ts   |  356 +++
 .../src/__tests__/dolt/schema-sync.test.ts         |   21 +-
 .../agentFull.rename-sub-agent-id.test.ts          |    2 +-
 .../dolt/resolve-conflicts.integration.test.ts     |  531 ++++
 packages/agents-core/src/auth/auth.ts              |   11 +-
 packages/agents-core/src/auth/init.ts              |   57 +
 .../src/data-access/runtime/conversations.ts       |    3 +
 .../src/db/runtime/test-runtime-client.ts          |    2 +-
 packages/agents-core/src/dolt/advisory-lock.ts     |   25 +
 packages/agents-core/src/dolt/branches-api.ts      |  147 +-
 packages/agents-core/src/dolt/index.ts             |    3 +
 packages/agents-core/src/dolt/merge.ts             |  285 ++-
 packages/agents-core/src/dolt/pk-map.ts            |   34 +
 packages/agents-core/src/dolt/ref-middleware.ts    |   21 +-
 packages/agents-core/src/dolt/resolve-conflicts.ts |  217 ++
 packages/agents-core/src/dolt/schema-sync.ts       |   50 +-
 packages/agents-core/src/types/utility.ts          |   11 +-
 .../utils/__tests__/schema-normalization.test.ts   |  175 ++
 .../utils/__tests__/validate-public-key.test.ts    |   82 +
 packages/agents-core/src/utils/index.ts            |    1 +
 .../agents-core/src/utils/schema-conversion.ts     |  129 +
 .../agents-core/src/utils/validate-public-key.ts   |  105 +
 packages/agents-core/src/utils/work-app-mcp.ts     |    9 +-
 .../__tests__/public-key-schemas.test.ts           |  126 +
 .../agents-core/src/validation/dolt-schemas.ts     |   91 +-
 packages/agents-core/src/validation/schemas.ts     |   28 +
 packages/agents-core/tsconfig.json                 |    1 -
 packages/agents-email/CHANGELOG.md                 |    2 +
 packages/agents-email/package.json                 |    4 +-
 packages/agents-email/tsconfig.json                |    1 -
 packages/agents-mcp/CHANGELOG.md                   |    2 +
 packages/agents-mcp/package.json                   |    2 +-
 packages/agents-sdk/CHANGELOG.md                   |    8 +
 packages/agents-sdk/package.json                   |    4 +-
 packages/agents-work-apps/CHANGELOG.md             |    8 +
 packages/agents-work-apps/package.json             |    5 +-
 packages/agents-work-apps/src/github/mcp/index.ts  |   22 +-
 packages/agents-work-apps/src/github/mcp/utils.ts  |   23 +-
 packages/agents-work-apps/tsconfig.json            |    3 +-
 packages/ai-sdk-provider/CHANGELOG.md              |    8 +
 packages/ai-sdk-provider/package.json              |    4 +-
 packages/ai-sdk-provider/tsconfig.json             |    1 -
 packages/create-agents/CHANGELOG.md                |    8 +
 packages/create-agents/package.json                |    4 +-
 packages/create-agents/tsconfig.json               |    1 +
 190 files changed, 14992 insertions(+), 5079 deletions(-)
```

Full file list (including untracked files when present):

```
.agents/skills/emil-design-eng/SKILL.md
.agents/skills/next-cache-components/SKILL.md
.agents/skills/react/rules/no-dot-provider.md
.agents/skills/shadcn/SKILL.md
.agents/skills/shadcn/cli.md
.agents/skills/vercel-react-best-practices/AGENTS.md
.agents/skills/vercel-react-best-practices/SKILL.md
.agents/skills/vercel-react-best-practices/rules/_sections.md
.agents/skills/vercel-react-best-practices/rules/_template.md
.agents/skills/vercel-react-best-practices/rules/js-flatmap-filter.md
.agents/skills/vercel-react-best-practices/rules/rendering-resource-hints.md
.agents/skills/vercel-react-best-practices/rules/rendering-script-defer-async.md
.agents/skills/vercel-react-best-practices/rules/rerender-no-inline-components.md
.agents/skills/vercel-react-best-practices/rules/rerender-split-combined-hooks.md
.agents/skills/vercel-react-best-practices/rules/rerender-use-deferred-value.md
.agents/skills/vercel-react-best-practices/rules/server-hoist-static-io.md
.agents/skills/web-design-guidelines/SKILL.md
.changeset/brave-pens-merge.md
.changeset/capable-lime-barnacle.md
.changeset/chilled-deers-listen.md
.changeset/clinical-bronze-mammal.md
.changeset/gentle-lions-glow.md
.changeset/remove-sidebar-tooltips.md
.changeset/shaggy-badgers-learn.md
.changeset/upgrade-typescript-six.md
.changeset/weak-dryers-sneeze.md
.changeset/wet-bees-drive.md
.env.example
.github/workflows/ci.yml
agents-api/CHANGELOG.md
agents-api/__snapshots__/openapi.json
agents-api/package.json
agents-api/src/__tests__/manage/integration/branches.test.ts
agents-api/src/__tests__/manage/integration/merge.test.ts
agents-api/src/__tests__/manage/routes/crud/appAuthKeys.test.ts
agents-api/src/__tests__/manage/routes/crud/userScopedScheduledTriggers.test.ts
agents-api/src/__tests__/manage/routes/merge-preview.test.ts
agents-api/src/__tests__/middleware/runAuth-appCredentialAuth.test.ts
agents-api/src/__tests__/run/agents/generateTaskHandler.test.ts
agents-api/src/__tests__/run/routes/chat/userProperties.test.ts
agents-api/src/domains/manage/routes/appAuthKeys.ts
agents-api/src/domains/manage/routes/branches.ts
agents-api/src/domains/manage/routes/evals/datasetRunConfigs.ts
agents-api/src/domains/manage/routes/index.ts
agents-api/src/domains/manage/routes/merge.ts
agents-api/src/domains/manage/routes/projectFull.ts
agents-api/src/domains/manage/routes/projects.ts
agents-api/src/domains/run/agents/generateTaskHandler.ts
agents-api/src/domains/run/agents/generation/generate.ts
agents-api/src/domains/run/agents/generation/schema-builder.ts
agents-api/src/domains/run/agents/relationTools.ts
agents-api/src/domains/run/artifacts/artifact-component-schema.ts
agents-api/src/domains/run/routes/chat.ts
agents-api/src/domains/run/routes/chatDataStream.ts
agents-api/src/domains/run/services/ScheduledTriggerService.ts
agents-api/src/domains/run/utils/SchemaProcessor.ts
agents-api/src/domains/run/workflow/functions/scheduledTriggerRunner.ts
agents-api/src/domains/run/workflow/steps/scheduledTriggerSteps.ts
agents-api/src/env.ts
agents-api/src/middleware/runAuth.ts
agents-api/tsconfig.json
agents-cli/CHANGELOG.md
agents-cli/package.json
agents-cli/src/commands/pull-v4/__tests__/__snapshots__/introspect/does not add context-config import when agent already has local context config.diff
agents-cli/src/commands/pull-v4/__tests__/__snapshots__/introspect/does not add context-config import when agent already has local context config.ts
agents-cli/src/commands/pull-v4/__tests__/artifact-component-generator.test.ts
agents-cli/src/commands/pull-v4/__tests__/environment-generator.test.ts
agents-cli/src/commands/pull-v4/collector-common.ts
agents-cli/src/commands/pull-v4/collector-reference-helpers.ts
agents-cli/src/commands/pull-v4/file-scope.ts
agents-cli/src/commands/pull-v4/generation-resolver.test.ts
agents-cli/src/commands/pull-v4/generation-resolver.ts
agents-cli/src/commands/pull-v4/generation-types.ts
agents-cli/src/commands/pull-v4/generators/agent-generator.helpers.ts
agents-cli/src/commands/pull-v4/generators/agent-generator.ts
agents-cli/src/commands/pull-v4/generators/artifact-component-generator.ts
agents-cli/src/commands/pull-v4/generators/context-config-generator.ts
agents-cli/src/commands/pull-v4/generators/credential-generator.ts
agents-cli/src/commands/pull-v4/generators/data-component-generator.ts
agents-cli/src/commands/pull-v4/generators/environment-generator.ts
agents-cli/src/commands/pull-v4/generators/environment-settings-generator.ts
agents-cli/src/commands/pull-v4/generators/external-agent-generator.ts
agents-cli/src/commands/pull-v4/generators/function-tool-generator.ts
agents-cli/src/commands/pull-v4/generators/helpers/agent.ts
agents-cli/src/commands/pull-v4/generators/helpers/sub-agent.ts
agents-cli/src/commands/pull-v4/generators/index.ts
agents-cli/src/commands/pull-v4/generators/mcp-tool-generator.ts
agents-cli/src/commands/pull-v4/generators/project-generator.ts
agents-cli/src/commands/pull-v4/generators/scheduled-trigger-generator.ts
agents-cli/src/commands/pull-v4/generators/status-component-generator.ts
agents-cli/src/commands/pull-v4/generators/sub-agent-generator.ts
agents-cli/src/commands/pull-v4/generators/trigger-generator.ts
agents-cli/src/commands/pull-v4/import-plan.test.ts
agents-cli/src/commands/pull-v4/import-plan.ts
agents-cli/src/commands/pull-v4/introspect-generator.ts
agents-cli/src/commands/pull-v4/introspect/batch-pull.test.ts
agents-cli/src/commands/pull-v4/introspect/context-config-regressions.test.ts
agents-cli/src/commands/pull-v4/introspect/index.ts
agents-cli/src/commands/pull-v4/module-merge.ts
agents-cli/src/commands/pull-v4/reference-resolution.test.ts
agents-cli/src/commands/pull-v4/reference-resolution.ts
agents-cli/src/commands/pull-v4/scheduled-trigger-generator.ts
agents-cli/src/commands/pull-v4/simple-factory-generator.test.ts
agents-cli/src/commands/pull-v4/simple-factory-generator.ts
agents-cli/src/commands/pull-v4/skill.ts
agents-cli/src/commands/pull-v4/typescript-file-writer.ts
agents-cli/src/commands/pull-v4/utils.ts
agents-cli/src/commands/pull-v4/utils/code-values.ts
agents-cli/src/commands/pull-v4/utils/factory-writer.ts
agents-cli/src/commands/pull-v4/utils/index.ts
agents-cli/src/commands/pull-v4/utils/naming.ts
agents-cli/src/commands/pull-v4/utils/schema-rendering.ts
agents-cli/src/commands/pull-v4/utils/shared.ts
agents-cli/src/commands/pull-v4/utils/templates.ts
agents-cli/src/commands/pull-v4/utils/utils.test.ts
agents-cli/tsconfig.json
agents-cookbook/evals/langfuse-dataset-example/package.json
agents-cookbook/package.json
agents-docs/content/api-reference/(openapi)/branches.mdx
agents-docs/package.json
agents-docs/tsconfig.json
agents-manage-ui/CHANGELOG.md
agents-manage-ui/cypress/tsconfig.json
agents-manage-ui/package.json
agents-manage-ui/src/app/[tenantId]/layout.tsx
agents-manage-ui/src/app/[tenantId]/projects/[projectId]/agents/[agentId]/page.client.tsx
agents-manage-ui/src/app/api/artifact-components/[artifactComponentId]/generate-render/route.ts
agents-manage-ui/src/app/api/data-components/[dataComponentId]/generate-render/route.ts
agents-manage-ui/src/components/apps/auth-keys-section.tsx
agents-manage-ui/src/components/apps/form/app-update-form.tsx
agents-manage-ui/src/components/apps/form/validation.ts
agents-manage-ui/src/components/apps/update-app-dialog.tsx
agents-manage-ui/src/components/sidebar-nav/nav-group.tsx
agents-manage-ui/src/components/sidebar-nav/nav-item.tsx
agents-manage-ui/src/lib/actions/app-auth-keys.ts
agents-manage-ui/src/lib/api/app-auth-keys.ts
agents-ui-demo/package.json
create-agents-template/apps/agents-api/package.json
create-agents-template/apps/mcp/package.json
packages/agents-core/CHANGELOG.md
packages/agents-core/package.json
packages/agents-core/src/__tests__/dolt/branches-api.test.ts
packages/agents-core/src/__tests__/dolt/merge.test.ts
packages/agents-core/src/__tests__/dolt/pk-map.test.ts
packages/agents-core/src/__tests__/dolt/ref-middleware-merge.test.ts
packages/agents-core/src/__tests__/dolt/resolve-conflicts.test.ts
packages/agents-core/src/__tests__/dolt/schema-sync.test.ts
packages/agents-core/src/__tests__/integration/data-access/agentFull.rename-sub-agent-id.test.ts
packages/agents-core/src/__tests__/integration/dolt/resolve-conflicts.integration.test.ts
packages/agents-core/src/auth/auth.ts
packages/agents-core/src/auth/init.ts
packages/agents-core/src/data-access/runtime/conversations.ts
packages/agents-core/src/db/runtime/test-runtime-client.ts
packages/agents-core/src/dolt/advisory-lock.ts
packages/agents-core/src/dolt/branches-api.ts
packages/agents-core/src/dolt/index.ts
packages/agents-core/src/dolt/merge.ts
packages/agents-core/src/dolt/pk-map.ts
packages/agents-core/src/dolt/ref-middleware.ts
packages/agents-core/src/dolt/resolve-conflicts.ts
packages/agents-core/src/dolt/schema-sync.ts
packages/agents-core/src/types/utility.ts
packages/agents-core/src/utils/__tests__/schema-normalization.test.ts
packages/agents-core/src/utils/__tests__/validate-public-key.test.ts
packages/agents-core/src/utils/index.ts
packages/agents-core/src/utils/schema-conversion.ts
packages/agents-core/src/utils/validate-public-key.ts
packages/agents-core/src/utils/work-app-mcp.ts
packages/agents-core/src/validation/__tests__/public-key-schemas.test.ts
packages/agents-core/src/validation/dolt-schemas.ts
packages/agents-core/src/validation/schemas.ts
packages/agents-core/tsconfig.json
packages/agents-email/CHANGELOG.md
packages/agents-email/package.json
packages/agents-email/tsconfig.json
packages/agents-mcp/CHANGELOG.md
packages/agents-mcp/package.json
packages/agents-sdk/CHANGELOG.md
packages/agents-sdk/package.json
packages/agents-work-apps/CHANGELOG.md
packages/agents-work-apps/package.json
packages/agents-work-apps/src/github/mcp/index.ts
packages/agents-work-apps/src/github/mcp/utils.ts
packages/agents-work-apps/tsconfig.json
packages/ai-sdk-provider/CHANGELOG.md
packages/ai-sdk-provider/package.json
packages/ai-sdk-provider/tsconfig.json
packages/create-agents/CHANGELOG.md
packages/create-agents/package.json
packages/create-agents/tsconfig.json
```

## Diff

> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~812727 bytes across ~190 files) exceeds the inline threshold (~100KB).
> The full diff is written to `.claude/pr-diff/full.diff`.
>
> **How to read diffs on-demand:**
> - Specific file: `git diff 6ca8164e64f8a6d08d020ba49c7b63aa68f9db05 -- path/to/file.ts`
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
