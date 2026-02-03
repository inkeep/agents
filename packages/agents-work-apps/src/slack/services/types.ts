import type { MessageAttachment } from '@slack/types';

export interface SlackCommandPayload {
  command: string;
  text: string;
  userId: string;
  userName: string;
  teamId: string;
  teamDomain: string;
  enterpriseId?: string;
  channelId: string;
  channelName: string;
  responseUrl: string;
  triggerId: string;
}

export interface SlackCommandResponse {
  response_type?: 'ephemeral' | 'in_channel';
  text?: string;
  blocks?: unknown[];
  attachments?: MessageAttachment[];
  replace_original?: boolean;
  delete_original?: boolean;
}

export interface SlackUserConnection {
  connectionId: string;
  appUserId: string;
  appUserEmail: string;
  slackDisplayName: string;
  linkedAt: string;
  tenantId?: string;
  slackUserId?: string;
  slackTeamId?: string;
  inkeepSessionToken?: string;
  inkeepSessionExpiresAt?: string;
  defaultAgent?: string;
}
