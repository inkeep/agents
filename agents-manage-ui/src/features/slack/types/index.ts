export interface SlackWorkspace {
  ok: boolean;
  teamId?: string;
  teamName?: string;
  teamDomain?: string;
  enterpriseId?: string;
  enterpriseName?: string;
  isEnterpriseInstall?: boolean;
  botUserId?: string;
  botScopes?: string;
  installerUserId?: string;
  installedAt?: string;
  connectionId?: string;
  error?: string;
}

export type SlackNotificationAction = 'connected' | 'disconnected' | 'installed' | 'error' | 'info';

export interface SlackNotification {
  type: 'success' | 'error';
  message: string;
  action?: SlackNotificationAction;
}
