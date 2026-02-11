/**
 * Shared utilities for Slack event handlers
 */

import {
  findWorkAppSlackChannelAgentConfig,
  findWorkAppSlackUserMapping,
  generateInternalServiceToken,
  InternalServices,
} from '@inkeep/agents-core';
import runDbClient from '../../../db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import type { AgentOption } from '../modals';
import {
  type DefaultAgentConfig,
  findWorkspaceConnectionByTeamId,
  type SlackWorkspaceConnection,
} from '../nango';

const logger = getLogger('slack-event-utils');

// --- Cached user mapping lookup (bounded) ---

const USER_MAPPING_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const USER_MAPPING_CACHE_MAX_SIZE = 5000;

type UserMappingResult = Awaited<ReturnType<ReturnType<typeof findWorkAppSlackUserMapping>>>;

const userMappingCache = new Map<string, { mapping: UserMappingResult; expiresAt: number }>();

function evictExpiredEntries() {
  if (userMappingCache.size <= USER_MAPPING_CACHE_MAX_SIZE) return;
  const now = Date.now();
  for (const [key, entry] of userMappingCache) {
    if (entry.expiresAt <= now) {
      userMappingCache.delete(key);
    }
  }
  // If still over max after evicting expired, remove oldest entries
  if (userMappingCache.size > USER_MAPPING_CACHE_MAX_SIZE) {
    const excess = userMappingCache.size - USER_MAPPING_CACHE_MAX_SIZE;
    const keys = userMappingCache.keys();
    for (let i = 0; i < excess; i++) {
      const { value } = keys.next();
      if (value) userMappingCache.delete(value);
    }
  }
}

/**
 * Find a user mapping with bounded in-memory caching (5 min TTL, max 5000 entries).
 * Called on every @mention and /inkeep command — caching avoids redundant DB queries.
 */
export async function findCachedUserMapping(
  tenantId: string,
  slackUserId: string,
  teamId: string,
  clientId = 'work-apps-slack'
) {
  const cacheKey = `${tenantId}:${slackUserId}:${teamId}:${clientId}`;
  const cached = userMappingCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.mapping;
  }

  const mapping = await findWorkAppSlackUserMapping(runDbClient)(
    tenantId,
    slackUserId,
    teamId,
    clientId
  );

  evictExpiredEntries();
  userMappingCache.set(cacheKey, {
    mapping,
    expiresAt: Date.now() + USER_MAPPING_CACHE_TTL_MS,
  });

  return mapping;
}

/**
 * Invalidate user mapping cache for a specific user (call on link/unlink).
 */
export function invalidateUserMappingCache(tenantId: string, slackUserId: string, teamId: string) {
  const cacheKey = `${tenantId}:${slackUserId}:${teamId}:work-apps-slack`;
  userMappingCache.delete(cacheKey);
}

/**
 * Convert standard Markdown to Slack's mrkdwn format
 *
 * Key differences:
 * - **bold** or __bold__ → *bold*
 * - *italic* (when not bold) → _italic_
 * - # Header → *Header* (Slack has no headers)
 * - [text](url) → <url|text>
 * - Keeps code blocks, inline code, and lists as-is
 */
export function markdownToMrkdwn(markdown: string): string {
  if (!markdown) return markdown;

  let result = markdown;

  // Convert headers to bold text (# ## ### etc.)
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // Convert markdown links [text](url) to Slack links <url|text>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');

  // Convert bold: **text** or __text__ to *text*
  // Do this before italic to avoid conflicts
  result = result.replace(/\*\*([^*]+)\*\*/g, '*$1*');
  result = result.replace(/__([^_]+)__/g, '*$1*');

  // Convert italic: *text* to _text_ (only single asterisks not already converted)
  // This is tricky because Slack uses * for bold
  // We need to find single * that aren't part of ** or surrounded by word chars
  // Skip this conversion as it can conflict with bold - Slack's _italic_ works fine
  // Users can use _italic_ in their prompts if needed

  // Convert strikethrough: ~~text~~ to ~text~
  result = result.replace(/~~([^~]+)~~/g, '~$1~');

  return result;
}

