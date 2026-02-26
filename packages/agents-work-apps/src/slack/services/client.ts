/**
 * Slack Web API Client Utilities
 *
 * Wrapper functions for common Slack Web API operations.
 * Tokens are fetched from Nango at runtime and passed to these functions.
 */

import { WebClient } from '@slack/web-api';
import { getLogger } from '../../logger';

const logger = getLogger('slack-client');

interface PaginateSlackOptions<TResponse, TItem> {
  fetchPage: (cursor?: string) => Promise<TResponse>;
  extractItems: (response: TResponse) => TItem[];
  getNextCursor: (response: TResponse) => string | undefined;
  limit?: number;
}

async function paginateSlack<TResponse, TItem>({
  fetchPage,
  extractItems,
  getNextCursor,
  limit,
}: PaginateSlackOptions<TResponse, TItem>): Promise<TItem[]> {
  const items: TItem[] = [];
  let cursor: string | undefined;

  do {
    const response = await fetchPage(cursor);
    items.push(...extractItems(response));
    cursor = getNextCursor(response);
  } while (cursor && (limit === undefined || items.length < limit));

  return limit !== undefined ? items.slice(0, limit) : items;
}

/**
 * Create a Slack WebClient with the provided bot token.
 *
 * Built-in retry behavior:
 * - **Connection errors**: 5 retries in 5 minutes (exponential backoff + jitter).
 *
 * @param token - Bot OAuth token from Nango connection
 * @returns Configured Slack WebClient instance
 */
export function getSlackClient(token: string): WebClient {
  return new WebClient(token);
}

/**
 * Fetch user profile information from Slack.
 *
 * @param client - Authenticated Slack WebClient
 * @param userId - Slack user ID (e.g., U0ABC123)
 * @returns User profile object, or null if not found
 */
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
        tz: result.user.tz,
      };
    }
    return null;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch Slack user info');
    return null;
  }
}

/**
 * Fetch workspace (team) information from Slack.
 *
 * @param client - Authenticated Slack WebClient
 * @returns Team info object, or null if not available
 */
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

/**
 * Fetch channel information from Slack.
 *
 * @param client - Authenticated Slack WebClient
 * @param channelId - Slack channel ID (e.g., C0ABC123)
 * @returns Channel info object, or null if not found
 */
export async function getSlackChannelInfo(client: WebClient, channelId: string) {
  try {
    const result = await client.conversations.info({ channel: channelId });
    if (result.ok && result.channel) {
      return {
        id: result.channel.id,
        name: result.channel.name,
        topic: result.channel.topic?.value,
        purpose: result.channel.purpose?.value,
        isPrivate: result.channel.is_private ?? false,
        isShared: result.channel.is_shared ?? result.channel.is_ext_shared ?? false,
        isMember: result.channel.is_member ?? false,
      };
    }
    return null;
  } catch (error) {
    logger.error({ error, channelId }, 'Failed to fetch Slack channel info');
    return null;
  }
}

/**
 * List channels in the workspace (public, private, and shared).
 *
 * Note: The bot must be a member of private channels to see them.
 * Users can invite the bot with `/invite @BotName` in the private channel.
 *
 * @param client - Authenticated Slack WebClient
 * @param limit - Maximum number of channels to return. Fetches in pages of up to 200 until the limit is reached or all channels are returned.
 * @returns Array of channel objects with id, name, member count, and privacy status
 */
export async function getSlackChannels(client: WebClient, limit = 200) {
  return paginateSlack({
    fetchPage: (cursor) =>
      client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: Math.min(limit, 200),
        cursor,
      }),
    extractItems: (result) => {
      if (!result.ok) {
        logger.warn(
          { error: result.error },
          'Slack API returned ok: false during channel pagination'
        );
        return [];
      }
      return result.channels
        ? result.channels.map((ch) => ({
            id: ch.id,
            name: ch.name,
            memberCount: ch.num_members,
            isBotMember: ch.is_member,
            isPrivate: ch.is_private ?? false,
            isShared: ch.is_shared ?? ch.is_ext_shared ?? false,
          }))
        : [];
    },
    getNextCursor: (result) => result.response_metadata?.next_cursor || undefined,
    limit,
  });
}

// num_members is returned by the Slack API but missing from the SDK's UsersConversationsResponse type.
// This helper safely extracts it with a runtime type check.
function safeNumMembers(ch: unknown): number | undefined {
  const record = ch as Record<string, unknown>;
  return typeof record.num_members === 'number' ? record.num_members : undefined;
}

