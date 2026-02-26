/**
 * Shared utilities for Slack event handlers
 */

import {
  findWorkAppSlackChannelAgentConfig,
  findWorkAppSlackUserMapping,
  generateInternalServiceToken,
  getInProcessFetch,
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

  // Only cache positive hits — don't cache null so that newly-linked users
  // are recognized immediately on their next message instead of waiting for TTL expiry.
  if (mapping) {
    if (userMappingCache.size >= USER_MAPPING_CACHE_MAX_SIZE) {
      evictExpiredEntries();
      if (userMappingCache.size >= USER_MAPPING_CACHE_MAX_SIZE) {
        const oldestKey = userMappingCache.keys().next().value;
        if (oldestKey) userMappingCache.delete(oldestKey);
      }
    }
    userMappingCache.set(cacheKey, {
      mapping,
      expiresAt: Date.now() + USER_MAPPING_CACHE_TTL_MS,
    });
  }

  return mapping;
}

/**
 * Escape special characters in Slack mrkdwn link display text.
 * In Slack's <url|text> format, `>` terminates the link, `<` opens a new one,
 * and `&` begins an HTML entity — all must be escaped.
 */
export function escapeSlackLinkText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escape special characters in Slack mrkdwn text.
 * In Slack's mrkdwn, `&`, `<`, and `>` are treated as HTML entities/tags
 * and must be escaped in all dynamic mrkdwn text fields.
 */
export function escapeSlackMrkdwn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, text, url) => `<${url}|${escapeSlackLinkText(text)}>`
  );

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
export function extractApiErrorMessage(responseBody: string): string | null {
  try {
    const parsed = JSON.parse(responseBody);
    if (typeof parsed.message === 'string' && parsed.message.length > 0) {
      return parsed.message;
    }
  } catch {
    // Body is not valid JSON
  }
  return null;
}