/**
 * Error types for user-friendly error messages
 */
export enum SlackErrorType {
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  API_ERROR = 'api_error',
  AUTH_ERROR = 'auth_error',
  UNKNOWN = 'unknown',
}

/**
 * Classify an error into a SlackErrorType for appropriate user messaging
 */
export function classifyError(error: unknown, httpStatus?: number): SlackErrorType {
  if (httpStatus === 429) {
    return SlackErrorType.RATE_LIMIT;
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return SlackErrorType.AUTH_ERROR;
  }
  if (httpStatus && httpStatus >= 400) {
    return SlackErrorType.API_ERROR;
  }

  const errorMessage =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    errorMessage.includes('aborted') ||
    errorMessage.includes('econnreset')
  ) {
    return SlackErrorType.TIMEOUT;
  }

  if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
    return SlackErrorType.RATE_LIMIT;
  }

  if (errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
    return SlackErrorType.AUTH_ERROR;
  }

  return SlackErrorType.UNKNOWN;
}

/**
 * Get a user-friendly error message based on error type
 */
export function getUserFriendlyErrorMessage(errorType: SlackErrorType, agentName?: string): string {
  const agent = agentName || 'The agent';

  switch (errorType) {
    case SlackErrorType.TIMEOUT:
      return `⏱️ *Request timed out*\n\n${agent} took too long to respond. This can happen with complex queries.\n\n*Try:*\n• Simplifying your question\n• Breaking it into smaller parts\n• Trying again in a moment`;

    case SlackErrorType.RATE_LIMIT:
      return `⚠️ *Too many requests*\n\nYou've hit the rate limit. Please wait a moment before trying again.\n\n*Tip:* Space out your requests to avoid this.`;

    case SlackErrorType.AUTH_ERROR:
      return `🔐 *Authentication issue*\n\nThere was a problem with your account connection.\n\n*Try:*\n• Running \`/inkeep link\` to re-link your account\n• Contacting your workspace admin if the issue persists`;

    case SlackErrorType.API_ERROR:
      return `❌ *Something went wrong*\n\n${agent} encountered an error processing your request.\n\n*Try:*\n• Rephrasing your question\n• Trying again in a moment\n• Using \`/inkeep help\` for more options`;

    default:
      return `❌ *Unexpected error*\n\nSomething went wrong while processing your request.\n\n*Try:*\n• Trying again in a moment\n• Using \`/inkeep help\` for more options`;
  }
}

export type ProjectOption = { id: string; name: string };

const INTERNAL_FETCH_TIMEOUT_MS = 10_000;

