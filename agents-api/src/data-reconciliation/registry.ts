import type { EntityEffectRegistry } from '@inkeep/agents-core';
import {
  cascadeDeleteByAgent,
  cascadeDeleteByContextConfig,
  cascadeDeleteByTool,
  defineHandlers,
  isGithubWorkAppTool,
  isSlackWorkAppTool,
  listSubAgents,
} from '@inkeep/agents-core';
import { clearWorkspaceConnectionCache } from '@inkeep/agents-work-apps/slack';
import {
  onTriggerCreated,
  onTriggerDeleted,
  onTriggerUpdated,
} from '../domains/run/services/ScheduledTriggerService';

export function createEntityEffectRegistry(): EntityEffectRegistry {
  return {
    scheduled_triggers: defineHandlers('scheduled_triggers', {
      onCreated: async (after) => {
        await onTriggerCreated(after);
      },
      onUpdated: async (before, after) => {
        const scheduleChanged =
          before.cronExpression !== after.cronExpression ||
          String(before.runAt) !== String(after.runAt);
        await onTriggerUpdated({
          trigger: after,
          previousEnabled: before.enabled,
          scheduleChanged,
        });
      },
      onDeleted: async (before) => {
        await onTriggerDeleted(before);
      },
    }),

    tools: defineHandlers('tools', {
      onDeleted: async (before, ctx) => {
        if (!before.isWorkApp) return;
        if (!isGithubWorkAppTool(before) && !isSlackWorkAppTool(before)) return;

        await cascadeDeleteByTool(ctx.runDb)({
          toolId: before.id,
          tenantId: ctx.scopes.tenantId,
          projectId: ctx.scopes.projectId,
        });
      },
    }),

    context_configs: defineHandlers('context_configs', {
      onDeleted: async (before, ctx) => {
        const fullBranchName = `${ctx.scopes.tenantId}_${ctx.scopes.projectId}_main`;
        await cascadeDeleteByContextConfig(ctx.runDb)({
          scopes: ctx.scopes,
          contextConfigId: before.id,
          fullBranchName,
        });
      },
    }),

    agent: defineHandlers('agent', {
      onCreated: async () => {
        clearWorkspaceConnectionCache();
      },
      onUpdated: async () => {
        clearWorkspaceConnectionCache();
      },
      onDeleted: async (before, ctx) => {
        clearWorkspaceConnectionCache();

        const subAgentsList = await listSubAgents(ctx.manageDb)({
          scopes: {
            tenantId: ctx.scopes.tenantId,
            projectId: ctx.scopes.projectId,
            agentId: before.id,
          },
        });
        const subAgentIds = subAgentsList.map((sa) => sa.id);

        const fullBranchName = `${ctx.scopes.tenantId}_${ctx.scopes.projectId}_main`;
        await cascadeDeleteByAgent(ctx.runDb)({
          scopes: {
            tenantId: ctx.scopes.tenantId,
            projectId: ctx.scopes.projectId,
            agentId: before.id,
          },
          fullBranchName,
          subAgentIds,
        });
      },
    }),
  };
}