/**
 * Fetch only channels where the bot is a member using the `users.conversations` API.
 *
 * Compared to `getSlackChannels()` (which uses `conversations.list` and returns ALL visible channels),
 * this function returns only channels the bot has been added to. It uses Tier 3 rate limits (50+ req/min)
 * and supports up to 999 items per page, making it significantly more efficient for large workspaces.
 *
 * Use this for the Channel Defaults UI. Keep `getSlackChannels()` for other purposes (e.g., health checks).
 *
 * @param client - Authenticated Slack WebClient
 * @param limit - Maximum number of channels to return. Fetches in pages of up to 999 until the limit is reached or all channels are returned.
 * @returns Array of channel objects with id, name, member count, and privacy status
 */
export async function getBotMemberChannels(client: WebClient, limit = 999) {
  return paginateSlack({
    fetchPage: (cursor) =>
      client.users.conversations({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: Math.min(limit, 999),
        cursor,
      }),
    extractItems: (result) => {
      if (!result.ok) {
        logger.warn(
          { error: result.error },
          'Slack API returned ok: false during bot member channel pagination'
        );
        return [];
      }
      return result.channels
        ? result.channels.map((ch) => ({
            id: ch.id,
            name: ch.name,
            memberCount: safeNumMembers(ch),
            isPrivate: ch.is_private ?? false,
            isShared: ch.is_shared ?? ch.is_ext_shared ?? false,
          }))
        : [];
    },
    getNextCursor: (result) => result.response_metadata?.next_cursor || undefined,
    limit,
  });
}

/**
 * Post a message to a Slack channel.
 *
 * @param client - Authenticated Slack WebClient
 * @param channel - Channel ID to post to
 * @param text - Fallback text for notifications
 * @param blocks - Optional Block Kit blocks for rich formatting
 * @returns Slack API response with message timestamp
 */
export async function postMessage(
  client: WebClient,
  channel: string,
  text: string,
  blocks?: unknown[]
) {
  try {
    const args: { channel: string; text: string; blocks?: unknown[] } = { channel, text };
    if (blocks) {
      args.blocks = blocks;
    }
    const result = await client.chat.postMessage(
      args as Parameters<typeof client.chat.postMessage>[0]
    );
    return result;
  } catch (error) {
    logger.error({ error, channel }, 'Failed to post Slack message');
    throw error;
  }
}

/**
 * Post a message as a reply in a thread.
 *
 * @param client - Authenticated Slack WebClient
 * @param channel - Channel ID containing the thread
 * @param threadTs - Thread parent message timestamp
 * @param text - Fallback text for notifications
 * @param blocks - Optional Block Kit blocks for rich formatting
 * @returns Slack API response with message timestamp
 */
export async function postMessageInThread(
  client: WebClient,
  channel: string,
  threadTs: string,
  text: string,
  blocks?: unknown[]
) {
  try {
    const args: { channel: string; text: string; thread_ts: string; blocks?: unknown[] } = {
      channel,
      text,
      thread_ts: threadTs,
    };
    if (blocks) {
      args.blocks = blocks;
    }
    const result = await client.chat.postMessage(
      args as Parameters<typeof client.chat.postMessage>[0]
    );
    return result;
  } catch (error) {
    logger.error({ error, channel, threadTs }, 'Failed to post Slack message in thread');
    throw error;
  }
}

/**
 * Check if a user is a member of a Slack channel.
 *
 * Uses conversations.members to verify membership. Handles pagination
 * for channels with many members.
 *
 * @param client - Authenticated Slack WebClient
 * @param channelId - Channel ID to check membership for
 * @param userId - Slack user ID to check
 * @returns true if user is a member, false otherwise
 */
export async function checkUserIsChannelMember(
  client: WebClient,
  channelId: string,
  userId: string
): Promise<boolean> {
  const members = await paginateSlack({
    fetchPage: (cursor) =>
      client.conversations.members({
        channel: channelId,
        limit: 200,
        cursor,
      }),
    extractItems: (result) => {
      if (!result.ok) {
        logger.warn(
          { error: result.error },
          'Slack API returned ok: false during members pagination'
        );
        return [];
      }
      return result.members ?? [];
    },
    getNextCursor: (result) => result.response_metadata?.next_cursor || undefined,
  });
  return members.includes(userId);
}

/**
 * Revoke a Slack bot token.
 *
 * This should be called when uninstalling a workspace to ensure
 * the token can no longer be used to make API calls.
 *
 * @param token - Bot OAuth token to revoke
 * @returns true if revocation succeeded or token was already invalid
 */
export async function revokeSlackToken(token: string): Promise<boolean> {
  try {
    const client = new WebClient(token);
    const result = await client.auth.revoke();

    if (result.ok) {
      logger.info({}, 'Successfully revoked Slack token');
      return true;
    }

    logger.warn({ error: result.error }, 'Token revocation returned non-ok status');
    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('token_revoked') || errorMessage.includes('invalid_auth')) {
      logger.info({}, 'Token already revoked or invalid');
      return true;
    }
    logger.error({ error }, 'Failed to revoke Slack token');
    return false;
  }
}
