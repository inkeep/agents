import type {
  EntityEffectRegistry,
  OrphanedRuntimeRowsResult,
  ScheduledTriggerAuditResult,
} from '@inkeep/agents-core';
import {
  cascadeDeleteByAgent,
  cascadeDeleteByContextConfig,
  cascadeDeleteByTool,
  defineHandlers,
  isGithubWorkAppTool,
  isSlackWorkAppTool,
  listAgentIdsByProject,
  listApiKeysByProject,
  listContextCacheByProject,
  listContextConfigIdsByProject,
  listEnabledScheduledTriggers,
  listGitHubToolAccessByProject,
  listGitHubToolAccessModeByProject,
  listScheduledWorkflowsByProject,
  listSlackChannelAgentConfigsByProject,
  listSlackToolAccessConfigByProject,
  listSubAgents,
  listToolIdsByProject,
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
      check: async (ctx): Promise<ScheduledTriggerAuditResult> => {
        const enabledTriggers = await listEnabledScheduledTriggers(ctx.manageDb)({
          scopes: ctx.scopes,
        });
        const workflows = await listScheduledWorkflowsByProject(ctx.manageDb)({
          scopes: ctx.scopes,
        });

        const enabledTriggerIds = new Set(enabledTriggers.map((t) => t.id));
        const workflowTriggerIds = new Set(workflows.map((w) => w.scheduledTriggerId));

        return {
          missingWorkflows: enabledTriggers
            .filter((t) => !workflowTriggerIds.has(t.id))
            .map((t) => ({ triggerId: t.id, triggerName: t.name })),
          orphanedWorkflows: workflows
            .filter((w) => !enabledTriggerIds.has(w.scheduledTriggerId))
            .map((w) => ({
              workflowRunId: w.workflowRunId ?? w.id,
              scheduledTriggerId: w.scheduledTriggerId,
            })),
        };
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
      check: async (ctx): Promise<OrphanedRuntimeRowsResult> => {
        const existingToolIds = new Set(
          await listToolIdsByProject(ctx.manageDb)({ scopes: ctx.scopes })
        );
        const orphaned: OrphanedRuntimeRowsResult['orphanedRows'] = [];

        const ghRepoAccess = await listGitHubToolAccessByProject(ctx.runDb)({
          scopes: ctx.scopes,
        });
        for (const row of ghRepoAccess) {
          if (!existingToolIds.has(row.toolId)) {
            orphaned.push({
              table: 'work_app_github_mcp_tool_repository_access',
              id: row.id,
              referencedEntityId: row.toolId,
            });
          }
        }

        const ghAccessModes = await listGitHubToolAccessModeByProject(ctx.runDb)({
          scopes: ctx.scopes,
        });
        for (const row of ghAccessModes) {
          if (!existingToolIds.has(row.toolId)) {
            orphaned.push({
              table: 'work_app_github_mcp_tool_access_mode',
              id: row.toolId,
              referencedEntityId: row.toolId,
            });
          }
        }

        const slackAccessConfigs = await listSlackToolAccessConfigByProject(ctx.runDb)({
          scopes: ctx.scopes,
        });
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
      check: async (ctx): Promise<OrphanedRuntimeRowsResult> => {
        const existingConfigIds = new Set(
          await listContextConfigIdsByProject(ctx.manageDb)({ scopes: ctx.scopes })
        );
        const cacheEntries = await listContextCacheByProject(ctx.runDb)({
          scopes: ctx.scopes,
        });

        return {
          orphanedRows: cacheEntries
            .filter((e) => !existingConfigIds.has(e.contextConfigId))
            .map((e) => ({
              table: 'context_cache',
              id: e.id,
              referencedEntityId: e.contextConfigId,
            })),
        };
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
      check: async (ctx): Promise<OrphanedRuntimeRowsResult> => {
        const existingAgentIds = new Set(
          await listAgentIdsByProject(ctx.manageDb)({ scopes: ctx.scopes })
        );
        const orphaned: OrphanedRuntimeRowsResult['orphanedRows'] = [];

        const keys = await listApiKeysByProject(ctx.runDb)({ scopes: ctx.scopes });
        for (const key of keys) {
          if (!existingAgentIds.has(key.agentId)) {
            orphaned.push({
              table: 'api_keys',
              id: key.id,
              referencedEntityId: key.agentId,
            });
          }
        }

        const slackConfigs = await listSlackChannelAgentConfigsByProject(ctx.runDb)({
          scopes: ctx.scopes,
        });
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
    }),
  };
}
