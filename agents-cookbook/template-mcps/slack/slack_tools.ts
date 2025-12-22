/**
 * Slack MCP Tools
 *
 * Provides tools for interacting with Slack conversations, users, and channels.
 * All tools use session-based authentication and automatically retrieve
 * the appropriate user's credentials from the session context.
 */

import { WebClient } from '@slack/web-api';

// Types for Slack objects
interface SlackMessage {
  type?: string;
  ts?: string;
  user?: string;
  text?: string;
  thread_ts?: string;
  [key: string]: unknown;
}

interface SlackUser {
  id?: string;
  name?: string;
  real_name?: string;
  profile?: Record<string, unknown>;
  [key: string]: unknown;
}

interface SlackChannel {
  id?: string;
  name?: string;
  is_channel?: boolean;
  is_private?: boolean;
}

interface SearchMatch {
  ts?: string;
  [key: string]: unknown;
}

// Types for return values
interface SlackError {
  ok: false;
  error: string;
}

interface MessagesResponse {
  ok: true;
  messages: SlackMessage[];
  has_more: boolean;
  next_cursor?: string;
}

interface SearchMessagesResponse {
  ok: true;
  query: string;
  filters: {
    from_user?: string;
    in_channel?: string;
    after_date?: string;
    before_date?: string;
    sort_by: string;
    sort_order: string;
  };
  matches: SearchMatch[];
  total: number;
  page: number;
  page_count: number;
}

interface UserResponse {
  ok: true;
  user: SlackUser;
}

interface UsersResponse {
  ok: true;
  users: SlackUser[];
  next_cursor?: string;
}

interface ChannelResponse {
  ok: true;
  channel: SlackChannel;
  members?: string[];
  members_error?: string;
}

interface ChannelsResponse {
  ok: true;
  channels: SlackChannel[];
  next_cursor?: string;
}

export interface PostMessageResponse {
  success: true;
  message: string;
}

interface AuthTestResponse {
  ok: true;
  url: string;
  team: string;
  team_id: string;
  user: string;
  user_id: string;
  bot_id?: string;
  is_enterprise_install?: boolean;
  scopes?: string[];
}

type SlackApiResponse =
  | MessagesResponse
  | SearchMessagesResponse
  | UserResponse
  | UsersResponse
  | ChannelResponse
  | ChannelsResponse
  | PostMessageResponse
  | AuthTestResponse
  | SlackError;

/**
 * Parse relative date strings like '7d', '1m', '2w' into YYYY-MM-DD format.
 */
