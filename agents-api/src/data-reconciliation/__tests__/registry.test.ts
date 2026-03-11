import type { EntityEffectHandlers, ReconcileContext } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../domains/run/services/ScheduledTriggerService', () => ({
  onTriggerCreated: vi.fn().mockResolvedValue(undefined),
  onTriggerUpdated: vi.fn().mockResolvedValue(undefined),
  onTriggerDeleted: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@inkeep/agents-work-apps/slack', () => ({
  clearWorkspaceConnectionCache: vi.fn(),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    cascadeDeleteByTool: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
    cascadeDeleteByContextConfig: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
    cascadeDeleteByAgent: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
    isGithubWorkAppTool: vi.fn((tool) => tool.config?.mcp?.server?.url?.includes('/github/mcp')),
    isSlackWorkAppTool: vi.fn((tool) => tool.config?.mcp?.server?.url?.includes('/slack/mcp')),
    listSubAgents: vi.fn(() => vi.fn().mockResolvedValue([])),
    listEnabledScheduledTriggers: vi.fn(() => vi.fn().mockResolvedValue([])),
    listScheduledWorkflowsByProject: vi.fn(() => vi.fn().mockResolvedValue([])),
    listToolIdsByProject: vi.fn(() => vi.fn().mockResolvedValue([])),
    listGitHubToolAccessByProject: vi.fn(() => vi.fn().mockResolvedValue([])),
    listGitHubToolAccessModeByProject: vi.fn(() => vi.fn().mockResolvedValue([])),
    listSlackToolAccessConfigByProject: vi.fn(() => vi.fn().mockResolvedValue([])),
    listContextConfigIdsByProject: vi.fn(() => vi.fn().mockResolvedValue([])),
    listContextCacheByProject: vi.fn(() => vi.fn().mockResolvedValue([])),
    listAgentIdsByProject: vi.fn(() => vi.fn().mockResolvedValue([])),
    listApiKeysByProject: vi.fn(() => vi.fn().mockResolvedValue([])),
    listSlackChannelAgentConfigsByProject: vi.fn(() => vi.fn().mockResolvedValue([])),
  };
});

import {
  cascadeDeleteByAgent,
  cascadeDeleteByContextConfig,
  cascadeDeleteByTool,
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
} from '../../domains/run/services/ScheduledTriggerService';
import { createEntityEffectRegistry } from '../registry';

const mockCtx = {
  manageDb: {} as any,
  runDb: {} as any,
  scopes: { tenantId: 'tenant-1', projectId: 'project-1' },
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as any,
} satisfies ReconcileContext;

function getHandlers<K extends string>(
  registry: Record<string, any>,
  key: K
): EntityEffectHandlers<any> {
  const h = registry[key];
  expect(h).toBeDefined();
  return h as EntityEffectHandlers<any>;
}

