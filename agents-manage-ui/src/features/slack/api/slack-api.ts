const getApiUrl = () => process.env.NEXT_PUBLIC_INKEEP_AGENTS_API_URL || 'http://localhost:3002';

export interface SlackConnectionStatus {
  connected: boolean;
  connection: {
    connectionId: string;
    appUserId: string;
    appUserEmail: string;
    slackDisplayName: string;
    linkedAt: string;
  } | null;
}

export interface SlackWorkspaceInfoResponse {
  team: {
    id: string;
    name: string;
    domain: string;
    icon?: string;
    url?: string;
  } | null;
  channels: Array<{
    id: string;
    name: string;
    memberCount?: number;
    isBotMember?: boolean;
  }>;
}

export interface CreateConnectSessionResponse {
  sessionToken: string;
}

export interface DisconnectResponse {
  success: boolean;
  connectionId?: string;
  error?: string;
}

export const slackApi = {
  async getConnectionStatus(userId: string): Promise<SlackConnectionStatus> {
    const response = await fetch(
      `${getApiUrl()}/manage/slack/status?userId=${encodeURIComponent(userId)}`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch connection status');
    }
    return response.json();
  },

  async getWorkspaceInfo(connectionId: string): Promise<SlackWorkspaceInfoResponse | null> {
    const response = await fetch(
      `${getApiUrl()}/manage/slack/workspace-info?connectionId=${encodeURIComponent(connectionId)}`
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error('Failed to fetch workspace info');
    }
    return response.json();
  },

  async createConnectSession(params: {
    userId: string;
    userEmail?: string;
    userName?: string;
    tenantId: string;
    sessionToken?: string;
    sessionExpiresAt?: string;
  }): Promise<CreateConnectSessionResponse> {
    const response = await fetch(`${getApiUrl()}/manage/slack/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      throw new Error('Failed to create connect session');
    }
    return response.json();
  },

  async disconnect(params: {
    userId?: string;
    connectionId?: string;
  }): Promise<DisconnectResponse> {
    const response = await fetch(`${getApiUrl()}/manage/slack/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to disconnect');
    }
    return response.json();
  },

  getInstallUrl(): string {
    return `${getApiUrl()}/manage/slack/install`;
  },

  async refreshSession(params: {
    userId: string;
    sessionToken: string;
    sessionExpiresAt?: string;
  }): Promise<{ success: boolean; connectionId?: string }> {
    const response = await fetch(`${getApiUrl()}/manage/slack/refresh-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to refresh session');
    }
    return response.json();
  },
};
