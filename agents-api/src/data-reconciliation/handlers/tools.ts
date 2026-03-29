import type { OrphanedRuntimeRowsResult } from '@inkeep/agents-core';
import {
  cascadeDeleteByTool,
  defineHandlers,
  isGithubWorkAppTool,
  isSlackWorkAppTool,
  listGitHubToolAccessByProject,
  listGitHubToolAccessModeByProject,
  listSlackToolAccessConfigByProject,
  listToolIdsByProject,
} from '@inkeep/agents-core';

export const toolsHandlers = defineHandlers('tools', {
  onDeleted: async (before, ctx) => {
    if (!before.isWorkApp) return;
    if (!isGithubWorkAppTool(before) && !isSlackWorkAppTool(before)) return;

    await cascadeDeleteByTool(ctx.runDb)({
      toolId: before.id,
      tenantId: ctx.scopes.tenantId,
      projectId: ctx.scopes.projectId,
    });
  },
  check: async (ctx): Promise<OrphanedRuntimeRowsResult> => {
    const [existingToolIdsList, ghRepoAccess, ghAccessModes, slackAccessConfigs] =
      await Promise.all([
        listToolIdsByProject(ctx.manageDb)({ scopes: ctx.scopes }),
        listGitHubToolAccessByProject(ctx.runDb)({ scopes: ctx.scopes }),
        listGitHubToolAccessModeByProject(ctx.runDb)({ scopes: ctx.scopes }),
        listSlackToolAccessConfigByProject(ctx.runDb)({ scopes: ctx.scopes }),
      ]);

    const existingToolIds = new Set(existingToolIdsList);
    const orphaned: OrphanedRuntimeRowsResult['orphanedRows'] = [];

    for (const row of ghRepoAccess) {
      if (!existingToolIds.has(row.toolId)) {
        orphaned.push({
          table: 'work_app_github_mcp_tool_repository_access',
          id: row.id,
          referencedEntityId: row.toolId,
        });
      }
    }

    for (const row of ghAccessModes) {
      if (!existingToolIds.has(row.toolId)) {
        orphaned.push({
          table: 'work_app_github_mcp_tool_access_mode',
          id: row.toolId,
          referencedEntityId: row.toolId,
        });
      }
    }

    for (const row of slackAccessConfigs) {
      if (!existingToolIds.has(row.toolId)) {
        orphaned.push({
          table: 'work_app_slack_mcp_tool_access_config',
          id: row.toolId,
          referencedEntityId: row.toolId,
        });
      }
    }

    return { orphanedRows: orphaned };
  },
});