export async function fetchProjectsForTenant(tenantId: string): Promise<ProjectOption[]> {
  const apiUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
  const token = await generateInternalServiceToken({
    serviceId: InternalServices.INKEEP_AGENTS_MANAGE_API,
    tenantId,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTERNAL_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiUrl}/manage/tenants/${tenantId}/projects?limit=50`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      logger.warn(
        { status: response.status, tenantId, errorBody },
        'Failed to fetch projects from API'
      );
      return [];
    }

    const result = (await response.json()) as {
      data: Array<{ id: string; name: string }>;
    };

    logger.debug({ tenantId, projectCount: result.data.length }, 'Fetched projects from API');
    return result.data.map((p) => ({ id: p.id, name: p.name || p.id }));
  } catch (error) {
    logger.error({ error, tenantId }, 'Error fetching projects from API');
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAgentsForProject(
  tenantId: string,
  projectId: string
): Promise<AgentOption[]> {
  const apiUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
  const token = await generateInternalServiceToken({
    serviceId: InternalServices.INKEEP_AGENTS_MANAGE_API,
    tenantId,
    projectId,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTERNAL_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${apiUrl}/manage/tenants/${tenantId}/projects/${projectId}/agents?limit=50`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-inkeep-project-id': projectId,
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      logger.warn(
        { status: response.status, tenantId, projectId, errorBody },
        'Failed to fetch agents from API'
      );
      return [];
    }

    const result = (await response.json()) as {
      data: Array<{ id: string; name: string }>;
    };

    logger.debug(
      { tenantId, projectId, agentCount: result.data.length },
      'Fetched agents from API'
    );
    return result.data.map((a) => ({
      id: a.id,
      name: a.name || a.id,
      projectId,
      projectName: projectId,
    }));
  } catch (error) {
    logger.error({ error, tenantId, projectId }, 'Error fetching agents from API');
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function getWorkspaceDefaultAgent(teamId: string): Promise<DefaultAgentConfig | null> {
  const workspace = await findWorkspaceConnectionByTeamId(teamId);
  if (workspace?.defaultAgent) {
    logger.debug({ teamId }, 'Found workspace default agent');
    return workspace.defaultAgent;
  }
  return null;
}

export async function getChannelAgentConfig(
  teamId: string,
  channelId: string
): Promise<DefaultAgentConfig | null> {
  const workspace = await findWorkspaceConnectionByTeamId(teamId);
  return resolveChannelAgentConfig(teamId, channelId, workspace);
}

/**
 * Resolve channel agent config using a pre-resolved workspace connection.
 * Avoids redundant workspace lookups when the connection is already available.
 */
export async function resolveChannelAgentConfig(
  teamId: string,
  channelId: string,
  workspace: SlackWorkspaceConnection | null
): Promise<DefaultAgentConfig | null> {
  const tenantId = workspace?.tenantId || 'default';

  const channelConfig = await findWorkAppSlackChannelAgentConfig(runDbClient)(
    tenantId,
    teamId,
    channelId
  );

  if (channelConfig?.enabled) {
    return {
      projectId: channelConfig.projectId,
      agentId: channelConfig.agentId,
      agentName: channelConfig.agentName || channelConfig.agentId,
      projectName: channelConfig.projectId,
    };
  }

  return workspace?.defaultAgent || null;
}

export async function sendResponseUrlMessage(
  responseUrl: string,
  message: {
    text: string;
    response_type?: 'ephemeral' | 'in_channel';
    replace_original?: boolean;
    delete_original?: boolean;
    blocks?: unknown[];
  }
): Promise<void> {
  try {
    const payload: Record<string, unknown> = { text: message.text };

    if (message.replace_original) {
      payload.replace_original = true;
    } else if (message.delete_original) {
      payload.delete_original = true;
    } else if (message.response_type) {
      payload.response_type = message.response_type;
    }

    if (message.blocks) {
      payload.blocks = message.blocks;
    }

    logger.info(
      {
        hasBlocks: !!message.blocks,
        blockCount: Array.isArray(message.blocks) ? message.blocks.length : 0,
        replace: !!message.replace_original,
      },
      'Sending response_url message'
    );

    const controller = new AbortController();
    const responseTimeout = setTimeout(() => controller.abort(), INTERNAL_FETCH_TIMEOUT_MS);

    const response = await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(responseTimeout);

    const responseBody = await response.text().catch(() => '');
    logger.info(
      { status: response.status, responseBody: responseBody.slice(0, 300) },
      'response_url response received'
    );

    if (!response.ok) {
      logger.error(
        { status: response.status, errorBody: responseBody },
        'response_url request failed'
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Failed to send response_url message');
  }
}

/**
 * Generate a deterministic conversation ID for Slack threads/DMs.
 * This ensures the same thread + agent combination gets the same conversation ID,
 * allowing the agent to maintain conversation history.
 *
 * Including agentId ensures switching agents in the same thread starts a fresh
 * conversation, avoiding sub-agent conflicts when the Run API tries to resume
 * a conversation that was started by a different agent.
 *
 * Format: slack-thread-{teamId}-{identifier}[-{agentId}]
 */
export function generateSlackConversationId(params: {
  teamId: string;
  threadTs?: string;
  channel: string;
  isDM?: boolean;
  agentId?: string;
}): string {
  const { teamId, threadTs, channel, isDM, agentId } = params;

  const base = isDM
    ? `slack-dm-${teamId}-${channel}`
    : `slack-thread-${teamId}-${threadTs || channel}`;

  return agentId ? `${base}-${agentId}` : base;
}

/**
 * Check if a thread was initiated by the bot (i.e., the parent message is from the bot).
 * This helps distinguish "bot threads" (where users are conversing with the bot)
 * from "user threads" (where users are having their own conversation).
 *
 * Uses conversations.replies which returns thread messages with the parent as the first message.
 */
export async function checkIfBotThread(
  slackClient: {
    conversations: {
      replies: (params: {
        channel: string;
        ts: string;
        limit?: number;
      }) => Promise<{ messages?: Array<{ bot_id?: string; user?: string; text?: string }> }>;
    };
  },
  channel: string,
  threadTs: string
): Promise<boolean> {
  try {
    const threadReplies = await slackClient.conversations.replies({
      channel,
      ts: threadTs,
      limit: 1,
    });

    const parentMessage = threadReplies.messages?.[0];
    if (!parentMessage) {
      logger.debug({ channel, threadTs }, 'No parent message found for thread');
      return false;
    }

    const isBotThread = Boolean(parentMessage.bot_id);
    logger.debug(
      { channel, threadTs, isBotThread, botId: parentMessage.bot_id },
      'Checked if thread is bot-owned'
    );
    return isBotThread;
  } catch (error) {
    logger.warn({ error, channel, threadTs }, 'Failed to check if thread is bot-owned');
    return false;
  }
}

interface ThreadContextOptions {
  includeLastMessage?: boolean;
  resolveUserNames?: boolean;
}

export async function getThreadContext(
  slackClient: {
    conversations: {
      replies: (params: { channel: string; ts: string; limit?: number }) => Promise<{
        messages?: Array<{
          bot_id?: string;
          user?: string;
          text?: string;
          ts?: string;
        }>;
      }>;
    };
    users?: {
      info: (params: { user: string }) => Promise<{
        user?: { real_name?: string; display_name?: string; name?: string };
      }>;
    };
  },
  channel: string,
  threadTs: string,
  options: ThreadContextOptions = {}
): Promise<string> {
  const { includeLastMessage = false, resolveUserNames = true } = options;

  try {
    const threadMessages = await slackClient.conversations.replies({
      channel,
      ts: threadTs,
      limit: 50,
    });

    if (!threadMessages.messages || threadMessages.messages.length === 0) {
      return '';
    }

    // Get all messages, optionally excluding the last one (the @mention itself)
    const messagesToProcess = includeLastMessage
      ? threadMessages.messages
      : threadMessages.messages.slice(0, -1);

    if (messagesToProcess.length === 0) {
      return '';
    }

    // Build a cache of user IDs to names
    const userNameCache = new Map<string, string>();

    if (resolveUserNames && slackClient.users) {
      const uniqueUserIds = [
        ...new Set(
          messagesToProcess
            .filter((m): m is typeof m & { user: string } => !!m.user)
            .map((m) => m.user)
        ),
      ];

      await Promise.all(
        uniqueUserIds.map(async (userId) => {
          try {
            const userInfo = await slackClient.users?.info({ user: userId });
            const name =
              userInfo?.user?.display_name ||
              userInfo?.user?.real_name ||
              userInfo?.user?.name ||
              userId;
            userNameCache.set(userId, name);
          } catch {
            userNameCache.set(userId, userId);
          }
        })
      );
    }

    // Format messages with clear structure
    const formattedMessages = messagesToProcess.map((msg, index) => {
      const isBot = !!msg.bot_id;
      const isParent = index === 0;

      let role: string;
      if (isBot) {
        role = 'Inkeep Agent';
      } else if (msg.user) {
        role = resolveUserNames ? userNameCache.get(msg.user) || msg.user : `<@${msg.user}>`;
      } else {
        role = 'Unknown';
      }

      const prefix = isParent ? '[Thread Start] ' : '';
      const messageText =
        msg.text?.replace(/<@U[A-Z0-9]+>/g, (match) => {
          const userId = match.slice(2, -1);
          return `@${userNameCache.get(userId) || userId}`;
        }) || '';

      return `${prefix}${role}: ${messageText}`;
    });

    return formattedMessages.join('\n\n');
  } catch (threadError) {
    logger.warn({ threadError, channel, threadTs }, 'Failed to fetch thread context');
  }

  return '';
}
