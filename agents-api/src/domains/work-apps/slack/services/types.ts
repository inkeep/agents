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

export interface SlackEventPayload {
  type: string;
  challenge?: string;
  event?: {
    type: string;
    user?: string;
    channel?: string;
    text?: string;
    ts?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface SlackInteractivePayload {
  type: 'block_actions' | 'view_submission' | 'view_closed' | 'shortcut' | 'message_action';
  user: {
    id: string;
    username: string;
    name: string;
    team_id: string;
  };
  trigger_id: string;
  response_url?: string;
  actions?: Array<{
    type: string;
    action_id: string;
    block_id: string;
    value?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
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

export interface SlackConfig {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
  appUrl: string;
  botToken?: string;
}