function parseRelativeDate(dateStr: string): string | null {
  const match = dateStr.toLowerCase().match(/^(\d+)([dmwy])$/);
  if (!match) {
    return null;
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const today = new Date();

  let targetDate: Date;
  if (unit === 'd') {
    targetDate = new Date(today.getTime() - amount * 24 * 60 * 60 * 1000);
  } else if (unit === 'w') {
    targetDate = new Date(today.getTime() - amount * 7 * 24 * 60 * 60 * 1000);
  } else if (unit === 'm') {
    // Approximate month as 30 days
    targetDate = new Date(today.getTime() - amount * 30 * 24 * 60 * 60 * 1000);
  } else if (unit === 'y') {
    // Approximate year as 365 days
    targetDate = new Date(today.getTime() - amount * 365 * 24 * 60 * 60 * 1000);
  } else {
    return null;
  }

  return targetDate.toISOString().split('T')[0];
}

/**
 * Parse date string (absolute or relative) into YYYY-MM-DD format.
 */
function parseDate(dateStr: string): string | null {
  // Try relative date first
  const relative = parseRelativeDate(dateStr);
  if (relative) {
    return relative;
  }

  // Try absolute date YYYY-MM-DD
  const parsed = new Date(dateStr);
  if (!Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  return null;
}

/**
 * Build Slack search query with filters.
 */
function buildSearchQuery(
  baseQuery: string,
  fromUser?: string,
  inChannel?: string,
  afterDate?: string,
  beforeDate?: string
): string {
  const queryParts: string[] = baseQuery ? [baseQuery] : [];

  if (fromUser) {
    // Add @ if not present for usernames
    let user = fromUser;
    if (!user.startsWith('U') && !user.startsWith('@')) {
      user = `@${user}`;
    }
    queryParts.push(`from:${user}`);
  }

  if (inChannel) {
    // Add # if not present for channel names
    let channel = inChannel;
    if (!channel.startsWith('C') && !channel.startsWith('#')) {
      channel = `#${channel}`;
    }
    queryParts.push(`in:${channel}`);
  }

  if (afterDate) {
    queryParts.push(`after:${afterDate}`);
  }

  if (beforeDate) {
    queryParts.push(`before:${beforeDate}`);
  }

  return queryParts.join(' ');
}

/**
 * Resolve a channel name to its ID, paginating through all results.
 */
async function resolveChannelName(client: WebClient, channelName: string): Promise<string | null> {
  let cursor: string | undefined = undefined;

  while (true) {
    const response = await client.conversations.list({
      types: 'public_channel,private_channel',
      cursor,
    });

    const channels = response.channels || [];
    for (const channel of channels) {
      if (channel.name === channelName) {
        return channel.id || null;
      }
    }

    cursor = response.response_metadata?.next_cursor;
    if (!cursor) {
      break;
    }
  }

  return null;
}

/**
 * Get messages from a Slack channel.
 * Uses the authenticated user's credentials from the current session context.
 */
export async function getChannelMessages(
  slackBotToken: string,
  channelId: string,
  limit = 100,
  cursor?: string
): Promise<MessagesResponse | SlackError> {
  const client = new WebClient(slackBotToken);

  try {
    let resolvedChannelId = channelId;

    // Handle channel name format (e.g., '#general' -> lookup ID)
    if (channelId.startsWith('#')) {
      const channelName = channelId.slice(1);
      const id = await resolveChannelName(client, channelName);
      if (!id) {
        return { ok: false, error: `Channel '${channelName}' not found` };
      }
      resolvedChannelId = id;
    }

    // Fetch conversation history
    const response = await client.conversations.history({
      channel: resolvedChannelId,
      limit: Math.min(limit, 1000),
      cursor,
    });

    if (!response.ok) {
      return { ok: false, error: response.error || 'Unknown error' };
    }

    return {
      ok: true,
      messages: (response.messages || []) as SlackMessage[],
      has_more: response.has_more || false,
      next_cursor: response.response_metadata?.next_cursor,
    };
  } catch (e: unknown) {
    const error = e as { data?: { error?: string } };
    console.error(
      `Slack API error in get_channel_messages: ${error.data?.error || 'Unknown error'}`
    );
    return {
      ok: false,
      error: `Slack API error: ${error.data?.error || 'Unknown error'}`,
    };
  }
}

/**
 * Get replies from a Slack thread.
 * Uses the authenticated user's credentials from the current session context.
 */
export async function getThreadReplies(
  slackBotToken: string,
  channelId: string,
  threadTs: string,
  limit = 100,
  cursor?: string
): Promise<MessagesResponse | SlackError> {
  const client = new WebClient(slackBotToken);

  try {
    let resolvedChannelId = channelId;

    // Handle channel name format
    if (channelId.startsWith('#')) {
      const channelName = channelId.slice(1);
      const id = await resolveChannelName(client, channelName);
      if (!id) {
        return { ok: false, error: `Channel '${channelName}' not found` };
      }
      resolvedChannelId = id;
    }

    // Fetch thread replies
    const response = await client.conversations.replies({
      channel: resolvedChannelId,
      ts: threadTs,
      limit: Math.min(limit, 1000),
      cursor,
    });

    if (!response.ok) {
      return { ok: false, error: response.error || 'Unknown error' };
    }

    return {
      ok: true,
      messages: (response.messages || []) as SlackMessage[],
      has_more: response.has_more || false,
      next_cursor: response.response_metadata?.next_cursor,
    };
  } catch (error: unknown) {
    const err = error as { data?: { error?: string } };
    console.error(`Slack API error in get_thread_replies: ${err.data?.error || 'Unknown error'}`);
    return {
      ok: false,
      error: `Slack API error: ${err.data?.error || 'Unknown error'}`,
    };
  }
}

/**
 * Search for messages across all conversations with advanced filters.
 * Uses the authenticated user's credentials from the current session context.
 *
 * @example
 * // Search in last 7 days
 * searchMessages("important", { afterDate: "7d" })
 *
 * // Search from specific user in a channel
 * searchMessages("meeting", { fromUser: "@john", inChannel: "#team" })
 *
 * // Date range search
 * searchMessages("report", { afterDate: "2025-01-01", beforeDate: "2025-01-31" })
 */
export async function searchMessages(
  slackBotToken: string,
  query: string,
  options: {
    count?: number;
    page?: number;
    fromUser?: string;
    inChannel?: string;
    afterDate?: string;
    beforeDate?: string;
    sortBy?: 'timestamp' | 'relevance';
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<SearchMessagesResponse | SlackError> {
  const {
    count = 20,
    page = 1,
    fromUser,
    inChannel,
    afterDate,
    beforeDate,
    sortBy = 'relevance',
    sortOrder = 'desc',
  } = options;

  const client = new WebClient(slackBotToken);

  try {
    // Parse dates if provided
    let parsedAfter: string | null = null;
    let parsedBefore: string | null = null;

    if (afterDate) {
      parsedAfter = parseDate(afterDate);
      if (!parsedAfter) {
        return { ok: false, error: `Invalid after_date format: ${afterDate}` };
      }
    }

    if (beforeDate) {
      parsedBefore = parseDate(beforeDate);
      if (!parsedBefore) {
        return { ok: false, error: `Invalid before_date format: ${beforeDate}` };
      }
    }

    // Build enhanced search query
    const enhancedQuery = buildSearchQuery(
      query,
      fromUser,
      inChannel,
      parsedAfter || undefined,
      parsedBefore || undefined
    );

    // Slack API doesn't support sort_by/sort_order parameters, so we apply
    // client-side sorting to the current page of results only
    const response = await client.search.messages({
      query: enhancedQuery,
      count: Math.min(count, 100),
      page,
    });

    if (!response.ok) {
      return { ok: false, error: response.error || 'Unknown error' };
    }

    const messagesData = response.messages || {
      matches: [],
      total: 0,
      pagination: { page: 1, page_count: 1 },
    };
    let matches = (messagesData.matches || []) as SearchMatch[];

    // Apply client-side sorting if requested and different from default
    if (sortBy === 'timestamp' && matches.length > 0) {
      const reverse = sortOrder === 'desc';
      matches = [...matches].sort((a, b) => {
        const aTs = Number.parseFloat(a.ts || '0');
        const bTs = Number.parseFloat(b.ts || '0');
        return reverse ? bTs - aTs : aTs - bTs;
      });
    }

    return {
      ok: true,
      query: enhancedQuery,
      filters: {
        from_user: fromUser,
        in_channel: inChannel,
        after_date: parsedAfter || undefined,
        before_date: parsedBefore || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      },
      matches,
      total: messagesData.total || 0,
      page: messagesData.pagination?.page || 1,
      page_count: messagesData.pagination?.page_count || 1,
    };
  } catch (error: unknown) {
    const err = error as { data?: { error?: string } };
    console.error(`Slack API error in search_messages: ${err.data?.error || 'Unknown error'}`);
    return {
      ok: false,
      error: `Slack API error: ${err.data?.error || 'Unknown error'}`,
    };
  }
}

/**
 * Get users from Slack workspace.
 * Dual-mode function:
 * - Without userId: Lists all users in the workspace with pagination
 * - With userId: Gets detailed profile for a specific user
 *
 * Uses the authenticated user's credentials from the current session context.
 */
export async function getUsers(
  slackBotToken: string,
  limit = 100,
  cursor?: string
): Promise<UserResponse | UsersResponse | SlackError> {
  const client = new WebClient(slackBotToken);

  try {
    // List all users
    const response = await client.users.list({
      limit: Math.min(limit, 1000),
      cursor,
    });

    if (!response.ok) {
      return { ok: false, error: response.error || 'Unknown error' };
    }

    return {
      ok: true,
      users: (response.members || []) as SlackUser[],
      next_cursor: response.response_metadata?.next_cursor,
    };
  } catch (error: unknown) {
    const err = error as { data?: { error?: string } };
    console.error(`Slack API error in get_users: ${err.data?.error || 'Unknown error'}`);
    return {
      ok: false,
      error: `Slack API error: ${err.data?.error || 'Unknown error'}`,
    };
  }
}

/**
 * Get channels from Slack workspace.
 * Dual-mode function:
 * - Without channelId: Lists channels with optional type filter (defaults to public channels only)
 * - With channelId: Gets detailed info for a specific channel, optionally with members
 *
 * Uses the authenticated user's credentials from the current session context.
 */
export async function getChannels(
  slackBotToken: string,
  channelId?: string,
  types?: string,
  limit = 200,
  cursor?: string
): Promise<ChannelResponse | ChannelsResponse | SlackError> {
  const client = new WebClient(slackBotToken);

  try {
    if (channelId) {
      // Get specific channel info
      const response = await client.conversations.info({ channel: channelId });

      if (!response.ok) {
        return { ok: false, error: response.error || 'Unknown error' };
      }

      const result: ChannelResponse = {
        ok: true,
        channel: (response.channel || {}) as SlackChannel,
      };

      return result;
    }
    const response = await client.conversations.list({
      limit: Math.min(limit, 1000),
      cursor,
      types,
    });

    const filteredChannels = response.channels
      ?.filter((channel) => channel.is_channel === true)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        is_private: channel.is_private,
      }));

    if (!response.ok) {
      return { ok: false, error: response.error || 'Unknown error' };
    }

    return {
      ok: true,
      channels: (filteredChannels || []) as SlackChannel[],
      next_cursor: response.response_metadata?.next_cursor,
    };
  } catch (error: unknown) {
    const err = error as { data?: { error?: string } };
    console.error(`Slack API error in get_channels: ${err.data?.error || 'Unknown error'}`);
    return {
      ok: false,
      error: `Slack API error: ${err.data?.error || 'Unknown error'}`,
    };
  }
}

/**
 * Post a message to a Slack channel.
 *
 * @param slackBotToken - Slack bot token for authentication
 * @param channelId - Channel ID to post the message to (e.g., 'C1234567890')
 * @param text - Message text content
 * @param options - Optional parameters for the message
 * @param options.threadTs - Thread timestamp to reply to (makes this a thread reply)
 * @param options.blocks - Slack Block Kit blocks for rich formatting
 * @param options.attachments - Message attachments (legacy)
 * @param options.unfurlLinks - Automatically unfurl links (default: true)
 * @param options.unfurlMedia - Automatically unfurl media (default: true)
 *
 * @returns Promise with message details or error
 *
 * @example
 * // Post a simple message
 * await postMessage(token, "C1234567890", "Hello, world!")
 *
 * // Post a threaded reply
 * await postMessage(token, "C1234567890", "Reply!", { threadTs: "1234567890.123456" })
 */
export async function postMessage(
  slackBotToken: string,
  channelId: string,
  text: string,
  options: {
    threadTs?: string;
    blocks?: unknown[];
    attachments?: Record<string, unknown>[];
    unfurlLinks?: boolean;
    unfurlMedia?: boolean;
  } = {}
): Promise<PostMessageResponse | SlackError> {
  const client = new WebClient(slackBotToken);

  try {
    const response = await client.chat.postMessage({
      channel: channelId,
      text,
      thread_ts: options.threadTs,
      blocks: options.blocks as never,
      attachments: options.attachments as never,
      unfurl_links: options.unfurlLinks,
      unfurl_media: options.unfurlMedia,
    });

    if (!response.ok) {
      return { ok: false, error: response.error || 'Unknown error' };
    }

    return {
      success: true,
      message: response.message?.text || text,
    };
  } catch (error: unknown) {
    const err = error as { data?: { error?: string } };
    console.error(`Slack API error in post_message: ${err.data?.error || 'Unknown error'}`);
    return {
      ok: false,
      error: `Slack API error: ${err.data?.error || 'Unknown error'}`,
    };
  }
}

/**
 * Test authentication and get bot information including available scopes/permissions.
 *
 * @param slackBotToken - Slack bot token for authentication
 * @returns Promise with authentication details including scopes/permissions
 *
 * @example
 * // Check bot permissions
 * const auth = await testAuth(token);
 * if (auth.ok) {
 *   console.log('Available scopes:', auth.scopes);
 *   console.log('Bot ID:', auth.bot_id);
 *   console.log('Team:', auth.team);
 * }
 */
export async function getAuthScopes(slackBotToken: string): Promise<string[]> {
  const client = new WebClient(slackBotToken);

  try {
    const response = await client.auth.test();

    if (!response.ok) {
      return [];
    }

    // Get additional info about the token's scopes
    let scopes: string[] = [];
    if (response.response_metadata?.scopes) {
      scopes = response.response_metadata.scopes;
    }

    return scopes;
  } catch (error: unknown) {
    const err = error as { data?: { error?: string } };
    console.error(`Slack API error in test_auth: ${err.data?.error || 'Unknown error'}`);
    return [];
  }
}
