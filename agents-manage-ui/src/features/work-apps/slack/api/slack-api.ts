const getApiUrl = () => process.env.NEXT_PUBLIC_INKEEP_AGENTS_API_URL || 'http://localhost:3002';

export interface SlackWorkspaceInstallation {
  connectionId: string;
  teamId: string;
  teamName?: string;
  tenantId: string;
  hasDefaultAgent: boolean;
  defaultAgentName?: string;
}

export interface DefaultAgentConfig {
  agentId: string;
  agentName?: string;
  projectId: string;
  projectName?: string;
}

export const slackApi = {
  getInstallUrl(): string {
    return `${getApiUrl()}/work-apps/slack/install`;
  },

  async listWorkspaceInstallations(): Promise<{
    workspaces: SlackWorkspaceInstallation[];
  }> {
    const response = await fetch(`${getApiUrl()}/work-apps/slack/workspaces`, {
      credentials: 'include',
    });
    if (!response.ok) {
      return { workspaces: [] };
    }
    return response.json();
  },

  async uninstallWorkspace(connectionId: string): Promise<{ success: boolean }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/workspaces/${encodeURIComponent(connectionId)}`,
      { method: 'DELETE', credentials: 'include' }
    );
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMessage =
        typeof errorBody?.error === 'string'
          ? errorBody.error
          : errorBody?.error?.message ||
            JSON.stringify(errorBody) ||
            'Failed to uninstall workspace';
      throw new Error(errorMessage);
    }
    return response.json();
  },

  async setWorkspaceDefaultAgent(params: {
    teamId: string;
    defaultAgent: DefaultAgentConfig;
  }): Promise<{ success: boolean }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/workspaces/${encodeURIComponent(params.teamId)}/settings`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ defaultAgent: params.defaultAgent }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to save workspace settings');
    }
    return response.json();
  },

  async getWorkspaceSettings(teamId: string): Promise<{
    defaultAgent?: DefaultAgentConfig;
  }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/workspaces/${encodeURIComponent(teamId)}/settings`,
      { credentials: 'include' }
    );
    if (!response.ok) {
      return {};
    }
    return response.json();
  },

  async verifyLinkToken(params: { token: string; userId: string; userEmail?: string }): Promise<{
    success: boolean;
    linkId?: string;
    slackUsername?: string;
    slackTeamId?: string;
    tenantId?: string;
    error?: string;
  }> {
    const response = await fetch(`${getApiUrl()}/work-apps/slack/users/link/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to verify link token' };
    }
    return { success: true, ...data };
  },

  async unlinkUser(params: {
    slackUserId: string;
    slackTeamId: string;
    tenantId?: string;
  }): Promise<{ success: boolean }> {
    const response = await fetch(`${getApiUrl()}/work-apps/slack/users/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to unlink user');
    }
    return response.json();
  },

  async getLinkedUsers(teamId: string): Promise<{
    linkedUsers: Array<{
      id: string;
      slackUserId: string;
      slackTeamId: string;
      slackUsername?: string;
      slackEmail?: string;
      userId: string;
      linkedAt: string;
      lastUsedAt?: string;
    }>;
  }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/workspaces/${encodeURIComponent(teamId)}/users`,
      { credentials: 'include' }
    );
    if (!response.ok) {
      return { linkedUsers: [] };
    }
    return response.json();
  },

  async listChannels(teamId: string): Promise<{
    channels: Array<{
      id: string;
      name: string;
      isPrivate: boolean;
      isShared: boolean;
      memberCount?: number;
      hasAgentConfig: boolean;
      agentConfig?: {
        projectId: string;
        agentId: string;
        agentName?: string;
      };
    }>;
  }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/workspaces/${encodeURIComponent(teamId)}/channels`,
      { credentials: 'include' }
    );
    if (!response.ok) {
      return { channels: [] };
    }
    return response.json();
  },

  async setChannelDefaultAgent(params: {
    teamId: string;
    channelId: string;
    agentConfig: {
      projectId: string;
      agentId: string;
      agentName?: string;
    };
    channelName?: string;
  }): Promise<{ success: boolean; configId: string }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/workspaces/${encodeURIComponent(params.teamId)}/channels/${encodeURIComponent(params.channelId)}/settings`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agentConfig: params.agentConfig,
          channelName: params.channelName,
        }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to set channel agent');
    }
    return response.json();
  },

  async removeChannelConfig(teamId: string, channelId: string): Promise<{ success: boolean }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/workspaces/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/settings`,
      { method: 'DELETE', credentials: 'include' }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to remove channel config');
    }
    return response.json();
  },

  async bulkSetChannelAgents(
    teamId: string,
    channelIds: string[],
    agentConfig: { projectId: string; agentId: string; agentName?: string }
  ): Promise<{
    success: boolean;
    updated: number;
    failed: number;
    errors?: Array<{ channelId: string; error: string }>;
  }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/workspaces/${encodeURIComponent(teamId)}/channels/bulk`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ channelIds, agentConfig }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to bulk update channels');
    }
    return response.json();
  },

  async bulkRemoveChannelConfigs(
    teamId: string,
    channelIds: string[]
  ): Promise<{ success: boolean; removed: number }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/workspaces/${encodeURIComponent(teamId)}/channels/bulk`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ channelIds }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to bulk remove channel configs');
    }
    return response.json();
  },

  async checkWorkspaceHealth(teamId: string): Promise<{
    healthy: boolean;
    botId?: string;
    botName?: string;
    teamId?: string;
    teamName?: string;
    permissions: {
      canPostMessages: boolean;
      canReadChannels: boolean;
      canReadHistory: boolean;
    };
    error?: string;
  }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/workspaces/${encodeURIComponent(teamId)}/health`,
      { credentials: 'include' }
    );
    if (!response.ok) {
      return {
        healthy: false,
        permissions: {
          canPostMessages: false,
          canReadChannels: false,
          canReadHistory: false,
        },
        error: 'Failed to check workspace health',
      };
    }
    return response.json();
  },

  async sendTestMessage(
    teamId: string,
    channelId: string,
    message?: string
  ): Promise<{
    success: boolean;
    messageTs?: string;
    error?: string;
  }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/workspaces/${encodeURIComponent(teamId)}/test-message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ channelId, message }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      return { success: false, error: error.error || 'Failed to send test message' };
    }
    return response.json();
  },

  async exportLinkedUsers(teamId: string): Promise<string> {
    const result = await this.getLinkedUsers(teamId);
    const users = result.linkedUsers;

    if (users.length === 0) {
      return 'No linked users to export';
    }

    const headers = ['Slack Username', 'Slack Email', 'Slack User ID', 'Linked At', 'Last Used'];
    const rows = users.map((user) => [
      user.slackUsername || '',
      user.slackEmail || '',
      user.slackUserId,
      new Date(user.linkedAt).toISOString(),
      user.lastUsedAt ? new Date(user.lastUsedAt).toISOString() : '',
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    return csvContent;
  },
};