describe('createEntityEffectRegistry', () => {
  let registry: ReturnType<typeof createEntityEffectRegistry>;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = createEntityEffectRegistry();
  });

  describe('scheduled_triggers', () => {
    it('onCreated calls onTriggerCreated with the trigger row', async () => {
      const h = getHandlers(registry, 'scheduled_triggers');
      const trigger = { id: 'trigger-1', name: 'test-trigger', enabled: true } as any;
      await h.onCreated?.(trigger, mockCtx);
      expect(onTriggerCreated).toHaveBeenCalledWith(trigger);
    });

    it('onUpdated detects schedule change and calls onTriggerUpdated', async () => {
      const h = getHandlers(registry, 'scheduled_triggers');
      const before = {
        id: 'trigger-1',
        enabled: true,
        cronExpression: '0 * * * *',
        runAt: null,
      } as any;
      const after = {
        id: 'trigger-1',
        enabled: true,
        cronExpression: '30 * * * *',
        runAt: null,
      } as any;

      await h.onUpdated?.(before, after, mockCtx);

      expect(onTriggerUpdated).toHaveBeenCalledWith({
        trigger: after,
        previousEnabled: true,
        scheduleChanged: true,
      });
    });

    it('onUpdated detects no schedule change', async () => {
      const h = getHandlers(registry, 'scheduled_triggers');
      const before = {
        id: 'trigger-1',
        enabled: true,
        cronExpression: '0 * * * *',
        runAt: null,
      } as any;
      const after = {
        id: 'trigger-1',
        enabled: false,
        cronExpression: '0 * * * *',
        runAt: null,
      } as any;

      await h.onUpdated?.(before, after, mockCtx);

      expect(onTriggerUpdated).toHaveBeenCalledWith({
        trigger: after,
        previousEnabled: true,
        scheduleChanged: false,
      });
    });

    it('onDeleted calls onTriggerDeleted', async () => {
      const h = getHandlers(registry, 'scheduled_triggers');
      const trigger = { id: 'trigger-1' } as any;
      await h.onDeleted?.(trigger, mockCtx);
      expect(onTriggerDeleted).toHaveBeenCalledWith(trigger);
    });
  });

  describe('tools', () => {
    it('onDeleted skips non-work-app tools', async () => {
      const h = getHandlers(registry, 'tools');
      const tool = { id: 'tool-1', isWorkApp: false } as any;
      await h.onDeleted?.(tool, mockCtx);
      expect(cascadeDeleteByTool).not.toHaveBeenCalled();
    });

    it('onDeleted skips work-app tools that are not GitHub or Slack', async () => {
      const h = getHandlers(registry, 'tools');
      const tool = {
        id: 'tool-1',
        isWorkApp: true,
        config: { mcp: { server: { url: '/other/mcp' } } },
      } as any;
      await h.onDeleted?.(tool, mockCtx);
      expect(cascadeDeleteByTool).not.toHaveBeenCalled();
    });

    it('onDeleted calls cascadeDeleteByTool for GitHub work-app tool', async () => {
      const h = getHandlers(registry, 'tools');
      const tool = {
        id: 'tool-1',
        isWorkApp: true,
        config: { mcp: { server: { url: '/github/mcp' } } },
      } as any;

      await h.onDeleted?.(tool, mockCtx);

      expect(cascadeDeleteByTool).toHaveBeenCalledWith(mockCtx.runDb);
      expect(vi.mocked(cascadeDeleteByTool).mock.results[0]?.value).toHaveBeenCalledWith({
        toolId: 'tool-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
      });
    });

    it('onDeleted calls cascadeDeleteByTool for Slack work-app tool', async () => {
      const h = getHandlers(registry, 'tools');
      const tool = {
        id: 'tool-2',
        isWorkApp: true,
        config: { mcp: { server: { url: '/slack/mcp' } } },
      } as any;

      await h.onDeleted?.(tool, mockCtx);

      expect(cascadeDeleteByTool).toHaveBeenCalledWith(mockCtx.runDb);
    });
  });

  describe('context_configs', () => {
    it('onDeleted calls cascadeDeleteByContextConfig with derived fullBranchName', async () => {
      const h = getHandlers(registry, 'context_configs');
      const config = { id: 'cc-1' } as any;

      await h.onDeleted?.(config, mockCtx);

      expect(cascadeDeleteByContextConfig).toHaveBeenCalledWith(mockCtx.runDb);
      expect(vi.mocked(cascadeDeleteByContextConfig).mock.results[0]?.value).toHaveBeenCalledWith({
        scopes: mockCtx.scopes,
        contextConfigId: 'cc-1',
        fullBranchName: 'tenant-1_project-1_main',
      });
    });
  });

  describe('agent', () => {
    it('onCreated calls clearWorkspaceConnectionCache', async () => {
      const h = getHandlers(registry, 'agent');
      await h.onCreated?.({ id: 'agent-1' } as any, mockCtx);
      expect(clearWorkspaceConnectionCache).toHaveBeenCalled();
    });

    it('onUpdated calls clearWorkspaceConnectionCache', async () => {
      const h = getHandlers(registry, 'agent');
      await h.onUpdated?.({ id: 'agent-1' } as any, { id: 'agent-1' } as any, mockCtx);
      expect(clearWorkspaceConnectionCache).toHaveBeenCalled();
    });

    it('onDeleted calls clearWorkspaceConnectionCache and cascadeDeleteByAgent', async () => {
      const subAgentsMock = vi.fn().mockResolvedValue([{ id: 'sub-1' }, { id: 'sub-2' }]);
      vi.mocked(listSubAgents).mockReturnValue(subAgentsMock as any);

      const h = getHandlers(registry, 'agent');
      const agent = { id: 'agent-1' } as any;
      await h.onDeleted?.(agent, mockCtx);

      expect(clearWorkspaceConnectionCache).toHaveBeenCalled();
      expect(listSubAgents).toHaveBeenCalledWith(mockCtx.manageDb);
      expect(subAgentsMock).toHaveBeenCalledWith({
        scopes: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          agentId: 'agent-1',
        },
      });
      expect(cascadeDeleteByAgent).toHaveBeenCalledWith(mockCtx.runDb);
      expect(vi.mocked(cascadeDeleteByAgent).mock.results[0]?.value).toHaveBeenCalledWith({
        scopes: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          agentId: 'agent-1',
        },
        fullBranchName: 'tenant-1_project-1_main',
        subAgentIds: ['sub-1', 'sub-2'],
      });
    });
  });

  describe('check functions', () => {
    it('scheduled_triggers check detects missing and orphaned workflows', async () => {
      vi.mocked(listEnabledScheduledTriggers).mockReturnValue(
        vi.fn().mockResolvedValue([
          { id: 'trigger-1', name: 'Active trigger' },
          { id: 'trigger-2', name: 'Missing trigger' },
        ]) as any
      );
      vi.mocked(listScheduledWorkflowsByProject).mockReturnValue(
        vi.fn().mockResolvedValue([
          { id: 'wf-1', workflowRunId: 'run-1', scheduledTriggerId: 'trigger-1' },
          { id: 'wf-2', workflowRunId: 'run-2', scheduledTriggerId: 'trigger-deleted' },
        ]) as any
      );

      const h = getHandlers(registry, 'scheduled_triggers');
      const result = await h.check?.(mockCtx);

      expect(result).toEqual({
        missingWorkflows: [{ triggerId: 'trigger-2', triggerName: 'Missing trigger' }],
        orphanedWorkflows: [{ workflowRunId: 'run-2', scheduledTriggerId: 'trigger-deleted' }],
      });
    });

    it('tools check detects orphaned GitHub access rows', async () => {
      vi.mocked(listToolIdsByProject).mockReturnValue(vi.fn().mockResolvedValue(['tool-1']) as any);
      vi.mocked(listGitHubToolAccessByProject).mockReturnValue(
        vi.fn().mockResolvedValue([
          { id: 'access-1', toolId: 'tool-1' },
          { id: 'access-2', toolId: 'tool-deleted' },
        ]) as any
      );
      vi.mocked(listGitHubToolAccessModeByProject).mockReturnValue(
        vi.fn().mockResolvedValue([]) as any
      );
      vi.mocked(listSlackToolAccessConfigByProject).mockReturnValue(
        vi.fn().mockResolvedValue([]) as any
      );

      const h = getHandlers(registry, 'tools');
      const result = await h.check?.(mockCtx);

      expect(result).toEqual({
        orphanedRows: [
          {
            table: 'work_app_github_mcp_tool_repository_access',
            id: 'access-2',
            referencedEntityId: 'tool-deleted',
          },
        ],
      });
    });

    it('context_configs check detects orphaned cache entries', async () => {
      vi.mocked(listContextConfigIdsByProject).mockReturnValue(
        vi.fn().mockResolvedValue(['cc-1']) as any
      );
      vi.mocked(listContextCacheByProject).mockReturnValue(
        vi.fn().mockResolvedValue([
          { id: 'cache-1', contextConfigId: 'cc-1' },
          { id: 'cache-2', contextConfigId: 'cc-deleted' },
        ]) as any
      );

      const h = getHandlers(registry, 'context_configs');
      const result = await h.check?.(mockCtx);

      expect(result).toEqual({
        orphanedRows: [
          {
            table: 'context_cache',
            id: 'cache-2',
            referencedEntityId: 'cc-deleted',
          },
        ],
      });
    });

    it('agent check detects orphaned API keys and Slack configs', async () => {
      vi.mocked(listAgentIdsByProject).mockReturnValue(
        vi.fn().mockResolvedValue(['agent-1']) as any
      );
      vi.mocked(listApiKeysByProject).mockReturnValue(
        vi.fn().mockResolvedValue([
          { id: 'key-1', agentId: 'agent-1' },
          { id: 'key-2', agentId: 'agent-deleted' },
        ]) as any
      );
      vi.mocked(listSlackChannelAgentConfigsByProject).mockReturnValue(
        vi.fn().mockResolvedValue([{ id: 'slack-1', agentId: 'agent-deleted' }]) as any
      );

      const h = getHandlers(registry, 'agent');
      const result = await h.check?.(mockCtx);

      expect(result).toEqual({
        orphanedRows: [
          {
            table: 'api_keys',
            id: 'key-2',
            referencedEntityId: 'agent-deleted',
          },
          {
            table: 'work_app_slack_channel_agent_configs',
            id: 'slack-1',
            referencedEntityId: 'agent-deleted',
          },
        ],
      });
    });
  });
});
