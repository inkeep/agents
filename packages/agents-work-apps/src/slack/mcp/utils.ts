import type { SlackMcpToolAccessConfig } from '@inkeep/agents-core';
import { listWorkAppSlackWorkspacesByTenant } from '@inkeep/agents-core';
import type { WebClient } from '@slack/web-api';
import runDbClient from '../../db/runDbClient';
import { isSlackDevMode, loadSlackDevConfig } from '../services/dev-config';
import { getConnectionAccessToken } from '../services/nango';

const MAX_PAGES = 10;

export async function resolveChannelId(client: WebClient, channelInput: string): Promise<string> {
  if (!channelInput.startsWith('#')) {
    return channelInput;
  }

  const channelName = channelInput.slice(1);

  let cursor: string | undefined;
  let pageCount = 0;
  do {
    if (pageCount >= MAX_PAGES) {
      throw new Error(
        `Channel not found within first ${MAX_PAGES * 200} channels: ${channelInput}`
      );
    }

    const result = await client.conversations.list({
      types: 'public_channel,private_channel',
      exclude_archived: true,
      limit: 200,
      cursor,
    });

    const match = result.channels?.find((ch) => ch.name === channelName);
    if (match?.id) {
      return match.id;
    }

    cursor = result.response_metadata?.next_cursor || undefined;
    pageCount++;
  } while (cursor);

  throw new Error(`Channel not found: ${channelInput}`);
}

export async function resolveWorkspaceToken(tenantId: string): Promise<string> {
  if (isSlackDevMode()) {
    const devConfig = loadSlackDevConfig();
    if (devConfig?.botToken) {
      return devConfig.botToken;
    }
    throw new Error('Slack dev mode enabled but no botToken found in .slack-dev.json');
  }

  const workspaces = await listWorkAppSlackWorkspacesByTenant(runDbClient)(tenantId);
  if (workspaces.length === 0) {
    throw new Error(`No Slack workspace installed for tenant ${tenantId}`);
  }

  const workspace = workspaces[0];
  const botToken = await getConnectionAccessToken(workspace.nangoConnectionId);
  if (!botToken) {
    throw new Error(`Failed to retrieve bot token for workspace ${workspace.slackTeamId}`);
  }

  return botToken;
}

export function validateChannelAccess(
  channelId: string,
  config: SlackMcpToolAccessConfig
): { allowed: boolean; reason?: string } {
  if (channelId.startsWith('D')) {
    if (!config.dmEnabled) {
      return { allowed: false, reason: 'DM access is not enabled for this tool' };
    }
    return { allowed: true };
  }

  if (config.channelAccessMode === 'all') {
    return { allowed: true };
  }

  if (config.channelIds.includes(channelId)) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'Channel not in allowed list' };
}
