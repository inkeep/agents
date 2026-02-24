/**
 * Tests for Slack Agent Resolution Service
 *
 * Tests cover:
 * - Priority resolution: channel > workspace (all admin-controlled)
 * - Edge cases when no config exists
 * - getAgentConfigSources for status display
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core', () => ({
  findWorkAppSlackChannelAgentConfig: vi.fn(() => vi.fn()),
}));

vi.mock('../../db/runDbClient', () => ({
  default: {},
}));

vi.mock('../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../slack/services/nango', () => ({
  getWorkspaceDefaultAgentFromNango: vi.fn(),
}));

vi.mock('../../slack/services/events/utils', () => ({
  fetchAgentsForProject: vi.fn().mockResolvedValue([]),
  fetchProjectsForTenant: vi.fn().mockResolvedValue([]),
}));

describe('Agent Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveEffectiveAgent', () => {
    it('should return channel config when channel default exists', async () => {
      const { findWorkAppSlackChannelAgentConfig } = await import('@inkeep/agents-core');
      vi.mocked(findWorkAppSlackChannelAgentConfig).mockReturnValue(
        vi.fn().mockResolvedValue({
          agentId: 'channel-agent',
          projectId: 'channel-project',
          agentName: 'Channel Agent',
          enabled: true,
          grantAccessToMembers: true,
        })
      );

      const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');

      const result = await resolveEffectiveAgent({
        tenantId: 'tenant-1',
        teamId: 'T123',
        channelId: 'C123',
        userId: 'U123',
      });

      expect(result).toEqual({
        projectId: 'channel-project',
        agentId: 'channel-agent',
        agentName: 'Channel Agent',
        source: 'channel',
        grantAccessToMembers: true,
      });
    });

    it('should fall back to workspace config when no channel default', async () => {
      const { findWorkAppSlackChannelAgentConfig } = await import('@inkeep/agents-core');
      const { getWorkspaceDefaultAgentFromNango } = await import('../../slack/services/nango');

      vi.mocked(findWorkAppSlackChannelAgentConfig).mockReturnValue(
        vi.fn().mockResolvedValue(null)
      );
      vi.mocked(getWorkspaceDefaultAgentFromNango).mockResolvedValue({
        agentId: 'workspace-agent',
        projectId: 'workspace-project',
        agentName: 'Workspace Agent',
        projectName: 'Workspace Project',
      });

      const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');

      const result = await resolveEffectiveAgent({
        tenantId: 'tenant-1',
        teamId: 'T123',
        channelId: 'C123',
        userId: 'U123',
      });

      expect(result).toEqual({
        projectId: 'workspace-project',
        projectName: 'Workspace Project',
        agentId: 'workspace-agent',
        agentName: 'Workspace Agent',
        source: 'workspace',
        grantAccessToMembers: true,
      });
    });

    it('should propagate explicit grantAccessToMembers: false from workspace config', async () => {
      const { findWorkAppSlackChannelAgentConfig } = await import('@inkeep/agents-core');
      const { getWorkspaceDefaultAgentFromNango } = await import('../../slack/services/nango');

      vi.mocked(findWorkAppSlackChannelAgentConfig).mockReturnValue(
        vi.fn().mockResolvedValue(null)
      );
      vi.mocked(getWorkspaceDefaultAgentFromNango).mockResolvedValue({
        agentId: 'workspace-agent',
        projectId: 'workspace-project',
        agentName: 'Workspace Agent',
        grantAccessToMembers: false,
      });

      const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');

      const result = await resolveEffectiveAgent({
        tenantId: 'tenant-1',
        teamId: 'T123',
        channelId: 'C123',
        userId: 'U123',
      });

      expect(result).toEqual({
        projectId: 'workspace-project',
        agentId: 'workspace-agent',
        agentName: 'Workspace Agent',
        source: 'workspace',
        grantAccessToMembers: false,
      });
    });

    it('should return null when no config exists at any level', async () => {
      const { findWorkAppSlackChannelAgentConfig } = await import('@inkeep/agents-core');
      const { getWorkspaceDefaultAgentFromNango } = await import('../../slack/services/nango');

      vi.mocked(findWorkAppSlackChannelAgentConfig).mockReturnValue(
        vi.fn().mockResolvedValue(null)
      );
      vi.mocked(getWorkspaceDefaultAgentFromNango).mockResolvedValue(null);

      const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');

      const result = await resolveEffectiveAgent({
        tenantId: 'tenant-1',
        teamId: 'T123',
        channelId: 'C123',
        userId: 'U123',
      });

      expect(result).toBeNull();
    });

    it('should skip channel check when channelId is not provided', async () => {
      const { findWorkAppSlackChannelAgentConfig } = await import('@inkeep/agents-core');
      const { getWorkspaceDefaultAgentFromNango } = await import('../../slack/services/nango');

      vi.mocked(getWorkspaceDefaultAgentFromNango).mockResolvedValue({
        agentId: 'workspace-agent',
        projectId: 'workspace-project',
      });

      const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');

      const result = await resolveEffectiveAgent({
        tenantId: 'tenant-1',
        teamId: 'T123',
        userId: 'U123',
      });

      expect(result?.source).toBe('workspace');
      expect(findWorkAppSlackChannelAgentConfig).not.toHaveBeenCalled();
    });

    it('should pass grantAccessToMembers: false from channel config', async () => {
      const { findWorkAppSlackChannelAgentConfig } = await import('@inkeep/agents-core');
      vi.mocked(findWorkAppSlackChannelAgentConfig).mockReturnValue(
        vi.fn().mockResolvedValue({
          agentId: 'channel-agent',
          projectId: 'channel-project',
          agentName: 'Channel Agent',
          enabled: true,
          grantAccessToMembers: false,
        })
      );

      const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');

      const result = await resolveEffectiveAgent({
        tenantId: 'tenant-1',
        teamId: 'T123',
        channelId: 'C123',
        userId: 'U123',
      });

      expect(result).toEqual({
        projectId: 'channel-project',
        agentId: 'channel-agent',
        agentName: 'Channel Agent',
        source: 'channel',
        grantAccessToMembers: false,
      });
    });

    it('should skip disabled channel config', async () => {
      const { findWorkAppSlackChannelAgentConfig } = await import('@inkeep/agents-core');
      const { getWorkspaceDefaultAgentFromNango } = await import('../../slack/services/nango');

      vi.mocked(findWorkAppSlackChannelAgentConfig).mockReturnValue(
        vi.fn().mockResolvedValue({
          agentId: 'channel-agent',
          projectId: 'channel-project',
          enabled: false,
        })
      );
      vi.mocked(getWorkspaceDefaultAgentFromNango).mockResolvedValue({
        agentId: 'workspace-agent',
        projectId: 'workspace-project',
      });

      const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');

      const result = await resolveEffectiveAgent({
        tenantId: 'tenant-1',
        teamId: 'T123',
        channelId: 'C123',
        userId: 'U123',
      });

      expect(result?.source).toBe('workspace');
    });

    it('should enrich projectName from fetchProjectsForTenant when missing', async () => {
      const { findWorkAppSlackChannelAgentConfig } = await import('@inkeep/agents-core');
      const { getWorkspaceDefaultAgentFromNango } = await import('../../slack/services/nango');
      const { fetchProjectsForTenant } = await import('../../slack/services/events/utils');

      vi.mocked(findWorkAppSlackChannelAgentConfig).mockReturnValue(
        vi.fn().mockResolvedValue(null)
      );
      vi.mocked(getWorkspaceDefaultAgentFromNango).mockResolvedValue({
        agentId: 'workspace-agent',
        projectId: 'workspace-project',
        agentName: 'Workspace Agent',
      });
      vi.mocked(fetchProjectsForTenant).mockResolvedValue([
        { id: 'workspace-project', name: 'My Cool Project' },
      ]);

      const { resolveEffectiveAgent } = await import('../../slack/services/agent-resolution');

      const result = await resolveEffectiveAgent({
        tenantId: 'tenant-1',
        teamId: 'T123',
        channelId: 'C123',
        userId: 'U123',
      });

      expect(result?.projectName).toBe('My Cool Project');
    });
  });

  describe('getAgentConfigSources', () => {
    it('should return all config sources and effective choice', async () => {
      const { findWorkAppSlackChannelAgentConfig } = await import('@inkeep/agents-core');
      const { getWorkspaceDefaultAgentFromNango } = await import('../../slack/services/nango');
      const { fetchProjectsForTenant } = await import('../../slack/services/events/utils');

      vi.mocked(findWorkAppSlackChannelAgentConfig).mockReturnValue(
        vi.fn().mockResolvedValue({
          agentId: 'channel-agent',
          projectId: 'channel-project',
          enabled: true,
        })
      );
      vi.mocked(getWorkspaceDefaultAgentFromNango).mockResolvedValue({
        agentId: 'workspace-agent',
        projectId: 'workspace-project',
      });
      vi.mocked(fetchProjectsForTenant).mockResolvedValue([
        { id: 'channel-project', name: 'Channel Project' },
      ]);

      const { getAgentConfigSources } = await import('../../slack/services/agent-resolution');

      const result = await getAgentConfigSources({
        tenantId: 'tenant-1',
        teamId: 'T123',
        channelId: 'C123',
        userId: 'U123',
      });

      expect(result.channelConfig).not.toBeNull();
      expect(result.channelConfig?.agentId).toBe('channel-agent');
      expect(result.workspaceConfig).not.toBeNull();
      expect(result.workspaceConfig?.agentId).toBe('workspace-agent');
      expect(result.effective?.agentId).toBe('channel-agent');
      expect(result.effective?.source).toBe('channel');
      expect(result.effective?.projectName).toBe('Channel Project');
    });

    it('should set effective to workspaceConfig when no channel config', async () => {
      const { findWorkAppSlackChannelAgentConfig } = await import('@inkeep/agents-core');
      const { getWorkspaceDefaultAgentFromNango } = await import('../../slack/services/nango');

      vi.mocked(findWorkAppSlackChannelAgentConfig).mockReturnValue(
        vi.fn().mockResolvedValue(null)
      );
      vi.mocked(getWorkspaceDefaultAgentFromNango).mockResolvedValue({
        agentId: 'workspace-agent',
        projectId: 'workspace-project',
        projectName: 'Workspace Project',
      });

      const { getAgentConfigSources } = await import('../../slack/services/agent-resolution');

      const result = await getAgentConfigSources({
        tenantId: 'tenant-1',
        teamId: 'T123',
        channelId: 'C123',
        userId: 'U123',
      });

      expect(result.channelConfig).toBeNull();
      expect(result.effective?.agentId).toBe('workspace-agent');
      expect(result.effective?.source).toBe('workspace');
      expect(result.effective?.projectName).toBe('Workspace Project');
    });

    it('should return null effective when no configs exist', async () => {
      const { findWorkAppSlackChannelAgentConfig } = await import('@inkeep/agents-core');
      const { getWorkspaceDefaultAgentFromNango } = await import('../../slack/services/nango');

      vi.mocked(findWorkAppSlackChannelAgentConfig).mockReturnValue(
        vi.fn().mockResolvedValue(null)
      );
      vi.mocked(getWorkspaceDefaultAgentFromNango).mockResolvedValue(null);

      const { getAgentConfigSources } = await import('../../slack/services/agent-resolution');

      const result = await getAgentConfigSources({
        tenantId: 'tenant-1',
        teamId: 'T123',
        channelId: 'C123',
        userId: 'U123',
      });

      expect(result.channelConfig).toBeNull();
      expect(result.workspaceConfig).toBeNull();
      expect(result.effective).toBeNull();
    });
  });
});
