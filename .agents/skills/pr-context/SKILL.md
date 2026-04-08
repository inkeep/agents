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
| **PR** | Local review — prd-6462 vs main |
| **Author** | Andrew Mikofalvy |
| **Base** | `main` |
| **Repo** | inkeep/agents |
| **Head SHA** | `7f1a6d8d6373c281c4f154bb30d68ba1d872dfab` |
| **Size** | 28 commits · +73811/-21460 · 1640 files |
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
fa18f8434 fix: return static error message for all 500-level API responses (#2718)
1f1b4b93f auto add dashes if user types a space in the skill name (#3048)
1a504c751 Add nested folder documentation and info tooltip for skill file paths (#3049)
50f57fad5 fix(slack-work-app): Listen to deletion events (#3050)
ebdd24f29 fix local timezone for datasets and evals (#3051)
b33134a80 Update agents mcp (#3047)
867b0f5df fix: validate originalToolCallId in durable approval to prevent replay (#3053)
d62beff93 Fixes changeset (#3059)
93eb31e84 feat: add scoped logger context via AsyncLocalStorage (#3054)
cb2cae37a Version Packages (#3041)
01a960dd4 refactor: extract magic string literals into shared constants (#3065)
98399ec4e Prd 6447 (#3068)
f0a7ee8d5 ci: harden Railway preview recovery (#3061)
63a13583d refactor: migrate logger calls to scoped context patterns (#3067)
c2157012a refactor(test): create reusable logger mock factory and migrate 71 test files
7f1a6d8d6 style: fix import ordering from biome auto-format
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 .changeset/rational-teal-emu.md                    |    7 +
 .changeset/sunny-mugs-carry.md                     |    9 +
 .changeset/urgent-blush-lion.md                    |    5 +
 .../bootstrap-preview-auth-with-recovery.sh        |  226 +
 .github/scripts/preview/bootstrap-preview-auth.sh  |  107 +-
 .../scripts/preview/cleanup-stale-railway-envs.sh  |   57 +-
 .github/scripts/preview/common.sh                  |   63 +-
 .github/scripts/preview/provision-railway.sh       |   54 +-
 .github/workflows/preview-environments.yml         |   41 +-
 AGENTS.md                                          |    6 +-
 agents-api/CHANGELOG.md                            |   33 +
 agents-api/__snapshots__/openapi.json              | 2813 +++++++----
 agents-api/package.json                            |    2 +-
 .../evals/routes/evaluationTriggers.test.ts        |   10 +-
 .../evals/services/EvaluationService.test.ts       |   10 +-
 .../evals/workflow/evaluateConversation.test.ts    |   10 +-
 .../evals/workflow/runDatasetItem.test.ts          |   10 +-
 .../src/__tests__/manage/data/agentFull.test.ts    |   11 +-
 .../__tests__/manage/data/conversations.test.ts    |   10 +-
 .../manage/routes/conversations-media.test.ts      |   20 +-
 .../manage/routes/crud/credentialStores.test.ts    |    6 +-
 .../__tests__/manage/routes/crud/feedback.test.ts  |  256 +
 .../src/__tests__/manage/routes/github.test.ts     |   17 +-
 .../__tests__/manage/routes/invitations.test.ts    |    6 +-
 .../manage/routes/mcp-tool-github-access.test.ts   |    9 +-
 .../manage/routes/mcp-tool-slack-access.test.ts    |    9 +-
 .../manage/routes/passwordResetLinks.test.ts       |    8 +-
 .../manage/routes/project-github-access.test.ts    |    9 +-
 .../src/__tests__/manage/routes/users.test.ts      |    4 +-
 .../middleware/runAuth-appCredentialAuth.test.ts   |   10 +-
 .../middleware/runAuth-initiatedBy.test.ts         |   10 +-
 agents-api/src/__tests__/run/a2a/handlers.test.ts  |    9 +-
 agents-api/src/__tests__/run/agents/Agent.test.ts  |   11 +-
 .../src/__tests__/run/agents/ModelFactory.test.ts  |   11 +-
 .../run/agents/conversation-history.test.ts        |    5 +-
 .../run/agents/generateTaskHandler.test.ts         |    9 +-
 .../src/__tests__/run/agents/relationTools.test.ts |   11 +-
 .../conversations.artifact-replacement.test.ts     |    5 +-
 .../handlers/executionHandler-run-as-user.test.ts  |   78 +-
 .../executionHandler-team-delegation.test.ts       |   10 +-
 agents-api/src/__tests__/run/routes/chat.test.ts   |    4 +-
 .../src/__tests__/run/routes/integration.test.ts   |   17 +-
 .../src/__tests__/run/routes/webhooks.test.ts      |   23 +-
 .../src/__tests__/run/utils/model-resolver.test.ts |   59 +-
 agents-api/src/__tests__/setup.ts                  |   44 +-
 .../src/__tests__/utils/in-process-fetch.test.ts   |   10 +-
 agents-api/src/createApp.ts                        |   29 +-
 .../src/domains/evals/routes/evaluationTriggers.ts |   32 +-
 .../domains/evals/services/EvaluationService.ts    |    4 +-
 .../evals/services/conversationEvaluation.ts       |   12 +-
 .../src/domains/evals/services/datasetRun.ts       |    2 +-
 .../src/domains/evals/services/evaluationJob.ts    |    2 +-
 .../evals/workflow/functions/runDatasetItem.ts     |    4 +-
 agents-api/src/domains/manage/index.ts             |    4 +
 .../src/domains/manage/routes/availableAgents.ts   |    4 +-
 .../src/domains/manage/routes/conversations.ts     |    9 +-
 .../manage/routes/evals/agentDatasetRelations.ts   |   16 +-
 .../manage/routes/evals/agentEvaluatorRelations.ts |   27 +-
 .../domains/manage/routes/evals/datasetItems.ts    |   26 +-
 .../manage/routes/evals/datasetRunConfigs.ts       |   29 +-
 .../src/domains/manage/routes/evals/datasetRuns.ts |    6 +-
 .../src/domains/manage/routes/evals/datasets.ts    |   16 +-
 .../evals/evaluationJobConfigEvaluatorRelations.ts |   16 +-
 .../manage/routes/evals/evaluationJobConfigs.ts    |   34 +-
 .../manage/routes/evals/evaluationResults.ts       |   17 +-
 .../manage/routes/evals/evaluationRunConfigs.ts    |   27 +-
 .../evaluationSuiteConfigEvaluatorRelations.ts     |   16 +-
 .../manage/routes/evals/evaluationSuiteConfigs.ts  |   28 +-
 .../src/domains/manage/routes/evals/evaluators.ts  |   18 +-
 agents-api/src/domains/manage/routes/feedback.ts   |  287 ++
 .../src/domains/manage/routes/functionTools.ts     |   13 +-
 agents-api/src/domains/manage/routes/functions.ts  |   16 +-
 agents-api/src/domains/manage/routes/github.ts     |  456 +-
 .../domains/manage/routes/mcpToolGithubAccess.ts   |   25 +-
 .../domains/manage/routes/mcpToolSlackAccess.ts    |   11 +-
 agents-api/src/domains/manage/routes/oauth.ts      |    2 +-
 .../src/domains/manage/routes/playgroundToken.ts   |   11 +-
 .../src/domains/manage/routes/projectFull.ts       |   39 +-
 .../domains/manage/routes/projectGithubAccess.ts   |   19 +-
 .../src/domains/manage/routes/projectMembers.ts    |    2 +-
 .../src/domains/manage/routes/scheduledTriggers.ts |   58 +-
 agents-api/src/domains/manage/routes/signoz.ts     |    4 +-
 agents-api/src/domains/manage/routes/tools.ts      |    4 +-
 agents-api/src/domains/manage/routes/triggers.ts   |   25 +-
 agents-api/src/domains/run/a2a/transfer.ts         |    2 -
 agents-api/src/domains/run/agents/Agent.ts         |    4 +-
 .../run/agents/__tests__/agent-cleanup.test.ts     |   10 +-
 agents-api/src/domains/run/agents/agent-types.ts   |   20 +-
 .../src/domains/run/agents/generateTaskHandler.ts  |   67 +-
 .../run/agents/generation/ai-sdk-callbacks.ts      |    6 +-
 .../src/domains/run/agents/generation/generate.ts  |   40 +-
 .../run/agents/generation/schema-builder.ts        |    4 +-
 .../domains/run/agents/generation/system-prompt.ts |   19 +-
 .../tool-result-for-conversation-history.ts        |   11 +-
 agents-api/src/domains/run/agents/relationTools.ts |   51 +-
 .../domains/run/agents/services/AgentMcpManager.ts |    3 +-
 .../run/agents/services/ToolSessionManager.ts      |    6 +-
 .../src/domains/run/agents/tools/default-tools.ts  |   18 +-
 .../src/domains/run/agents/tools/mcp-tools.ts      |   32 +-
 .../src/domains/run/agents/tools/relation-tools.ts |    1 +
 .../src/domains/run/agents/tools/tool-approval.ts  |   53 +-
 .../src/domains/run/agents/tools/tool-utils.ts     |    7 +-
 .../src/domains/run/agents/tools/tool-wrapper.ts   |  161 +-
 .../src/domains/run/artifacts/ArtifactService.ts   |    3 +-
 .../run/artifacts/__tests__/ArtifactParser.test.ts |   10 +-
 .../__tests__/ArtifactParser.typeSchema.test.ts    |   11 +-
 .../artifacts/__tests__/ArtifactService.test.ts    |   12 +-
 .../src/domains/run/compression/BaseCompressor.ts  |   15 +-
 .../src/domains/run/context/ContextFetcher.ts      |    1 -
 .../src/domains/run/context/ContextResolver.ts     |    1 -
 agents-api/src/domains/run/context/context.ts      |    6 +-
 agents-api/src/domains/run/context/validation.ts   |   14 +-
 .../src/domains/run/handlers/executionHandler.ts   | 1230 ++---
 agents-api/src/domains/run/index.ts                |    2 +
 agents-api/src/domains/run/routes/chat.ts          |   22 +-
 .../src/domains/run/routes/chatDataStream.ts       |   15 +-
 agents-api/src/domains/run/routes/executions.ts    |   11 +-
 agents-api/src/domains/run/routes/feedback.ts      |  102 +
 agents-api/src/domains/run/routes/mcp.ts           |    4 +-
 agents-api/src/domains/run/routes/webhooks.ts      |    2 +-
 .../src/domains/run/services/TriggerService.ts     |  949 ++--
 .../services/__tests__/SchedulerService.test.ts    |   10 +-
 .../run/services/__tests__/file-upload.test.ts     |   12 +-
 .../services/__tests__/triggerDispatcher.test.ts   |   24 +-
 .../services/blob-storage/vercel-blob-provider.ts  |    2 +-
 .../src/domains/run/services/triggerDispatcher.ts  |   10 +-
 agents-api/src/domains/run/session/AgentSession.ts |  134 +-
 .../src/domains/run/session/ToolApprovalUiBus.ts   |    5 +-
 .../__tests__/IncrementalStreamParser.test.ts      |   12 +-
 .../stream/__tests__/streaming-integration.test.ts |   12 +-
 .../domains/run/tools/SandboxExecutorFactory.ts    |    8 +-
 .../utils/__tests__/model-context-utils.test.ts    |   11 +-
 .../domains/run/utils/__tests__/project.test.ts    |   11 +-
 .../src/domains/run/utils/model-context-utils.ts   |    2 +-
 agents-api/src/domains/run/utils/model-resolver.ts |   30 +-
 .../run/workflow/functions/agentExecution.ts       |   39 +-
 .../steps/__tests__/scheduledTriggerSteps.test.ts  |   10 +-
 .../steps/__tests__/schedulerSteps.test.ts         |   10 +-
 .../run/workflow/steps/agentExecutionSteps.ts      | 1097 ++--
 .../run/workflow/steps/scheduledTriggerSteps.ts    |  208 +-
 agents-api/src/logger.ts                           |    4 +-
 agents-api/src/middleware/branchScopedDb.ts        |   15 +-
 agents-api/src/middleware/errorHandler.ts          |    4 +-
 agents-api/src/middleware/evalsAuth.ts             |    2 +-
 agents-api/src/middleware/manageAuth.ts            |    2 +-
 agents-api/src/middleware/ref.ts                   |    2 +-
 agents-api/src/middleware/runAuth.ts               |    4 +-
 agents-api/src/middleware/tracing.ts               |    4 +-
 agents-api/src/openapi.ts                          |    1 +
 agents-cli/CHANGELOG.md                            |   27 +
 agents-cli/package.json                            |    2 +-
 .../_snippets/generated/style-classnames.mdx       |    1 -
 .../content/api-reference/(openapi)/executions.mdx |    2 +-
 .../content/api-reference/(openapi)/feedback.mdx   |   59 +
 .../api-reference/(openapi)/scheduled-triggers.mdx |   22 +-
 agents-docs/content/visual-builder/skills.mdx      |    8 +
 agents-docs/package.json                           |    4 +-
 agents-docs/scripts/generate-openapi-docs.ts       |    1 +
 .../src/components/inkeep/inkeep-script.tsx        |   13 +-
 agents-manage-ui/CHANGELOG.md                      |   24 +
 agents-manage-ui/package.json                      |    4 +-
 .../evaluations/jobs/[configId]/page.tsx           |    8 +-
 .../projects/[projectId]/feedback/page.tsx         |   65 +
 .../traces/conversations/[conversationId]/page.tsx |   39 +-
 .../traces/conversations/[conversationId]/route.ts |    6 +-
 .../agent/error-display/agent-error-summary.tsx    |    6 +-
 .../components/agent/nodes/function-tool-node.tsx  |    2 +-
 .../src/components/agent/nodes/mcp-node.tsx        |    7 +-
 .../src/components/agent/nodes/sub-agent-node.tsx  |   17 +-
 .../components/agent/playground/chat-widget.tsx    |   44 +-
 .../agent/playground/feedback-dialog.tsx           |  106 +-
 .../components/agent/playground/improve-dialog.tsx |  102 +
 .../agent/sidepane/metadata/metadata-editor.tsx    |   15 +-
 .../agent/sidepane/nodes/mcp-node-editor.tsx       |    5 +-
 .../agent/sidepane/nodes/sub-agent-node-editor.tsx |   10 +-
 .../components/agent/use-grouped-agent-errors.ts   |   60 +-
 .../credentials/views/credential-form.tsx          |    6 +-
 .../dataset-items/dataset-items-table.tsx          |    2 +-
 .../evaluation-run-config-form-dialog.tsx          |    7 +-
 .../feedback/delete-feedback-confirmation.tsx      |   72 +
 .../src/components/feedback/feedback-table.tsx     |  337 ++
 .../form/__tests__/generic-input.test.tsx          |   40 +
 .../src/components/form/generic-input.tsx          |   17 +-
 .../mcp-servers/form/mcp-server-form.tsx           |   12 +-
 .../mcp-servers/form/tool-override-dialog.tsx      |    7 +-
 .../src/components/projects/form/project-form.tsx  |    2 +-
 .../projects/form/project-models-section.tsx       |   22 +-
 .../projects/form/project-stopwhen-section.tsx     |   16 +-
 .../scheduled-triggers/scheduled-trigger-form.tsx  |    6 +-
 .../src/components/sidebar-nav/app-sidebar.tsx     |    6 +
 .../src/components/skills/form/skill-form.tsx      |    5 +
 .../src/components/skills/skill-file-editor.tsx    |   20 +-
 .../src/components/traces/filters/date-picker.tsx  |    9 +-
 .../traces/timeline/hierarchical-timeline.tsx      |    7 +
 .../traces/timeline/render-panel-content.tsx       |   29 +
 .../components/traces/timeline/timeline-item.tsx   |    6 +-
 .../traces/timeline/timeline-wrapper.tsx           |   26 +
 .../src/components/traces/timeline/types.ts        |    1 +
 .../src/components/triggers/trigger-form.tsx       |   50 +-
 .../src/components/ui/local-date-time-text.tsx     |   11 +
 agents-manage-ui/src/constants/theme.ts            |    1 +
 .../src/hooks/use-processed-errors.tsx             |   27 +-
 .../src/lib/actions/__tests__/feedback.test.ts     |   90 +
 agents-manage-ui/src/lib/actions/feedback.ts       |   80 +
 agents-manage-ui/src/lib/api/feedback.ts           |   73 +
 agents-ui-demo/package.json                        |    2 +-
 packages/agents-core/CHANGELOG.md                  |   15 +
 .../drizzle/runtime/0034_simple_sphinx.sql         |   17 +
 .../drizzle/runtime/meta/0034_snapshot.json        | 5288 ++++++++++++++++++++
 .../agents-core/drizzle/runtime/meta/_journal.json |    9 +-
 packages/agents-core/package.json                  |    6 +-
 .../__tests__/credentials/composio-store.test.ts   |   10 +-
 .../credentials/credentialStuffer.test.ts          |   11 +-
 .../src/__tests__/credentials/nango-store.test.ts  |   10 +-
 .../__tests__/data-access/projectLifecycle.test.ts |   52 +-
 .../src/__tests__/dolt/ref-scope.test.ts           |  102 +
 .../agents-core/src/__tests__/utils/apiKey.test.ts |    8 +-
 .../src/__tests__/utils/appCredentials.test.ts     |    7 +-
 packages/agents-core/src/constants/index.ts        |   11 +
 .../agents-core/src/constants/otel-attributes.ts   |    1 +
 .../agents-core/src/constants/relation-types.ts    |    2 +
 .../agents-core/src/constants/session-events.ts    |   10 +
 packages/agents-core/src/constants/tool-names.ts   |    4 +
 packages/agents-core/src/constants/workflow.ts     |    4 +
 .../src/data-access/__tests__/workAppSlack.test.ts |   11 +-
 packages/agents-core/src/data-access/index.ts      |    1 +
 .../src/data-access/manage/agentFull.ts            |   25 +-
 .../src/data-access/runtime/feedback.ts            |  174 +
 .../agents-core/src/db/manage/manage-client.ts     |   21 +-
 .../agents-core/src/db/runtime/runtime-client.ts   |   10 +-
 .../agents-core/src/db/runtime/runtime-schema.ts   |   39 +
 packages/agents-core/src/dolt/merge.ts             |   16 +-
 packages/agents-core/src/dolt/ref-middleware.ts    |    4 +-
 packages/agents-core/src/dolt/ref-scope.ts         |   34 +-
 packages/agents-core/src/index.ts                  |    4 +
 .../src/retry/__tests__/withRetry.test.ts          |   17 +-
 packages/agents-core/src/test-utils/index.ts       |    1 +
 packages/agents-core/src/test-utils/mocks/index.ts |    7 +
 .../agents-core/src/test-utils/mocks/logger.ts     |   70 +
 packages/agents-core/src/types/entities.ts         |    7 +
 .../agents-core/src/utils/__tests__/error.test.ts  |  165 +-
 .../agents-core/src/utils/__tests__/logger.test.ts |  215 +
 .../utils/__tests__/usage-cost-middleware.test.ts  |   10 +-
 .../src/utils/__tests__/wait-until.test.ts         |   12 +-
 packages/agents-core/src/utils/error.ts            |  130 +-
 packages/agents-core/src/utils/jwt-helpers.ts      |    1 -
 packages/agents-core/src/utils/logger.ts           |  108 +-
 .../third-party-mcp-servers/composio-client.ts     |   20 +-
 packages/agents-core/src/utils/tracer-factory.ts   |    2 +-
 packages/agents-core/src/validation/schemas.ts     |   41 +-
 .../agents-core/src/validation/schemas/shared.ts   |   17 +
 packages/agents-email/CHANGELOG.md                 |    4 +
 packages/agents-email/package.json                 |    2 +-
 packages/agents-mcp/.genignore                     |    1 +
 packages/agents-mcp/.npmignore                     |    5 +-
 packages/agents-mcp/.speakeasy/gen.yaml            |    6 +-
 packages/agents-mcp/.speakeasy/out.openapi.yaml    |    2 +-
 packages/agents-mcp/.speakeasy/workflow.yaml       |    2 +-
 packages/agents-mcp/CHANGELOG.md                   |    8 +
 packages/agents-mcp/README.md                      |  152 +-
 packages/agents-mcp/manifest.json                  |  806 +--
 packages/agents-mcp/package.json                   |    4 +-
 packages/agents-mcp/src/core.ts                    |    1 +
 .../src/funcs/a2aGetRunAgentsWellKnownAgentJson.ts |   37 +-
 ...> agentsAssociateArtifactComponentWithAgent.ts} |   63 +-
 ...ts => agentsAssociateDataComponentWithAgent.ts} |   63 +-
 ...gentsCheckArtifactComponentAgentAssociation.ts} |   60 +-
 ...=> agentsCheckDataComponentAgentAssociation.ts} |   60 +-
 packages/agents-mcp/src/funcs/agentsCreateAgent.ts |   56 +-
 ...RunDatasetItems.ts => agentsCreateFullAgent.ts} |   70 +-
 packages/agents-mcp/src/funcs/agentsDeleteAgent.ts |   33 +-
 ...DeleteFullAgent.ts => agentsDeleteFullAgent.ts} |   58 +-
 packages/agents-mcp/src/funcs/agentsGetAgent.ts    |   56 +-
 ...ts => agentsGetAgentsUsingArtifactComponent.ts} |   60 +-
 ...ent.ts => agentsGetAgentsUsingDataComponent.ts} |   60 +-
 .../funcs/agentsGetArtifactComponentsForAgent.ts   |  172 +
 ...Agent.ts => agentsGetDataComponentsForAgent.ts} |   60 +-
 ...lAgentGetFullAgent.ts => agentsGetFullAgent.ts} |   60 +-
 ...finition.ts => agentsGetFullAgentDefinition.ts} |   60 +-
 ...AgentInfos.ts => agentsGetRelatedAgentInfos.ts} |   60 +-
 packages/agents-mcp/src/funcs/agentsListAgents.ts  |   56 +-
 .../src/funcs/agentsListAvailableAgents.ts         |  136 +
 ...s => agentsRemoveArtifactComponentFromAgent.ts} |   60 +-
 ...nt.ts => agentsRemoveDataComponentFromAgent.ts} |   60 +-
 packages/agents-mcp/src/funcs/agentsUpdateAgent.ts |   58 +-
 ...UpdateFullAgent.ts => agentsUpdateFullAgent.ts} |   60 +-
 .../agents-mcp/src/funcs/apiKeysCreateAPIKey.ts    |   56 +-
 ...undToken.ts => apiKeysCreatePlaygroundToken.ts} |   37 +-
 .../agents-mcp/src/funcs/apiKeysDeleteAPIKey.ts    |   33 +-
 .../agents-mcp/src/funcs/apiKeysGetAPIKeyById.ts   |   56 +-
 .../agents-mcp/src/funcs/apiKeysListAPIKeys.ts     |   56 +-
 .../agents-mcp/src/funcs/apiKeysUpdateAPIKey.ts    |   58 +-
 packages/agents-mcp/src/funcs/appsCreateApp.ts     |  166 +
 .../agents-mcp/src/funcs/appsCreateAppAuthKey.ts   |  172 +
 packages/agents-mcp/src/funcs/appsDeleteApp.ts     |  163 +
 .../agents-mcp/src/funcs/appsDeleteAppAuthKey.ts   |  167 +
 packages/agents-mcp/src/funcs/appsGetAppById.ts    |  169 +
 .../agents-mcp/src/funcs/appsListAppAuthKeys.ts    |  171 +
 packages/agents-mcp/src/funcs/appsListApps.ts      |  171 +
 packages/agents-mcp/src/funcs/appsUpdateApp.ts     |  170 +
 ...omponentsAssociateArtifactComponentWithAgent.ts |  170 +
 ...onentsCheckArtifactComponentAgentAssociation.ts |  178 +
 ...> artifactComponentsCreateArtifactComponent.ts} |   60 +-
 ...> artifactComponentsDeleteArtifactComponent.ts} |   37 +-
 ...actComponentsGetAgentsUsingArtifactComponent.ts |  173 +
 ... artifactComponentsGetArtifactComponentById.ts} |   60 +-
 ...factComponentsGetArtifactComponentsForAgent.ts} |   60 +-
 ...=> artifactComponentsListArtifactComponents.ts} |   60 +-
 ...ctComponentsRemoveArtifactComponentFromAgent.ts |  177 +
 ...> artifactComponentsUpdateArtifactComponent.ts} |   62 +-
 .../src/funcs/authCreateAnonymousSession.ts        |  157 +
 .../agents-mcp/src/funcs/authGetPowChallenge.ts    |  120 +
 .../agents-mcp/src/funcs/branchesCreateBranch.ts   |   57 +-
 .../agents-mcp/src/funcs/branchesDeleteBranch.ts   |   59 +-
 packages/agents-mcp/src/funcs/branchesGetBranch.ts |   56 +-
 .../agents-mcp/src/funcs/branchesListBranches.ts   |   56 +-
 .../src/funcs/branchesListBranchesForAgent.ts      |   58 +-
 .../agents-mcp/src/funcs/branchesMergeExecute.ts   |  166 +
 .../agents-mcp/src/funcs/branchesMergePreview.ts   |  166 +
 packages/agents-mcp/src/funcs/capabilities.ts      |   36 +-
 .../funcs/channelsSlackBulkDeleteChannelAgents.ts  |  156 +
 .../src/funcs/channelsSlackBulkSetChannelAgents.ts |  156 +
 .../funcs/channelsSlackDeleteChannelSettings.ts    |  159 +
 .../src/funcs/channelsSlackGetChannelSettings.ts   |  159 +
 .../src/funcs/channelsSlackListChannels.ts         |  159 +
 .../src/funcs/channelsSlackSetChannelSettings.ts   |  160 +
 .../agents-mcp/src/funcs/chatPostRunApiChat.ts     |   56 +-
 .../src/funcs/chatPostRunV1ChatCompletions.ts      |   45 +-
 ...etManageApiCliMe.ts => cliGetManageApiCLIMe.ts} |   37 +-
 .../src/funcs/contextConfigDeleteContextConfig.ts  |  204 -
 ...fig.ts => contextConfigsCreateContextConfig.ts} |   60 +-
 .../src/funcs/contextConfigsDeleteContextConfig.ts |  164 +
 ...Id.ts => contextConfigsGetContextConfigById.ts} |   60 +-
 ...figs.ts => contextConfigsListContextConfigs.ts} |   60 +-
 ...fig.ts => contextConfigsUpdateContextConfig.ts} |   62 +-
 .../src/funcs/conversationsGetConversation.ts      |   58 +-
 .../funcs/conversationsGetConversationBounds.ts    |  168 +
 .../src/funcs/conversationsGetConversationMedia.ts |  173 +
 .../funcs/conversationsGetEndUserConversation.ts   |  179 +
 .../src/funcs/conversationsListConversations.ts    |  173 +
 .../funcs/conversationsListEndUserConversations.ts |  170 +
 .../funcs/conversationsResumeConversationStream.ts |  177 +
 ... => credentialStoresCreateCredentialInStore.ts} |   60 +-
 ....ts => credentialStoresListCredentialStores.ts} |   60 +-
 ...redential.ts => credentialsCreateCredential.ts} |   60 +-
 ...redential.ts => credentialsDeleteCredential.ts} |   35 +-
 ...tialById.ts => credentialsGetCredentialById.ts} |   60 +-
 ...redentials.ts => credentialsListCredentials.ts} |   60 +-
 ...redential.ts => credentialsUpdateCredential.ts} |   62 +-
 ...ataComponentsAssociateDataComponentWithAgent.ts |  169 +
 ...ComponentsCheckDataComponentAgentAssociation.ts |  177 +
 ...ent.ts => dataComponentsCreateDataComponent.ts} |   60 +-
 ...ent.ts => dataComponentsDeleteDataComponent.ts} |   37 +-
 .../dataComponentsGetAgentsUsingDataComponent.ts   |  172 +
 ...Id.ts => dataComponentsGetDataComponentById.ts} |   60 +-
 .../dataComponentsGetDataComponentsForAgent.ts     |  172 +
 ...ents.ts => dataComponentsListDataComponents.ts} |   60 +-
 .../dataComponentsRemoveDataComponentFromAgent.ts  |  176 +
 ...ent.ts => dataComponentsUpdateDataComponent.ts} |   62 +-
 .../src/funcs/entitlementsListOrgEntitlements.ts   |  161 +
 .../src/funcs/evaluationsAddAgentToDataset.ts      |  172 +
 .../src/funcs/evaluationsAddAgentToEvaluator.ts    |  172 +
 .../funcs/evaluationsAddEvaluatorToJobConfig.ts    |   56 +-
 .../funcs/evaluationsAddEvaluatorToSuiteConfig.ts  |   56 +-
 .../evaluationsBatchGetEvaluatorAgentScopes.ts     |  165 +
 .../src/funcs/evaluationsCreateDataset.ts          |   56 +-
 .../src/funcs/evaluationsCreateDatasetItem.ts      |   56 +-
 .../src/funcs/evaluationsCreateDatasetItemsBulk.ts |   56 +-
 .../src/funcs/evaluationsCreateDatasetRunConfig.ts |  165 +
 .../funcs/evaluationsCreateEvaluationJobConfig.ts  |   56 +-
 .../src/funcs/evaluationsCreateEvaluationResult.ts |   56 +-
 .../funcs/evaluationsCreateEvaluationRunConfig.ts  |   56 +-
 .../evaluationsCreateEvaluationSuiteConfig.ts      |   58 +-
 .../src/funcs/evaluationsCreateEvaluator.ts        |   56 +-
 .../src/funcs/evaluationsDeleteDataset.ts          |   56 +-
 .../src/funcs/evaluationsDeleteDatasetItem.ts      |   56 +-
 .../src/funcs/evaluationsDeleteDatasetRunConfig.ts |  160 +
 .../funcs/evaluationsDeleteEvaluationJobConfig.ts  |   56 +-
 .../src/funcs/evaluationsDeleteEvaluationResult.ts |   56 +-
 .../funcs/evaluationsDeleteEvaluationRunConfig.ts  |   56 +-
 .../evaluationsDeleteEvaluationSuiteConfig.ts      |   56 +-
 .../src/funcs/evaluationsDeleteEvaluator.ts        |   56 +-
 .../src/funcs/evaluationsEvaluateConversation.ts   |   56 +-
 .../agents-mcp/src/funcs/evaluationsGetDataset.ts  |   56 +-
 .../src/funcs/evaluationsGetDatasetItem.ts         |   56 +-
 .../src/funcs/evaluationsGetDatasetRun.ts          |  166 +
 .../src/funcs/evaluationsGetDatasetRunConfig.ts    |  168 +
 .../src/funcs/evaluationsGetDatasetRunItems.ts     |  172 +
 .../src/funcs/evaluationsGetEvaluationJobConfig.ts |   56 +-
 .../evaluationsGetEvaluationJobConfigResults.ts    |   58 +-
 .../src/funcs/evaluationsGetEvaluationResult.ts    |   56 +-
 .../src/funcs/evaluationsGetEvaluationRunConfig.ts |   56 +-
 .../evaluationsGetEvaluationRunConfigResults.ts    |   58 +-
 .../funcs/evaluationsGetEvaluationSuiteConfig.ts   |   56 +-
 .../src/funcs/evaluationsGetEvaluator.ts           |   56 +-
 .../src/funcs/evaluationsGetEvaluatorsBatch.ts     |   56 +-
 .../src/funcs/evaluationsListDatasetAgents.ts      |  168 +
 .../src/funcs/evaluationsListDatasetItems.ts       |   56 +-
 .../src/funcs/evaluationsListDatasetRunConfigs.ts  |  168 +
 .../src/funcs/evaluationsListDatasetRuns.ts        |  168 +
 .../src/funcs/evaluationsListDatasets.ts           |   62 +-
 ...evaluationsListEvaluationJobConfigEvaluators.ts |   58 +-
 .../funcs/evaluationsListEvaluationJobConfigs.ts   |   56 +-
 .../funcs/evaluationsListEvaluationRunConfigs.ts   |   56 +-
 ...aluationsListEvaluationSuiteConfigEvaluators.ts |   58 +-
 .../funcs/evaluationsListEvaluationSuiteConfigs.ts |   58 +-
 .../src/funcs/evaluationsListEvaluatorAgents.ts    |  168 +
 .../src/funcs/evaluationsListEvaluators.ts         |   62 +-
 .../src/funcs/evaluationsRemoveAgentFromDataset.ts |  164 +
 .../funcs/evaluationsRemoveAgentFromEvaluator.ts   |  164 +
 .../evaluationsRemoveEvaluatorFromJobConfig.ts     |   56 +-
 .../evaluationsRemoveEvaluatorFromSuiteConfig.ts   |   56 +-
 .../evaluationsStartConversationsEvaluations.ts    |   58 +-
 .../src/funcs/evaluationsTriggerDatasetRun.ts      |  169 +
 .../src/funcs/evaluationsUpdateDataset.ts          |   56 +-
 .../src/funcs/evaluationsUpdateDatasetItem.ts      |   56 +-
 .../src/funcs/evaluationsUpdateDatasetRunConfig.ts |  169 +
 .../src/funcs/evaluationsUpdateEvaluationResult.ts |   56 +-
 .../funcs/evaluationsUpdateEvaluationRunConfig.ts  |   56 +-
 .../evaluationsUpdateEvaluationSuiteConfig.ts      |   58 +-
 .../src/funcs/evaluationsUpdateEvaluator.ts        |   56 +-
 .../executionsGetRunApiExecutionsExecutionId.ts    |  165 +
 ...ecutionsGetRunApiExecutionsExecutionIdStream.ts |  174 +
 .../src/funcs/executionsPostRunApiExecutions.ts    |  167 +
 ...nApiExecutionsExecutionIdApprovalsToolCallId.ts |  176 +
 .../src/funcs/externalAgentsCreateExternalAgent.ts |   58 +-
 ...alAgentsCreateSubAgentExternalAgentRelation.ts} |   60 +-
 .../src/funcs/externalAgentsDeleteExternalAgent.ts |   35 +-
 ...alAgentsDeleteSubAgentExternalAgentRelation.ts} |   37 +-
 .../funcs/externalAgentsGetExternalAgentById.ts    |   58 +-
 ...lAgentsGetSubAgentExternalAgentRelationById.ts} |   60 +-
 .../src/funcs/externalAgentsListExternalAgents.ts  |   58 +-
 ...nalAgentsListSubAgentExternalAgentRelations.ts} |   60 +-
 .../src/funcs/externalAgentsUpdateExternalAgent.ts |   60 +-
 ...alAgentsUpdateSubAgentExternalAgentRelation.ts} |   62 +-
 .../agents-mcp/src/funcs/feedbackCreateFeedback.ts |  168 +
 .../agents-mcp/src/funcs/feedbackDeleteFeedback.ts |  171 +
 .../src/funcs/feedbackGetFeedbackById.ts           |  171 +
 .../agents-mcp/src/funcs/feedbackListFeedback.ts   |  176 +
 ...provals.ts => feedbackSubmitEndUserFeedback.ts} |   84 +-
 .../agents-mcp/src/funcs/feedbackUpdateFeedback.ts |  172 +
 .../src/funcs/fullAgentCreateFullAgent.ts          |  211 -
 ...ctionToolsAssociateFunctionToolWithSubAgent.ts} |   63 +-
 ...onToolsCheckFunctionToolSubAgentAssociation.ts} |   60 +-
 .../src/funcs/functionToolsCreateFunctionTool.ts   |   58 +-
 .../src/funcs/functionToolsDeleteFunctionTool.ts   |   56 +-
 .../src/funcs/functionToolsGetFunctionTool.ts      |   58 +-
 ...=> functionToolsGetFunctionToolsForSubAgent.ts} |   60 +-
 ... functionToolsGetSubAgentsUsingFunctionTool.ts} |   60 +-
 .../src/funcs/functionToolsListFunctionTools.ts    |   58 +-
 ...functionToolsRemoveFunctionToolFromSubAgent.ts} |   60 +-
 .../src/funcs/functionToolsUpdateFunctionTool.ts   |   60 +-
 .../src/funcs/functionsCreateFunction.ts           |   56 +-
 .../src/funcs/functionsDeleteFunction.ts           |   56 +-
 .../agents-mcp/src/funcs/functionsGetFunction.ts   |   56 +-
 .../agents-mcp/src/funcs/functionsListFunctions.ts |   58 +-
 .../src/funcs/functionsUpdateFunction.ts           |   58 +-
 .../src/funcs/gitHubDeleteGithubInstallation.ts    |  167 +
 .../funcs/gitHubDisconnectGithubInstallation.ts    |  167 +
 .../src/funcs/gitHubGetGithubInstallUrl.ts         |  161 +
 .../funcs/gitHubGetGithubInstallationDetails.ts    |  167 +
 .../src/funcs/gitHubListGithubInstallations.ts     |  165 +
 .../src/funcs/gitHubReconnectGithubInstallation.ts |  167 +
 .../gitHubSyncGithubInstallationRepositories.ts    |  168 +
 packages/agents-mcp/src/funcs/healthHealth.ts      |  120 +
 packages/agents-mcp/src/funcs/healthReady.ts       |  126 +
 .../src/funcs/mcpCatalogListMCPCatalog.ts          |   58 +-
 packages/agents-mcp/src/funcs/mcpPostRunV1MCP.ts   |   34 +-
 .../src/funcs/oAuthInitiateOauthLoginPublic.ts     |  178 -
 .../agents-mcp/src/funcs/oAuthMcpOauthCallback.ts  |   50 +-
 packages/agents-mcp/src/funcs/oAuthSlackInstall.ts |  144 +
 .../src/funcs/oAuthSlackOauthRedirect.ts           |  146 +
 .../src/funcs/projectMembersAddProjectMember.ts    |   58 +-
 .../src/funcs/projectMembersListProjectMembers.ts  |   58 +-
 .../src/funcs/projectMembersRemoveProjectMember.ts |   58 +-
 .../src/funcs/projectMembersUpdateProjectMember.ts |   58 +-
 .../projectPermissionsGetProjectPermissions.ts     |   56 +-
 ...FullProject.ts => projectsCreateFullProject.ts} |   61 +-
 .../agents-mcp/src/funcs/projectsCreateProject.ts  |   57 +-
 ...FullProject.ts => projectsDeleteFullProject.ts} |   58 +-
 .../agents-mcp/src/funcs/projectsDeleteProject.ts  |   57 +-
 ...GetFullProject.ts => projectsGetFullProject.ts} |   60 +-
 ...ts => projectsGetFullProjectWithRelationIds.ts} |   60 +-
 .../agents-mcp/src/funcs/projectsGetProjectById.ts |   56 +-
 .../src/funcs/projectsGetProjectGithubAccess.ts    |  167 +
 .../agents-mcp/src/funcs/projectsListProjects.ts   |   56 +-
 .../src/funcs/projectsSetProjectGithubAccess.ts    |  168 +
 ...FullProject.ts => projectsUpdateFullProject.ts} |   60 +-
 .../agents-mcp/src/funcs/projectsUpdateProject.ts  |   56 +-
 packages/agents-mcp/src/funcs/refsResolveRef.ts    |   56 +-
 .../scheduledTriggersAddScheduledTriggerUser.ts    |  173 +
 ...uledTriggersCancelScheduledTriggerInvocation.ts |  176 +
 .../scheduledTriggersCreateScheduledTrigger.ts     |  169 +
 .../scheduledTriggersDeleteScheduledTrigger.ts     |  164 +
 .../scheduledTriggersGetScheduledTriggerById.ts    |  172 +
 ...ledTriggersGetScheduledTriggerInvocationById.ts |  177 +
 ...duledTriggersListScheduledTriggerInvocations.ts |  180 +
 .../scheduledTriggersListScheduledTriggerUsers.ts  |  172 +
 .../scheduledTriggersListScheduledTriggers.ts      |  173 +
 .../scheduledTriggersListUpcomingScheduledRuns.ts  |  174 +
 .../scheduledTriggersRemoveScheduledTriggerUser.ts |  168 +
 ...duledTriggersRerunScheduledTriggerInvocation.ts |  176 +
 .../scheduledTriggersRunScheduledTriggerNow.ts     |  176 +
 .../scheduledTriggersSetScheduledTriggerUsers.ts   |  173 +
 .../scheduledTriggersUpdateScheduledTrigger.ts     |  173 +
 packages/agents-mcp/src/funcs/skillsCreateSkill.ts |  163 +
 .../agents-mcp/src/funcs/skillsCreateSkillFile.ts  |  169 +
 .../src/funcs/skillsCreateSubagentSkill.ts         |  169 +
 packages/agents-mcp/src/funcs/skillsDeleteSkill.ts |  160 +
 .../agents-mcp/src/funcs/skillsDeleteSkillFile.ts  |  164 +
 .../src/funcs/skillsDeleteSubagentSkill.ts         |  168 +
 packages/agents-mcp/src/funcs/skillsGetSkill.ts    |  166 +
 .../agents-mcp/src/funcs/skillsGetSkillFile.ts     |  170 +
 .../src/funcs/skillsGetSkillsForSubagent.ts        |  172 +
 packages/agents-mcp/src/funcs/skillsListSkills.ts  |  167 +
 packages/agents-mcp/src/funcs/skillsUpdateSkill.ts |  167 +
 .../agents-mcp/src/funcs/skillsUpdateSkillFile.ts  |  173 +
 .../src/funcs/slackSlackBulkDeleteChannelAgents.ts |  156 +
 .../src/funcs/slackSlackBulkSetChannelAgents.ts    |  156 +
 .../src/funcs/slackSlackDeleteChannelSettings.ts   |  159 +
 .../src/funcs/slackSlackDeleteWorkspace.ts         |  153 +
 .../src/funcs/slackSlackGetChannelSettings.ts      |  159 +
 .../src/funcs/slackSlackGetJoinFromWorkspace.ts    |  155 +
 .../agents-mcp/src/funcs/slackSlackGetWorkspace.ts |  153 +
 .../src/funcs/slackSlackGetWorkspaceSettings.ts    |  153 +
 packages/agents-mcp/src/funcs/slackSlackInstall.ts |  144 +
 ...vitationsPending.ts => slackSlackLinkStatus.ts} |   60 +-
 .../agents-mcp/src/funcs/slackSlackListChannels.ts |  159 +
 .../src/funcs/slackSlackListLinkedUsers.ts         |  153 +
 .../{health.ts => slackSlackListWorkspaces.ts}     |   46 +-
 .../src/funcs/slackSlackOauthRedirect.ts           |  146 +
 .../src/funcs/slackSlackSetChannelSettings.ts      |  160 +
 ...IdOrganizations.ts => slackSlackTestMessage.ts} |   59 +-
 .../src/funcs/slackSlackUpdateJoinFromWorkspace.ts |  156 +
 .../src/funcs/slackSlackUpdateWorkspaceSettings.ts |  154 +
 .../agents-mcp/src/funcs/slackSlackUserConnect.ts  |  147 +
 .../src/funcs/slackSlackUserDisconnect.ts          |  147 +
 .../agents-mcp/src/funcs/slackSlackUserStatus.ts   |  148 +
 .../src/funcs/slackSlackVerifyLinkToken.ts         |  147 +
 .../src/funcs/slackSlackWorkspaceHealth.ts         |  153 +
 ...subAgentToolRelationsGetSubagentToolRelation.ts |  214 -
 .../subAgentsAssociateFunctionToolWithSubAgent.ts  |  170 +
 ...ubAgentsCheckFunctionToolSubAgentAssociation.ts |  177 +
 ...subAgentsCreateSubAgentExternalAgentRelation.ts |  174 +
 ...ation.ts => subAgentsCreateSubAgentRelation.ts} |   60 +-
 ...=> subAgentsCreateSubAgentTeamAgentRelation.ts} |   60 +-
 ...reateSubagent.ts => subAgentsCreateSubagent.ts} |   58 +-
 ...n.ts => subAgentsCreateSubagentToolRelation.ts} |   60 +-
 ...subAgentsDeleteSubAgentExternalAgentRelation.ts |  169 +
 ...ation.ts => subAgentsDeleteSubAgentRelation.ts} |   37 +-
 ...=> subAgentsDeleteSubAgentTeamAgentRelation.ts} |   37 +-
 ...eleteSubagent.ts => subAgentsDeleteSubagent.ts} |   37 +-
 ...n.ts => subAgentsDeleteSubagentToolRelation.ts} |   37 +-
 .../funcs/subAgentsGetFunctionToolsForSubAgent.ts  |  172 +
 ...ubAgentsGetSubAgentExternalAgentRelationById.ts |  177 +
 ...ById.ts => subAgentsGetSubAgentRelationById.ts} |   60 +-
 ...> subAgentsGetSubAgentTeamAgentRelationById.ts} |   60 +-
 .../subAgentsGetSubAgentsUsingFunctionTool.ts      |  172 +
 ...SubagentById.ts => subAgentsGetSubagentById.ts} |   58 +-
 .../src/funcs/subAgentsGetSubagentToolRelation.ts  |  172 +
 ...sForTool.ts => subAgentsGetSubagentsForTool.ts} |   60 +-
 .../subAgentsListSubAgentExternalAgentRelations.ts |  178 +
 ...ations.ts => subAgentsListSubAgentRelations.ts} |   60 +-
 ... => subAgentsListSubAgentTeamAgentRelations.ts} |   60 +-
 ...ns.ts => subAgentsListSubagentToolRelations.ts} |   60 +-
 ...tListSubagents.ts => subAgentsListSubagents.ts} |   60 +-
 .../subAgentsRemoveFunctionToolFromSubAgent.ts     |  176 +
 ...subAgentsUpdateSubAgentExternalAgentRelation.ts |  178 +
 ...ation.ts => subAgentsUpdateSubAgentRelation.ts} |   62 +-
 ...=> subAgentsUpdateSubAgentTeamAgentRelation.ts} |   62 +-
 ...pdateSubagent.ts => subAgentsUpdateSubagent.ts} |   60 +-
 ...n.ts => subAgentsUpdateSubagentToolRelation.ts} |   62 +-
 .../thirdPartyMCPServersGetOauthRedirectUrl.ts     |   56 +-
 .../thirdPartyMCPServersGetThirdPartyMCPServer.ts  |   58 +-
 .../src/funcs/toolsCreateSubagentToolRelation.ts   |  169 +
 packages/agents-mcp/src/funcs/toolsCreateTool.ts   |   56 +-
 .../src/funcs/toolsDeleteSubagentToolRelation.ts   |  164 +
 packages/agents-mcp/src/funcs/toolsDeleteTool.ts   |   56 +-
 .../src/funcs/toolsGetMcpToolGithubAccess.ts       |  171 +
 .../src/funcs/toolsGetMcpToolSlackAccess.ts        |  171 +
 .../src/funcs/toolsGetSubagentToolRelation.ts      |  172 +
 .../src/funcs/toolsGetSubagentsForTool.ts          |  177 +
 packages/agents-mcp/src/funcs/toolsGetTool.ts      |   56 +-
 .../src/funcs/toolsGetUserCredentialForTool.ts     |   58 +-
 .../src/funcs/toolsInitiateToolOauthLogin.ts       |  163 +
 .../src/funcs/toolsListSubagentToolRelations.ts    |  175 +
 packages/agents-mcp/src/funcs/toolsListTools.ts    |   56 +-
 .../src/funcs/toolsSetMcpToolGithubAccess.ts       |  172 +
 .../src/funcs/toolsSetMcpToolSlackAccess.ts        |  172 +
 .../src/funcs/toolsUpdateSubagentToolRelation.ts   |  173 +
 packages/agents-mcp/src/funcs/toolsUpdateTool.ts   |   58 +-
 .../agents-mcp/src/funcs/triggersCreateTrigger.ts  |   58 +-
 .../agents-mcp/src/funcs/triggersDeleteTrigger.ts  |   56 +-
 .../agents-mcp/src/funcs/triggersGetTriggerById.ts |   58 +-
 .../src/funcs/triggersGetTriggerInvocationById.ts  |   58 +-
 .../src/funcs/triggersListTriggerInvocations.ts    |   58 +-
 .../agents-mcp/src/funcs/triggersListTriggers.ts   |   58 +-
 .../agents-mcp/src/funcs/triggersRerunTrigger.ts   |  171 +
 .../agents-mcp/src/funcs/triggersUpdateTrigger.ts  |   58 +-
 ...ganizations.ts => userProfileGetUserProfile.ts} |   69 +-
 .../src/funcs/userProfileUpsertUserProfile.ts      |  162 +
 ...ProjectMembershipsListUserProjectMemberships.ts |   60 +-
 .../agents-mcp/src/funcs/usersSlackLinkStatus.ts   |  150 +
 .../src/funcs/usersSlackListLinkedUsers.ts         |  153 +
 .../agents-mcp/src/funcs/usersSlackUserConnect.ts  |  147 +
 .../src/funcs/usersSlackUserDisconnect.ts          |  147 +
 .../agents-mcp/src/funcs/usersSlackUserStatus.ts   |  148 +
 .../src/funcs/usersSlackVerifyLinkToken.ts         |  147 +
 ...jectsProjectIdAgentsAgentIdTriggersTriggerId.ts |   74 +-
 .../funcs/workAppsSlackBulkDeleteChannelAgents.ts  |  156 +
 .../src/funcs/workAppsSlackBulkSetChannelAgents.ts |  156 +
 .../funcs/workAppsSlackDeleteChannelSettings.ts    |  159 +
 .../src/funcs/workAppsSlackDeleteWorkspace.ts      |  153 +
 .../src/funcs/workAppsSlackGetChannelSettings.ts   |  159 +
 .../src/funcs/workAppsSlackGetJoinFromWorkspace.ts |  155 +
 .../src/funcs/workAppsSlackGetWorkspace.ts         |  153 +
 .../src/funcs/workAppsSlackGetWorkspaceSettings.ts |  153 +
 .../agents-mcp/src/funcs/workAppsSlackInstall.ts   |  144 +
 .../src/funcs/workAppsSlackLinkStatus.ts           |  150 +
 .../src/funcs/workAppsSlackListChannels.ts         |  159 +
 .../src/funcs/workAppsSlackListLinkedUsers.ts      |  153 +
 ...owProcess.ts => workAppsSlackListWorkspaces.ts} |   46 +-
 .../src/funcs/workAppsSlackOauthRedirect.ts        |  146 +
 .../src/funcs/workAppsSlackSetChannelSettings.ts   |  160 +
 .../src/funcs/workAppsSlackTestMessage.ts          |  154 +
 .../funcs/workAppsSlackUpdateJoinFromWorkspace.ts  |  156 +
 .../funcs/workAppsSlackUpdateWorkspaceSettings.ts  |  154 +
 .../src/funcs/workAppsSlackUserConnect.ts          |  147 +
 .../src/funcs/workAppsSlackUserDisconnect.ts       |  147 +
 .../src/funcs/workAppsSlackUserStatus.ts           |  148 +
 .../src/funcs/workAppsSlackVerifyLinkToken.ts      |  147 +
 .../src/funcs/workAppsSlackWorkspaceHealth.ts      |  153 +
 .../funcs/workflowsEvaluateConversationsByJob.ts   |   36 +-
 .../workflowsGetApiCronCleanupStreamChunks.ts      |  120 +
 .../workflowsPostApiDeployRestartScheduler.ts      |  120 +
 .../src/funcs/workspacesSlackDeleteWorkspace.ts    |  153 +
 .../funcs/workspacesSlackGetJoinFromWorkspace.ts   |  155 +
 .../src/funcs/workspacesSlackGetWorkspace.ts       |  153 +
 .../funcs/workspacesSlackGetWorkspaceSettings.ts   |  153 +
 .../src/funcs/workspacesSlackListWorkspaces.ts     |  124 +
 .../src/funcs/workspacesSlackTestMessage.ts        |  154 +
 .../workspacesSlackUpdateJoinFromWorkspace.ts      |  156 +
 .../workspacesSlackUpdateWorkspaceSettings.ts      |  154 +
 .../src/funcs/workspacesSlackWorkspaceHealth.ts    |  153 +
 packages/agents-mcp/src/hooks/hooks.ts             |    1 +
 packages/agents-mcp/src/hooks/types.ts             |    1 +
 packages/agents-mcp/src/landing-page.ts            | 1073 ++++
 packages/agents-mcp/src/lib/base64.ts              |    1 +
 packages/agents-mcp/src/lib/config.ts              |    9 +-
 packages/agents-mcp/src/lib/dlv.ts                 |    1 +
 packages/agents-mcp/src/lib/encodings.ts           |   28 +-
 packages/agents-mcp/src/lib/env.ts                 |    1 +
 packages/agents-mcp/src/lib/files.ts               |   23 +
 packages/agents-mcp/src/lib/http.ts                |    1 +
 packages/agents-mcp/src/lib/is-plain-object.ts     |    1 +
 packages/agents-mcp/src/lib/logger.ts              |    1 +
 packages/agents-mcp/src/lib/matchers.ts            |  352 --
 packages/agents-mcp/src/lib/primitives.ts          |    1 +
 packages/agents-mcp/src/lib/result.ts              |    1 +
 packages/agents-mcp/src/lib/retries.ts             |    1 +
 packages/agents-mcp/src/lib/schemas.ts             |    1 +
 packages/agents-mcp/src/lib/sdks.ts                |    1 +
 packages/agents-mcp/src/lib/security.ts            |   26 +-
 packages/agents-mcp/src/lib/url.ts                 |    1 +
 packages/agents-mcp/src/mcp-server/build.mts       |   42 +-
 packages/agents-mcp/src/mcp-server/cli.ts          |    1 +
 .../agents-mcp/src/mcp-server/cli/serve/command.ts |  117 +
 .../agents-mcp/src/mcp-server/cli/serve/impl.ts    |  113 +
 .../agents-mcp/src/mcp-server/cli/start/command.ts |   15 +
 .../agents-mcp/src/mcp-server/cli/start/impl.ts    |  129 +-
 .../agents-mcp/src/mcp-server/console-logger.ts    |    1 +
 packages/agents-mcp/src/mcp-server/extensions.ts   |    1 +
 packages/agents-mcp/src/mcp-server/flags.ts        |    3 +
 packages/agents-mcp/src/mcp-server/mcp-server.ts   |    5 +-
 packages/agents-mcp/src/mcp-server/prompts.ts      |    1 +
 packages/agents-mcp/src/mcp-server/resources.ts    |   54 +-
 packages/agents-mcp/src/mcp-server/scopes.ts       |    1 +
 packages/agents-mcp/src/mcp-server/server.ts       |  603 ++-
 packages/agents-mcp/src/mcp-server/shared.ts       |    1 +
 packages/agents-mcp/src/mcp-server/tools.ts        |  445 +-
 ...RelationsAssociateArtifactComponentWithAgent.ts |   45 -
 ...ationsCheckArtifactComponentAgentAssociation.ts |   45 -
 ...nentRelationsGetAgentsUsingArtifactComponent.ts |   45 -
 ...ponentRelationsGetArtifactComponentsForAgent.ts |   45 -
 ...entRelationsRemoveArtifactComponentFromAgent.ts |   45 -
 ...nentRelationsAssociateDataComponentWithAgent.ts |   44 -
 ...tRelationsCheckDataComponentAgentAssociation.ts |   45 -
 ...omponentRelationsGetAgentsUsingDataComponent.ts |   44 -
 ...mponentRelationsRemoveDataComponentFromAgent.ts |   44 -
 .../agentsAssociateArtifactComponentWithAgent.ts   |   43 +
 .../tools/agentsAssociateDataComponentWithAgent.ts |   43 +
 ...agentsCheckArtifactComponentAgentAssociation.ts |   43 +
 .../agentsCheckDataComponentAgentAssociation.ts    |   43 +
 .../src/mcp-server/tools/agentsCreateAgent.ts      |    7 +-
 ...CreateFullAgent.ts => agentsCreateFullAgent.ts} |   13 +-
 .../src/mcp-server/tools/agentsDeleteAgent.ts      |    7 +-
 ...DeleteFullAgent.ts => agentsDeleteFullAgent.ts} |   13 +-
 .../src/mcp-server/tools/agentsGetAgent.ts         |    7 +-
 .../tools/agentsGetAgentsUsingArtifactComponent.ts |   43 +
 .../tools/agentsGetAgentsUsingDataComponent.ts     |   43 +
 .../tools/agentsGetArtifactComponentsForAgent.ts   |   43 +
 ...Agent.ts => agentsGetDataComponentsForAgent.ts} |   24 +-
 ...lAgentGetFullAgent.ts => agentsGetFullAgent.ts} |   13 +-
 ...finition.ts => agentsGetFullAgentDefinition.ts} |   13 +-
 ...AgentInfos.ts => agentsGetRelatedAgentInfos.ts} |   13 +-
 .../src/mcp-server/tools/agentsListAgents.ts       |    7 +-
 .../agentsRemoveArtifactComponentFromAgent.ts      |   43 +
 .../tools/agentsRemoveDataComponentFromAgent.ts    |   43 +
 .../src/mcp-server/tools/agentsUpdateAgent.ts      |    7 +-
 ...UpdateFullAgent.ts => agentsUpdateFullAgent.ts} |   13 +-
 .../src/mcp-server/tools/apiKeysCreateAPIKey.ts    |    7 +-
 .../src/mcp-server/tools/apiKeysDeleteAPIKey.ts    |    7 +-
 .../src/mcp-server/tools/apiKeysGetAPIKeyById.ts   |    7 +-
 .../src/mcp-server/tools/apiKeysListAPIKeys.ts     |    7 +-
 .../src/mcp-server/tools/apiKeysUpdateAPIKey.ts    |    7 +-
 .../src/mcp-server/tools/appsCreateApp.ts          |   43 +
 .../src/mcp-server/tools/appsCreateAppAuthKey.ts   |   43 +
 .../src/mcp-server/tools/appsDeleteApp.ts          |   43 +
 .../src/mcp-server/tools/appsDeleteAppAuthKey.ts   |   43 +
 .../src/mcp-server/tools/appsGetAppById.ts         |   43 +
 .../src/mcp-server/tools/appsListAppAuthKeys.ts    |   43 +
 .../src/mcp-server/tools/appsListApps.ts           |   43 +
 .../src/mcp-server/tools/appsUpdateApp.ts          |   43 +
 ...> artifactComponentsCreateArtifactComponent.ts} |   13 +-
 ...> artifactComponentsDeleteArtifactComponent.ts} |   13 +-
 ... artifactComponentsGetArtifactComponentById.ts} |   13 +-
 ...=> artifactComponentsListArtifactComponents.ts} |   13 +-
 ...> artifactComponentsUpdateArtifactComponent.ts} |   13 +-
 .../mcp-server/tools/authCreateAnonymousSession.ts |   43 +
 ...piWorkflowProcess.ts => authGetPowChallenge.ts} |   15 +-
 .../src/mcp-server/tools/branchesCreateBranch.ts   |    7 +-
 .../src/mcp-server/tools/branchesDeleteBranch.ts   |    7 +-
 .../src/mcp-server/tools/branchesGetBranch.ts      |    7 +-
 .../src/mcp-server/tools/branchesListBranches.ts   |    7 +-
 .../tools/branchesListBranchesForAgent.ts          |    7 +-
 .../src/mcp-server/tools/branchesMergeExecute.ts   |   43 +
 .../src/mcp-server/tools/branchesMergePreview.ts   |   43 +
 .../src/mcp-server/tools/capabilities.ts           |    7 +-
 ...etManageApiCliMe.ts => cliGetManageApiCLIMe.ts} |   11 +-
 ...fig.ts => contextConfigsCreateContextConfig.ts} |   13 +-
 ...fig.ts => contextConfigsDeleteContextConfig.ts} |   13 +-
 ...Id.ts => contextConfigsGetContextConfigById.ts} |   13 +-
 .../tools/contextConfigsListContextConfigs.ts      |   43 +
 ...fig.ts => contextConfigsUpdateContextConfig.ts} |   13 +-
 .../tools/conversationsGetConversation.ts          |    7 +-
 .../tools/conversationsGetConversationBounds.ts    |   43 +
 .../tools/conversationsGetConversationMedia.ts     |   43 +
 .../tools/conversationsListConversations.ts        |   44 +
 ... => credentialStoresCreateCredentialInStore.ts} |   13 +-
 ....ts => credentialStoresListCredentialStores.ts} |   13 +-
 ...redential.ts => credentialsCreateCredential.ts} |   13 +-
 ...redential.ts => credentialsDeleteCredential.ts} |   13 +-
 ...tialById.ts => credentialsGetCredentialById.ts} |   13 +-
 ...redentials.ts => credentialsListCredentials.ts} |   13 +-
 ...redential.ts => credentialsUpdateCredential.ts} |   13 +-
 ...ent.ts => dataComponentsCreateDataComponent.ts} |   13 +-
 ...ent.ts => dataComponentsDeleteDataComponent.ts} |   13 +-
 ...Id.ts => dataComponentsGetDataComponentById.ts} |   13 +-
 .../tools/dataComponentsListDataComponents.ts      |   43 +
 ...ent.ts => dataComponentsUpdateDataComponent.ts} |   13 +-
 .../tools/entitlementsListOrgEntitlements.ts       |   44 +
 .../tools/evaluationsAddAgentToDataset.ts          |   41 +
 .../tools/evaluationsAddAgentToEvaluator.ts        |   42 +
 .../tools/evaluationsAddEvaluatorToJobConfig.ts    |    7 +-
 .../tools/evaluationsAddEvaluatorToSuiteConfig.ts  |    7 +-
 .../evaluationsBatchGetEvaluatorAgentScopes.ts     |   43 +
 .../mcp-server/tools/evaluationsCreateDataset.ts   |    7 +-
 .../tools/evaluationsCreateDatasetItem.ts          |    7 +-
 .../tools/evaluationsCreateDatasetItemsBulk.ts     |    7 +-
 .../tools/evaluationsCreateDatasetRunConfig.ts     |   43 +
 .../tools/evaluationsCreateEvaluationJobConfig.ts  |    7 +-
 .../tools/evaluationsCreateEvaluationResult.ts     |    7 +-
 .../tools/evaluationsCreateEvaluationRunConfig.ts  |    7 +-
 .../evaluationsCreateEvaluationSuiteConfig.ts      |    7 +-
 .../mcp-server/tools/evaluationsCreateEvaluator.ts |    7 +-
 .../mcp-server/tools/evaluationsDeleteDataset.ts   |    7 +-
 .../tools/evaluationsDeleteDatasetItem.ts          |    7 +-
 .../tools/evaluationsDeleteDatasetRunConfig.ts     |   43 +
 .../tools/evaluationsDeleteEvaluationJobConfig.ts  |    7 +-
 .../tools/evaluationsDeleteEvaluationResult.ts     |    7 +-
 .../tools/evaluationsDeleteEvaluationRunConfig.ts  |    7 +-
 .../evaluationsDeleteEvaluationSuiteConfig.ts      |    7 +-
 .../mcp-server/tools/evaluationsDeleteEvaluator.ts |    7 +-
 .../tools/evaluationsEvaluateConversation.ts       |    7 +-
 .../src/mcp-server/tools/evaluationsGetDataset.ts  |    7 +-
 .../mcp-server/tools/evaluationsGetDatasetItem.ts  |    7 +-
 .../mcp-server/tools/evaluationsGetDatasetRun.ts   |   41 +
 ...onents.ts => evaluationsGetDatasetRunConfig.ts} |   19 +-
 .../tools/evaluationsGetDatasetRunItems.ts         |   41 +
 .../tools/evaluationsGetEvaluationJobConfig.ts     |    7 +-
 .../evaluationsGetEvaluationJobConfigResults.ts    |    7 +-
 .../tools/evaluationsGetEvaluationResult.ts        |    7 +-
 .../tools/evaluationsGetEvaluationRunConfig.ts     |    7 +-
 .../evaluationsGetEvaluationRunConfigResults.ts    |    7 +-
 .../tools/evaluationsGetEvaluationSuiteConfig.ts   |    7 +-
 .../mcp-server/tools/evaluationsGetEvaluator.ts    |    7 +-
 .../tools/evaluationsGetEvaluatorsBatch.ts         |    7 +-
 .../tools/evaluationsListDatasetAgents.ts          |   41 +
 .../tools/evaluationsListDatasetItems.ts           |    7 +-
 .../tools/evaluationsListDatasetRunConfigs.ts      |   43 +
 .../mcp-server/tools/evaluationsListDatasetRuns.ts |   41 +
 .../mcp-server/tools/evaluationsListDatasets.ts    |    7 +-
 ...evaluationsListEvaluationJobConfigEvaluators.ts |   16 +-
 .../tools/evaluationsListEvaluationJobConfigs.ts   |    7 +-
 .../tools/evaluationsListEvaluationRunConfigs.ts   |    7 +-
 ...aluationsListEvaluationSuiteConfigEvaluators.ts |   16 +-
 .../tools/evaluationsListEvaluationSuiteConfigs.ts |    7 +-
 ...onfigs.ts => evaluationsListEvaluatorAgents.ts} |   19 +-
 .../mcp-server/tools/evaluationsListEvaluators.ts  |    7 +-
 .../tools/evaluationsRemoveAgentFromDataset.ts     |   43 +
 .../tools/evaluationsRemoveAgentFromEvaluator.ts   |   43 +
 .../evaluationsRemoveEvaluatorFromJobConfig.ts     |    7 +-
 .../evaluationsRemoveEvaluatorFromSuiteConfig.ts   |    7 +-
 .../evaluationsStartConversationsEvaluations.ts    |    7 +-
 .../tools/evaluationsTriggerDatasetRun.ts          |   41 +
 .../mcp-server/tools/evaluationsUpdateDataset.ts   |    7 +-
 .../tools/evaluationsUpdateDatasetItem.ts          |    7 +-
 .../tools/evaluationsUpdateDatasetRunConfig.ts     |   43 +
 .../tools/evaluationsUpdateEvaluationResult.ts     |    7 +-
 .../tools/evaluationsUpdateEvaluationRunConfig.ts  |    7 +-
 .../evaluationsUpdateEvaluationSuiteConfig.ts      |    7 +-
 .../mcp-server/tools/evaluationsUpdateEvaluator.ts |    7 +-
 .../tools/externalAgentsCreateExternalAgent.ts     |    7 +-
 .../tools/externalAgentsDeleteExternalAgent.ts     |    7 +-
 .../tools/externalAgentsGetExternalAgentById.ts    |    7 +-
 .../tools/externalAgentsListExternalAgents.ts      |    7 +-
 .../tools/externalAgentsUpdateExternalAgent.ts     |    7 +-
 .../src/mcp-server/tools/feedbackCreateFeedback.ts |   43 +
 .../src/mcp-server/tools/feedbackDeleteFeedback.ts |   43 +
 .../mcp-server/tools/feedbackGetFeedbackById.ts    |   43 +
 .../src/mcp-server/tools/feedbackListFeedback.ts   |   43 +
 .../src/mcp-server/tools/feedbackUpdateFeedback.ts |   43 +
 .../tools/functionToolsCreateFunctionTool.ts       |    7 +-
 .../tools/functionToolsDeleteFunctionTool.ts       |    7 +-
 .../tools/functionToolsGetFunctionTool.ts          |    7 +-
 .../tools/functionToolsListFunctionTools.ts        |    7 +-
 .../tools/functionToolsUpdateFunctionTool.ts       |    7 +-
 .../mcp-server/tools/functionsCreateFunction.ts    |    7 +-
 .../mcp-server/tools/functionsDeleteFunction.ts    |    7 +-
 .../src/mcp-server/tools/functionsGetFunction.ts   |    7 +-
 .../src/mcp-server/tools/functionsListFunctions.ts |    7 +-
 .../mcp-server/tools/functionsUpdateFunction.ts    |    7 +-
 .../tools/gitHubDeleteGithubInstallation.ts        |   44 +
 .../tools/gitHubDisconnectGithubInstallation.ts    |   45 +
 .../mcp-server/tools/gitHubGetGithubInstallUrl.ts  |   43 +
 .../tools/gitHubGetGithubInstallationDetails.ts    |   45 +
 .../tools/gitHubListGithubInstallations.ts         |   43 +
 .../tools/gitHubReconnectGithubInstallation.ts     |   45 +
 .../gitHubSyncGithubInstallationRepositories.ts    |   45 +
 .../tools/{health.ts => healthHealth.ts}           |   11 +-
 .../agents-mcp/src/mcp-server/tools/healthReady.ts |   36 +
 .../invitationsGetManageApiInvitationsPending.ts   |   46 -
 .../mcp-server/tools/mcpCatalogListMCPCatalog.ts   |    7 +-
 .../src/mcp-server/tools/oAuthMcpOauthCallback.ts  |    9 +-
 .../src/mcp-server/tools/oAuthSlackInstall.ts      |   43 +
 .../mcp-server/tools/oAuthSlackOauthRedirect.ts    |   43 +
 .../tools/projectMembersAddProjectMember.ts        |    9 +-
 .../tools/projectMembersListProjectMembers.ts      |    9 +-
 .../tools/projectMembersRemoveProjectMember.ts     |    9 +-
 .../tools/projectMembersUpdateProjectMember.ts     |    9 +-
 .../projectPermissionsGetProjectPermissions.ts     |    7 +-
 ...FullProject.ts => projectsCreateFullProject.ts} |   13 +-
 .../src/mcp-server/tools/projectsCreateProject.ts  |    7 +-
 ...FullProject.ts => projectsDeleteFullProject.ts} |   13 +-
 .../src/mcp-server/tools/projectsDeleteProject.ts  |    7 +-
 ...GetFullProject.ts => projectsGetFullProject.ts} |   13 +-
 ...ts => projectsGetFullProjectWithRelationIds.ts} |   13 +-
 .../src/mcp-server/tools/projectsGetProjectById.ts |    7 +-
 .../tools/projectsGetProjectGithubAccess.ts        |   44 +
 .../src/mcp-server/tools/projectsListProjects.ts   |    7 +-
 .../tools/projectsSetProjectGithubAccess.ts        |   44 +
 ...FullProject.ts => projectsUpdateFullProject.ts} |   13 +-
 .../src/mcp-server/tools/projectsUpdateProject.ts  |    7 +-
 .../src/mcp-server/tools/refsResolveRef.ts         |    7 +-
 .../scheduledTriggersAddScheduledTriggerUser.ts    |   43 +
 ...uledTriggersCancelScheduledTriggerInvocation.ts |   42 +
 ... => scheduledTriggersCreateScheduledTrigger.ts} |   19 +-
 ... => scheduledTriggersDeleteScheduledTrigger.ts} |   19 +-
 .../scheduledTriggersGetScheduledTriggerById.ts    |   43 +
 ...ledTriggersGetScheduledTriggerInvocationById.ts |   42 +
 ...duledTriggersListScheduledTriggerInvocations.ts |   42 +
 .../scheduledTriggersListScheduledTriggerUsers.ts  |   43 +
 ...s => scheduledTriggersListScheduledTriggers.ts} |   19 +-
 .../scheduledTriggersListUpcomingScheduledRuns.ts  |   43 +
 .../scheduledTriggersRemoveScheduledTriggerUser.ts |   43 +
 ...duledTriggersRerunScheduledTriggerInvocation.ts |   42 +
 ... => scheduledTriggersRunScheduledTriggerNow.ts} |   19 +-
 .../scheduledTriggersSetScheduledTriggerUsers.ts   |   43 +
 .../scheduledTriggersUpdateScheduledTrigger.ts     |   43 +
 .../src/mcp-server/tools/skillsCreateSkill.ts      |   41 +
 .../src/mcp-server/tools/skillsCreateSkillFile.ts  |   41 +
 .../mcp-server/tools/skillsCreateSubagentSkill.ts  |   41 +
 .../src/mcp-server/tools/skillsDeleteSkill.ts      |   41 +
 .../src/mcp-server/tools/skillsDeleteSkillFile.ts  |   41 +
 .../mcp-server/tools/skillsDeleteSubagentSkill.ts  |   41 +
 .../src/mcp-server/tools/skillsGetSkill.ts         |   41 +
 .../src/mcp-server/tools/skillsGetSkillFile.ts     |   41 +
 .../mcp-server/tools/skillsGetSkillsForSubagent.ts |   41 +
 .../src/mcp-server/tools/skillsListSkills.ts       |   41 +
 .../src/mcp-server/tools/skillsUpdateSkill.ts      |   41 +
 .../src/mcp-server/tools/skillsUpdateSkillFile.ts  |   41 +
 ...RelationsCreateSubAgentExternalAgentRelation.ts |   45 -
 ...RelationsDeleteSubAgentExternalAgentRelation.ts |   45 -
 ...elationsGetSubAgentExternalAgentRelationById.ts |   45 -
 ...tRelationsListSubAgentExternalAgentRelations.ts |   45 -
 ...RelationsUpdateSubAgentExternalAgentRelation.ts |   45 -
 ...olRelationsAssociateFunctionToolWithSubAgent.ts |   45 -
 ...elationsCheckFunctionToolSubAgentAssociation.ts |   45 -
 ...tionToolRelationsGetFunctionToolsForSubAgent.ts |   44 -
 ...onToolRelationsGetSubAgentsUsingFunctionTool.ts |   45 -
 ...nToolRelationsRemoveFunctionToolFromSubAgent.ts |   45 -
 ...gentRelationsCreateSubAgentTeamAgentRelation.ts |   44 -
 ...gentRelationsDeleteSubAgentTeamAgentRelation.ts |   44 -
 ...entRelationsGetSubAgentTeamAgentRelationById.ts |   45 -
 ...AgentRelationsListSubAgentTeamAgentRelations.ts |   44 -
 ...gentRelationsUpdateSubAgentTeamAgentRelation.ts |   44 -
 ...AgentToolRelationsCreateSubagentToolRelation.ts |   44 -
 ...AgentToolRelationsDeleteSubagentToolRelation.ts |   44 -
 ...bAgentToolRelationsListSubagentToolRelations.ts |   44 -
 ...AgentToolRelationsUpdateSubagentToolRelation.ts |   44 -
 .../subAgentsAssociateFunctionToolWithSubAgent.ts  |   43 +
 ...ubAgentsCheckFunctionToolSubAgentAssociation.ts |   43 +
 ...subAgentsCreateSubAgentExternalAgentRelation.ts |   43 +
 .../tools/subAgentsCreateSubAgentRelation.ts       |   42 +
 .../subAgentsCreateSubAgentTeamAgentRelation.ts    |   43 +
 ...reateSubagent.ts => subAgentsCreateSubagent.ts} |   13 +-
 .../tools/subAgentsCreateSubagentToolRelation.ts   |   43 +
 ...subAgentsDeleteSubAgentExternalAgentRelation.ts |   43 +
 .../tools/subAgentsDeleteSubAgentRelation.ts       |   42 +
 .../subAgentsDeleteSubAgentTeamAgentRelation.ts    |   43 +
 ...eleteSubagent.ts => subAgentsDeleteSubagent.ts} |   13 +-
 .../tools/subAgentsDeleteSubagentToolRelation.ts   |   43 +
 .../tools/subAgentsGetFunctionToolsForSubAgent.ts  |   43 +
 ...ubAgentsGetSubAgentExternalAgentRelationById.ts |   43 +
 ...ById.ts => subAgentsGetSubAgentRelationById.ts} |   13 +-
 .../subAgentsGetSubAgentTeamAgentRelationById.ts   |   43 +
 .../subAgentsGetSubAgentsUsingFunctionTool.ts      |   43 +
 ...SubagentById.ts => subAgentsGetSubagentById.ts} |   13 +-
 ...tion.ts => subAgentsGetSubagentToolRelation.ts} |   22 +-
 ...sForTool.ts => subAgentsGetSubagentsForTool.ts} |   15 +-
 .../subAgentsListSubAgentExternalAgentRelations.ts |   43 +
 .../tools/subAgentsListSubAgentRelations.ts        |   42 +
 .../subAgentsListSubAgentTeamAgentRelations.ts     |   43 +
 .../tools/subAgentsListSubagentToolRelations.ts    |   43 +
 ...tListSubagents.ts => subAgentsListSubagents.ts} |   13 +-
 .../subAgentsRemoveFunctionToolFromSubAgent.ts     |   43 +
 ...subAgentsUpdateSubAgentExternalAgentRelation.ts |   43 +
 .../tools/subAgentsUpdateSubAgentRelation.ts       |   42 +
 .../subAgentsUpdateSubAgentTeamAgentRelation.ts    |   43 +
 ...pdateSubagent.ts => subAgentsUpdateSubagent.ts} |   13 +-
 .../tools/subAgentsUpdateSubagentToolRelation.ts   |   43 +
 .../thirdPartyMCPServersGetOauthRedirectUrl.ts     |    7 +-
 .../thirdPartyMCPServersGetThirdPartyMCPServer.ts  |    7 +-
 .../src/mcp-server/tools/toolsCreateTool.ts        |    7 +-
 .../src/mcp-server/tools/toolsDeleteTool.ts        |    7 +-
 .../tools/toolsGetMcpToolGithubAccess.ts           |   43 +
 .../mcp-server/tools/toolsGetMcpToolSlackAccess.ts |   43 +
 .../src/mcp-server/tools/toolsGetTool.ts           |    7 +-
 .../tools/toolsGetUserCredentialForTool.ts         |    7 +-
 ...ginPublic.ts => toolsInitiateToolOauthLogin.ts} |   19 +-
 .../src/mcp-server/tools/toolsListTools.ts         |    7 +-
 .../tools/toolsSetMcpToolGithubAccess.ts           |   43 +
 .../mcp-server/tools/toolsSetMcpToolSlackAccess.ts |   43 +
 .../src/mcp-server/tools/toolsUpdateTool.ts        |    7 +-
 .../src/mcp-server/tools/triggersCreateTrigger.ts  |    7 +-
 .../src/mcp-server/tools/triggersDeleteTrigger.ts  |    7 +-
 .../src/mcp-server/tools/triggersGetTriggerById.ts |    7 +-
 .../tools/triggersGetTriggerInvocationById.ts      |    7 +-
 .../tools/triggersListTriggerInvocations.ts        |    7 +-
 .../src/mcp-server/tools/triggersListTriggers.ts   |    7 +-
 .../src/mcp-server/tools/triggersRerunTrigger.ts   |   41 +
 .../src/mcp-server/tools/triggersUpdateTrigger.ts  |    7 +-
 ...izationsGetManageApiUsersUserIdOrganizations.ts |   46 -
 ...zationsPostManageApiUsersUserIdOrganizations.ts |   46 -
 .../mcp-server/tools/userProfileGetUserProfile.ts  |   43 +
 .../tools/userProfileUpsertUserProfile.ts          |   43 +
 ...ProjectMembershipsListUserProjectMemberships.ts |   20 +-
 ...jectsProjectIdAgentsAgentIdTriggersTriggerId.ts |   10 +-
 .../tools/workAppsSlackBulkDeleteChannelAgents.ts  |   45 +
 .../tools/workAppsSlackBulkSetChannelAgents.ts     |   45 +
 .../tools/workAppsSlackDeleteChannelSettings.ts    |   45 +
 .../tools/workAppsSlackDeleteWorkspace.ts          |   43 +
 .../tools/workAppsSlackGetChannelSettings.ts       |   44 +
 .../tools/workAppsSlackGetJoinFromWorkspace.ts     |   45 +
 .../mcp-server/tools/workAppsSlackGetWorkspace.ts  |   43 +
 .../tools/workAppsSlackGetWorkspaceSettings.ts     |   45 +
 .../mcp-server/tools/workAppsSlackLinkStatus.ts    |   43 +
 .../mcp-server/tools/workAppsSlackListChannels.ts  |   43 +
 .../tools/workAppsSlackListLinkedUsers.ts          |   43 +
 .../tools/workAppsSlackListWorkspaces.ts           |   36 +
 .../tools/workAppsSlackSetChannelSettings.ts       |   44 +
 ...DatasetItems.ts => workAppsSlackTestMessage.ts} |   21 +-
 .../tools/workAppsSlackUpdateJoinFromWorkspace.ts  |   45 +
 .../tools/workAppsSlackUpdateWorkspaceSettings.ts  |   45 +
 .../mcp-server/tools/workAppsSlackUserConnect.ts   |   43 +
 .../tools/workAppsSlackUserDisconnect.ts           |   43 +
 .../mcp-server/tools/workAppsSlackUserStatus.ts    |   43 +
 .../tools/workAppsSlackVerifyLinkToken.ts          |   43 +
 .../tools/workAppsSlackWorkspaceHealth.ts          |   43 +
 .../tools/workflowsEvaluateConversationsByJob.ts   |    7 +-
 .../workflowsGetApiCronCleanupStreamChunks.ts      |   36 +
 .../workflowsPostApiDeployRestartScheduler.ts      |   36 +
 .../agents-mcp/src/models/addagenttodatasetop.ts   |   86 +
 .../agents-mcp/src/models/addagenttoevaluatorop.ts |   86 +
 .../src/models/addevaluatortojobconfigop.ts        |   27 +-
 .../src/models/addevaluatortosuiteconfigop.ts      |   27 +-
 .../agents-mcp/src/models/addprojectmemberop.ts    |   30 +-
 .../agents-mcp/src/models/addpublickeyrequest.ts   |   51 +
 .../src/models/addscheduledtriggeruserop.ts        |   81 +
 .../src/models/addscheduledtriggeruserrequest.ts   |   14 +
 packages/agents-mcp/src/models/agent.ts            |    3 +
 packages/agents-mcp/src/models/agentcreate.ts      |   23 +-
 .../agents-mcp/src/models/agentdatasetrelation.ts  |   23 +
 .../src/models/agentevaluatorrelation.ts           |   24 +
 .../agents-mcp/src/models/agentlistresponse.ts     |    1 +
 packages/agents-mcp/src/models/agentresponse.ts    |    1 +
 packages/agents-mcp/src/models/agentstopwhen.ts    |    5 +-
 packages/agents-mcp/src/models/agentupdate.ts      |   23 +-
 .../src/models/agentwithincontextofproject.ts      |   23 +-
 .../models/agentwithincontextofprojectresponse.ts  |    1 +
 .../models/agentwithincontextofprojectselect.ts    |   13 +-
 ...twithincontextofprojectselectwithrelationids.ts |   13 +-
 .../src/models/anonymoussessionresponse.ts         |   15 +
 packages/agents-mcp/src/models/apiconfig.ts        |   27 +
 packages/agents-mcp/src/models/apikey.ts           |    1 +
 packages/agents-mcp/src/models/apikeycreate.ts     |    7 +-
 .../agents-mcp/src/models/apikeylistresponse.ts    |    1 +
 packages/agents-mcp/src/models/apikeyresponse.ts   |    1 +
 packages/agents-mcp/src/models/apikeyupdate.ts     |    9 +-
 packages/agents-mcp/src/models/appconfig.ts        |   28 +
 .../agents-mcp/src/models/appconfigresponse.ts     |   29 +
 packages/agents-mcp/src/models/appcreate.ts        |   49 +
 packages/agents-mcp/src/models/applistresponse.ts  |   21 +
 packages/agents-mcp/src/models/appresponse.ts      |   16 +
 packages/agents-mcp/src/models/appresponseitem.ts  |   44 +
 packages/agents-mcp/src/models/appupdate.ts        |   35 +
 .../agents-mcp/src/models/artifactcomponent.ts     |    1 +
 .../src/models/artifactcomponentarrayresponse.ts   |    1 +
 .../src/models/artifactcomponentcreate.ts          |   11 +-
 .../src/models/artifactcomponentlistresponse.ts    |    1 +
 .../src/models/artifactcomponentresponse.ts        |    1 +
 .../src/models/artifactcomponentupdate.ts          |    3 +-
 .../associateartifactcomponentwithagentop.ts       |   39 +-
 .../models/associatedatacomponentwithagentop.ts    |   35 +-
 .../models/associatefunctiontoolwithsubagentop.ts  |   35 +-
 packages/agents-mcp/src/models/badrequest.ts       |   35 +-
 .../src/models/batchgetevaluatoragentscopesop.ts   |   93 +
 packages/agents-mcp/src/models/branchinfo.ts       |    7 +-
 .../agents-mcp/src/models/branchlistresponse.ts    |    1 +
 packages/agents-mcp/src/models/branchresponse.ts   |    1 +
 .../models/cancelscheduledtriggerinvocationop.ts   |   90 +
 .../src/models/candelegatetoexternalagent.ts       |    1 +
 .../src/models/candelegatetoexternalagentinsert.ts |    1 +
 .../src/models/candelegatetoteamagent.ts           |    1 +
 .../src/models/candelegatetoteamagentinsert.ts     |    1 +
 .../src/models/canrelatetointernalsubagent.ts      |    1 +
 packages/agents-mcp/src/models/canuseitem.ts       |    1 +
 packages/agents-mcp/src/models/capabilitiesop.ts   |   16 +-
 .../src/models/capabilitiesresponseschema.ts       |   49 +-
 .../checkartifactcomponentagentassociationop.ts    |   33 +-
 .../models/checkdatacomponentagentassociationop.ts |   31 +-
 .../checkfunctiontoolsubagentassociationop.ts      |   31 +-
 .../agents-mcp/src/models/componentassociation.ts  |    1 +
 .../src/models/componentassociationlistresponse.ts |    1 +
 packages/agents-mcp/src/models/componentjoin.ts    |    5 +-
 packages/agents-mcp/src/models/conflictitem.ts     |   26 +
 packages/agents-mcp/src/models/contextconfig.ts    |    4 +-
 .../agents-mcp/src/models/contextconfigcreate.ts   |    9 +-
 .../src/models/contextconfiglistresponse.ts        |    1 +
 .../agents-mcp/src/models/contextconfigresponse.ts |    1 +
 .../agents-mcp/src/models/contextconfigupdate.ts   |    9 +-
 .../src/models/conversationboundsresponse.ts       |   28 +
 .../conversationwithformattedmessagesresponse.ts   |    1 +
 packages/agents-mcp/src/models/createagentop.ts    |   33 +-
 .../src/models/createanonymoussessionop.ts         |   67 +
 packages/agents-mcp/src/models/createapikeyop.ts   |   34 +-
 .../agents-mcp/src/models/createappauthkeyop.ts    |   80 +
 packages/agents-mcp/src/models/createappop.ts      |   92 +
 .../src/models/createartifactcomponentop.ts        |   30 +-
 packages/agents-mcp/src/models/createbranchop.ts   |   37 +-
 .../agents-mcp/src/models/createbranchrequest.ts   |   16 +-
 .../agents-mcp/src/models/createcontextconfigop.ts |   31 +-
 .../src/models/createcredentialinstoreop.ts        |   29 +-
 .../src/models/createcredentialinstorerequest.ts   |    9 +-
 .../src/models/createcredentialinstoreresponse.ts  |    7 +-
 .../agents-mcp/src/models/createcredentialop.ts    |   30 +-
 .../agents-mcp/src/models/createdatacomponentop.ts |   31 +-
 .../agents-mcp/src/models/createdatasetitemop.ts   |   30 +-
 .../src/models/createdatasetitemsbulkop.ts         |   30 +-
 packages/agents-mcp/src/models/createdatasetop.ts  |   32 +-
 .../src/models/createdatasetrunconfigop.ts         |  106 +
 .../src/models/createevaluationjobconfigop.ts      |   29 +-
 .../src/models/createevaluationresultop.ts         |   30 +-
 .../src/models/createevaluationrunconfigop.ts      |   29 +-
 .../src/models/createevaluationsuiteconfigop.ts    |   29 +-
 .../agents-mcp/src/models/createevaluatorop.ts     |   30 +-
 .../agents-mcp/src/models/createexternalagentop.ts |   31 +-
 packages/agents-mcp/src/models/createfeedbackop.ts |   71 +
 .../agents-mcp/src/models/createfullagentop.ts     |   35 +-
 .../agents-mcp/src/models/createfullprojectop.ts   |   34 +-
 packages/agents-mcp/src/models/createfunctionop.ts |   31 +-
 .../agents-mcp/src/models/createfunctiontoolop.ts  |   31 +-
 .../src/models/createplaygroundtokenop.ts          |   24 +-
 packages/agents-mcp/src/models/createprojectop.ts  |   37 +-
 .../src/models/createscheduledtriggerop.ts         |   79 +
 .../agents-mcp/src/models/createskillfileop.ts     |   80 +
 packages/agents-mcp/src/models/createskillop.ts    |   74 +
 .../createsubagentexternalagentrelationop.ts       |   31 +-
 packages/agents-mcp/src/models/createsubagentop.ts |   31 +-
 .../src/models/createsubagentrelationop.ts         |   30 +-
 .../agents-mcp/src/models/createsubagentskillop.ts |   80 +
 .../models/createsubagentteamagentrelationop.ts    |   29 +-
 .../src/models/createsubagenttoolrelationop.ts     |   29 +-
 packages/agents-mcp/src/models/createtoolop.ts     |   33 +-
 packages/agents-mcp/src/models/createtriggerop.ts  |   45 +-
 .../agents-mcp/src/models/credentialreference.ts   |    5 +
 .../src/models/credentialreferencecreate.ts        |   11 +-
 .../src/models/credentialreferencelistresponse.ts  |    1 +
 .../src/models/credentialreferenceresponse.ts      |    1 +
 .../src/models/credentialreferenceupdate.ts        |   11 +-
 packages/agents-mcp/src/models/credentialstore.ts  |   13 +-
 .../src/models/credentialstorelistresponse.ts      |    5 +-
 packages/agents-mcp/src/models/datacomponent.ts    |    1 +
 .../src/models/datacomponentarrayresponse.ts       |    1 +
 .../agents-mcp/src/models/datacomponentcreate.ts   |   15 +-
 .../src/models/datacomponentlistresponse.ts        |    1 +
 .../agents-mcp/src/models/datacomponentresponse.ts |    1 +
 .../agents-mcp/src/models/datacomponentupdate.ts   |   19 +-
 packages/agents-mcp/src/models/datapart.ts         |   28 +
 packages/agents-mcp/src/models/dataset.ts          |    1 +
 packages/agents-mcp/src/models/datasetcreate.ts    |    1 +
 packages/agents-mcp/src/models/datasetitem.ts      |    3 +-
 .../agents-mcp/src/models/datasetitemcreate.ts     |    3 +-
 .../agents-mcp/src/models/datasetitemupdate.ts     |    3 +-
 packages/agents-mcp/src/models/datasetrun.ts       |   60 +
 packages/agents-mcp/src/models/datasetrunconfig.ts |   26 +
 packages/agents-mcp/src/models/datasetrunitem.ts   |   21 -
 packages/agents-mcp/src/models/datasetupdate.ts    |    1 +
 packages/agents-mcp/src/models/deleteagentop.ts    |   17 +-
 packages/agents-mcp/src/models/deleteapikeyop.ts   |   17 +-
 .../agents-mcp/src/models/deleteappauthkeyop.ts    |   68 +
 packages/agents-mcp/src/models/deleteappop.ts      |   42 +
 .../src/models/deleteartifactcomponentop.ts        |   15 +-
 packages/agents-mcp/src/models/deletebranchop.ts   |   45 +-
 .../agents-mcp/src/models/deletecontextconfigop.ts |   27 +-
 .../agents-mcp/src/models/deletecredentialop.ts    |   15 +-
 .../agents-mcp/src/models/deletedatacomponentop.ts |   15 +-
 .../agents-mcp/src/models/deletedatasetitemop.ts   |   27 +-
 packages/agents-mcp/src/models/deletedatasetop.ts  |   29 +-
 .../src/models/deletedatasetrunconfigop.ts         |   66 +
 .../src/models/deleteevaluationjobconfigop.ts      |   27 +-
 .../src/models/deleteevaluationresultop.ts         |   27 +-
 .../src/models/deleteevaluationrunconfigop.ts      |   27 +-
 .../src/models/deleteevaluationsuiteconfigop.ts    |   27 +-
 .../agents-mcp/src/models/deleteevaluatorop.ts     |   27 +-
 .../agents-mcp/src/models/deleteexternalagentop.ts |   15 +-
 packages/agents-mcp/src/models/deletefeedbackop.ts |   79 +
 .../agents-mcp/src/models/deletefullagentop.ts     |   27 +-
 .../agents-mcp/src/models/deletefullprojectop.ts   |   27 +-
 packages/agents-mcp/src/models/deletefunctionop.ts |   27 +-
 .../agents-mcp/src/models/deletefunctiontoolop.ts  |   27 +-
 .../src/models/deletegithubinstallationop.ts       |   82 +
 packages/agents-mcp/src/models/deleteprojectop.ts  |   33 +-
 .../src/models/deletescheduledtriggerop.ts         |   68 +
 .../agents-mcp/src/models/deleteskillfileop.ts     |   68 +
 packages/agents-mcp/src/models/deleteskillop.ts    |   66 +
 .../deletesubagentexternalagentrelationop.ts       |   15 +-
 packages/agents-mcp/src/models/deletesubagentop.ts |   15 +-
 .../src/models/deletesubagentrelationop.ts         |   15 +-
 .../agents-mcp/src/models/deletesubagentskillop.ts |   70 +
 .../models/deletesubagentteamagentrelationop.ts    |   15 +-
 .../src/models/deletesubagenttoolrelationop.ts     |   15 +-
 packages/agents-mcp/src/models/deletetoolop.ts     |   29 +-
 packages/agents-mcp/src/models/deletetriggerop.ts  |   29 +-
 packages/agents-mcp/src/models/diffsummaryitem.ts  |   20 +
 .../src/models/disconnectgithubinstallationop.ts   |   79 +
 .../models/enduserconversationdetailresponse.ts    |   72 +
 .../src/models/enduserconversationlistresponse.ts  |   37 +
 packages/agents-mcp/src/models/errorresponse.ts    |    3 +-
 packages/agents-mcp/src/models/errors/apierror.ts  |    1 +
 .../src/models/errors/httpclienterrors.ts          |    1 +
 .../src/models/errors/sdkvalidationerror.ts        |    1 +
 .../src/models/evaluateconversationop.ts           |   30 +-
 .../src/models/evaluateconversationsbyjobop.ts     |   13 +-
 .../agents-mcp/src/models/evaluationjobconfig.ts   |    1 +
 .../src/models/evaluationjobconfigcreate.ts        |    1 +
 .../src/models/evaluationjobfiltercriteria.ts      |    1 +
 packages/agents-mcp/src/models/evaluationresult.ts |    1 +
 .../src/models/evaluationresultcreate.ts           |    1 +
 .../src/models/evaluationresultupdate.ts           |    1 +
 .../src/models/evaluationrunconfigcreate.ts        |    1 +
 .../src/models/evaluationrunconfigupdate.ts        |    1 +
 .../models/evaluationrunconfigwithsuiteconfigs.ts  |    1 +
 .../agents-mcp/src/models/evaluationsuiteconfig.ts |    1 +
 .../src/models/evaluationsuiteconfigcreate.ts      |    1 +
 .../src/models/evaluationsuiteconfigupdate.ts      |    1 +
 packages/agents-mcp/src/models/evaluator.ts        |    1 +
 packages/agents-mcp/src/models/evaluatorcreate.ts  |    1 +
 packages/agents-mcp/src/models/evaluatorupdate.ts  |    1 +
 packages/agents-mcp/src/models/existsresponse.ts   |    1 +
 packages/agents-mcp/src/models/externalagent.ts    |    1 +
 .../agents-mcp/src/models/externalagentcreate.ts   |    7 +-
 .../src/models/externalagentlistresponse.ts        |    1 +
 .../agents-mcp/src/models/externalagentresponse.ts |    1 +
 .../agents-mcp/src/models/externalagentupdate.ts   |    7 +-
 packages/agents-mcp/src/models/feedback.ts         |   26 +
 packages/agents-mcp/src/models/feedbackcreate.ts   |   38 +
 .../agents-mcp/src/models/feedbacklistresponse.ts  |   42 +
 packages/agents-mcp/src/models/feedbackresponse.ts |   15 +
 packages/agents-mcp/src/models/feedbackupdate.ts   |   32 +
 packages/agents-mcp/src/models/filepart.ts         |   62 +
 packages/agents-mcp/src/models/forbidden.ts        |   35 +-
 .../agents-mcp/src/models/fullagentagentinsert.ts  |   28 +-
 .../src/models/fullagentsubagentselect.ts          |    1 +
 .../fullagentsubagentselectwithrelationids.ts      |    1 +
 .../agents-mcp/src/models/fullprojectdefinition.ts |    8 +-
 .../agents-mcp/src/models/fullprojectselect.ts     |    5 +-
 .../src/models/fullprojectselectresponse.ts        |    1 +
 .../src/models/fullprojectselectwithrelationids.ts |    5 +-
 .../fullprojectselectwithrelationidsresponse.ts    |    1 +
 packages/agents-mcp/src/models/function.ts         |    1 +
 packages/agents-mcp/src/models/functioncreate.ts   |   15 +-
 .../agents-mcp/src/models/functionlistresponse.ts  |    1 +
 packages/agents-mcp/src/models/functionresponse.ts |    1 +
 packages/agents-mcp/src/models/functiontool.ts     |    1 +
 .../agents-mcp/src/models/functiontoolcreate.ts    |    7 +-
 .../src/models/functiontoollistresponse.ts         |    1 +
 .../agents-mcp/src/models/functiontoolresponse.ts  |    1 +
 .../agents-mcp/src/models/functiontoolupdate.ts    |    7 +-
 packages/agents-mcp/src/models/functionupdate.ts   |   11 +-
 packages/agents-mcp/src/models/getagentop.ts       |   31 +-
 .../models/getagentsusingartifactcomponentop.ts    |   29 +-
 .../src/models/getagentsusingdatacomponentop.ts    |   29 +-
 .../src/models/getapicroncleanupstreamchunksop.ts  |   24 +
 packages/agents-mcp/src/models/getapikeybyidop.ts  |   33 +-
 .../src/models/getapiworkflowprocessop.ts          |   19 -
 packages/agents-mcp/src/models/getappbyidop.ts     |   69 +
 .../src/models/getartifactcomponentbyidop.ts       |   30 +-
 .../src/models/getartifactcomponentsforagentop.ts  |   29 +-
 packages/agents-mcp/src/models/getbranchop.ts      |   33 +-
 .../src/models/getcontextconfigbyidop.ts           |   31 +-
 .../src/models/getconversationboundsop.ts          |   73 +
 .../src/models/getconversationmediaop.ts           |   86 +
 .../agents-mcp/src/models/getconversationop.ts     |   31 +-
 .../agents-mcp/src/models/getcredentialbyidop.ts   |   30 +-
 .../src/models/getdatacomponentbyidop.ts           |   31 +-
 .../src/models/getdatacomponentsforagentop.ts      |   30 +-
 packages/agents-mcp/src/models/getdatasetitemop.ts |   30 +-
 packages/agents-mcp/src/models/getdatasetop.ts     |   33 +-
 .../agents-mcp/src/models/getdatasetrunconfigop.ts |   84 +
 .../agents-mcp/src/models/getdatasetrunitemsop.ts  |  119 +
 packages/agents-mcp/src/models/getdatasetrunop.ts  |  185 +
 .../src/models/getenduserconversationop.ts         |   99 +
 .../src/models/getevaluationjobconfigop.ts         |   30 +-
 .../src/models/getevaluationjobconfigresultsop.ts  |   29 +-
 .../agents-mcp/src/models/getevaluationresultop.ts |   30 +-
 .../src/models/getevaluationrunconfigop.ts         |   30 +-
 .../src/models/getevaluationrunconfigresultsop.ts  |   29 +-
 .../src/models/getevaluationsuiteconfigop.ts       |   29 +-
 packages/agents-mcp/src/models/getevaluatorop.ts   |   32 +-
 .../agents-mcp/src/models/getevaluatorsbatchop.ts  |   30 +-
 .../src/models/getexternalagentbyidop.ts           |   31 +-
 .../agents-mcp/src/models/getfeedbackbyidop.ts     |   74 +
 .../src/models/getfullagentdefinitionop.ts         |   31 +-
 packages/agents-mcp/src/models/getfullagentop.ts   |   33 +-
 packages/agents-mcp/src/models/getfullprojectop.ts |   30 +-
 .../src/models/getfullprojectwithrelationidsop.ts  |   31 +-
 packages/agents-mcp/src/models/getfunctionop.ts    |   33 +-
 .../agents-mcp/src/models/getfunctiontoolop.ts     |   31 +-
 .../src/models/getfunctiontoolsforsubagentop.ts    |   30 +-
 .../src/models/getgithubinstallationdetailsop.ts   |  136 +
 .../agents-mcp/src/models/getgithubinstallurlop.ts |   76 +
 .../agents-mcp/src/models/getmanageapiclimeop.ts   |   14 +-
 .../src/models/getmanageapiinvitationspendingop.ts |   59 -
 .../getmanageapiusersuseridorganizationsop.ts      |   54 -
 .../src/models/getmcptoolgithubaccessop.ts         |  140 +
 .../src/models/getmcptoolslackaccessop.ts          |  112 +
 .../agents-mcp/src/models/getoauthredirecturlop.ts |   36 +-
 .../agents-mcp/src/models/getpowchallengeop.ts     |   40 +
 packages/agents-mcp/src/models/getprojectbyidop.ts |   31 +-
 .../src/models/getprojectgithubaccessop.ts         |  132 +
 .../src/models/getprojectpermissionsop.ts          |   30 +-
 .../src/models/getrelatedagentinfosop.ts           |   29 +-
 .../src/models/getrunagentswellknownagentjsonop.ts |   13 +-
 .../src/models/getrunapiexecutionsexecutionidop.ts |  107 +
 .../getrunapiexecutionsexecutionidstreamop.ts      |   64 +
 .../src/models/getscheduledtriggerbyidop.ts        |   75 +
 .../models/getscheduledtriggerinvocationbyidop.ts  |   81 +
 packages/agents-mcp/src/models/getskillfileop.ts   |   76 +
 packages/agents-mcp/src/models/getskillop.ts       |   73 +
 .../src/models/getskillsforsubagentop.ts           |   79 +
 .../agents-mcp/src/models/getsubagentbyidop.ts     |   31 +-
 .../getsubagentexternalagentrelationbyidop.ts      |   31 +-
 .../src/models/getsubagentrelationbyidop.ts        |   30 +-
 .../agents-mcp/src/models/getsubagentsfortoolop.ts |   29 +-
 .../src/models/getsubagentsusingfunctiontoolop.ts  |   29 +-
 .../models/getsubagentteamagentrelationbyidop.ts   |   29 +-
 .../src/models/getsubagenttoolrelationop.ts        |   29 +-
 .../src/models/getthirdpartymcpserverop.ts         |   32 +-
 packages/agents-mcp/src/models/gettoolop.ts        |   29 +-
 packages/agents-mcp/src/models/gettriggerbyidop.ts |   29 +-
 .../src/models/gettriggerinvocationbyidop.ts       |   30 +-
 .../src/models/getusercredentialfortoolop.ts       |   30 +-
 packages/agents-mcp/src/models/getuserprofileop.ts |   85 +
 packages/agents-mcp/src/models/healthop.ts         |   11 +-
 .../src/models/initiateoauthloginpublicop.ts       |   43 -
 .../src/models/initiatetooloauthloginop.ts         |   48 +
 .../agents-mcp/src/models/internalservererror.ts   |   35 +-
 .../src/models/jsonschemaforllmschema.ts           |   62 +
 .../src/models/jsonschemapropertyschemaunion.ts    |  419 ++
 packages/agents-mcp/src/models/lastrunsummary.ts   |   25 +
 packages/agents-mcp/src/models/listagentsop.ts     |   33 +-
 packages/agents-mcp/src/models/listapikeysop.ts    |   33 +-
 .../agents-mcp/src/models/listappauthkeysop.ts     |   74 +
 packages/agents-mcp/src/models/listappsop.ts       |   96 +
 .../src/models/listartifactcomponentsop.ts         |   29 +-
 .../agents-mcp/src/models/listavailableagentsop.ts |   64 +
 .../src/models/listbranchesforagentop.ts           |   31 +-
 packages/agents-mcp/src/models/listbranchesop.ts   |   33 +-
 .../agents-mcp/src/models/listcontextconfigsop.ts  |   30 +-
 .../agents-mcp/src/models/listconversationsop.ts   |   77 +
 .../agents-mcp/src/models/listcredentialsop.ts     |   29 +-
 .../src/models/listcredentialstoresop.ts           |   30 +-
 .../agents-mcp/src/models/listdatacomponentsop.ts  |   30 +-
 .../agents-mcp/src/models/listdatasetagentsop.ts   |   89 +
 .../agents-mcp/src/models/listdatasetitemsop.ts    |   30 +-
 .../src/models/listdatasetrunconfigsop.ts          |   89 +
 .../agents-mcp/src/models/listdatasetrunsop.ts     |   86 +
 packages/agents-mcp/src/models/listdatasetsop.ts   |   39 +-
 .../src/models/listenduserconversationsop.ts       |   83 +
 .../models/listevaluationjobconfigevaluatorsop.ts  |   27 +-
 .../src/models/listevaluationjobconfigsop.ts       |   29 +-
 .../src/models/listevaluationrunconfigsop.ts       |   29 +-
 .../listevaluationsuiteconfigevaluatorsop.ts       |   27 +-
 .../src/models/listevaluationsuiteconfigsop.ts     |   29 +-
 .../agents-mcp/src/models/listevaluatoragentsop.ts |   89 +
 packages/agents-mcp/src/models/listevaluatorsop.ts |   37 +-
 .../agents-mcp/src/models/listexternalagentsop.ts  |   30 +-
 packages/agents-mcp/src/models/listfeedbackop.ts   |  114 +
 packages/agents-mcp/src/models/listfunctionsop.ts  |   33 +-
 .../agents-mcp/src/models/listfunctiontoolsop.ts   |   30 +-
 .../src/models/listgithubinstallationsop.ts        |  112 +
 packages/agents-mcp/src/models/listmcpcatalogop.ts |   31 +-
 .../agents-mcp/src/models/listorgentitlementsop.ts |   83 +
 .../agents-mcp/src/models/listprojectmembersop.ts  |   30 +-
 packages/agents-mcp/src/models/listprojectsop.ts   |   33 +-
 .../models/listscheduledtriggerinvocationsop.ts    |  121 +
 .../src/models/listscheduledtriggersop.ts          |   81 +
 .../src/models/listscheduledtriggerusersop.ts      |   75 +
 packages/agents-mcp/src/models/listskillsop.ts     |   76 +
 .../models/listsubagentexternalagentrelationsop.ts |   31 +-
 .../src/models/listsubagentrelationsop.ts          |   29 +-
 packages/agents-mcp/src/models/listsubagentsop.ts  |   33 +-
 .../src/models/listsubagentteamagentrelationsop.ts |   31 +-
 .../src/models/listsubagenttoolrelationsop.ts      |   31 +-
 packages/agents-mcp/src/models/listtoolsop.ts      |   37 +-
 .../src/models/listtriggerinvocationsop.ts         |   35 +-
 packages/agents-mcp/src/models/listtriggersop.ts   |   33 +-
 .../src/models/listupcomingscheduledrunsop.ts      |  103 +
 .../src/models/listuserprojectmembershipsop.ts     |   29 +-
 .../src/models/manageconversationlistresponse.ts   |   62 +
 .../src/models/mcpcataloglistresponse.ts           |   37 +-
 .../agents-mcp/src/models/mcpoauthcallbackop.ts    |   11 +-
 packages/agents-mcp/src/models/mcptool.ts          |   29 +-
 .../agents-mcp/src/models/mcptoollistresponse.ts   |    1 +
 packages/agents-mcp/src/models/mcptoolresponse.ts  |    1 +
 packages/agents-mcp/src/models/mergeexecuteop.ts   |   83 +
 .../agents-mcp/src/models/mergeexecuterequest.ts   |   71 +
 .../agents-mcp/src/models/mergeexecuteresponse.ts  |   41 +
 packages/agents-mcp/src/models/mergepreviewop.ts   |   78 +
 .../agents-mcp/src/models/mergepreviewrequest.ts   |   17 +
 .../agents-mcp/src/models/mergepreviewresponse.ts  |   38 +
 packages/agents-mcp/src/models/model.ts            |    1 +
 packages/agents-mcp/src/models/modelsettings.ts    |   15 +-
 packages/agents-mcp/src/models/notfound.ts         |   35 +-
 packages/agents-mcp/src/models/pagination.ts       |    1 +
 packages/agents-mcp/src/models/part.ts             |   32 +
 .../src/models/postapideployrestartschedulerop.ts  |   24 +
 .../postmanageapiusersuseridorganizationsop.ts     |   63 -
 packages/agents-mcp/src/models/postrunapichatop.ts |  201 +-
 ...piexecutionsexecutionidapprovalstoolcallidop.ts |  106 +
 .../src/models/postrunapiexecutionsop.ts           |  260 +
 .../src/models/postrunapitoolapprovalsop.ts        |  120 -
 ...ctsprojectidagentsagentidtriggerstriggeridop.ts |   27 +-
 .../src/models/postrunv1chatcompletionsop.ts       |  294 +-
 packages/agents-mcp/src/models/postrunv1mcpop.ts   |   13 +-
 .../agents-mcp/src/models/powchallengeresponse.ts  |   23 +
 packages/agents-mcp/src/models/powdisablederror.ts |   35 +
 packages/agents-mcp/src/models/project.ts          |    1 +
 packages/agents-mcp/src/models/projectcreate.ts    |    5 +-
 .../agents-mcp/src/models/projectlistresponse.ts   |    1 +
 packages/agents-mcp/src/models/projectmodel.ts     |    1 +
 packages/agents-mcp/src/models/projectresponse.ts  |    1 +
 packages/agents-mcp/src/models/projectupdate.ts    |    1 +
 packages/agents-mcp/src/models/publickeyconfig.ts  |   44 +
 .../agents-mcp/src/models/publickeylistresponse.ts |   17 +
 .../agents-mcp/src/models/publickeyresponse.ts     |   17 +
 packages/agents-mcp/src/models/readyerrorchecks.ts |   15 +
 .../agents-mcp/src/models/readyerrorresponse.ts    |   33 +
 packages/agents-mcp/src/models/readyop.ts          |   38 +
 packages/agents-mcp/src/models/readyresponse.ts    |   28 +
 .../src/models/reconnectgithubinstallationop.ts    |  164 +
 packages/agents-mcp/src/models/relatedagentinfo.ts |    1 +
 .../src/models/relatedagentinfolistresponse.ts     |    1 +
 .../src/models/removeagentfromdatasetop.ts         |   68 +
 .../src/models/removeagentfromevaluatorop.ts       |   68 +
 .../models/removeartifactcomponentfromagentop.ts   |   31 +-
 .../src/models/removedatacomponentfromagentop.ts   |   31 +-
 packages/agents-mcp/src/models/removedresponse.ts  |    1 +
 .../src/models/removeevaluatorfromjobconfigop.ts   |   27 +-
 .../src/models/removeevaluatorfromsuiteconfigop.ts |   27 +-
 .../src/models/removefunctiontoolfromsubagentop.ts |   31 +-
 .../agents-mcp/src/models/removeprojectmemberop.ts |   27 +-
 .../src/models/removescheduledtriggeruserop.ts     |   70 +
 .../models/rerunscheduledtriggerinvocationop.ts    |   92 +
 packages/agents-mcp/src/models/reruntriggerop.ts   |  113 +
 packages/agents-mcp/src/models/resolvedref.ts      |    9 +-
 .../agents-mcp/src/models/resolvedrefresponse.ts   |    1 +
 packages/agents-mcp/src/models/resolverefop.ts     |   33 +-
 .../src/models/resumeconversationstreamop.ts       |   80 +
 .../agents-mcp/src/models/rundatasetitemsop.ts     |   56 -
 .../src/models/runscheduledtriggernowop.ts         |   89 +
 packages/agents-mcp/src/models/scheduledtrigger.ts |   52 +
 .../src/models/scheduledtriggercreate.ts           |   65 +
 .../src/models/scheduledtriggerinvocation.ts       |   99 +
 .../scheduledtriggerinvocationlistresponse.ts      |   23 +
 .../models/scheduledtriggerinvocationresponse.ts   |   20 +
 .../src/models/scheduledtriggerresponse.ts         |   18 +
 .../src/models/scheduledtriggerupdate.ts           |   65 +
 .../src/models/scheduledtriggerusersresponse.ts    |   14 +
 .../src/models/scheduledtriggerwithruninfo.ts      |   95 +
 .../scheduledtriggerwithruninfolistresponse.ts     |   23 +
 packages/agents-mcp/src/models/security.ts         |   10 +-
 .../src/models/setmcptoolgithubaccessop.ts         |  149 +
 .../src/models/setmcptoolslackaccessop.ts          |  154 +
 .../src/models/setprojectgithubaccessop.ts         |  147 +
 .../src/models/setscheduledtriggerusersop.ts       |   81 +
 .../src/models/setscheduledtriggerusersrequest.ts  |   14 +
 packages/agents-mcp/src/models/signaturesource.ts  |   17 +-
 .../src/models/signaturevalidationoptions.ts       |   13 +-
 .../src/models/signatureverificationconfig.ts      |   25 +-
 packages/agents-mcp/src/models/signedcomponent.ts  |   21 +-
 packages/agents-mcp/src/models/skill.ts            |   26 +
 packages/agents-mcp/src/models/skillcreate.ts      |   19 +
 packages/agents-mcp/src/models/skillfile.ts        |   24 +
 packages/agents-mcp/src/models/skillfilecreate.ts  |   13 +
 .../agents-mcp/src/models/skillfileresponse.ts     |   14 +
 packages/agents-mcp/src/models/skillfileupdate.ts  |   12 +
 .../agents-mcp/src/models/skilllistresponse.ts     |   16 +
 packages/agents-mcp/src/models/skillupdate.ts      |   19 +
 packages/agents-mcp/src/models/skillwithfiles.ts   |   29 +
 .../src/models/skillwithfilesresponse.ts           |   15 +
 .../src/models/slackbulkdeletechannelagentsop.ts   |   65 +
 .../src/models/slackbulksetchannelagentsop.ts      |   97 +
 .../src/models/slackdeletechannelsettingsop.ts     |   50 +
 .../src/models/slackdeleteworkspaceop.ts           |   46 +
 .../src/models/slackgetchannelsettingsop.ts        |   69 +
 .../src/models/slackgetjoinfromworkspaceop.ts      |   48 +
 .../agents-mcp/src/models/slackgetworkspaceop.ts   |   71 +
 .../src/models/slackgetworkspacesettingsop.ts      |   63 +
 packages/agents-mcp/src/models/slackinstallop.ts   |   32 +
 .../agents-mcp/src/models/slacklinkstatusop.ts     |   60 +
 .../agents-mcp/src/models/slacklistchannelsop.ts   |   92 +
 .../src/models/slacklistlinkedusersop.ts           |   70 +
 .../agents-mcp/src/models/slacklistworkspacesop.ts |   58 +
 .../agents-mcp/src/models/slackoauthredirectop.ts  |   38 +
 .../src/models/slacksetchannelsettingsop.ts        |   84 +
 .../agents-mcp/src/models/slacktestmessageop.ts    |   68 +
 .../src/models/slackupdatejoinfromworkspaceop.ts   |   61 +
 .../src/models/slackupdateworkspacesettingsop.ts   |   76 +
 .../agents-mcp/src/models/slackuserconnectop.ts    |   58 +
 .../agents-mcp/src/models/slackuserdisconnectop.ts |   54 +
 .../agents-mcp/src/models/slackuserstatusop.ts     |   72 +
 .../src/models/slackverifylinktokenop.ts           |   62 +
 .../src/models/slackworkspacehealthop.ts           |   72 +
 .../src/models/startconversationsevaluationsop.ts  |   29 +-
 packages/agents-mcp/src/models/statuscomponent.ts  |    1 +
 packages/agents-mcp/src/models/statusupdate.ts     |    5 +-
 packages/agents-mcp/src/models/stopwhen.ts         |    9 +-
 packages/agents-mcp/src/models/subagent.ts         |    1 +
 .../models/subagentartifactcomponentresponse.ts    |    1 +
 packages/agents-mcp/src/models/subagentcreate.ts   |    3 +-
 .../src/models/subagentdatacomponentresponse.ts    |    1 +
 .../src/models/subagentexternalagentrelation.ts    |    1 +
 .../models/subagentexternalagentrelationcreate.ts  |    3 +-
 .../subagentexternalagentrelationlistresponse.ts   |    1 +
 .../subagentexternalagentrelationresponse.ts       |    1 +
 .../models/subagentexternalagentrelationupdate.ts  |    7 +-
 .../src/models/subagentfunctiontoolrelation.ts     |    1 +
 .../models/subagentfunctiontoolrelationcreate.ts   |    5 +-
 .../models/subagentfunctiontoolrelationresponse.ts |    1 +
 .../agents-mcp/src/models/subagentlistresponse.ts  |    1 +
 packages/agents-mcp/src/models/subagentrelation.ts |    1 +
 .../src/models/subagentrelationcreate.ts           |   11 +-
 .../src/models/subagentrelationlistresponse.ts     |    1 +
 .../src/models/subagentrelationresponse.ts         |    1 +
 .../src/models/subagentrelationupdate.ts           |   11 +-
 packages/agents-mcp/src/models/subagentresponse.ts |    1 +
 packages/agents-mcp/src/models/subagentskill.ts    |   26 +
 .../agents-mcp/src/models/subagentskillcreate.ts   |   23 +
 .../agents-mcp/src/models/subagentskillresponse.ts |   14 +
 .../src/models/subagentskillwithindex.ts           |   36 +
 .../models/subagentskillwithindexarrayresponse.ts  |   20 +
 packages/agents-mcp/src/models/subagentstopwhen.ts |   16 +
 .../src/models/subagentteamagentrelation.ts        |    1 +
 .../src/models/subagentteamagentrelationcreate.ts  |    3 +-
 .../subagentteamagentrelationlistresponse.ts       |    1 +
 .../models/subagentteamagentrelationresponse.ts    |    1 +
 .../src/models/subagentteamagentrelationupdate.ts  |    7 +-
 .../agents-mcp/src/models/subagenttoolrelation.ts  |    1 +
 .../src/models/subagenttoolrelationcreate.ts       |    7 +-
 .../src/models/subagenttoolrelationlistresponse.ts |    1 +
 .../src/models/subagenttoolrelationresponse.ts     |    1 +
 .../src/models/subagenttoolrelationupdate.ts       |    7 +-
 packages/agents-mcp/src/models/subagentupdate.ts   |    3 +-
 .../src/models/submitenduserfeedbackop.ts          |   67 +
 .../models/syncgithubinstallationrepositoriesop.ts |  188 +
 packages/agents-mcp/src/models/teamagent.ts        |   11 +-
 packages/agents-mcp/src/models/textpart.ts         |   28 +
 .../src/models/thirdpartymcpserverresponse.ts      |   37 +-
 packages/agents-mcp/src/models/tool.ts             |    3 +
 packages/agents-mcp/src/models/toolcreate.ts       |   17 +-
 packages/agents-mcp/src/models/toolupdate.ts       |   17 +-
 .../src/models/triggerauthenticationinput.ts       |    9 +-
 packages/agents-mcp/src/models/triggercreate.ts    |   60 +-
 .../agents-mcp/src/models/triggerdatasetrun.ts     |   25 -
 .../agents-mcp/src/models/triggerdatasetrunop.ts   |  112 +
 .../agents-mcp/src/models/triggerevaluationjob.ts  |    1 +
 .../agents-mcp/src/models/triggerinvocation.ts     |   38 +
 .../src/models/triggerinvocationlistresponse.ts    |    1 +
 .../src/models/triggerinvocationresponse.ts        |    1 +
 .../agents-mcp/src/models/triggerisdisabled.ts     |   89 +
 .../src/models/triggeroutputtransform.ts           |    9 +-
 packages/agents-mcp/src/models/triggerupdate.ts    |   62 +-
 .../agents-mcp/src/models/triggerwithwebhookurl.ts |   13 +-
 .../models/triggerwithwebhookurllistresponse.ts    |    1 +
 .../src/models/triggerwithwebhookurlresponse.ts    |    1 +
 .../triggerwithwebhookurlwithwarningresponse.ts    |   24 +
 packages/agents-mcp/src/models/unauthorized.ts     |   35 +-
 .../agents-mcp/src/models/unprocessableentity.ts   |   35 +-
 packages/agents-mcp/src/models/updateagentop.ts    |   33 +-
 packages/agents-mcp/src/models/updateapikeyop.ts   |   33 +-
 packages/agents-mcp/src/models/updateappop.ts      |   75 +
 .../src/models/updateartifactcomponentop.ts        |   30 +-
 .../agents-mcp/src/models/updatecontextconfigop.ts |   31 +-
 .../agents-mcp/src/models/updatecredentialop.ts    |   30 +-
 .../agents-mcp/src/models/updatedatacomponentop.ts |   31 +-
 .../agents-mcp/src/models/updatedatasetitemop.ts   |   30 +-
 packages/agents-mcp/src/models/updatedatasetop.ts  |   32 +-
 .../src/models/updatedatasetrunconfigop.ts         |  108 +
 .../src/models/updateevaluationresultop.ts         |   30 +-
 .../src/models/updateevaluationrunconfigop.ts      |   29 +-
 .../src/models/updateevaluationsuiteconfigop.ts    |   29 +-
 .../agents-mcp/src/models/updateevaluatorop.ts     |   30 +-
 .../agents-mcp/src/models/updateexternalagentop.ts |   31 +-
 packages/agents-mcp/src/models/updatefeedbackop.ts |   76 +
 .../agents-mcp/src/models/updatefullagentop.ts     |   31 +-
 .../agents-mcp/src/models/updatefullprojectop.ts   |   30 +-
 packages/agents-mcp/src/models/updatefunctionop.ts |   31 +-
 .../agents-mcp/src/models/updatefunctiontoolop.ts  |   31 +-
 .../agents-mcp/src/models/updateprojectmemberop.ts |   30 +-
 packages/agents-mcp/src/models/updateprojectop.ts  |   33 +-
 .../src/models/updatescheduledtriggerop.ts         |   81 +
 .../agents-mcp/src/models/updateskillfileop.ts     |   82 +
 packages/agents-mcp/src/models/updateskillop.ts    |   76 +
 .../updatesubagentexternalagentrelationop.ts       |   31 +-
 packages/agents-mcp/src/models/updatesubagentop.ts |   31 +-
 .../src/models/updatesubagentrelationop.ts         |   30 +-
 .../models/updatesubagentteamagentrelationop.ts    |   29 +-
 .../src/models/updatesubagenttoolrelationop.ts     |   29 +-
 packages/agents-mcp/src/models/updatetoolop.ts     |   33 +-
 packages/agents-mcp/src/models/updatetriggerop.ts  |   45 +-
 .../agents-mcp/src/models/upsertuserprofileop.ts   |  102 +
 packages/agents-mcp/src/models/webclientconfig.ts  |   46 +
 .../src/models/webclientconfigresponse.ts          |   50 +
 packages/agents-mcp/src/tool-names.ts              |    7 +
 packages/agents-mcp/src/types/async.ts             |    1 +
 packages/agents-mcp/src/types/bigint.ts            |    1 +
 packages/agents-mcp/src/types/blobs.ts             |    1 +
 packages/agents-mcp/src/types/enums.ts             |    1 +
 packages/agents-mcp/src/types/fp.ts                |    1 +
 packages/agents-mcp/src/types/rfcdate.ts           |    1 +
 packages/agents-mcp/src/types/streams.ts           |    1 +
 packages/agents-sdk/CHANGELOG.md                   |   17 +
 packages/agents-sdk/package.json                   |    2 +-
 packages/agents-sdk/src/evaluationClient.ts        |  527 +-
 packages/agents-work-apps/CHANGELOG.md             |   18 +
 packages/agents-work-apps/package.json             |    2 +-
 .../src/__tests__/github/config.test.ts            |   38 +-
 .../src/__tests__/github/mcp/utils.test.ts         |   10 +-
 .../src/__tests__/github/routes/setup.test.ts      |   10 +-
 .../src/__tests__/github/routes/webhooks.test.ts   |   11 +-
 packages/agents-work-apps/src/__tests__/setup.ts   |   48 +-
 .../src/__tests__/slack/agent-resolution.test.ts   |   10 +-
 .../src/__tests__/slack/app-mention.test.ts        |   10 +-
 .../src/__tests__/slack/auto-invite.test.ts        |   10 +-
 .../src/__tests__/slack/block-actions.test.ts      |   10 +-
 .../src/__tests__/slack/client.test.ts             |   10 +-
 .../src/__tests__/slack/command-question.test.ts   |   10 +-
 .../src/__tests__/slack/dev-config.test.ts         |   36 +-
 .../src/__tests__/slack/direct-message.test.ts     |   10 +-
 .../src/__tests__/slack/dispatcher.test.ts         |   10 +-
 .../src/__tests__/slack/events.test.ts             |   10 +-
 .../src/__tests__/slack/execution.test.ts          |   10 +-
 .../src/__tests__/slack/handle-command.test.ts     |   10 +-
 .../slack/mcp/prune-stale-channels.test.ts         |   10 +-
 .../src/__tests__/slack/mcp/utils.test.ts          |   10 +-
 .../src/__tests__/slack/modal-submission.test.ts   |   10 +-
 .../src/__tests__/slack/nango.test.ts              |   10 +-
 .../src/__tests__/slack/oauth.test.ts              |   10 +-
 .../src/__tests__/slack/resume-intent.test.ts      |   10 +-
 .../src/__tests__/slack/socket-mode.test.ts        |   10 +-
 .../src/__tests__/slack/streaming.test.ts          |   10 +-
 packages/agents-work-apps/src/github/config.ts     |    2 +-
 packages/agents-work-apps/src/github/jwks.ts       |    4 +-
 packages/agents-work-apps/src/github/oidcToken.ts  |    4 +-
 .../src/github/routes/tokenExchange.ts             |    4 +-
 .../agents-work-apps/src/github/routes/webhooks.ts |    2 +-
 packages/agents-work-apps/src/slack/dispatcher.ts  |   66 +-
 .../agents-work-apps/src/slack/routes/events.ts    |   12 +-
 .../agents-work-apps/src/slack/routes/oauth.ts     |    8 +-
 .../src/slack/routes/workspaces.ts                 |   74 +-
 .../agents-work-apps/src/slack/services/client.ts  |    4 +-
 .../agents-work-apps/src/slack/services/index.ts   |    1 +
 .../agents-work-apps/src/slack/services/nango.ts   |    4 +-
 .../src/slack/services/security.ts                 |    2 +-
 .../src/slack/services/workspace-cleanup.ts        |  106 +
 .../src/slack/slack-app-manifest.json              |   15 +-
 packages/agents-work-apps/src/slack/socket-mode.ts |    8 +-
 packages/ai-sdk-provider/CHANGELOG.md              |   17 +
 packages/ai-sdk-provider/package.json              |    2 +-
 packages/create-agents/CHANGELOG.md                |   17 +
 packages/create-agents/package.json                |    2 +-
 specs/2026-04-06-logger-scoped-context/SPEC.md     |  371 ++
 .../evidence/als-performance.md                    |   48 +
 .../evidence/context-propagation.md                |   54 +
 .../evidence/current-logger-usage.md               |   40 +
 .../meta/_changelog.md                             |   46 +
 .../meta/audit-findings.md                         |  134 +
 .../meta/design-challenge.md                       |  126 +
 1640 files changed, 73811 insertions(+), 21460 deletions(-)