export function getUserFriendlyErrorMessage(errorType: SlackErrorType, agentName?: string): string {
  const agent = agentName || 'The agent';

  switch (errorType) {
    case SlackErrorType.TIMEOUT:
      return `*Request timed out.* ${agent} took too long to respond. Try again with a simpler question.`;

    case SlackErrorType.RATE_LIMIT:
      return '*Rate limited.* Wait a moment and try again.';

    case SlackErrorType.AUTH_ERROR:
      return '*Authentication error.* Run `/inkeep link` to reconnect your account.';

    case SlackErrorType.API_ERROR:
      return `*Something went wrong.* ${agent} encountered an error. Try again in a moment.`;

    default:
      return '*Unexpected error.* Something went wrong. Try again in a moment.';
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
    const response = await getInProcessFetch()(
      `${apiUrl}/manage/tenants/${tenantId}/projects?limit=50`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      }
    );

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
    const response = await getInProcessFetch()(
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
  const tenantId = workspace?.tenantId;
  if (!tenantId) return null;

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

    if (message.replace_original === true) {
      payload.replace_original = true;
    } else if (message.delete_original) {
      payload.delete_original = true;
    } else {
      // Explicitly prevent Slack's default replace_original: true behavior so the
      // original message (e.g. approval buttons) is preserved when sending an
      // ephemeral rejection or any other non-replacing response.
      payload.replace_original = false;
      if (message.response_type) {
        payload.response_type = message.response_type;
      }
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

export function generateSlackConversationId(params: {
  teamId: string;
  messageTs: string;
  isDM?: boolean;
  agentId?: string;
}): string {
  const { teamId, messageTs, isDM, agentId } = params;

  const prefix = isDM ? 'slack-dm' : 'slack-trigger';
  const base = `${prefix}-${teamId}-${messageTs}`;

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

export interface SlackAttachment {
  text?: string;
  fallback?: string;
  pretext?: string;
  author_name?: string;
  author_id?: string;
  channel_name?: string;
  channel_id?: string;
  title?: string;
  is_msg_unfurl?: boolean;
  is_share?: boolean;
  from_url?: string;
  fields?: Array<{ title?: string; value?: string }>;
}

export function formatAttachments(attachments: SlackAttachment[] | undefined): string {
  if (!attachments || attachments.length === 0) return '';

  const parts: string[] = [];

  for (const att of attachments) {
    const content = att.text || att.fallback;
    if (!content) continue;

    const isSharedMessage = att.is_msg_unfurl || att.is_share;

    const meta: string[] = [];
    if (att.author_name) meta.push(`from ${att.author_name}`);
    if (att.channel_name) {
      meta.push(`in #${att.channel_name}`);
    } else if (att.channel_id) {
      meta.push(`in channel ${att.channel_id}`);
    }

    const label = isSharedMessage ? 'Shared message' : 'Attachment';
    const metaSuffix = meta.length > 0 ? ` (${meta.join(', ')})` : '';
    const sourceLine = att.from_url ? `\n[Source: ${att.from_url}]` : '';
    parts.push(`[${label}${metaSuffix}]:\n\`\`\`\n${content}\n\`\`\`${sourceLine}`);

    if (att.fields && att.fields.length > 0) {
      for (const field of att.fields) {
        if (field.title && field.value) {
          parts.push(`${field.title}: ${field.value}`);
        }
      }
    }
  }

  return parts.join('\n\n');
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
          attachments?: SlackAttachment[];
        }>;
      }>;
    };
    users?: {
      info: (params: { user: string }) => Promise<{
        user?: {
          real_name?: string;
          profile?: { display_name?: string; email?: string };
        };
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

    const allMessages = threadMessages.messages;

    if (messagesToProcess.length === 0) {
      return '';
    }

    // Build a cache of user IDs to their Slack profile names
    const userNameCache = new Map<
      string,
      { displayName: string | undefined; fullName: string | undefined; email: string | undefined }
    >();

    if (resolveUserNames && slackClient.users) {
      const uniqueUserIds = [
        ...new Set(
          allMessages.filter((m): m is typeof m & { user: string } => !!m.user).map((m) => m.user)
        ),
      ];

      await Promise.all(
        uniqueUserIds.map(async (userId) => {
          try {
            const userInfo = await slackClient.users?.info({ user: userId });
            userNameCache.set(userId, {
              displayName: userInfo?.user?.profile?.display_name,
              fullName: userInfo?.user?.real_name,
              email: userInfo?.user?.profile?.email,
            });
          } catch {
            userNameCache.set(userId, {
              displayName: undefined,
              fullName: undefined,
              email: undefined,
            });
          }
        })
      );
    }

    // Build user directory mapping at the start of the context
    const userDirectoryLines: string[] = [];
    for (const [userId, info] of userNameCache) {
      const parts = [`userId: ${userId}`];
      if (info.displayName) parts.push(`"${info.displayName}"`);
      if (info.fullName) parts.push(`"${info.fullName}"`);
      if (info.email) parts.push(info.email);
      userDirectoryLines.push(`- ${parts.join(', ')}`);
    }

    const userDirectory =
      userDirectoryLines.length > 0
        ? `Users in this thread (UserId - DisplayName, FullName, Email):\n${userDirectoryLines.join('\n')}\n\n`
        : '';

    // Format messages using only user IDs
    const formattedMessages = messagesToProcess.map((msg, index) => {
      const isBot = !!msg.bot_id;
      const isParent = index === 0;

      let role: string;
      if (isBot) {
        role = 'Inkeep Agent';
      } else if (msg.user) {
        role = msg.user;
      } else {
        role = 'Unknown';
      }

      const prefix = isParent ? '[Thread Start] ' : '';
      const messageText = msg.text || '';
      const attachmentText = formatAttachments(msg.attachments);
      const fullText = attachmentText ? `${messageText}\n${attachmentText}` : messageText;

      return `${prefix}${role}: """${fullText}"""`;
    });

    return `${userDirectory}Messages in this thread:\n${formattedMessages.join('\n\n')}`;
  } catch (threadError) {
    logger.warn({ threadError, channel, threadTs }, 'Failed to fetch thread context');
  }

  return '';
}

export async function timedOp<T>(
  operation: Promise<T>,
  opts: { warnThresholdMs?: number; label: string; context: Record<string, unknown> }
): Promise<{ result: T; durationMs: number }> {
  const { warnThresholdMs = 3000, label, context } = opts;
  const start = Date.now();
  const result = await operation;
  const durationMs = Date.now() - start;
  if (durationMs > warnThresholdMs)
    logger.warn({ ...context, durationMs, operation: label }, `Slow ${label}`);
  return { result, durationMs };
}

export function formatChannelLabel(channelInfo: { name?: string } | null): string {
  return channelInfo?.name ? `#${channelInfo.name}` : '';
}

export function formatChannelContext(channelInfo: { name?: string } | null): string {
  const label = formatChannelLabel(channelInfo);
  return label ? `the Slack channel ${label}` : 'Slack';
}

export function formatMessageTimestamp(messageTs: string, timezone: string): string {
  const date = new Date(Number.parseFloat(messageTs) * 1000);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export interface FormatSlackQueryOptions {
  text: string;
  channelContext: string;
  userName: string;
  attachmentContext?: string;
  threadContext?: string;
  isAutoExecute?: boolean;
  messageTs?: string;
  senderTimezone?: string;
}

export function formatSlackQuery(options: FormatSlackQueryOptions): string {
  const {
    text,
    channelContext,
    userName,
    attachmentContext,
    threadContext,
    isAutoExecute,
    messageTs,
    senderTimezone,
  } = options;

  const timestampSuffix =
    messageTs && senderTimezone
      ? ` (sent ${formatMessageTimestamp(messageTs, senderTimezone)})`
      : '';

  if (isAutoExecute && threadContext) {
    return `A user mentioned you in a thread in ${channelContext}${timestampSuffix}.

<slack_thread_context>
${threadContext}
</slack_thread_context>

Based on the thread above, provide a helpful response. Consider:
- What is the main topic or question being discussed?
- Is there anything that needs clarification or a direct answer?
- If appropriate, summarize key points or provide relevant information.

Respond naturally as if you're joining the conversation to help.`;
  }

  if (threadContext) {
    let messageContent = text;
    if (attachmentContext) {
      messageContent = `${text}\n\n<attached_content>\n${attachmentContext}\n</attached_content>`;
    }
    return `The following is thread context from ${channelContext}:\n\n<slack_thread_context>\n${threadContext}\n</slack_thread_context>\n\nMessage from ${userName}${timestampSuffix}: ${messageContent}`;
  }

  if (attachmentContext) {
    return `The following is a message from ${channelContext} from ${userName}${timestampSuffix}: """${text}"""\n\nThe message also includes the following shared/forwarded content:\n\n<attached_content>\n${attachmentContext}\n</attached_content>`;
  }

  return `The following is a message from ${channelContext} from ${userName}${timestampSuffix}: """${text}"""`;
}
