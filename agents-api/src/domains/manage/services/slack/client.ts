import { WebClient } from '@slack/web-api';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';

const logger = getLogger('slack-client');

let webClient: WebClient | null = null;

export function getSlackClient(token?: string): WebClient {
  if (token) {
    return new WebClient(token);
  }

  if (!webClient) {
    const botToken = env.SLACK_BOT_TOKEN;
    if (!botToken) {
      logger.warn({}, 'No SLACK_BOT_TOKEN configured, creating client without token');
    }
    webClient = new WebClient(botToken);
  }

  return webClient;
}

export async function getSlackUserInfo(client: WebClient, userId: string) {
  try {
    const result = await client.users.info({ user: userId });
    if (result.ok && result.user) {
      return {
        id: result.user.id,
        name: result.user.name,
        realName: result.user.real_name,
        displayName: result.user.profile?.display_name,
        email: result.user.profile?.email,
        isAdmin: result.user.is_admin,
        isOwner: result.user.is_owner,
        avatar: result.user.profile?.image_72,
      };
    }
    return null;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch Slack user info');
    return null;
  }
}

export async function getSlackTeamInfo(client: WebClient) {
  try {
    const result = await client.team.info();
    if (result.ok && result.team) {
      return {
        id: result.team.id,
        name: result.team.name,
        domain: result.team.domain,
        icon: result.team.icon?.image_68,
        url: result.team.url,
      };
    }
    return null;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch Slack team info');
    return null;
  }
}

export async function getSlackChannels(client: WebClient, limit = 20) {
  try {
    const result = await client.conversations.list({
      types: 'public_channel',
      limit,
    });
    if (result.ok && result.channels) {
      return result.channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        memberCount: ch.num_members,
        isBotMember: ch.is_member,
      }));
    }
    return [];
  } catch (error) {
    logger.error({ error }, 'Failed to fetch Slack channels');
    return [];
  }
}

export async function postMessage(
  client: WebClient,
  channel: string,
  text: string,
  blocks?: unknown[]
) {
  try {
    const result = await client.chat.postMessage({
      channel,
      text,
      blocks: blocks as Parameters<WebClient['chat']['postMessage']>[0]['blocks'],
    });
    return result;
  } catch (error) {
    logger.error({ error, channel }, 'Failed to post Slack message');
    throw error;
  }
}