```

Full file list (including untracked files when present):

```
.changeset/rational-teal-emu.md
.changeset/sunny-mugs-carry.md
.changeset/urgent-blush-lion.md
.github/scripts/preview/bootstrap-preview-auth-with-recovery.sh
.github/scripts/preview/bootstrap-preview-auth.sh
.github/scripts/preview/cleanup-stale-railway-envs.sh
.github/scripts/preview/common.sh
.github/scripts/preview/provision-railway.sh
.github/workflows/preview-environments.yml
AGENTS.md
agents-api/CHANGELOG.md
agents-api/__snapshots__/openapi.json
agents-api/package.json
agents-api/src/__tests__/evals/routes/evaluationTriggers.test.ts
agents-api/src/__tests__/evals/services/EvaluationService.test.ts
agents-api/src/__tests__/evals/workflow/evaluateConversation.test.ts
agents-api/src/__tests__/evals/workflow/runDatasetItem.test.ts
agents-api/src/__tests__/manage/data/agentFull.test.ts
agents-api/src/__tests__/manage/data/conversations.test.ts
agents-api/src/__tests__/manage/routes/conversations-media.test.ts
agents-api/src/__tests__/manage/routes/crud/credentialStores.test.ts
agents-api/src/__tests__/manage/routes/crud/feedback.test.ts
agents-api/src/__tests__/manage/routes/github.test.ts
agents-api/src/__tests__/manage/routes/invitations.test.ts
agents-api/src/__tests__/manage/routes/mcp-tool-github-access.test.ts
agents-api/src/__tests__/manage/routes/mcp-tool-slack-access.test.ts
agents-api/src/__tests__/manage/routes/passwordResetLinks.test.ts
agents-api/src/__tests__/manage/routes/project-github-access.test.ts
agents-api/src/__tests__/manage/routes/users.test.ts
agents-api/src/__tests__/middleware/runAuth-appCredentialAuth.test.ts
agents-api/src/__tests__/middleware/runAuth-initiatedBy.test.ts
agents-api/src/__tests__/run/a2a/handlers.test.ts
agents-api/src/__tests__/run/agents/Agent.test.ts
agents-api/src/__tests__/run/agents/ModelFactory.test.ts
agents-api/src/__tests__/run/agents/conversation-history.test.ts
agents-api/src/__tests__/run/agents/generateTaskHandler.test.ts
agents-api/src/__tests__/run/agents/relationTools.test.ts
agents-api/src/__tests__/run/data/conversations.artifact-replacement.test.ts
agents-api/src/__tests__/run/handlers/executionHandler-run-as-user.test.ts
agents-api/src/__tests__/run/handlers/executionHandler-team-delegation.test.ts
agents-api/src/__tests__/run/routes/chat.test.ts
agents-api/src/__tests__/run/routes/integration.test.ts
agents-api/src/__tests__/run/routes/webhooks.test.ts
agents-api/src/__tests__/run/utils/model-resolver.test.ts
agents-api/src/__tests__/setup.ts
agents-api/src/__tests__/utils/in-process-fetch.test.ts
agents-api/src/createApp.ts
agents-api/src/domains/evals/routes/evaluationTriggers.ts
agents-api/src/domains/evals/services/EvaluationService.ts
agents-api/src/domains/evals/services/conversationEvaluation.ts
agents-api/src/domains/evals/services/datasetRun.ts
agents-api/src/domains/evals/services/evaluationJob.ts
agents-api/src/domains/evals/workflow/functions/runDatasetItem.ts
agents-api/src/domains/manage/index.ts
agents-api/src/domains/manage/routes/availableAgents.ts
agents-api/src/domains/manage/routes/conversations.ts
agents-api/src/domains/manage/routes/evals/agentDatasetRelations.ts
agents-api/src/domains/manage/routes/evals/agentEvaluatorRelations.ts
agents-api/src/domains/manage/routes/evals/datasetItems.ts
agents-api/src/domains/manage/routes/evals/datasetRunConfigs.ts
agents-api/src/domains/manage/routes/evals/datasetRuns.ts
agents-api/src/domains/manage/routes/evals/datasets.ts
agents-api/src/domains/manage/routes/evals/evaluationJobConfigEvaluatorRelations.ts
agents-api/src/domains/manage/routes/evals/evaluationJobConfigs.ts
agents-api/src/domains/manage/routes/evals/evaluationResults.ts
agents-api/src/domains/manage/routes/evals/evaluationRunConfigs.ts
agents-api/src/domains/manage/routes/evals/evaluationSuiteConfigEvaluatorRelations.ts
agents-api/src/domains/manage/routes/evals/evaluationSuiteConfigs.ts
agents-api/src/domains/manage/routes/evals/evaluators.ts
agents-api/src/domains/manage/routes/feedback.ts
agents-api/src/domains/manage/routes/functionTools.ts
agents-api/src/domains/manage/routes/functions.ts
agents-api/src/domains/manage/routes/github.ts
agents-api/src/domains/manage/routes/mcpToolGithubAccess.ts
agents-api/src/domains/manage/routes/mcpToolSlackAccess.ts
agents-api/src/domains/manage/routes/oauth.ts
agents-api/src/domains/manage/routes/playgroundToken.ts
agents-api/src/domains/manage/routes/projectFull.ts
agents-api/src/domains/manage/routes/projectGithubAccess.ts
agents-api/src/domains/manage/routes/projectMembers.ts
agents-api/src/domains/manage/routes/scheduledTriggers.ts
agents-api/src/domains/manage/routes/signoz.ts
agents-api/src/domains/manage/routes/tools.ts
agents-api/src/domains/manage/routes/triggers.ts
agents-api/src/domains/run/a2a/transfer.ts
agents-api/src/domains/run/agents/Agent.ts
agents-api/src/domains/run/agents/__tests__/agent-cleanup.test.ts
agents-api/src/domains/run/agents/agent-types.ts
agents-api/src/domains/run/agents/generateTaskHandler.ts
agents-api/src/domains/run/agents/generation/ai-sdk-callbacks.ts
agents-api/src/domains/run/agents/generation/generate.ts
agents-api/src/domains/run/agents/generation/schema-builder.ts
agents-api/src/domains/run/agents/generation/system-prompt.ts
agents-api/src/domains/run/agents/generation/tool-result-for-conversation-history.ts
agents-api/src/domains/run/agents/relationTools.ts
agents-api/src/domains/run/agents/services/AgentMcpManager.ts
agents-api/src/domains/run/agents/services/ToolSessionManager.ts
agents-api/src/domains/run/agents/tools/default-tools.ts
agents-api/src/domains/run/agents/tools/mcp-tools.ts
agents-api/src/domains/run/agents/tools/relation-tools.ts
agents-api/src/domains/run/agents/tools/tool-approval.ts
agents-api/src/domains/run/agents/tools/tool-utils.ts
agents-api/src/domains/run/agents/tools/tool-wrapper.ts
agents-api/src/domains/run/artifacts/ArtifactService.ts
agents-api/src/domains/run/artifacts/__tests__/ArtifactParser.test.ts
agents-api/src/domains/run/artifacts/__tests__/ArtifactParser.typeSchema.test.ts
agents-api/src/domains/run/artifacts/__tests__/ArtifactService.test.ts
agents-api/src/domains/run/compression/BaseCompressor.ts
agents-api/src/domains/run/context/ContextFetcher.ts
agents-api/src/domains/run/context/ContextResolver.ts
agents-api/src/domains/run/context/context.ts
agents-api/src/domains/run/context/validation.ts
agents-api/src/domains/run/handlers/executionHandler.ts
agents-api/src/domains/run/index.ts
agents-api/src/domains/run/routes/chat.ts
agents-api/src/domains/run/routes/chatDataStream.ts
agents-api/src/domains/run/routes/executions.ts
agents-api/src/domains/run/routes/feedback.ts
agents-api/src/domains/run/routes/mcp.ts
agents-api/src/domains/run/routes/webhooks.ts
agents-api/src/domains/run/services/TriggerService.ts
agents-api/src/domains/run/services/__tests__/SchedulerService.test.ts
agents-api/src/domains/run/services/__tests__/file-upload.test.ts
agents-api/src/domains/run/services/__tests__/triggerDispatcher.test.ts
agents-api/src/domains/run/services/blob-storage/vercel-blob-provider.ts
agents-api/src/domains/run/services/triggerDispatcher.ts
agents-api/src/domains/run/session/AgentSession.ts
agents-api/src/domains/run/session/ToolApprovalUiBus.ts
agents-api/src/domains/run/stream/__tests__/IncrementalStreamParser.test.ts
agents-api/src/domains/run/stream/__tests__/streaming-integration.test.ts
agents-api/src/domains/run/tools/SandboxExecutorFactory.ts
agents-api/src/domains/run/utils/__tests__/model-context-utils.test.ts
agents-api/src/domains/run/utils/__tests__/project.test.ts
agents-api/src/domains/run/utils/model-context-utils.ts
agents-api/src/domains/run/utils/model-resolver.ts
agents-api/src/domains/run/workflow/functions/agentExecution.ts
agents-api/src/domains/run/workflow/steps/__tests__/scheduledTriggerSteps.test.ts
agents-api/src/domains/run/workflow/steps/__tests__/schedulerSteps.test.ts
agents-api/src/domains/run/workflow/steps/agentExecutionSteps.ts
agents-api/src/domains/run/workflow/steps/scheduledTriggerSteps.ts
agents-api/src/logger.ts
agents-api/src/middleware/branchScopedDb.ts
agents-api/src/middleware/errorHandler.ts
agents-api/src/middleware/evalsAuth.ts
agents-api/src/middleware/manageAuth.ts
agents-api/src/middleware/ref.ts
agents-api/src/middleware/runAuth.ts
agents-api/src/middleware/tracing.ts
agents-api/src/openapi.ts
agents-cli/CHANGELOG.md
agents-cli/package.json
agents-docs/_snippets/generated/style-classnames.mdx
agents-docs/content/api-reference/(openapi)/executions.mdx
agents-docs/content/api-reference/(openapi)/feedback.mdx
agents-docs/content/api-reference/(openapi)/scheduled-triggers.mdx
agents-docs/content/visual-builder/skills.mdx
agents-docs/package.json
agents-docs/scripts/generate-openapi-docs.ts
agents-docs/src/components/inkeep/inkeep-script.tsx
agents-manage-ui/CHANGELOG.md
agents-manage-ui/package.json
agents-manage-ui/src/app/[tenantId]/projects/[projectId]/evaluations/jobs/[configId]/page.tsx
agents-manage-ui/src/app/[tenantId]/projects/[projectId]/feedback/page.tsx
agents-manage-ui/src/app/[tenantId]/projects/[projectId]/traces/conversations/[conversationId]/page.tsx
agents-manage-ui/src/app/api/traces/conversations/[conversationId]/route.ts
agents-manage-ui/src/components/agent/error-display/agent-error-summary.tsx
agents-manage-ui/src/components/agent/nodes/function-tool-node.tsx
agents-manage-ui/src/components/agent/nodes/mcp-node.tsx
agents-manage-ui/src/components/agent/nodes/sub-agent-node.tsx
agents-manage-ui/src/components/agent/playground/chat-widget.tsx
agents-manage-ui/src/components/agent/playground/feedback-dialog.tsx
agents-manage-ui/src/components/agent/playground/improve-dialog.tsx
agents-manage-ui/src/components/agent/sidepane/metadata/metadata-editor.tsx
agents-manage-ui/src/components/agent/sidepane/nodes/mcp-node-editor.tsx
agents-manage-ui/src/components/agent/sidepane/nodes/sub-agent-node-editor.tsx
agents-manage-ui/src/components/agent/use-grouped-agent-errors.ts
agents-manage-ui/src/components/credentials/views/credential-form.tsx
agents-manage-ui/src/components/dataset-items/dataset-items-table.tsx
agents-manage-ui/src/components/evaluation-run-configs/evaluation-run-config-form-dialog.tsx
agents-manage-ui/src/components/feedback/delete-feedback-confirmation.tsx
agents-manage-ui/src/components/feedback/feedback-table.tsx
agents-manage-ui/src/components/form/__tests__/generic-input.test.tsx
agents-manage-ui/src/components/form/generic-input.tsx
agents-manage-ui/src/components/mcp-servers/form/mcp-server-form.tsx
agents-manage-ui/src/components/mcp-servers/form/tool-override-dialog.tsx
agents-manage-ui/src/components/projects/form/project-form.tsx
agents-manage-ui/src/components/projects/form/project-models-section.tsx
agents-manage-ui/src/components/projects/form/project-stopwhen-section.tsx
agents-manage-ui/src/components/scheduled-triggers/scheduled-trigger-form.tsx
agents-manage-ui/src/components/sidebar-nav/app-sidebar.tsx
agents-manage-ui/src/components/skills/form/skill-form.tsx
agents-manage-ui/src/components/skills/skill-file-editor.tsx
agents-manage-ui/src/components/traces/filters/date-picker.tsx
agents-manage-ui/src/components/traces/timeline/hierarchical-timeline.tsx
agents-manage-ui/src/components/traces/timeline/render-panel-content.tsx
agents-manage-ui/src/components/traces/timeline/timeline-item.tsx
agents-manage-ui/src/components/traces/timeline/timeline-wrapper.tsx
agents-manage-ui/src/components/traces/timeline/types.ts
agents-manage-ui/src/components/triggers/trigger-form.tsx
agents-manage-ui/src/components/ui/local-date-time-text.tsx
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
packages/agents-core/src/__tests__/credentials/composio-store.test.ts
packages/agents-core/src/__tests__/credentials/credentialStuffer.test.ts
packages/agents-core/src/__tests__/credentials/nango-store.test.ts
packages/agents-core/src/__tests__/data-access/projectLifecycle.test.ts
packages/agents-core/src/__tests__/dolt/ref-scope.test.ts
packages/agents-core/src/__tests__/utils/apiKey.test.ts
packages/agents-core/src/__tests__/utils/appCredentials.test.ts
packages/agents-core/src/constants/index.ts
packages/agents-core/src/constants/otel-attributes.ts
packages/agents-core/src/constants/relation-types.ts
packages/agents-core/src/constants/session-events.ts
packages/agents-core/src/constants/tool-names.ts
packages/agents-core/src/constants/workflow.ts
packages/agents-core/src/data-access/__tests__/workAppSlack.test.ts
packages/agents-core/src/data-access/index.ts
packages/agents-core/src/data-access/manage/agentFull.ts
packages/agents-core/src/data-access/runtime/feedback.ts
packages/agents-core/src/db/manage/manage-client.ts
packages/agents-core/src/db/runtime/runtime-client.ts
packages/agents-core/src/db/runtime/runtime-schema.ts
packages/agents-core/src/dolt/merge.ts
packages/agents-core/src/dolt/ref-middleware.ts
packages/agents-core/src/dolt/ref-scope.ts
packages/agents-core/src/index.ts
packages/agents-core/src/retry/__tests__/withRetry.test.ts
packages/agents-core/src/test-utils/index.ts
packages/agents-core/src/test-utils/mocks/index.ts
packages/agents-core/src/test-utils/mocks/logger.ts
packages/agents-core/src/types/entities.ts
packages/agents-core/src/utils/__tests__/error.test.ts
packages/agents-core/src/utils/__tests__/logger.test.ts
packages/agents-core/src/utils/__tests__/usage-cost-middleware.test.ts
packages/agents-core/src/utils/__tests__/wait-until.test.ts
packages/agents-core/src/utils/error.ts
packages/agents-core/src/utils/jwt-helpers.ts
packages/agents-core/src/utils/logger.ts
packages/agents-core/src/utils/third-party-mcp-servers/composio-client.ts
packages/agents-core/src/utils/tracer-factory.ts
packages/agents-core/src/validation/schemas.ts
packages/agents-core/src/validation/schemas/shared.ts
packages/agents-email/CHANGELOG.md
packages/agents-email/package.json
packages/agents-mcp/.genignore
packages/agents-mcp/.npmignore
packages/agents-mcp/.speakeasy/gen.yaml
packages/agents-mcp/.speakeasy/out.openapi.yaml
packages/agents-mcp/.speakeasy/workflow.yaml
packages/agents-mcp/CHANGELOG.md
packages/agents-mcp/README.md
packages/agents-mcp/manifest.json
packages/agents-mcp/package.json
packages/agents-mcp/src/core.ts
packages/agents-mcp/src/funcs/a2aGetRunAgentsWellKnownAgentJson.ts
packages/agents-mcp/src/funcs/agentsAssociateArtifactComponentWithAgent.ts
packages/agents-mcp/src/funcs/agentsAssociateDataComponentWithAgent.ts
packages/agents-mcp/src/funcs/agentsCheckArtifactComponentAgentAssociation.ts
packages/agents-mcp/src/funcs/agentsCheckDataComponentAgentAssociation.ts
packages/agents-mcp/src/funcs/agentsCreateAgent.ts
packages/agents-mcp/src/funcs/agentsCreateFullAgent.ts
packages/agents-mcp/src/funcs/agentsDeleteAgent.ts
packages/agents-mcp/src/funcs/agentsDeleteFullAgent.ts
packages/agents-mcp/src/funcs/agentsGetAgent.ts
packages/agents-mcp/src/funcs/agentsGetAgentsUsingArtifactComponent.ts
packages/agents-mcp/src/funcs/agentsGetAgentsUsingDataComponent.ts
packages/agents-mcp/src/funcs/agentsGetArtifactComponentsForAgent.ts
packages/agents-mcp/src/funcs/agentsGetDataComponentsForAgent.ts
packages/agents-mcp/src/funcs/agentsGetFullAgent.ts
packages/agents-mcp/src/funcs/agentsGetFullAgentDefinition.ts
packages/agents-mcp/src/funcs/agentsGetRelatedAgentInfos.ts
packages/agents-mcp/src/funcs/agentsListAgents.ts
packages/agents-mcp/src/funcs/agentsListAvailableAgents.ts
packages/agents-mcp/src/funcs/agentsRemoveArtifactComponentFromAgent.ts
packages/agents-mcp/src/funcs/agentsRemoveDataComponentFromAgent.ts
packages/agents-mcp/src/funcs/agentsUpdateAgent.ts
packages/agents-mcp/src/funcs/agentsUpdateFullAgent.ts
packages/agents-mcp/src/funcs/apiKeysCreateAPIKey.ts
packages/agents-mcp/src/funcs/apiKeysCreatePlaygroundToken.ts
packages/agents-mcp/src/funcs/apiKeysDeleteAPIKey.ts
packages/agents-mcp/src/funcs/apiKeysGetAPIKeyById.ts
packages/agents-mcp/src/funcs/apiKeysListAPIKeys.ts
packages/agents-mcp/src/funcs/apiKeysUpdateAPIKey.ts
packages/agents-mcp/src/funcs/appsCreateApp.ts
packages/agents-mcp/src/funcs/appsCreateAppAuthKey.ts
packages/agents-mcp/src/funcs/appsDeleteApp.ts
packages/agents-mcp/src/funcs/appsDeleteAppAuthKey.ts
packages/agents-mcp/src/funcs/appsGetAppById.ts
packages/agents-mcp/src/funcs/appsListAppAuthKeys.ts
packages/agents-mcp/src/funcs/appsListApps.ts
packages/agents-mcp/src/funcs/appsUpdateApp.ts
packages/agents-mcp/src/funcs/artifactComponentsAssociateArtifactComponentWithAgent.ts
packages/agents-mcp/src/funcs/artifactComponentsCheckArtifactComponentAgentAssociation.ts
packages/agents-mcp/src/funcs/artifactComponentsCreateArtifactComponent.ts
packages/agents-mcp/src/funcs/artifactComponentsDeleteArtifactComponent.ts
packages/agents-mcp/src/funcs/artifactComponentsGetAgentsUsingArtifactComponent.ts
packages/agents-mcp/src/funcs/artifactComponentsGetArtifactComponentById.ts
packages/agents-mcp/src/funcs/artifactComponentsGetArtifactComponentsForAgent.ts
packages/agents-mcp/src/funcs/artifactComponentsListArtifactComponents.ts
packages/agents-mcp/src/funcs/artifactComponentsRemoveArtifactComponentFromAgent.ts
packages/agents-mcp/src/funcs/artifactComponentsUpdateArtifactComponent.ts
packages/agents-mcp/src/funcs/authCreateAnonymousSession.ts
packages/agents-mcp/src/funcs/authGetPowChallenge.ts
packages/agents-mcp/src/funcs/branchesCreateBranch.ts
packages/agents-mcp/src/funcs/branchesDeleteBranch.ts
packages/agents-mcp/src/funcs/branchesGetBranch.ts
packages/agents-mcp/src/funcs/branchesListBranches.ts
packages/agents-mcp/src/funcs/branchesListBranchesForAgent.ts
packages/agents-mcp/src/funcs/branchesMergeExecute.ts
packages/agents-mcp/src/funcs/branchesMergePreview.ts
packages/agents-mcp/src/funcs/capabilities.ts
packages/agents-mcp/src/funcs/channelsSlackBulkDeleteChannelAgents.ts
packages/agents-mcp/src/funcs/channelsSlackBulkSetChannelAgents.ts
packages/agents-mcp/src/funcs/channelsSlackDeleteChannelSettings.ts
packages/agents-mcp/src/funcs/channelsSlackGetChannelSettings.ts
packages/agents-mcp/src/funcs/channelsSlackListChannels.ts
packages/agents-mcp/src/funcs/channelsSlackSetChannelSettings.ts
packages/agents-mcp/src/funcs/chatPostRunApiChat.ts
packages/agents-mcp/src/funcs/chatPostRunV1ChatCompletions.ts
packages/agents-mcp/src/funcs/cliGetManageApiCLIMe.ts
packages/agents-mcp/src/funcs/contextConfigDeleteContextConfig.ts
packages/agents-mcp/src/funcs/contextConfigsCreateContextConfig.ts
packages/agents-mcp/src/funcs/contextConfigsDeleteContextConfig.ts
packages/agents-mcp/src/funcs/contextConfigsGetContextConfigById.ts
packages/agents-mcp/src/funcs/contextConfigsListContextConfigs.ts
packages/agents-mcp/src/funcs/contextConfigsUpdateContextConfig.ts
packages/agents-mcp/src/funcs/conversationsGetConversation.ts
packages/agents-mcp/src/funcs/conversationsGetConversationBounds.ts
packages/agents-mcp/src/funcs/conversationsGetConversationMedia.ts
packages/agents-mcp/src/funcs/conversationsGetEndUserConversation.ts
packages/agents-mcp/src/funcs/conversationsListConversations.ts
packages/agents-mcp/src/funcs/conversationsListEndUserConversations.ts
packages/agents-mcp/src/funcs/conversationsResumeConversationStream.ts
packages/agents-mcp/src/funcs/credentialStoresCreateCredentialInStore.ts
packages/agents-mcp/src/funcs/credentialStoresListCredentialStores.ts
packages/agents-mcp/src/funcs/credentialsCreateCredential.ts
packages/agents-mcp/src/funcs/credentialsDeleteCredential.ts
packages/agents-mcp/src/funcs/credentialsGetCredentialById.ts
packages/agents-mcp/src/funcs/credentialsListCredentials.ts
packages/agents-mcp/src/funcs/credentialsUpdateCredential.ts
packages/agents-mcp/src/funcs/dataComponentsAssociateDataComponentWithAgent.ts
packages/agents-mcp/src/funcs/dataComponentsCheckDataComponentAgentAssociation.ts
packages/agents-mcp/src/funcs/dataComponentsCreateDataComponent.ts
packages/agents-mcp/src/funcs/dataComponentsDeleteDataComponent.ts
packages/agents-mcp/src/funcs/dataComponentsGetAgentsUsingDataComponent.ts
packages/agents-mcp/src/funcs/dataComponentsGetDataComponentById.ts
packages/agents-mcp/src/funcs/dataComponentsGetDataComponentsForAgent.ts
packages/agents-mcp/src/funcs/dataComponentsListDataComponents.ts
packages/agents-mcp/src/funcs/dataComponentsRemoveDataComponentFromAgent.ts
packages/agents-mcp/src/funcs/dataComponentsUpdateDataComponent.ts
packages/agents-mcp/src/funcs/entitlementsListOrgEntitlements.ts
packages/agents-mcp/src/funcs/evaluationsAddAgentToDataset.ts
packages/agents-mcp/src/funcs/evaluationsAddAgentToEvaluator.ts
packages/agents-mcp/src/funcs/evaluationsAddEvaluatorToJobConfig.ts
packages/agents-mcp/src/funcs/evaluationsAddEvaluatorToSuiteConfig.ts
packages/agents-mcp/src/funcs/evaluationsBatchGetEvaluatorAgentScopes.ts
packages/agents-mcp/src/funcs/evaluationsCreateDataset.ts
packages/agents-mcp/src/funcs/evaluationsCreateDatasetItem.ts
packages/agents-mcp/src/funcs/evaluationsCreateDatasetItemsBulk.ts
packages/agents-mcp/src/funcs/evaluationsCreateDatasetRunConfig.ts
packages/agents-mcp/src/funcs/evaluationsCreateEvaluationJobConfig.ts
packages/agents-mcp/src/funcs/evaluationsCreateEvaluationResult.ts
packages/agents-mcp/src/funcs/evaluationsCreateEvaluationRunConfig.ts
packages/agents-mcp/src/funcs/evaluationsCreateEvaluationSuiteConfig.ts
packages/agents-mcp/src/funcs/evaluationsCreateEvaluator.ts
packages/agents-mcp/src/funcs/evaluationsDeleteDataset.ts
packages/agents-mcp/src/funcs/evaluationsDeleteDatasetItem.ts
packages/agents-mcp/src/funcs/evaluationsDeleteDatasetRunConfig.ts
packages/agents-mcp/src/funcs/evaluationsDeleteEvaluationJobConfig.ts
packages/agents-mcp/src/funcs/evaluationsDeleteEvaluationResult.ts
packages/agents-mcp/src/funcs/evaluationsDeleteEvaluationRunConfig.ts
packages/agents-mcp/src/funcs/evaluationsDeleteEvaluationSuiteConfig.ts
packages/agents-mcp/src/funcs/evaluationsDeleteEvaluator.ts
packages/agents-mcp/src/funcs/evaluationsEvaluateConversation.ts
packages/agents-mcp/src/funcs/evaluationsGetDataset.ts
packages/agents-mcp/src/funcs/evaluationsGetDatasetItem.ts
packages/agents-mcp/src/funcs/evaluationsGetDatasetRun.ts
packages/agents-mcp/src/funcs/evaluationsGetDatasetRunConfig.ts
packages/agents-mcp/src/funcs/evaluationsGetDatasetRunItems.ts
packages/agents-mcp/src/funcs/evaluationsGetEvaluationJobConfig.ts
packages/agents-mcp/src/funcs/evaluationsGetEvaluationJobConfigResults.ts
packages/agents-mcp/src/funcs/evaluationsGetEvaluationResult.ts
packages/agents-mcp/src/funcs/evaluationsGetEvaluationRunConfig.ts
packages/agents-mcp/src/funcs/evaluationsGetEvaluationRunConfigResults.ts
packages/agents-mcp/src/funcs/evaluationsGetEvaluationSuiteConfig.ts
packages/agents-mcp/src/funcs/evaluationsGetEvaluator.ts
packages/agents-mcp/src/funcs/evaluationsGetEvaluatorsBatch.ts
packages/agents-mcp/src/funcs/evaluationsListDatasetAgents.ts
packages/agents-mcp/src/funcs/evaluationsListDatasetItems.ts
packages/agents-mcp/src/funcs/evaluationsListDatasetRunConfigs.ts
packages/agents-mcp/src/funcs/evaluationsListDatasetRuns.ts
packages/agents-mcp/src/funcs/evaluationsListDatasets.ts
packages/agents-mcp/src/funcs/evaluationsListEvaluationJobConfigEvaluators.ts
packages/agents-mcp/src/funcs/evaluationsListEvaluationJobConfigs.ts
packages/agents-mcp/src/funcs/evaluationsListEvaluationRunConfigs.ts
packages/agents-mcp/src/funcs/evaluationsListEvaluationSuiteConfigEvaluators.ts
packages/agents-mcp/src/funcs/evaluationsListEvaluationSuiteConfigs.ts
packages/agents-mcp/src/funcs/evaluationsListEvaluatorAgents.ts
packages/agents-mcp/src/funcs/evaluationsListEvaluators.ts
packages/agents-mcp/src/funcs/evaluationsRemoveAgentFromDataset.ts
packages/agents-mcp/src/funcs/evaluationsRemoveAgentFromEvaluator.ts
packages/agents-mcp/src/funcs/evaluationsRemoveEvaluatorFromJobConfig.ts
packages/agents-mcp/src/funcs/evaluationsRemoveEvaluatorFromSuiteConfig.ts
packages/agents-mcp/src/funcs/evaluationsStartConversationsEvaluations.ts
packages/agents-mcp/src/funcs/evaluationsTriggerDatasetRun.ts
packages/agents-mcp/src/funcs/evaluationsUpdateDataset.ts
packages/agents-mcp/src/funcs/evaluationsUpdateDatasetItem.ts
packages/agents-mcp/src/funcs/evaluationsUpdateDatasetRunConfig.ts
packages/agents-mcp/src/funcs/evaluationsUpdateEvaluationResult.ts
packages/agents-mcp/src/funcs/evaluationsUpdateEvaluationRunConfig.ts
packages/agents-mcp/src/funcs/evaluationsUpdateEvaluationSuiteConfig.ts
packages/agents-mcp/src/funcs/evaluationsUpdateEvaluator.ts
packages/agents-mcp/src/funcs/executionsGetRunApiExecutionsExecutionId.ts
packages/agents-mcp/src/funcs/executionsGetRunApiExecutionsExecutionIdStream.ts
packages/agents-mcp/src/funcs/executionsPostRunApiExecutions.ts
packages/agents-mcp/src/funcs/executionsPostRunApiExecutionsExecutionIdApprovalsToolCallId.ts
packages/agents-mcp/src/funcs/externalAgentsCreateExternalAgent.ts
packages/agents-mcp/src/funcs/externalAgentsCreateSubAgentExternalAgentRelation.ts
packages/agents-mcp/src/funcs/externalAgentsDeleteExternalAgent.ts
packages/agents-mcp/src/funcs/externalAgentsDeleteSubAgentExternalAgentRelation.ts
packages/agents-mcp/src/funcs/externalAgentsGetExternalAgentById.ts
packages/agents-mcp/src/funcs/externalAgentsGetSubAgentExternalAgentRelationById.ts
packages/agents-mcp/src/funcs/externalAgentsListExternalAgents.ts
packages/agents-mcp/src/funcs/externalAgentsListSubAgentExternalAgentRelations.ts
packages/agents-mcp/src/funcs/externalAgentsUpdateExternalAgent.ts
packages/agents-mcp/src/funcs/externalAgentsUpdateSubAgentExternalAgentRelation.ts
packages/agents-mcp/src/funcs/feedbackCreateFeedback.ts
packages/agents-mcp/src/funcs/feedbackDeleteFeedback.ts
packages/agents-mcp/src/funcs/feedbackGetFeedbackById.ts
packages/agents-mcp/src/funcs/feedbackListFeedback.ts
packages/agents-mcp/src/funcs/feedbackSubmitEndUserFeedback.ts
packages/agents-mcp/src/funcs/feedbackUpdateFeedback.ts
packages/agents-mcp/src/funcs/fullAgentCreateFullAgent.ts
packages/agents-mcp/src/funcs/functionToolsAssociateFunctionToolWithSubAgent.ts
packages/agents-mcp/src/funcs/functionToolsCheckFunctionToolSubAgentAssociation.ts
packages/agents-mcp/src/funcs/functionToolsCreateFunctionTool.ts
packages/agents-mcp/src/funcs/functionToolsDeleteFunctionTool.ts
packages/agents-mcp/src/funcs/functionToolsGetFunctionTool.ts
packages/agents-mcp/src/funcs/functionToolsGetFunctionToolsForSubAgent.ts
packages/agents-mcp/src/funcs/functionToolsGetSubAgentsUsingFunctionTool.ts
packages/agents-mcp/src/funcs/functionToolsListFunctionTools.ts
packages/agents-mcp/src/funcs/functionToolsRemoveFunctionToolFromSubAgent.ts
packages/agents-mcp/src/funcs/functionToolsUpdateFunctionTool.ts
packages/agents-mcp/src/funcs/functionsCreateFunction.ts
packages/agents-mcp/src/funcs/functionsDeleteFunction.ts
packages/agents-mcp/src/funcs/functionsGetFunction.ts
packages/agents-mcp/src/funcs/functionsListFunctions.ts
packages/agents-mcp/src/funcs/functionsUpdateFunction.ts
packages/agents-mcp/src/funcs/gitHubDeleteGithubInstallation.ts
packages/agents-mcp/src/funcs/gitHubDisconnectGithubInstallation.ts
packages/agents-mcp/src/funcs/gitHubGetGithubInstallUrl.ts
packages/agents-mcp/src/funcs/gitHubGetGithubInstallationDetails.ts
packages/agents-mcp/src/funcs/gitHubListGithubInstallations.ts
packages/agents-mcp/src/funcs/gitHubReconnectGithubInstallation.ts
packages/agents-mcp/src/funcs/gitHubSyncGithubInstallationRepositories.ts
packages/agents-mcp/src/funcs/healthHealth.ts
packages/agents-mcp/src/funcs/healthReady.ts
packages/agents-mcp/src/funcs/mcpCatalogListMCPCatalog.ts
packages/agents-mcp/src/funcs/mcpPostRunV1MCP.ts
packages/agents-mcp/src/funcs/oAuthInitiateOauthLoginPublic.ts
packages/agents-mcp/src/funcs/oAuthMcpOauthCallback.ts
packages/agents-mcp/src/funcs/oAuthSlackInstall.ts
packages/agents-mcp/src/funcs/oAuthSlackOauthRedirect.ts
packages/agents-mcp/src/funcs/projectMembersAddProjectMember.ts
packages/agents-mcp/src/funcs/projectMembersListProjectMembers.ts
packages/agents-mcp/src/funcs/projectMembersRemoveProjectMember.ts
packages/agents-mcp/src/funcs/projectMembersUpdateProjectMember.ts
packages/agents-mcp/src/funcs/projectPermissionsGetProjectPermissions.ts
packages/agents-mcp/src/funcs/projectsCreateFullProject.ts
packages/agents-mcp/src/funcs/projectsCreateProject.ts
packages/agents-mcp/src/funcs/projectsDeleteFullProject.ts
packages/agents-mcp/src/funcs/projectsDeleteProject.ts
packages/agents-mcp/src/funcs/projectsGetFullProject.ts
packages/agents-mcp/src/funcs/projectsGetFullProjectWithRelationIds.ts
packages/agents-mcp/src/funcs/projectsGetProjectById.ts
packages/agents-mcp/src/funcs/projectsGetProjectGithubAccess.ts
packages/agents-mcp/src/funcs/projectsListProjects.ts
packages/agents-mcp/src/funcs/projectsSetProjectGithubAccess.ts
packages/agents-mcp/src/funcs/projectsUpdateFullProject.ts
packages/agents-mcp/src/funcs/projectsUpdateProject.ts
packages/agents-mcp/src/funcs/refsResolveRef.ts
packages/agents-mcp/src/funcs/scheduledTriggersAddScheduledTriggerUser.ts
packages/agents-mcp/src/funcs/scheduledTriggersCancelScheduledTriggerInvocation.ts
packages/agents-mcp/src/funcs/scheduledTriggersCreateScheduledTrigger.ts
packages/agents-mcp/src/funcs/scheduledTriggersDeleteScheduledTrigger.ts
packages/agents-mcp/src/funcs/scheduledTriggersGetScheduledTriggerById.ts
packages/agents-mcp/src/funcs/scheduledTriggersGetScheduledTriggerInvocationById.ts
packages/agents-mcp/src/funcs/scheduledTriggersListScheduledTriggerInvocations.ts
packages/agents-mcp/src/funcs/scheduledTriggersListScheduledTriggerUsers.ts
packages/agents-mcp/src/funcs/scheduledTriggersListScheduledTriggers.ts
packages/agents-mcp/src/funcs/scheduledTriggersListUpcomingScheduledRuns.ts
packages/agents-mcp/src/funcs/scheduledTriggersRemoveScheduledTriggerUser.ts
packages/agents-mcp/src/funcs/scheduledTriggersRerunScheduledTriggerInvocation.ts
packages/agents-mcp/src/funcs/scheduledTriggersRunScheduledTriggerNow.ts
packages/agents-mcp/src/funcs/scheduledTriggersSetScheduledTriggerUsers.ts
packages/agents-mcp/src/funcs/scheduledTriggersUpdateScheduledTrigger.ts
packages/agents-mcp/src/funcs/skillsCreateSkill.ts
packages/agents-mcp/src/funcs/skillsCreateSkillFile.ts
packages/agents-mcp/src/funcs/skillsCreateSubagentSkill.ts
packages/agents-mcp/src/funcs/skillsDeleteSkill.ts
packages/agents-mcp/src/funcs/skillsDeleteSkillFile.ts
packages/agents-mcp/src/funcs/skillsDeleteSubagentSkill.ts
packages/agents-mcp/src/funcs/skillsGetSkill.ts
packages/agents-mcp/src/funcs/skillsGetSkillFile.ts
packages/agents-mcp/src/funcs/skillsGetSkillsForSubagent.ts
packages/agents-mcp/src/funcs/skillsListSkills.ts
packages/agents-mcp/src/funcs/skillsUpdateSkill.ts
packages/agents-mcp/src/funcs/skillsUpdateSkillFile.ts
packages/agents-mcp/src/funcs/slackSlackBulkDeleteChannelAgents.ts
packages/agents-mcp/src/funcs/slackSlackBulkSetChannelAgents.ts
packages/agents-mcp/src/funcs/slackSlackDeleteChannelSettings.ts
packages/agents-mcp/src/funcs/slackSlackDeleteWorkspace.ts
packages/agents-mcp/src/funcs/slackSlackGetChannelSettings.ts
packages/agents-mcp/src/funcs/slackSlackGetJoinFromWorkspace.ts
packages/agents-mcp/src/funcs/slackSlackGetWorkspace.ts
packages/agents-mcp/src/funcs/slackSlackGetWorkspaceSettings.ts
packages/agents-mcp/src/funcs/slackSlackInstall.ts
packages/agents-mcp/src/funcs/slackSlackLinkStatus.ts
packages/agents-mcp/src/funcs/slackSlackListChannels.ts
packages/agents-mcp/src/funcs/slackSlackListLinkedUsers.ts
packages/agents-mcp/src/funcs/slackSlackListWorkspaces.ts
packages/agents-mcp/src/funcs/slackSlackOauthRedirect.ts
packages/agents-mcp/src/funcs/slackSlackSetChannelSettings.ts
packages/agents-mcp/src/funcs/slackSlackTestMessage.ts
packages/agents-mcp/src/funcs/slackSlackUpdateJoinFromWorkspace.ts
packages/agents-mcp/src/funcs/slackSlackUpdateWorkspaceSettings.ts
packages/agents-mcp/src/funcs/slackSlackUserConnect.ts
packages/agents-mcp/src/funcs/slackSlackUserDisconnect.ts
packages/agents-mcp/src/funcs/slackSlackUserStatus.ts
packages/agents-mcp/src/funcs/slackSlackVerifyLinkToken.ts
packages/agents-mcp/src/funcs/slackSlackWorkspaceHealth.ts
packages/agents-mcp/src/funcs/subAgentToolRelationsGetSubagentToolRelation.ts
packages/agents-mcp/src/funcs/subAgentsAssociateFunctionToolWithSubAgent.ts
packages/agents-mcp/src/funcs/subAgentsCheckFunctionToolSubAgentAssociation.ts
packages/agents-mcp/src/funcs/subAgentsCreateSubAgentExternalAgentRelation.ts
packages/agents-mcp/src/funcs/subAgentsCreateSubAgentRelation.ts
packages/agents-mcp/src/funcs/subAgentsCreateSubAgentTeamAgentRelation.ts
packages/agents-mcp/src/funcs/subAgentsCreateSubagent.ts
packages/agents-mcp/src/funcs/subAgentsCreateSubagentToolRelation.ts
packages/agents-mcp/src/funcs/subAgentsDeleteSubAgentExternalAgentRelation.ts
packages/agents-mcp/src/funcs/subAgentsDeleteSubAgentRelation.ts
packages/agents-mcp/src/funcs/subAgentsDeleteSubAgentTeamAgentRelation.ts
packages/agents-mcp/src/funcs/subAgentsDeleteSubagent.ts
packages/agents-mcp/src/funcs/subAgentsDeleteSubagentToolRelation.ts
packages/agents-mcp/src/funcs/subAgentsGetFunctionToolsForSubAgent.ts
packages/agents-mcp/src/funcs/subAgentsGetSubAgentExternalAgentRelationById.ts
packages/agents-mcp/src/funcs/subAgentsGetSubAgentRelationById.ts
packages/agents-mcp/src/funcs/subAgentsGetSubAgentTeamAgentRelationById.ts
packages/agents-mcp/src/funcs/subAgentsGetSubAgentsUsingFunctionTool.ts
packages/agents-mcp/src/funcs/subAgentsGetSubagentById.ts
packages/agents-mcp/src/funcs/subAgentsGetSubagentToolRelation.ts
packages/agents-mcp/src/funcs/subAgentsGetSubagentsForTool.ts
packages/agents-mcp/src/funcs/subAgentsListSubAgentExternalAgentRelations.ts
packages/agents-mcp/src/funcs/subAgentsListSubAgentRelations.ts
packages/agents-mcp/src/funcs/subAgentsListSubAgentTeamAgentRelations.ts
packages/agents-mcp/src/funcs/subAgentsListSubagentToolRelations.ts
packages/agents-mcp/src/funcs/subAgentsListSubagents.ts
packages/agents-mcp/src/funcs/subAgentsRemoveFunctionToolFromSubAgent.ts
packages/agents-mcp/src/funcs/subAgentsUpdateSubAgentExternalAgentRelation.ts
packages/agents-mcp/src/funcs/subAgentsUpdateSubAgentRelation.ts
packages/agents-mcp/src/funcs/subAgentsUpdateSubAgentTeamAgentRelation.ts
packages/agents-mcp/src/funcs/subAgentsUpdateSubagent.ts
packages/agents-mcp/src/funcs/subAgentsUpdateSubagentToolRelation.ts
packages/agents-mcp/src/funcs/thirdPartyMCPServersGetOauthRedirectUrl.ts
packages/agents-mcp/src/funcs/thirdPartyMCPServersGetThirdPartyMCPServer.ts
packages/agents-mcp/src/funcs/toolsCreateSubagentToolRelation.ts
packages/agents-mcp/src/funcs/toolsCreateTool.ts
packages/agents-mcp/src/funcs/toolsDeleteSubagentToolRelation.ts
packages/agents-mcp/src/funcs/toolsDeleteTool.ts
packages/agents-mcp/src/funcs/toolsGetMcpToolGithubAccess.ts
packages/agents-mcp/src/funcs/toolsGetMcpToolSlackAccess.ts
packages/agents-mcp/src/funcs/toolsGetSubagentToolRelation.ts
packages/agents-mcp/src/funcs/toolsGetSubagentsForTool.ts
packages/agents-mcp/src/funcs/toolsGetTool.ts
packages/agents-mcp/src/funcs/toolsGetUserCredentialForTool.ts
packages/agents-mcp/src/funcs/toolsInitiateToolOauthLogin.ts
packages/agents-mcp/src/funcs/toolsListSubagentToolRelations.ts
packages/agents-mcp/src/funcs/toolsListTools.ts
packages/agents-mcp/src/funcs/toolsSetMcpToolGithubAccess.ts
packages/agents-mcp/src/funcs/toolsSetMcpToolSlackAccess.ts
packages/agents-mcp/src/funcs/toolsUpdateSubagentToolRelation.ts
packages/agents-mcp/src/funcs/toolsUpdateTool.ts
packages/agents-mcp/src/funcs/triggersCreateTrigger.ts
packages/agents-mcp/src/funcs/triggersDeleteTrigger.ts
packages/agents-mcp/src/funcs/triggersGetTriggerById.ts
packages/agents-mcp/src/funcs/triggersGetTriggerInvocationById.ts
packages/agents-mcp/src/funcs/triggersListTriggerInvocations.ts
packages/agents-mcp/src/funcs/triggersListTriggers.ts
packages/agents-mcp/src/funcs/triggersRerunTrigger.ts
packages/agents-mcp/src/funcs/triggersUpdateTrigger.ts
packages/agents-mcp/src/funcs/userProfileGetUserProfile.ts
packages/agents-mcp/src/funcs/userProfileUpsertUserProfile.ts
packages/agents-mcp/src/funcs/userProjectMembershipsListUserProjectMemberships.ts
packages/agents-mcp/src/funcs/usersSlackLinkStatus.ts
packages/agents-mcp/src/funcs/usersSlackListLinkedUsers.ts
packages/agents-mcp/src/funcs/usersSlackUserConnect.ts
packages/agents-mcp/src/funcs/usersSlackUserDisconnect.ts
packages/agents-mcp/src/funcs/usersSlackUserStatus.ts
packages/agents-mcp/src/funcs/usersSlackVerifyLinkToken.ts
packages/agents-mcp/src/funcs/webhooksPostRunTenantsTenantIdProjectsProjectIdAgentsAgentIdTriggersTriggerId.ts
packages/agents-mcp/src/funcs/workAppsSlackBulkDeleteChannelAgents.ts
packages/agents-mcp/src/funcs/workAppsSlackBulkSetChannelAgents.ts
packages/agents-mcp/src/funcs/workAppsSlackDeleteChannelSettings.ts
packages/agents-mcp/src/funcs/workAppsSlackDeleteWorkspace.ts
packages/agents-mcp/src/funcs/workAppsSlackGetChannelSettings.ts
packages/agents-mcp/src/funcs/workAppsSlackGetJoinFromWorkspace.ts
packages/agents-mcp/src/funcs/workAppsSlackGetWorkspace.ts
packages/agents-mcp/src/funcs/workAppsSlackGetWorkspaceSettings.ts
packages/agents-mcp/src/funcs/workAppsSlackInstall.ts
packages/agents-mcp/src/funcs/workAppsSlackLinkStatus.ts
packages/agents-mcp/src/funcs/workAppsSlackListChannels.ts
packages/agents-mcp/src/funcs/workAppsSlackListLinkedUsers.ts
packages/agents-mcp/src/funcs/workAppsSlackListWorkspaces.ts
packages/agents-mcp/src/funcs/workAppsSlackOauthRedirect.ts
packages/agents-mcp/src/funcs/workAppsSlackSetChannelSettings.ts
packages/agents-mcp/src/funcs/workAppsSlackTestMessage.ts
packages/agents-mcp/src/funcs/workAppsSlackUpdateJoinFromWorkspace.ts
packages/agents-mcp/src/funcs/workAppsSlackUpdateWorkspaceSettings.ts
packages/agents-mcp/src/funcs/workAppsSlackUserConnect.ts
packages/agents-mcp/src/funcs/workAppsSlackUserDisconnect.ts
packages/agents-mcp/src/funcs/workAppsSlackUserStatus.ts
packages/agents-mcp/src/funcs/workAppsSlackVerifyLinkToken.ts
packages/agents-mcp/src/funcs/workAppsSlackWorkspaceHealth.ts
packages/agents-mcp/src/funcs/workflowsEvaluateConversationsByJob.ts
packages/agents-mcp/src/funcs/workflowsGetApiCronCleanupStreamChunks.ts
packages/agents-mcp/src/funcs/workflowsPostApiDeployRestartScheduler.ts
packages/agents-mcp/src/funcs/workspacesSlackDeleteWorkspace.ts
packages/agents-mcp/src/funcs/workspacesSlackGetJoinFromWorkspace.ts
packages/agents-mcp/src/funcs/workspacesSlackGetWorkspace.ts
packages/agents-mcp/src/funcs/workspacesSlackGetWorkspaceSettings.ts
packages/agents-mcp/src/funcs/workspacesSlackListWorkspaces.ts
packages/agents-mcp/src/funcs/workspacesSlackTestMessage.ts
packages/agents-mcp/src/funcs/workspacesSlackUpdateJoinFromWorkspace.ts
packages/agents-mcp/src/funcs/workspacesSlackUpdateWorkspaceSettings.ts
packages/agents-mcp/src/funcs/workspacesSlackWorkspaceHealth.ts
packages/agents-mcp/src/hooks/hooks.ts
packages/agents-mcp/src/hooks/types.ts
packages/agents-mcp/src/landing-page.ts
packages/agents-mcp/src/lib/base64.ts
packages/agents-mcp/src/lib/config.ts
packages/agents-mcp/src/lib/dlv.ts
packages/agents-mcp/src/lib/encodings.ts
packages/agents-mcp/src/lib/env.ts
packages/agents-mcp/src/lib/files.ts
packages/agents-mcp/src/lib/http.ts
packages/agents-mcp/src/lib/is-plain-object.ts
packages/agents-mcp/src/lib/logger.ts
packages/agents-mcp/src/lib/matchers.ts
packages/agents-mcp/src/lib/primitives.ts
packages/agents-mcp/src/lib/result.ts
packages/agents-mcp/src/lib/retries.ts
packages/agents-mcp/src/lib/schemas.ts
packages/agents-mcp/src/lib/sdks.ts
packages/agents-mcp/src/lib/security.ts
packages/agents-mcp/src/lib/url.ts
packages/agents-mcp/src/mcp-server/build.mts
packages/agents-mcp/src/mcp-server/cli.ts
packages/agents-mcp/src/mcp-server/cli/serve/command.ts
packages/agents-mcp/src/mcp-server/cli/serve/impl.ts
packages/agents-mcp/src/mcp-server/cli/start/command.ts
packages/agents-mcp/src/mcp-server/cli/start/impl.ts
packages/agents-mcp/src/mcp-server/console-logger.ts
packages/agents-mcp/src/mcp-server/extensions.ts
packages/agents-mcp/src/mcp-server/flags.ts
packages/agents-mcp/src/mcp-server/mcp-server.ts
packages/agents-mcp/src/mcp-server/prompts.ts
packages/agents-mcp/src/mcp-server/resources.ts
packages/agents-mcp/src/mcp-server/scopes.ts
packages/agents-mcp/src/mcp-server/server.ts
packages/agents-mcp/src/mcp-server/shared.ts
packages/agents-mcp/src/mcp-server/tools.ts
packages/agents-mcp/src/mcp-server/tools/agentArtifactComponentRelationsAssociateArtifactComponentWithAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentArtifactComponentRelationsCheckArtifactComponentAgentAssociation.ts
packages/agents-mcp/src/mcp-server/tools/agentArtifactComponentRelationsGetAgentsUsingArtifactComponent.ts
packages/agents-mcp/src/mcp-server/tools/agentArtifactComponentRelationsGetArtifactComponentsForAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentArtifactComponentRelationsRemoveArtifactComponentFromAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentDataComponentRelationsAssociateDataComponentWithAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentDataComponentRelationsCheckDataComponentAgentAssociation.ts
packages/agents-mcp/src/mcp-server/tools/agentDataComponentRelationsGetAgentsUsingDataComponent.ts
packages/agents-mcp/src/mcp-server/tools/agentDataComponentRelationsRemoveDataComponentFromAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsAssociateArtifactComponentWithAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsAssociateDataComponentWithAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsCheckArtifactComponentAgentAssociation.ts
packages/agents-mcp/src/mcp-server/tools/agentsCheckDataComponentAgentAssociation.ts
packages/agents-mcp/src/mcp-server/tools/agentsCreateAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsCreateFullAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsDeleteAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsDeleteFullAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsGetAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsGetAgentsUsingArtifactComponent.ts
packages/agents-mcp/src/mcp-server/tools/agentsGetAgentsUsingDataComponent.ts
packages/agents-mcp/src/mcp-server/tools/agentsGetArtifactComponentsForAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsGetDataComponentsForAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsGetFullAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsGetFullAgentDefinition.ts
packages/agents-mcp/src/mcp-server/tools/agentsGetRelatedAgentInfos.ts
packages/agents-mcp/src/mcp-server/tools/agentsListAgents.ts
packages/agents-mcp/src/mcp-server/tools/agentsRemoveArtifactComponentFromAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsRemoveDataComponentFromAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsUpdateAgent.ts
packages/agents-mcp/src/mcp-server/tools/agentsUpdateFullAgent.ts
packages/agents-mcp/src/mcp-server/tools/apiKeysCreateAPIKey.ts
packages/agents-mcp/src/mcp-server/tools/apiKeysDeleteAPIKey.ts
packages/agents-mcp/src/mcp-server/tools/apiKeysGetAPIKeyById.ts
packages/agents-mcp/src/mcp-server/tools/apiKeysListAPIKeys.ts
packages/agents-mcp/src/mcp-server/tools/apiKeysUpdateAPIKey.ts
packages/agents-mcp/src/mcp-server/tools/appsCreateApp.ts
packages/agents-mcp/src/mcp-server/tools/appsCreateAppAuthKey.ts
packages/agents-mcp/src/mcp-server/tools/appsDeleteApp.ts
packages/agents-mcp/src/mcp-server/tools/appsDeleteAppAuthKey.ts
packages/agents-mcp/src/mcp-server/tools/appsGetAppById.ts
packages/agents-mcp/src/mcp-server/tools/appsListAppAuthKeys.ts
packages/agents-mcp/src/mcp-server/tools/appsListApps.ts
packages/agents-mcp/src/mcp-server/tools/appsUpdateApp.ts
packages/agents-mcp/src/mcp-server/tools/artifactComponentsCreateArtifactComponent.ts
packages/agents-mcp/src/mcp-server/tools/artifactComponentsDeleteArtifactComponent.ts
packages/agents-mcp/src/mcp-server/tools/artifactComponentsGetArtifactComponentById.ts
packages/agents-mcp/src/mcp-server/tools/artifactComponentsListArtifactComponents.ts
packages/agents-mcp/src/mcp-server/tools/artifactComponentsUpdateArtifactComponent.ts
packages/agents-mcp/src/mcp-server/tools/authCreateAnonymousSession.ts
packages/agents-mcp/src/mcp-server/tools/authGetPowChallenge.ts
packages/agents-mcp/src/mcp-server/tools/branchesCreateBranch.ts
packages/agents-mcp/src/mcp-server/tools/branchesDeleteBranch.ts
packages/agents-mcp/src/mcp-server/tools/branchesGetBranch.ts
packages/agents-mcp/src/mcp-server/tools/branchesListBranches.ts
packages/agents-mcp/src/mcp-server/tools/branchesListBranchesForAgent.ts
packages/agents-mcp/src/mcp-server/tools/branchesMergeExecute.ts
packages/agents-mcp/src/mcp-server/tools/branchesMergePreview.ts
packages/agents-mcp/src/mcp-server/tools/capabilities.ts
packages/agents-mcp/src/mcp-server/tools/cliGetManageApiCLIMe.ts
packages/agents-mcp/src/mcp-server/tools/contextConfigsCreateContextConfig.ts
packages/agents-mcp/src/mcp-server/tools/contextConfigsDeleteContextConfig.ts
packages/agents-mcp/src/mcp-server/tools/contextConfigsGetContextConfigById.ts
packages/agents-mcp/src/mcp-server/tools/contextConfigsListContextConfigs.ts
packages/agents-mcp/src/mcp-server/tools/contextConfigsUpdateContextConfig.ts
packages/agents-mcp/src/mcp-server/tools/conversationsGetConversation.ts
packages/agents-mcp/src/mcp-server/tools/conversationsGetConversationBounds.ts
packages/agents-mcp/src/mcp-server/tools/conversationsGetConversationMedia.ts
packages/agents-mcp/src/mcp-server/tools/conversationsListConversations.ts
packages/agents-mcp/src/mcp-server/tools/credentialStoresCreateCredentialInStore.ts
packages/agents-mcp/src/mcp-server/tools/credentialStoresListCredentialStores.ts
packages/agents-mcp/src/mcp-server/tools/credentialsCreateCredential.ts
packages/agents-mcp/src/mcp-server/tools/credentialsDeleteCredential.ts
packages/agents-mcp/src/mcp-server/tools/credentialsGetCredentialById.ts
packages/agents-mcp/src/mcp-server/tools/credentialsListCredentials.ts
packages/agents-mcp/src/mcp-server/tools/credentialsUpdateCredential.ts
packages/agents-mcp/src/mcp-server/tools/dataComponentsCreateDataComponent.ts
packages/agents-mcp/src/mcp-server/tools/dataComponentsDeleteDataComponent.ts
packages/agents-mcp/src/mcp-server/tools/dataComponentsGetDataComponentById.ts
packages/agents-mcp/src/mcp-server/tools/dataComponentsListDataComponents.ts
packages/agents-mcp/src/mcp-server/tools/dataComponentsUpdateDataComponent.ts
packages/agents-mcp/src/mcp-server/tools/entitlementsListOrgEntitlements.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsAddAgentToDataset.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsAddAgentToEvaluator.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsAddEvaluatorToJobConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsAddEvaluatorToSuiteConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsBatchGetEvaluatorAgentScopes.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsCreateDataset.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsCreateDatasetItem.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsCreateDatasetItemsBulk.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsCreateDatasetRunConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsCreateEvaluationJobConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsCreateEvaluationResult.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsCreateEvaluationRunConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsCreateEvaluationSuiteConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsCreateEvaluator.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsDeleteDataset.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsDeleteDatasetItem.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsDeleteDatasetRunConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsDeleteEvaluationJobConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsDeleteEvaluationResult.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsDeleteEvaluationRunConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsDeleteEvaluationSuiteConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsDeleteEvaluator.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsEvaluateConversation.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsGetDataset.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsGetDatasetItem.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsGetDatasetRun.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsGetDatasetRunConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsGetDatasetRunItems.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsGetEvaluationJobConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsGetEvaluationJobConfigResults.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsGetEvaluationResult.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsGetEvaluationRunConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsGetEvaluationRunConfigResults.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsGetEvaluationSuiteConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsGetEvaluator.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsGetEvaluatorsBatch.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsListDatasetAgents.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsListDatasetItems.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsListDatasetRunConfigs.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsListDatasetRuns.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsListDatasets.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsListEvaluationJobConfigEvaluators.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsListEvaluationJobConfigs.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsListEvaluationRunConfigs.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsListEvaluationSuiteConfigEvaluators.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsListEvaluationSuiteConfigs.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsListEvaluatorAgents.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsListEvaluators.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsRemoveAgentFromDataset.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsRemoveAgentFromEvaluator.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsRemoveEvaluatorFromJobConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsRemoveEvaluatorFromSuiteConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsStartConversationsEvaluations.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsTriggerDatasetRun.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsUpdateDataset.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsUpdateDatasetItem.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsUpdateDatasetRunConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsUpdateEvaluationResult.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsUpdateEvaluationRunConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsUpdateEvaluationSuiteConfig.ts
packages/agents-mcp/src/mcp-server/tools/evaluationsUpdateEvaluator.ts
packages/agents-mcp/src/mcp-server/tools/externalAgentsCreateExternalAgent.ts
packages/agents-mcp/src/mcp-server/tools/externalAgentsDeleteExternalAgent.ts
packages/agents-mcp/src/mcp-server/tools/externalAgentsGetExternalAgentById.ts
packages/agents-mcp/src/mcp-server/tools/externalAgentsListExternalAgents.ts
packages/agents-mcp/src/mcp-server/tools/externalAgentsUpdateExternalAgent.ts
packages/agents-mcp/src/mcp-server/tools/feedbackCreateFeedback.ts
packages/agents-mcp/src/mcp-server/tools/feedbackDeleteFeedback.ts
packages/agents-mcp/src/mcp-server/tools/feedbackGetFeedbackById.ts
packages/agents-mcp/src/mcp-server/tools/feedbackListFeedback.ts
packages/agents-mcp/src/mcp-server/tools/feedbackUpdateFeedback.ts
packages/agents-mcp/src/mcp-server/tools/functionToolsCreateFunctionTool.ts
packages/agents-mcp/src/mcp-server/tools/functionToolsDeleteFunctionTool.ts
packages/agents-mcp/src/mcp-server/tools/functionToolsGetFunctionTool.ts
packages/agents-mcp/src/mcp-server/tools/functionToolsListFunctionTools.ts
packages/agents-mcp/src/mcp-server/tools/functionToolsUpdateFunctionTool.ts
packages/agents-mcp/src/mcp-server/tools/functionsCreateFunction.ts
packages/agents-mcp/src/mcp-server/tools/functionsDeleteFunction.ts
packages/agents-mcp/src/mcp-server/tools/functionsGetFunction.ts
packages/agents-mcp/src/mcp-server/tools/functionsListFunctions.ts
packages/agents-mcp/src/mcp-server/tools/functionsUpdateFunction.ts
packages/agents-mcp/src/mcp-server/tools/gitHubDeleteGithubInstallation.ts
packages/agents-mcp/src/mcp-server/tools/gitHubDisconnectGithubInstallation.ts
packages/agents-mcp/src/mcp-server/tools/gitHubGetGithubInstallUrl.ts
packages/agents-mcp/src/mcp-server/tools/gitHubGetGithubInstallationDetails.ts
packages/agents-mcp/src/mcp-server/tools/gitHubListGithubInstallations.ts
packages/agents-mcp/src/mcp-server/tools/gitHubReconnectGithubInstallation.ts
packages/agents-mcp/src/mcp-server/tools/gitHubSyncGithubInstallationRepositories.ts
packages/agents-mcp/src/mcp-server/tools/healthHealth.ts
packages/agents-mcp/src/mcp-server/tools/healthReady.ts
packages/agents-mcp/src/mcp-server/tools/invitationsGetManageApiInvitationsPending.ts
packages/agents-mcp/src/mcp-server/tools/mcpCatalogListMCPCatalog.ts
packages/agents-mcp/src/mcp-server/tools/oAuthMcpOauthCallback.ts
packages/agents-mcp/src/mcp-server/tools/oAuthSlackInstall.ts
packages/agents-mcp/src/mcp-server/tools/oAuthSlackOauthRedirect.ts
packages/agents-mcp/src/mcp-server/tools/projectMembersAddProjectMember.ts
packages/agents-mcp/src/mcp-server/tools/projectMembersListProjectMembers.ts
packages/agents-mcp/src/mcp-server/tools/projectMembersRemoveProjectMember.ts
packages/agents-mcp/src/mcp-server/tools/projectMembersUpdateProjectMember.ts
packages/agents-mcp/src/mcp-server/tools/projectPermissionsGetProjectPermissions.ts
packages/agents-mcp/src/mcp-server/tools/projectsCreateFullProject.ts
packages/agents-mcp/src/mcp-server/tools/projectsCreateProject.ts
packages/agents-mcp/src/mcp-server/tools/projectsDeleteFullProject.ts
packages/agents-mcp/src/mcp-server/tools/projectsDeleteProject.ts
packages/agents-mcp/src/mcp-server/tools/projectsGetFullProject.ts
packages/agents-mcp/src/mcp-server/tools/projectsGetFullProjectWithRelationIds.ts
packages/agents-mcp/src/mcp-server/tools/projectsGetProjectById.ts
packages/agents-mcp/src/mcp-server/tools/projectsGetProjectGithubAccess.ts
packages/agents-mcp/src/mcp-server/tools/projectsListProjects.ts
packages/agents-mcp/src/mcp-server/tools/projectsSetProjectGithubAccess.ts
packages/agents-mcp/src/mcp-server/tools/projectsUpdateFullProject.ts
packages/agents-mcp/src/mcp-server/tools/projectsUpdateProject.ts
packages/agents-mcp/src/mcp-server/tools/refsResolveRef.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersAddScheduledTriggerUser.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersCancelScheduledTriggerInvocation.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersCreateScheduledTrigger.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersDeleteScheduledTrigger.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersGetScheduledTriggerById.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersGetScheduledTriggerInvocationById.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersListScheduledTriggerInvocations.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersListScheduledTriggerUsers.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersListScheduledTriggers.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersListUpcomingScheduledRuns.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersRemoveScheduledTriggerUser.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersRerunScheduledTriggerInvocation.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersRunScheduledTriggerNow.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersSetScheduledTriggerUsers.ts
packages/agents-mcp/src/mcp-server/tools/scheduledTriggersUpdateScheduledTrigger.ts
packages/agents-mcp/src/mcp-server/tools/skillsCreateSkill.ts
packages/agents-mcp/src/mcp-server/tools/skillsCreateSkillFile.ts
packages/agents-mcp/src/mcp-server/tools/skillsCreateSubagentSkill.ts
packages/agents-mcp/src/mcp-server/tools/skillsDeleteSkill.ts
packages/agents-mcp/src/mcp-server/tools/skillsDeleteSkillFile.ts
packages/agents-mcp/src/mcp-server/tools/skillsDeleteSubagentSkill.ts
packages/agents-mcp/src/mcp-server/tools/skillsGetSkill.ts
packages/agents-mcp/src/mcp-server/tools/skillsGetSkillFile.ts
packages/agents-mcp/src/mcp-server/tools/skillsGetSkillsForSubagent.ts
packages/agents-mcp/src/mcp-server/tools/skillsListSkills.ts
packages/agents-mcp/src/mcp-server/tools/skillsUpdateSkill.ts
packages/agents-mcp/src/mcp-server/tools/skillsUpdateSkillFile.ts
packages/agents-mcp/src/mcp-server/tools/subAgentExternalAgentRelationsCreateSubAgentExternalAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentExternalAgentRelationsDeleteSubAgentExternalAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentExternalAgentRelationsGetSubAgentExternalAgentRelationById.ts
packages/agents-mcp/src/mcp-server/tools/subAgentExternalAgentRelationsListSubAgentExternalAgentRelations.ts
packages/agents-mcp/src/mcp-server/tools/subAgentExternalAgentRelationsUpdateSubAgentExternalAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentFunctionToolRelationsAssociateFunctionToolWithSubAgent.ts
packages/agents-mcp/src/mcp-server/tools/subAgentFunctionToolRelationsCheckFunctionToolSubAgentAssociation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentFunctionToolRelationsGetFunctionToolsForSubAgent.ts
packages/agents-mcp/src/mcp-server/tools/subAgentFunctionToolRelationsGetSubAgentsUsingFunctionTool.ts
packages/agents-mcp/src/mcp-server/tools/subAgentFunctionToolRelationsRemoveFunctionToolFromSubAgent.ts
packages/agents-mcp/src/mcp-server/tools/subAgentTeamAgentRelationsCreateSubAgentTeamAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentTeamAgentRelationsDeleteSubAgentTeamAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentTeamAgentRelationsGetSubAgentTeamAgentRelationById.ts
packages/agents-mcp/src/mcp-server/tools/subAgentTeamAgentRelationsListSubAgentTeamAgentRelations.ts
packages/agents-mcp/src/mcp-server/tools/subAgentTeamAgentRelationsUpdateSubAgentTeamAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentToolRelationsCreateSubagentToolRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentToolRelationsDeleteSubagentToolRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentToolRelationsListSubagentToolRelations.ts
packages/agents-mcp/src/mcp-server/tools/subAgentToolRelationsUpdateSubagentToolRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsAssociateFunctionToolWithSubAgent.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsCheckFunctionToolSubAgentAssociation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsCreateSubAgentExternalAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsCreateSubAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsCreateSubAgentTeamAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsCreateSubagent.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsCreateSubagentToolRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsDeleteSubAgentExternalAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsDeleteSubAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsDeleteSubAgentTeamAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsDeleteSubagent.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsDeleteSubagentToolRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsGetFunctionToolsForSubAgent.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsGetSubAgentExternalAgentRelationById.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsGetSubAgentRelationById.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsGetSubAgentTeamAgentRelationById.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsGetSubAgentsUsingFunctionTool.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsGetSubagentById.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsGetSubagentToolRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsGetSubagentsForTool.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsListSubAgentExternalAgentRelations.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsListSubAgentRelations.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsListSubAgentTeamAgentRelations.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsListSubagentToolRelations.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsListSubagents.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsRemoveFunctionToolFromSubAgent.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsUpdateSubAgentExternalAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsUpdateSubAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsUpdateSubAgentTeamAgentRelation.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsUpdateSubagent.ts
packages/agents-mcp/src/mcp-server/tools/subAgentsUpdateSubagentToolRelation.ts
packages/agents-mcp/src/mcp-server/tools/thirdPartyMCPServersGetOauthRedirectUrl.ts
packages/agents-mcp/src/mcp-server/tools/thirdPartyMCPServersGetThirdPartyMCPServer.ts
packages/agents-mcp/src/mcp-server/tools/toolsCreateTool.ts
packages/agents-mcp/src/mcp-server/tools/toolsDeleteTool.ts
packages/agents-mcp/src/mcp-server/tools/toolsGetMcpToolGithubAccess.ts
packages/agents-mcp/src/mcp-server/tools/toolsGetMcpToolSlackAccess.ts
packages/agents-mcp/src/mcp-server/tools/toolsGetTool.ts
packages/agents-mcp/src/mcp-server/tools/toolsGetUserCredentialForTool.ts
packages/agents-mcp/src/mcp-server/tools/toolsInitiateToolOauthLogin.ts
packages/agents-mcp/src/mcp-server/tools/toolsListTools.ts
packages/agents-mcp/src/mcp-server/tools/toolsSetMcpToolGithubAccess.ts
packages/agents-mcp/src/mcp-server/tools/toolsSetMcpToolSlackAccess.ts
packages/agents-mcp/src/mcp-server/tools/toolsUpdateTool.ts
packages/agents-mcp/src/mcp-server/tools/triggersCreateTrigger.ts
packages/agents-mcp/src/mcp-server/tools/triggersDeleteTrigger.ts
packages/agents-mcp/src/mcp-server/tools/triggersGetTriggerById.ts
packages/agents-mcp/src/mcp-server/tools/triggersGetTriggerInvocationById.ts
packages/agents-mcp/src/mcp-server/tools/triggersListTriggerInvocations.ts
packages/agents-mcp/src/mcp-server/tools/triggersListTriggers.ts
packages/agents-mcp/src/mcp-server/tools/triggersRerunTrigger.ts
packages/agents-mcp/src/mcp-server/tools/triggersUpdateTrigger.ts
packages/agents-mcp/src/mcp-server/tools/userOrganizationsGetManageApiUsersUserIdOrganizations.ts
packages/agents-mcp/src/mcp-server/tools/userOrganizationsPostManageApiUsersUserIdOrganizations.ts
packages/agents-mcp/src/mcp-server/tools/userProfileGetUserProfile.ts
packages/agents-mcp/src/mcp-server/tools/userProfileUpsertUserProfile.ts
packages/agents-mcp/src/mcp-server/tools/userProjectMembershipsListUserProjectMemberships.ts
packages/agents-mcp/src/mcp-server/tools/webhooksPostRunTenantsTenantIdProjectsProjectIdAgentsAgentIdTriggersTriggerId.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackBulkDeleteChannelAgents.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackBulkSetChannelAgents.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackDeleteChannelSettings.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackDeleteWorkspace.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackGetChannelSettings.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackGetJoinFromWorkspace.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackGetWorkspace.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackGetWorkspaceSettings.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackLinkStatus.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackListChannels.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackListLinkedUsers.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackListWorkspaces.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackSetChannelSettings.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackTestMessage.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackUpdateJoinFromWorkspace.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackUpdateWorkspaceSettings.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackUserConnect.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackUserDisconnect.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackUserStatus.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackVerifyLinkToken.ts
packages/agents-mcp/src/mcp-server/tools/workAppsSlackWorkspaceHealth.ts
packages/agents-mcp/src/mcp-server/tools/workflowsEvaluateConversationsByJob.ts
packages/agents-mcp/src/mcp-server/tools/workflowsGetApiCronCleanupStreamChunks.ts
packages/agents-mcp/src/mcp-server/tools/workflowsPostApiDeployRestartScheduler.ts
packages/agents-mcp/src/models/addagenttodatasetop.ts
packages/agents-mcp/src/models/addagenttoevaluatorop.ts
packages/agents-mcp/src/models/addevaluatortojobconfigop.ts
packages/agents-mcp/src/models/addevaluatortosuiteconfigop.ts
packages/agents-mcp/src/models/addprojectmemberop.ts
packages/agents-mcp/src/models/addpublickeyrequest.ts
packages/agents-mcp/src/models/addscheduledtriggeruserop.ts
packages/agents-mcp/src/models/addscheduledtriggeruserrequest.ts
packages/agents-mcp/src/models/agent.ts
packages/agents-mcp/src/models/agentcreate.ts
packages/agents-mcp/src/models/agentdatasetrelation.ts
packages/agents-mcp/src/models/agentevaluatorrelation.ts
packages/agents-mcp/src/models/agentlistresponse.ts
packages/agents-mcp/src/models/agentresponse.ts
packages/agents-mcp/src/models/agentstopwhen.ts
packages/agents-mcp/src/models/agentupdate.ts
packages/agents-mcp/src/models/agentwithincontextofproject.ts
packages/agents-mcp/src/models/agentwithincontextofprojectresponse.ts
packages/agents-mcp/src/models/agentwithincontextofprojectselect.ts
packages/agents-mcp/src/models/agentwithincontextofprojectselectwithrelationids.ts
packages/agents-mcp/src/models/anonymoussessionresponse.ts
packages/agents-mcp/src/models/apiconfig.ts
packages/agents-mcp/src/models/apikey.ts
packages/agents-mcp/src/models/apikeycreate.ts
packages/agents-mcp/src/models/apikeylistresponse.ts
packages/agents-mcp/src/models/apikeyresponse.ts
packages/agents-mcp/src/models/apikeyupdate.ts
packages/agents-mcp/src/models/appconfig.ts
packages/agents-mcp/src/models/appconfigresponse.ts
packages/agents-mcp/src/models/appcreate.ts
packages/agents-mcp/src/models/applistresponse.ts
packages/agents-mcp/src/models/appresponse.ts
packages/agents-mcp/src/models/appresponseitem.ts
packages/agents-mcp/src/models/appupdate.ts
packages/agents-mcp/src/models/artifactcomponent.ts
packages/agents-mcp/src/models/artifactcomponentarrayresponse.ts
packages/agents-mcp/src/models/artifactcomponentcreate.ts
packages/agents-mcp/src/models/artifactcomponentlistresponse.ts
packages/agents-mcp/src/models/artifactcomponentresponse.ts
packages/agents-mcp/src/models/artifactcomponentupdate.ts
packages/agents-mcp/src/models/associateartifactcomponentwithagentop.ts
packages/agents-mcp/src/models/associatedatacomponentwithagentop.ts
packages/agents-mcp/src/models/associatefunctiontoolwithsubagentop.ts
packages/agents-mcp/src/models/badrequest.ts
packages/agents-mcp/src/models/batchgetevaluatoragentscopesop.ts
packages/agents-mcp/src/models/branchinfo.ts
packages/agents-mcp/src/models/branchlistresponse.ts
packages/agents-mcp/src/models/branchresponse.ts
packages/agents-mcp/src/models/cancelscheduledtriggerinvocationop.ts
packages/agents-mcp/src/models/candelegatetoexternalagent.ts
packages/agents-mcp/src/models/candelegatetoexternalagentinsert.ts
packages/agents-mcp/src/models/candelegatetoteamagent.ts
packages/agents-mcp/src/models/candelegatetoteamagentinsert.ts
packages/agents-mcp/src/models/canrelatetointernalsubagent.ts
packages/agents-mcp/src/models/canuseitem.ts
packages/agents-mcp/src/models/capabilitiesop.ts
packages/agents-mcp/src/models/capabilitiesresponseschema.ts
packages/agents-mcp/src/models/checkartifactcomponentagentassociationop.ts
packages/agents-mcp/src/models/checkdatacomponentagentassociationop.ts
packages/agents-mcp/src/models/checkfunctiontoolsubagentassociationop.ts
packages/agents-mcp/src/models/componentassociation.ts
packages/agents-mcp/src/models/componentassociationlistresponse.ts
packages/agents-mcp/src/models/componentjoin.ts
packages/agents-mcp/src/models/conflictitem.ts
packages/agents-mcp/src/models/contextconfig.ts
packages/agents-mcp/src/models/contextconfigcreate.ts
packages/agents-mcp/src/models/contextconfiglistresponse.ts
packages/agents-mcp/src/models/contextconfigresponse.ts
packages/agents-mcp/src/models/contextconfigupdate.ts
packages/agents-mcp/src/models/conversationboundsresponse.ts
packages/agents-mcp/src/models/conversationwithformattedmessagesresponse.ts
packages/agents-mcp/src/models/createagentop.ts
packages/agents-mcp/src/models/createanonymoussessionop.ts
packages/agents-mcp/src/models/createapikeyop.ts
packages/agents-mcp/src/models/createappauthkeyop.ts
packages/agents-mcp/src/models/createappop.ts
packages/agents-mcp/src/models/createartifactcomponentop.ts
packages/agents-mcp/src/models/createbranchop.ts
packages/agents-mcp/src/models/createbranchrequest.ts
packages/agents-mcp/src/models/createcontextconfigop.ts
packages/agents-mcp/src/models/createcredentialinstoreop.ts
packages/agents-mcp/src/models/createcredentialinstorerequest.ts
packages/agents-mcp/src/models/createcredentialinstoreresponse.ts
packages/agents-mcp/src/models/createcredentialop.ts
packages/agents-mcp/src/models/createdatacomponentop.ts
packages/agents-mcp/src/models/createdatasetitemop.ts
packages/agents-mcp/src/models/createdatasetitemsbulkop.ts
packages/agents-mcp/src/models/createdatasetop.ts
packages/agents-mcp/src/models/createdatasetrunconfigop.ts
packages/agents-mcp/src/models/createevaluationjobconfigop.ts
packages/agents-mcp/src/models/createevaluationresultop.ts
packages/agents-mcp/src/models/createevaluationrunconfigop.ts
packages/agents-mcp/src/models/createevaluationsuiteconfigop.ts
packages/agents-mcp/src/models/createevaluatorop.ts
packages/agents-mcp/src/models/createexternalagentop.ts
packages/agents-mcp/src/models/createfeedbackop.ts
packages/agents-mcp/src/models/createfullagentop.ts
packages/agents-mcp/src/models/createfullprojectop.ts
packages/agents-mcp/src/models/createfunctionop.ts
packages/agents-mcp/src/models/createfunctiontoolop.ts
packages/agents-mcp/src/models/createplaygroundtokenop.ts
packages/agents-mcp/src/models/createprojectop.ts
packages/agents-mcp/src/models/createscheduledtriggerop.ts
packages/agents-mcp/src/models/createskillfileop.ts
packages/agents-mcp/src/models/createskillop.ts
packages/agents-mcp/src/models/createsubagentexternalagentrelationop.ts
packages/agents-mcp/src/models/createsubagentop.ts
packages/agents-mcp/src/models/createsubagentrelationop.ts
packages/agents-mcp/src/models/createsubagentskillop.ts
packages/agents-mcp/src/models/createsubagentteamagentrelationop.ts
packages/agents-mcp/src/models/createsubagenttoolrelationop.ts
packages/agents-mcp/src/models/createtoolop.ts
packages/agents-mcp/src/models/createtriggerop.ts
packages/agents-mcp/src/models/credentialreference.ts
packages/agents-mcp/src/models/credentialreferencecreate.ts
packages/agents-mcp/src/models/credentialreferencelistresponse.ts
packages/agents-mcp/src/models/credentialreferenceresponse.ts
packages/agents-mcp/src/models/credentialreferenceupdate.ts
packages/agents-mcp/src/models/credentialstore.ts
packages/agents-mcp/src/models/credentialstorelistresponse.ts
packages/agents-mcp/src/models/datacomponent.ts
packages/agents-mcp/src/models/datacomponentarrayresponse.ts
packages/agents-mcp/src/models/datacomponentcreate.ts
packages/agents-mcp/src/models/datacomponentlistresponse.ts
packages/agents-mcp/src/models/datacomponentresponse.ts
packages/agents-mcp/src/models/datacomponentupdate.ts
packages/agents-mcp/src/models/datapart.ts
packages/agents-mcp/src/models/dataset.ts
packages/agents-mcp/src/models/datasetcreate.ts
packages/agents-mcp/src/models/datasetitem.ts
packages/agents-mcp/src/models/datasetitemcreate.ts
packages/agents-mcp/src/models/datasetitemupdate.ts
packages/agents-mcp/src/models/datasetrun.ts
packages/agents-mcp/src/models/datasetrunconfig.ts
packages/agents-mcp/src/models/datasetrunitem.ts
packages/agents-mcp/src/models/datasetupdate.ts
packages/agents-mcp/src/models/deleteagentop.ts
packages/agents-mcp/src/models/deleteapikeyop.ts
packages/agents-mcp/src/models/deleteappauthkeyop.ts
packages/agents-mcp/src/models/deleteappop.ts
packages/agents-mcp/src/models/deleteartifactcomponentop.ts
packages/agents-mcp/src/models/deletebranchop.ts
packages/agents-mcp/src/models/deletecontextconfigop.ts
packages/agents-mcp/src/models/deletecredentialop.ts
packages/agents-mcp/src/models/deletedatacomponentop.ts
packages/agents-mcp/src/models/deletedatasetitemop.ts
packages/agents-mcp/src/models/deletedatasetop.ts
packages/agents-mcp/src/models/deletedatasetrunconfigop.ts
packages/agents-mcp/src/models/deleteevaluationjobconfigop.ts
packages/agents-mcp/src/models/deleteevaluationresultop.ts
packages/agents-mcp/src/models/deleteevaluationrunconfigop.ts
packages/agents-mcp/src/models/deleteevaluationsuiteconfigop.ts
packages/agents-mcp/src/models/deleteevaluatorop.ts
packages/agents-mcp/src/models/deleteexternalagentop.ts
packages/agents-mcp/src/models/deletefeedbackop.ts
packages/agents-mcp/src/models/deletefullagentop.ts
packages/agents-mcp/src/models/deletefullprojectop.ts
packages/agents-mcp/src/models/deletefunctionop.ts
packages/agents-mcp/src/models/deletefunctiontoolop.ts
packages/agents-mcp/src/models/deletegithubinstallationop.ts
packages/agents-mcp/src/models/deleteprojectop.ts
packages/agents-mcp/src/models/deletescheduledtriggerop.ts
packages/agents-mcp/src/models/deleteskillfileop.ts
packages/agents-mcp/src/models/deleteskillop.ts
packages/agents-mcp/src/models/deletesubagentexternalagentrelationop.ts
packages/agents-mcp/src/models/deletesubagentop.ts
packages/agents-mcp/src/models/deletesubagentrelationop.ts
packages/agents-mcp/src/models/deletesubagentskillop.ts
packages/agents-mcp/src/models/deletesubagentteamagentrelationop.ts
packages/agents-mcp/src/models/deletesubagenttoolrelationop.ts
packages/agents-mcp/src/models/deletetoolop.ts
packages/agents-mcp/src/models/deletetriggerop.ts
packages/agents-mcp/src/models/diffsummaryitem.ts
packages/agents-mcp/src/models/disconnectgithubinstallationop.ts
packages/agents-mcp/src/models/enduserconversationdetailresponse.ts
packages/agents-mcp/src/models/enduserconversationlistresponse.ts
packages/agents-mcp/src/models/errorresponse.ts
packages/agents-mcp/src/models/errors/apierror.ts
packages/agents-mcp/src/models/errors/httpclienterrors.ts
packages/agents-mcp/src/models/errors/sdkvalidationerror.ts
packages/agents-mcp/src/models/evaluateconversationop.ts
packages/agents-mcp/src/models/evaluateconversationsbyjobop.ts
packages/agents-mcp/src/models/evaluationjobconfig.ts
packages/agents-mcp/src/models/evaluationjobconfigcreate.ts
packages/agents-mcp/src/models/evaluationjobfiltercriteria.ts
packages/agents-mcp/src/models/evaluationresult.ts
packages/agents-mcp/src/models/evaluationresultcreate.ts
packages/agents-mcp/src/models/evaluationresultupdate.ts
packages/agents-mcp/src/models/evaluationrunconfigcreate.ts
packages/agents-mcp/src/models/evaluationrunconfigupdate.ts
packages/agents-mcp/src/models/evaluationrunconfigwithsuiteconfigs.ts
packages/agents-mcp/src/models/evaluationsuiteconfig.ts
packages/agents-mcp/src/models/evaluationsuiteconfigcreate.ts
packages/agents-mcp/src/models/evaluationsuiteconfigupdate.ts
packages/agents-mcp/src/models/evaluator.ts
packages/agents-mcp/src/models/evaluatorcreate.ts
packages/agents-mcp/src/models/evaluatorupdate.ts
packages/agents-mcp/src/models/existsresponse.ts
packages/agents-mcp/src/models/externalagent.ts
packages/agents-mcp/src/models/externalagentcreate.ts
packages/agents-mcp/src/models/externalagentlistresponse.ts
packages/agents-mcp/src/models/externalagentresponse.ts
packages/agents-mcp/src/models/externalagentupdate.ts
packages/agents-mcp/src/models/feedback.ts
packages/agents-mcp/src/models/feedbackcreate.ts
packages/agents-mcp/src/models/feedbacklistresponse.ts
packages/agents-mcp/src/models/feedbackresponse.ts
packages/agents-mcp/src/models/feedbackupdate.ts
packages/agents-mcp/src/models/filepart.ts
packages/agents-mcp/src/models/forbidden.ts
packages/agents-mcp/src/models/fullagentagentinsert.ts
packages/agents-mcp/src/models/fullagentsubagentselect.ts
packages/agents-mcp/src/models/fullagentsubagentselectwithrelationids.ts
packages/agents-mcp/src/models/fullprojectdefinition.ts
packages/agents-mcp/src/models/fullprojectselect.ts
packages/agents-mcp/src/models/fullprojectselectresponse.ts
packages/agents-mcp/src/models/fullprojectselectwithrelationids.ts
packages/agents-mcp/src/models/fullprojectselectwithrelationidsresponse.ts
packages/agents-mcp/src/models/function.ts
packages/agents-mcp/src/models/functioncreate.ts
packages/agents-mcp/src/models/functionlistresponse.ts
packages/agents-mcp/src/models/functionresponse.ts
packages/agents-mcp/src/models/functiontool.ts
packages/agents-mcp/src/models/functiontoolcreate.ts
packages/agents-mcp/src/models/functiontoollistresponse.ts
packages/agents-mcp/src/models/functiontoolresponse.ts
packages/agents-mcp/src/models/functiontoolupdate.ts
packages/agents-mcp/src/models/functionupdate.ts
packages/agents-mcp/src/models/getagentop.ts
packages/agents-mcp/src/models/getagentsusingartifactcomponentop.ts
packages/agents-mcp/src/models/getagentsusingdatacomponentop.ts
packages/agents-mcp/src/models/getapicroncleanupstreamchunksop.ts
packages/agents-mcp/src/models/getapikeybyidop.ts
packages/agents-mcp/src/models/getapiworkflowprocessop.ts
packages/agents-mcp/src/models/getappbyidop.ts
packages/agents-mcp/src/models/getartifactcomponentbyidop.ts
packages/agents-mcp/src/models/getartifactcomponentsforagentop.ts
packages/agents-mcp/src/models/getbranchop.ts
packages/agents-mcp/src/models/getcontextconfigbyidop.ts
packages/agents-mcp/src/models/getconversationboundsop.ts
packages/agents-mcp/src/models/getconversationmediaop.ts
packages/agents-mcp/src/models/getconversationop.ts
packages/agents-mcp/src/models/getcredentialbyidop.ts
packages/agents-mcp/src/models/getdatacomponentbyidop.ts
packages/agents-mcp/src/models/getdatacomponentsforagentop.ts
packages/agents-mcp/src/models/getdatasetitemop.ts
packages/agents-mcp/src/models/getdatasetop.ts
packages/agents-mcp/src/models/getdatasetrunconfigop.ts
packages/agents-mcp/src/models/getdatasetrunitemsop.ts
packages/agents-mcp/src/models/getdatasetrunop.ts
packages/agents-mcp/src/models/getenduserconversationop.ts
packages/agents-mcp/src/models/getevaluationjobconfigop.ts
packages/agents-mcp/src/models/getevaluationjobconfigresultsop.ts
packages/agents-mcp/src/models/getevaluationresultop.ts
packages/agents-mcp/src/models/getevaluationrunconfigop.ts
packages/agents-mcp/src/models/getevaluationrunconfigresultsop.ts
packages/agents-mcp/src/models/getevaluationsuiteconfigop.ts
packages/agents-mcp/src/models/getevaluatorop.ts
packages/agents-mcp/src/models/getevaluatorsbatchop.ts
packages/agents-mcp/src/models/getexternalagentbyidop.ts
packages/agents-mcp/src/models/getfeedbackbyidop.ts
packages/agents-mcp/src/models/getfullagentdefinitionop.ts
packages/agents-mcp/src/models/getfullagentop.ts
packages/agents-mcp/src/models/getfullprojectop.ts
packages/agents-mcp/src/models/getfullprojectwithrelationidsop.ts
packages/agents-mcp/src/models/getfunctionop.ts
packages/agents-mcp/src/models/getfunctiontoolop.ts
packages/agents-mcp/src/models/getfunctiontoolsforsubagentop.ts
packages/agents-mcp/src/models/getgithubinstallationdetailsop.ts
packages/agents-mcp/src/models/getgithubinstallurlop.ts
packages/agents-mcp/src/models/getmanageapiclimeop.ts
packages/agents-mcp/src/models/getmanageapiinvitationspendingop.ts
packages/agents-mcp/src/models/getmanageapiusersuseridorganizationsop.ts
packages/agents-mcp/src/models/getmcptoolgithubaccessop.ts
packages/agents-mcp/src/models/getmcptoolslackaccessop.ts
packages/agents-mcp/src/models/getoauthredirecturlop.ts
packages/agents-mcp/src/models/getpowchallengeop.ts
packages/agents-mcp/src/models/getprojectbyidop.ts
packages/agents-mcp/src/models/getprojectgithubaccessop.ts
packages/agents-mcp/src/models/getprojectpermissionsop.ts
packages/agents-mcp/src/models/getrelatedagentinfosop.ts
packages/agents-mcp/src/models/getrunagentswellknownagentjsonop.ts
packages/agents-mcp/src/models/getrunapiexecutionsexecutionidop.ts
packages/agents-mcp/src/models/getrunapiexecutionsexecutionidstreamop.ts
packages/agents-mcp/src/models/getscheduledtriggerbyidop.ts
packages/agents-mcp/src/models/getscheduledtriggerinvocationbyidop.ts
packages/agents-mcp/src/models/getskillfileop.ts
packages/agents-mcp/src/models/getskillop.ts
packages/agents-mcp/src/models/getskillsforsubagentop.ts
packages/agents-mcp/src/models/getsubagentbyidop.ts
packages/agents-mcp/src/models/getsubagentexternalagentrelationbyidop.ts
packages/agents-mcp/src/models/getsubagentrelationbyidop.ts
packages/agents-mcp/src/models/getsubagentsfortoolop.ts
packages/agents-mcp/src/models/getsubagentsusingfunctiontoolop.ts
packages/agents-mcp/src/models/getsubagentteamagentrelationbyidop.ts
packages/agents-mcp/src/models/getsubagenttoolrelationop.ts
packages/agents-mcp/src/models/getthirdpartymcpserverop.ts
packages/agents-mcp/src/models/gettoolop.ts
packages/agents-mcp/src/models/gettriggerbyidop.ts
packages/agents-mcp/src/models/gettriggerinvocationbyidop.ts
packages/agents-mcp/src/models/getusercredentialfortoolop.ts
packages/agents-mcp/src/models/getuserprofileop.ts
packages/agents-mcp/src/models/healthop.ts
packages/agents-mcp/src/models/initiateoauthloginpublicop.ts
packages/agents-mcp/src/models/initiatetooloauthloginop.ts
packages/agents-mcp/src/models/internalservererror.ts
packages/agents-mcp/src/models/jsonschemaforllmschema.ts
packages/agents-mcp/src/models/jsonschemapropertyschemaunion.ts
packages/agents-mcp/src/models/lastrunsummary.ts
packages/agents-mcp/src/models/listagentsop.ts
packages/agents-mcp/src/models/listapikeysop.ts
packages/agents-mcp/src/models/listappauthkeysop.ts
packages/agents-mcp/src/models/listappsop.ts
packages/agents-mcp/src/models/listartifactcomponentsop.ts
packages/agents-mcp/src/models/listavailableagentsop.ts
packages/agents-mcp/src/models/listbranchesforagentop.ts
packages/agents-mcp/src/models/listbranchesop.ts
packages/agents-mcp/src/models/listcontextconfigsop.ts
packages/agents-mcp/src/models/listconversationsop.ts
packages/agents-mcp/src/models/listcredentialsop.ts
packages/agents-mcp/src/models/listcredentialstoresop.ts
packages/agents-mcp/src/models/listdatacomponentsop.ts
packages/agents-mcp/src/models/listdatasetagentsop.ts
packages/agents-mcp/src/models/listdatasetitemsop.ts
packages/agents-mcp/src/models/listdatasetrunconfigsop.ts
packages/agents-mcp/src/models/listdatasetrunsop.ts
packages/agents-mcp/src/models/listdatasetsop.ts
packages/agents-mcp/src/models/listenduserconversationsop.ts
packages/agents-mcp/src/models/listevaluationjobconfigevaluatorsop.ts
packages/agents-mcp/src/models/listevaluationjobconfigsop.ts
packages/agents-mcp/src/models/listevaluationrunconfigsop.ts
packages/agents-mcp/src/models/listevaluationsuiteconfigevaluatorsop.ts
packages/agents-mcp/src/models/listevaluationsuiteconfigsop.ts
packages/agents-mcp/src/models/listevaluatoragentsop.ts
packages/agents-mcp/src/models/listevaluatorsop.ts
packages/agents-mcp/src/models/listexternalagentsop.ts
packages/agents-mcp/src/models/listfeedbackop.ts
packages/agents-mcp/src/models/listfunctionsop.ts
packages/agents-mcp/src/models/listfunctiontoolsop.ts
packages/agents-mcp/src/models/listgithubinstallationsop.ts
packages/agents-mcp/src/models/listmcpcatalogop.ts
packages/agents-mcp/src/models/listorgentitlementsop.ts
packages/agents-mcp/src/models/listprojectmembersop.ts
packages/agents-mcp/src/models/listprojectsop.ts
packages/agents-mcp/src/models/listscheduledtriggerinvocationsop.ts
packages/agents-mcp/src/models/listscheduledtriggersop.ts
packages/agents-mcp/src/models/listscheduledtriggerusersop.ts
packages/agents-mcp/src/models/listskillsop.ts
packages/agents-mcp/src/models/listsubagentexternalagentrelationsop.ts
packages/agents-mcp/src/models/listsubagentrelationsop.ts
packages/agents-mcp/src/models/listsubagentsop.ts
packages/agents-mcp/src/models/listsubagentteamagentrelationsop.ts
packages/agents-mcp/src/models/listsubagenttoolrelationsop.ts
packages/agents-mcp/src/models/listtoolsop.ts
packages/agents-mcp/src/models/listtriggerinvocationsop.ts
packages/agents-mcp/src/models/listtriggersop.ts
packages/agents-mcp/src/models/listupcomingscheduledrunsop.ts
packages/agents-mcp/src/models/listuserprojectmembershipsop.ts
packages/agents-mcp/src/models/manageconversationlistresponse.ts
packages/agents-mcp/src/models/mcpcataloglistresponse.ts
packages/agents-mcp/src/models/mcpoauthcallbackop.ts
packages/agents-mcp/src/models/mcptool.ts
packages/agents-mcp/src/models/mcptoollistresponse.ts
packages/agents-mcp/src/models/mcptoolresponse.ts
packages/agents-mcp/src/models/mergeexecuteop.ts
packages/agents-mcp/src/models/mergeexecuterequest.ts
packages/agents-mcp/src/models/mergeexecuteresponse.ts
packages/agents-mcp/src/models/mergepreviewop.ts
packages/agents-mcp/src/models/mergepreviewrequest.ts
packages/agents-mcp/src/models/mergepreviewresponse.ts
packages/agents-mcp/src/models/model.ts
packages/agents-mcp/src/models/modelsettings.ts
packages/agents-mcp/src/models/notfound.ts
packages/agents-mcp/src/models/pagination.ts
packages/agents-mcp/src/models/part.ts
packages/agents-mcp/src/models/postapideployrestartschedulerop.ts
packages/agents-mcp/src/models/postmanageapiusersuseridorganizationsop.ts
packages/agents-mcp/src/models/postrunapichatop.ts
packages/agents-mcp/src/models/postrunapiexecutionsexecutionidapprovalstoolcallidop.ts
packages/agents-mcp/src/models/postrunapiexecutionsop.ts
packages/agents-mcp/src/models/postrunapitoolapprovalsop.ts
packages/agents-mcp/src/models/postruntenantstenantidprojectsprojectidagentsagentidtriggerstriggeridop.ts
packages/agents-mcp/src/models/postrunv1chatcompletionsop.ts
packages/agents-mcp/src/models/postrunv1mcpop.ts
packages/agents-mcp/src/models/powchallengeresponse.ts
packages/agents-mcp/src/models/powdisablederror.ts
packages/agents-mcp/src/models/project.ts
packages/agents-mcp/src/models/projectcreate.ts
packages/agents-mcp/src/models/projectlistresponse.ts
packages/agents-mcp/src/models/projectmodel.ts
packages/agents-mcp/src/models/projectresponse.ts
packages/agents-mcp/src/models/projectupdate.ts
packages/agents-mcp/src/models/publickeyconfig.ts
packages/agents-mcp/src/models/publickeylistresponse.ts
packages/agents-mcp/src/models/publickeyresponse.ts
packages/agents-mcp/src/models/readyerrorchecks.ts
packages/agents-mcp/src/models/readyerrorresponse.ts
packages/agents-mcp/src/models/readyop.ts
packages/agents-mcp/src/models/readyresponse.ts
packages/agents-mcp/src/models/reconnectgithubinstallationop.ts
packages/agents-mcp/src/models/relatedagentinfo.ts
packages/agents-mcp/src/models/relatedagentinfolistresponse.ts
packages/agents-mcp/src/models/removeagentfromdatasetop.ts
packages/agents-mcp/src/models/removeagentfromevaluatorop.ts
packages/agents-mcp/src/models/removeartifactcomponentfromagentop.ts
packages/agents-mcp/src/models/removedatacomponentfromagentop.ts
packages/agents-mcp/src/models/removedresponse.ts
packages/agents-mcp/src/models/removeevaluatorfromjobconfigop.ts
packages/agents-mcp/src/models/removeevaluatorfromsuiteconfigop.ts
packages/agents-mcp/src/models/removefunctiontoolfromsubagentop.ts
packages/agents-mcp/src/models/removeprojectmemberop.ts
packages/agents-mcp/src/models/removescheduledtriggeruserop.ts
packages/agents-mcp/src/models/rerunscheduledtriggerinvocationop.ts
packages/agents-mcp/src/models/reruntriggerop.ts
packages/agents-mcp/src/models/resolvedref.ts
packages/agents-mcp/src/models/resolvedrefresponse.ts
packages/agents-mcp/src/models/resolverefop.ts
packages/agents-mcp/src/models/resumeconversationstreamop.ts
packages/agents-mcp/src/models/rundatasetitemsop.ts
packages/agents-mcp/src/models/runscheduledtriggernowop.ts
packages/agents-mcp/src/models/scheduledtrigger.ts
packages/agents-mcp/src/models/scheduledtriggercreate.ts
packages/agents-mcp/src/models/scheduledtriggerinvocation.ts
packages/agents-mcp/src/models/scheduledtriggerinvocationlistresponse.ts
packages/agents-mcp/src/models/scheduledtriggerinvocationresponse.ts
packages/agents-mcp/src/models/scheduledtriggerresponse.ts
packages/agents-mcp/src/models/scheduledtriggerupdate.ts
packages/agents-mcp/src/models/scheduledtriggerusersresponse.ts
packages/agents-mcp/src/models/scheduledtriggerwithruninfo.ts
packages/agents-mcp/src/models/scheduledtriggerwithruninfolistresponse.ts
packages/agents-mcp/src/models/security.ts
packages/agents-mcp/src/models/setmcptoolgithubaccessop.ts
packages/agents-mcp/src/models/setmcptoolslackaccessop.ts
packages/agents-mcp/src/models/setprojectgithubaccessop.ts
packages/agents-mcp/src/models/setscheduledtriggerusersop.ts
packages/agents-mcp/src/models/setscheduledtriggerusersrequest.ts
packages/agents-mcp/src/models/signaturesource.ts
packages/agents-mcp/src/models/signaturevalidationoptions.ts
packages/agents-mcp/src/models/signatureverificationconfig.ts
packages/agents-mcp/src/models/signedcomponent.ts
packages/agents-mcp/src/models/skill.ts
packages/agents-mcp/src/models/skillcreate.ts
packages/agents-mcp/src/models/skillfile.ts
packages/agents-mcp/src/models/skillfilecreate.ts
packages/agents-mcp/src/models/skillfileresponse.ts
packages/agents-mcp/src/models/skillfileupdate.ts
packages/agents-mcp/src/models/skilllistresponse.ts
packages/agents-mcp/src/models/skillupdate.ts
packages/agents-mcp/src/models/skillwithfiles.ts
packages/agents-mcp/src/models/skillwithfilesresponse.ts
packages/agents-mcp/src/models/slackbulkdeletechannelagentsop.ts
packages/agents-mcp/src/models/slackbulksetchannelagentsop.ts
packages/agents-mcp/src/models/slackdeletechannelsettingsop.ts
packages/agents-mcp/src/models/slackdeleteworkspaceop.ts
packages/agents-mcp/src/models/slackgetchannelsettingsop.ts
packages/agents-mcp/src/models/slackgetjoinfromworkspaceop.ts
packages/agents-mcp/src/models/slackgetworkspaceop.ts
packages/agents-mcp/src/models/slackgetworkspacesettingsop.ts
packages/agents-mcp/src/models/slackinstallop.ts
packages/agents-mcp/src/models/slacklinkstatusop.ts
packages/agents-mcp/src/models/slacklistchannelsop.ts
packages/agents-mcp/src/models/slacklistlinkedusersop.ts
packages/agents-mcp/src/models/slacklistworkspacesop.ts
packages/agents-mcp/src/models/slackoauthredirectop.ts
packages/agents-mcp/src/models/slacksetchannelsettingsop.ts
packages/agents-mcp/src/models/slacktestmessageop.ts
packages/agents-mcp/src/models/slackupdatejoinfromworkspaceop.ts
packages/agents-mcp/src/models/slackupdateworkspacesettingsop.ts
packages/agents-mcp/src/models/slackuserconnectop.ts
packages/agents-mcp/src/models/slackuserdisconnectop.ts
packages/agents-mcp/src/models/slackuserstatusop.ts
packages/agents-mcp/src/models/slackverifylinktokenop.ts
packages/agents-mcp/src/models/slackworkspacehealthop.ts
packages/agents-mcp/src/models/startconversationsevaluationsop.ts
packages/agents-mcp/src/models/statuscomponent.ts
packages/agents-mcp/src/models/statusupdate.ts
packages/agents-mcp/src/models/stopwhen.ts
packages/agents-mcp/src/models/subagent.ts
packages/agents-mcp/src/models/subagentartifactcomponentresponse.ts
packages/agents-mcp/src/models/subagentcreate.ts
packages/agents-mcp/src/models/subagentdatacomponentresponse.ts
packages/agents-mcp/src/models/subagentexternalagentrelation.ts
packages/agents-mcp/src/models/subagentexternalagentrelationcreate.ts
packages/agents-mcp/src/models/subagentexternalagentrelationlistresponse.ts
packages/agents-mcp/src/models/subagentexternalagentrelationresponse.ts
packages/agents-mcp/src/models/subagentexternalagentrelationupdate.ts
packages/agents-mcp/src/models/subagentfunctiontoolrelation.ts
packages/agents-mcp/src/models/subagentfunctiontoolrelationcreate.ts
packages/agents-mcp/src/models/subagentfunctiontoolrelationresponse.ts
packages/agents-mcp/src/models/subagentlistresponse.ts
packages/agents-mcp/src/models/subagentrelation.ts
packages/agents-mcp/src/models/subagentrelationcreate.ts
packages/agents-mcp/src/models/subagentrelationlistresponse.ts
packages/agents-mcp/src/models/subagentrelationresponse.ts
packages/agents-mcp/src/models/subagentrelationupdate.ts
packages/agents-mcp/src/models/subagentresponse.ts
packages/agents-mcp/src/models/subagentskill.ts
packages/agents-mcp/src/models/subagentskillcreate.ts
packages/agents-mcp/src/models/subagentskillresponse.ts
packages/agents-mcp/src/models/subagentskillwithindex.ts
packages/agents-mcp/src/models/subagentskillwithindexarrayresponse.ts
packages/agents-mcp/src/models/subagentstopwhen.ts
packages/agents-mcp/src/models/subagentteamagentrelation.ts
packages/agents-mcp/src/models/subagentteamagentrelationcreate.ts
packages/agents-mcp/src/models/subagentteamagentrelationlistresponse.ts
packages/agents-mcp/src/models/subagentteamagentrelationresponse.ts
packages/agents-mcp/src/models/subagentteamagentrelationupdate.ts
packages/agents-mcp/src/models/subagenttoolrelation.ts
packages/agents-mcp/src/models/subagenttoolrelationcreate.ts
packages/agents-mcp/src/models/subagenttoolrelationlistresponse.ts
packages/agents-mcp/src/models/subagenttoolrelationresponse.ts
packages/agents-mcp/src/models/subagenttoolrelationupdate.ts
packages/agents-mcp/src/models/subagentupdate.ts
packages/agents-mcp/src/models/submitenduserfeedbackop.ts
packages/agents-mcp/src/models/syncgithubinstallationrepositoriesop.ts
packages/agents-mcp/src/models/teamagent.ts
packages/agents-mcp/src/models/textpart.ts
packages/agents-mcp/src/models/thirdpartymcpserverresponse.ts
packages/agents-mcp/src/models/tool.ts
packages/agents-mcp/src/models/toolcreate.ts
packages/agents-mcp/src/models/toolupdate.ts
packages/agents-mcp/src/models/triggerauthenticationinput.ts
packages/agents-mcp/src/models/triggercreate.ts
packages/agents-mcp/src/models/triggerdatasetrun.ts
packages/agents-mcp/src/models/triggerdatasetrunop.ts
packages/agents-mcp/src/models/triggerevaluationjob.ts
packages/agents-mcp/src/models/triggerinvocation.ts
packages/agents-mcp/src/models/triggerinvocationlistresponse.ts
packages/agents-mcp/src/models/triggerinvocationresponse.ts
packages/agents-mcp/src/models/triggerisdisabled.ts
packages/agents-mcp/src/models/triggeroutputtransform.ts
packages/agents-mcp/src/models/triggerupdate.ts
packages/agents-mcp/src/models/triggerwithwebhookurl.ts
packages/agents-mcp/src/models/triggerwithwebhookurllistresponse.ts
packages/agents-mcp/src/models/triggerwithwebhookurlresponse.ts
packages/agents-mcp/src/models/triggerwithwebhookurlwithwarningresponse.ts
packages/agents-mcp/src/models/unauthorized.ts
packages/agents-mcp/src/models/unprocessableentity.ts
packages/agents-mcp/src/models/updateagentop.ts
packages/agents-mcp/src/models/updateapikeyop.ts
packages/agents-mcp/src/models/updateappop.ts
packages/agents-mcp/src/models/updateartifactcomponentop.ts
packages/agents-mcp/src/models/updatecontextconfigop.ts
packages/agents-mcp/src/models/updatecredentialop.ts
packages/agents-mcp/src/models/updatedatacomponentop.ts
packages/agents-mcp/src/models/updatedatasetitemop.ts
packages/agents-mcp/src/models/updatedatasetop.ts
packages/agents-mcp/src/models/updatedatasetrunconfigop.ts
packages/agents-mcp/src/models/updateevaluationresultop.ts
packages/agents-mcp/src/models/updateevaluationrunconfigop.ts
packages/agents-mcp/src/models/updateevaluationsuiteconfigop.ts
packages/agents-mcp/src/models/updateevaluatorop.ts
packages/agents-mcp/src/models/updateexternalagentop.ts
packages/agents-mcp/src/models/updatefeedbackop.ts
packages/agents-mcp/src/models/updatefullagentop.ts
packages/agents-mcp/src/models/updatefullprojectop.ts
packages/agents-mcp/src/models/updatefunctionop.ts
packages/agents-mcp/src/models/updatefunctiontoolop.ts
packages/agents-mcp/src/models/updateprojectmemberop.ts
packages/agents-mcp/src/models/updateprojectop.ts
packages/agents-mcp/src/models/updatescheduledtriggerop.ts
packages/agents-mcp/src/models/updateskillfileop.ts
packages/agents-mcp/src/models/updateskillop.ts
packages/agents-mcp/src/models/updatesubagentexternalagentrelationop.ts
packages/agents-mcp/src/models/updatesubagentop.ts
packages/agents-mcp/src/models/updatesubagentrelationop.ts
packages/agents-mcp/src/models/updatesubagentteamagentrelationop.ts
packages/agents-mcp/src/models/updatesubagenttoolrelationop.ts
packages/agents-mcp/src/models/updatetoolop.ts
packages/agents-mcp/src/models/updatetriggerop.ts
packages/agents-mcp/src/models/upsertuserprofileop.ts
packages/agents-mcp/src/models/webclientconfig.ts
packages/agents-mcp/src/models/webclientconfigresponse.ts
packages/agents-mcp/src/tool-names.ts
packages/agents-mcp/src/types/async.ts
packages/agents-mcp/src/types/bigint.ts
packages/agents-mcp/src/types/blobs.ts
packages/agents-mcp/src/types/enums.ts
packages/agents-mcp/src/types/fp.ts
packages/agents-mcp/src/types/rfcdate.ts
packages/agents-mcp/src/types/streams.ts
packages/agents-sdk/CHANGELOG.md
packages/agents-sdk/package.json
packages/agents-sdk/src/evaluationClient.ts
packages/agents-work-apps/CHANGELOG.md
packages/agents-work-apps/package.json
packages/agents-work-apps/src/__tests__/github/config.test.ts
packages/agents-work-apps/src/__tests__/github/mcp/utils.test.ts
packages/agents-work-apps/src/__tests__/github/routes/setup.test.ts
packages/agents-work-apps/src/__tests__/github/routes/webhooks.test.ts
packages/agents-work-apps/src/__tests__/setup.ts
packages/agents-work-apps/src/__tests__/slack/agent-resolution.test.ts
packages/agents-work-apps/src/__tests__/slack/app-mention.test.ts
packages/agents-work-apps/src/__tests__/slack/auto-invite.test.ts
packages/agents-work-apps/src/__tests__/slack/block-actions.test.ts
packages/agents-work-apps/src/__tests__/slack/client.test.ts
packages/agents-work-apps/src/__tests__/slack/command-question.test.ts
packages/agents-work-apps/src/__tests__/slack/dev-config.test.ts
packages/agents-work-apps/src/__tests__/slack/direct-message.test.ts
packages/agents-work-apps/src/__tests__/slack/dispatcher.test.ts
packages/agents-work-apps/src/__tests__/slack/events.test.ts
packages/agents-work-apps/src/__tests__/slack/execution.test.ts
packages/agents-work-apps/src/__tests__/slack/handle-command.test.ts
packages/agents-work-apps/src/__tests__/slack/mcp/prune-stale-channels.test.ts
packages/agents-work-apps/src/__tests__/slack/mcp/utils.test.ts
packages/agents-work-apps/src/__tests__/slack/modal-submission.test.ts
packages/agents-work-apps/src/__tests__/slack/nango.test.ts
packages/agents-work-apps/src/__tests__/slack/oauth.test.ts
packages/agents-work-apps/src/__tests__/slack/resume-intent.test.ts
packages/agents-work-apps/src/__tests__/slack/socket-mode.test.ts
packages/agents-work-apps/src/__tests__/slack/streaming.test.ts
packages/agents-work-apps/src/github/config.ts
packages/agents-work-apps/src/github/jwks.ts
packages/agents-work-apps/src/github/oidcToken.ts
packages/agents-work-apps/src/github/routes/tokenExchange.ts
packages/agents-work-apps/src/github/routes/webhooks.ts
packages/agents-work-apps/src/slack/dispatcher.ts
packages/agents-work-apps/src/slack/routes/events.ts
packages/agents-work-apps/src/slack/routes/oauth.ts
packages/agents-work-apps/src/slack/routes/workspaces.ts
packages/agents-work-apps/src/slack/services/client.ts
packages/agents-work-apps/src/slack/services/index.ts
packages/agents-work-apps/src/slack/services/nango.ts
packages/agents-work-apps/src/slack/services/security.ts
packages/agents-work-apps/src/slack/services/workspace-cleanup.ts
packages/agents-work-apps/src/slack/slack-app-manifest.json
packages/agents-work-apps/src/slack/socket-mode.ts
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

> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~5554167 bytes across ~1640 files) exceeds the inline threshold (~100KB).
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
