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
  agentName: string;
  projectId: string;
  projectName: string;
}

export const slackApi = {
  getInstallUrl(): string {
    return `${getApiUrl()}/work-apps/slack/install`;
  },

  async listWorkspaceInstallations(): Promise<{
    workspaces: SlackWorkspaceInstallation[];
  }> {
    const response = await fetch(`${getApiUrl()}/work-apps/slack/workspaces`);
    if (!response.ok) {
      return { workspaces: [] };
    }
    return response.json();
  },

  async uninstallWorkspace(connectionId: string): Promise<{ success: boolean }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/workspaces/${encodeURIComponent(connectionId)}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to uninstall workspace');
    }
    return response.json();
  },

  async listAgents(tenantId: string): Promise<{
    agents: Array<{
      id: string;
      name: string | null;
      projectId: string;
      projectName: string | null;
    }>;
  }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/agents?tenantId=${encodeURIComponent(tenantId)}`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch agents');
    }
    return response.json();
  },

  async setWorkspaceDefaultAgent(params: {
    teamId: string;
    defaultAgent: DefaultAgentConfig;
  }): Promise<{ success: boolean }> {
    const response = await fetch(`${getApiUrl()}/work-apps/slack/workspace-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
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
      `${getApiUrl()}/work-apps/slack/workspace-settings?teamId=${encodeURIComponent(teamId)}`
    );
    if (!response.ok) {
      return {};
    }
    return response.json();
  },

  async confirmLink(params: { code: string; userId: string; userEmail?: string }): Promise<{
    success: boolean;
    linkId?: string;
    slackUsername?: string;
    slackTeamId?: string;
    error?: string;
  }> {
    const response = await fetch(`${getApiUrl()}/work-apps/slack/confirm-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to confirm link' };
    }
    return { success: true, ...data };
  },

  async getLinkStatus(params: { slackUserId: string; slackTeamId: string }): Promise<{
    linked: boolean;
    linkId?: string;
    linkedAt?: string;
    slackUsername?: string;
  }> {
    const response = await fetch(
      `${getApiUrl()}/work-apps/slack/link-status?slackUserId=${encodeURIComponent(params.slackUserId)}&slackTeamId=${encodeURIComponent(params.slackTeamId)}`
    );
    if (!response.ok) {
      return { linked: false };
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
      `${getApiUrl()}/work-apps/slack/linked-users?teamId=${encodeURIComponent(teamId)}`
    );
    if (!response.ok) {
      return { linkedUsers: [] };
    }
    return response.json();
  },
};
