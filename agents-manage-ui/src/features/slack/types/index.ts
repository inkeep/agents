export interface SlackWorkspace {
  ok: boolean;
  teamId?: string;
  teamName?: string;
  teamDomain?: string;
  enterpriseId?: string;
  enterpriseName?: string;
  isEnterpriseInstall?: boolean;
  botUserId?: string;
  botToken?: string;
  botScopes?: string;
  installerUserId?: string;
  installedAt?: string;
  error?: string;
}

export interface SlackUserLink {
  slackUserId: string;
  slackTeamId: string;
  slackUsername?: string;
  slackDisplayName?: string;
  slackEmail?: string;
  slackAvatarUrl?: string;
  isSlackAdmin?: boolean;
  isSlackOwner?: boolean;
  enterpriseId?: string;
  enterpriseName?: string;
  appUserId: string;
  appUserEmail?: string;
  appUserName?: string;
  nangoConnectionId: string;
  isLinked: boolean;
  linkedAt?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  memberCount?: number;
  isBotMember?: boolean;
}

export interface SlackTeamInfo {
  id: string;
  name: string;
  domain: string;
  icon?: string;
  url?: string;
}

export interface SlackWorkspaceInfo {
  team: SlackTeamInfo | null;
  channels: SlackChannel[];
}

export type SlackNotificationAction = 'connected' | 'disconnected' | 'installed' | 'error' | 'info';

export interface SlackNotification {
  type: 'success' | 'error';
  message: string;
  action?: SlackNotificationAction;
}
