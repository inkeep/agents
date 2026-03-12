import type { OrphanedRuntimeRowsResult } from '@inkeep/agents-core';
import {
  cascadeDeleteByAgent,
  defineHandlers,
  listAgentIdsByProject,
  listApiKeysByProject,
  listSlackChannelAgentConfigsByProject,
} from '@inkeep/agents-core';
import { clearWorkspaceConnectionCache } from '@inkeep/agents-work-apps/slack';

export const agentHandlers = defineHandlers('agent', {
  onDeleted: async (before, ctx) => {
    clearWorkspaceConnectionCache();

    await cascadeDeleteByAgent(ctx.runDb)({
      scopes: {
        tenantId: ctx.scopes.tenantId,
        projectId: ctx.scopes.projectId,
        agentId: before.id,
      },
      fullBranchName: ctx.fullBranchName,
      // sub agents cascade is handled separately by the sub_agents handler
      subAgentIds: [],
    });
  },
  check: async (ctx): Promise<OrphanedRuntimeRowsResult> => {
    const [existingAgentIdsList, keys, slackConfigs] = await Promise.all([
      listAgentIdsByProject(ctx.manageDb)({ scopes: ctx.scopes }),
      listApiKeysByProject(ctx.runDb)({ scopes: ctx.scopes }),
      listSlackChannelAgentConfigsByProject(ctx.runDb)({ scopes: ctx.scopes }),
    ]);

    const existingAgentIds = new Set(existingAgentIdsList);
    const orphaned: OrphanedRuntimeRowsResult['orphanedRows'] = [];

    for (const key of keys) {
      if (!existingAgentIds.has(key.agentId)) {
        orphaned.push({
          table: 'api_keys',
          id: key.id,
          referencedEntityId: key.agentId,
        });
      }
    }

    for (const row of slackConfigs) {
      if (!existingAgentIds.has(row.agentId)) {
        orphaned.push({
          table: 'work_app_slack_channel_agent_configs',
          id: row.id,
          referencedEntityId: row.agentId,
        });
      }
    }

    return { orphanedRows: orphaned };
  },
});
