/**
 * Slack Work App Routes
 *
 * Handles Slack workspace installation and user connection:
 * - GET /install - Redirects to Slack's OAuth page for workspace install
 * - GET /oauth_redirect - Handles callback from Slack workspace install
 * - POST /connect - Creates Nango session for user-level Slack connection
 * - POST /nango-webhook - Handles Nango auth webhooks
 * - POST /commands - Handles /inkeep slash commands
 * - POST /events - Handles Slack events & interactivity
 * - GET /workspace-info - Fetch workspace info via Nango
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import type { WorkAppsVariables } from '../types';
import {
  createConnectSession,
  createSlackApiClient,
  type DefaultAgentConfig,
  deleteConnection,
  findConnectionByAppUser,
  findConnectionBySlackUser,
  findWorkspaceConnectionByTeamId,
  getConnectionAccessToken,
  getConnectionStatus,
  getSlackChannels,
  getSlackClient,
  getSlackIntegrationId,
  getSlackNango,
  getSlackTeamInfo,
  getSlackUserInfo,
  getWorkspaceDefaultAgentFromNango,
  handleCommand,
  parseSlackCommandBody,
  parseSlackEventBody,
  postMessageInThread,
  type SlackCommandPayload,
  setWorkspaceDefaultAgent as setWorkspaceDefaultAgentInNango,
  updateConnectionMetadata,
  verifySlackRequest,
} from './services';

const logger = getLogger('slack-routes');

const app = new OpenAPIHono<{ Variables: WorkAppsVariables }>();

const pendingSessionTokens = new Map<
  string,
  { token: string; expiresAt: string; createdAt: number }
>();

const workspaceBotTokens = new Map<
  string,
  { botToken: string; teamName: string; installedAt: string }
>();

setInterval(() => {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000;
  for (const [key, value] of pendingSessionTokens.entries()) {
    if (now - value.createdAt > maxAge) {
      pendingSessionTokens.delete(key);
    }
  }
}, 60 * 1000);

export function getBotTokenForTeam(teamId: string): string | null {
  const workspace = workspaceBotTokens.get(teamId);
  return workspace?.botToken || null;
}

async function handleAppMention(params: {
  slackUserId: string;
  channel: string;
  text: string;
  threadTs: string;
  messageTs: string;
  teamId: string;
}) {
  const { slackUserId, channel, text, threadTs, messageTs, teamId } = params;
  const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';

  logger.info({ slackUserId, channel, teamId, text: text.slice(0, 50) }, 'Handling app mention');

  // Try to get bot token from multiple sources:
  // 1. Nango connection (persisted) - most reliable
  // 2. In-memory cache (populated during OAuth, lost on restart)
  // 3. Environment variable (fallback)
  let botToken: string | null = null;

  // First, try to get from Nango (persisted across restarts)
  const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
  if (workspaceConnection?.botToken) {
    botToken = workspaceConnection.botToken;
    logger.debug({ teamId, source: 'nango' }, 'Got bot token from Nango connection');
  }

  // Fall back to in-memory cache
  if (!botToken) {
    botToken = getBotTokenForTeam(teamId);
    if (botToken) {
      logger.debug({ teamId, source: 'memory' }, 'Got bot token from in-memory cache');
    }
  }

  // Fall back to environment variable
  if (!botToken) {
    botToken = env.SLACK_BOT_TOKEN || null;
    if (botToken) {
      logger.debug({ teamId, source: 'env' }, 'Got bot token from environment variable');
    }
  }

  if (!botToken) {
    logger.error({ teamId }, 'No bot token available for app mention response');
    return;
  }

  const slackClient = getSlackClient(botToken);
  const replyThreadTs = threadTs || messageTs;

  try {
    const connection = await findConnectionBySlackUser(slackUserId);
    const tenantId = connection?.tenantId || 'default';
    const dashboardUrl = `${manageUiUrl}/${tenantId}/work-apps/slack`;

    logger.debug({ slackUserId, hasConnection: !!connection }, 'Looked up user connection');

    let queryText = text;

    if (!text && threadTs && threadTs !== messageTs) {
      logger.debug({ channel, threadTs }, 'Empty mention in thread - fetching thread context');

      try {
        const threadMessages = await slackClient.conversations.replies({
          channel,
          ts: threadTs,
          limit: 50,
        });

        if (threadMessages.messages && threadMessages.messages.length > 1) {
          const contextMessages = threadMessages.messages
            .filter((msg) => msg.ts !== messageTs)
            .filter((msg) => !msg.bot_id)
            .map((msg) => {
              const userName = msg.user ? `<@${msg.user}>` : 'Unknown';
              return `${userName}: ${msg.text || ''}`;
            })
            .join('\n');

          if (contextMessages.trim()) {
            queryText = `Based on the following conversation thread, please provide a helpful response or summary:\n\n${contextMessages}`;
            logger.debug(
              { threadMessageCount: threadMessages.messages.length },
              'Using thread context as query'
            );
          }
        }
      } catch (threadError) {
        logger.warn({ threadError }, 'Failed to fetch thread context, falling back to greeting');
      }
    }

    if (!queryText) {
      logger.debug({ channel, replyThreadTs }, 'Sending empty mention greeting');
      await postMessageInThread(
        slackClient,
        channel,
        replyThreadTs,
        `👋 Hi! I'm your Inkeep AI assistant. Ask me anything!\n\n` +
          `*Examples:*\n` +
          `• \`@Inkeep Agent How do I reset my password?\`\n` +
          `• \`@Inkeep Agent Summarize our return policy\`\n\n` +
          `Or use \`/inkeep help\` for more commands.`
      );
      return;
    }

    if (!connection) {
      logger.debug({ channel, replyThreadTs }, 'Sending connect prompt');
      await postMessageInThread(
        slackClient,
        channel,
        replyThreadTs,
        `👋 Hi! To use Inkeep, please connect your account first.\n\n` +
          `👉 *<${manageUiUrl}/default/work-apps/slack|Connect your account>*`
      );
      return;
    }

    let defaultAgent: {
      projectId: string;
      agentId: string;
      subAgentId?: string;
      name: string;
    } | null = null;

    if (connection?.defaultAgent) {
      try {
        defaultAgent = JSON.parse(connection.defaultAgent);
        logger.debug({ source: 'user' }, 'Using user default agent');
      } catch {}
    }

    if (!defaultAgent) {
      const workspaceDefault = await getWorkspaceDefaultAgent(teamId);
      if (workspaceDefault) {
        defaultAgent = {
          projectId: workspaceDefault.projectId,
          agentId: workspaceDefault.agentId,
          name: workspaceDefault.agentName,
        };
        logger.debug({ source: 'workspace' }, 'Using workspace default agent');
      }
    }

    logger.debug({ hasDefaultAgent: !!defaultAgent }, 'Checked default agent config');

    if (!defaultAgent) {
      logger.debug({ channel, replyThreadTs }, 'Sending no default agent prompt');
      await postMessageInThread(
        slackClient,
        channel,
        replyThreadTs,
        `⚙️ No default agent configured.\n\n` +
          `👉 *<${dashboardUrl}|Set up your default agent>*\n\n` +
          `Or use \`/inkeep run [agent-id] [question]\` to specify an agent.`
      );
      return;
    }

    if (!connection?.inkeepSessionToken) {
      logger.debug({ channel, replyThreadTs }, 'User session token missing or expired');
      await postMessageInThread(
        slackClient,
        channel,
        replyThreadTs,
        `🔑 Your session has expired. Please re-connect your account.\n\n` +
          `👉 *<${dashboardUrl}|Reconnect your account>*`
      );
      return;
    }

    if (connection.inkeepSessionExpiresAt) {
      const expiresAt = new Date(connection.inkeepSessionExpiresAt);
      if (expiresAt < new Date()) {
        logger.debug({ channel, replyThreadTs, expiresAt }, 'User session token expired');
        await postMessageInThread(
          slackClient,
          channel,
          replyThreadTs,
          `🔑 Your session has expired. Please re-connect your account.\n\n` +
            `👉 *<${dashboardUrl}|Reconnect your account>*`
        );
        return;
      }
    }

    const apiClient = createSlackApiClient(connection);

    const agentDisplayName = defaultAgent.name || defaultAgent.subAgentId || defaultAgent.agentId;

    logger.debug(
      { channel, replyThreadTs, agentName: agentDisplayName },
      'Sending thinking message'
    );
    const thinkingMessage = await slackClient.chat.postMessage({
      channel,
      thread_ts: replyThreadTs,
      text: `🤔 _${agentDisplayName} is thinking..._`,
    });

    logger.info(
      { projectId: defaultAgent.projectId, agentId: defaultAgent.agentId },
      'Getting API key for agent'
    );
    const apiKey = await apiClient.getOrCreateAgentApiKey(
      defaultAgent.projectId,
      defaultAgent.agentId
    );

    logger.info(
      { projectId: defaultAgent.projectId, agentId: defaultAgent.agentId },
      'Triggering agent with streaming'
    );

    await streamAgentResponse({
      slackClient,
      channel,
      threadTs: replyThreadTs,
      thinkingMessageTs: thinkingMessage.ts || '',
      slackUserId,
      teamId,
      apiKey,
      question: queryText,
      agentName: agentDisplayName,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({ errorMessage, errorStack, channel, teamId }, 'Failed in app mention handler');

    try {
      await postMessageInThread(
        slackClient,
        channel,
        replyThreadTs,
        `❌ Sorry, I encountered an error.\n\n` +
          `Try again or use \`/inkeep help\` for more options.`
      );
    } catch (postError) {
      const postErrorMessage = postError instanceof Error ? postError.message : String(postError);
      logger.error({ postErrorMessage }, 'Failed to post error message to Slack');
    }
  }
}

async function streamAgentResponse(params: {
  slackClient: ReturnType<typeof getSlackClient>;
  channel: string;
  threadTs: string;
  thinkingMessageTs: string;
  slackUserId: string;
  teamId: string;
  apiKey: string;
  question: string;
  agentName: string;
}): Promise<void> {
  const {
    slackClient,
    channel,
    threadTs,
    thinkingMessageTs,
    slackUserId,
    teamId,
    apiKey,
    question,
    agentName,
  } = params;

  const apiUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/run/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'default',
      messages: [{ role: 'user', content: question }],
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    logger.error({ status: response.status, errorBody }, 'Agent streaming request failed');
    throw new Error(`Agent execution failed: ${response.status}`);
  }

  if (thinkingMessageTs) {
    try {
      await slackClient.chat.delete({
        channel,
        ts: thinkingMessageTs,
      });
    } catch (deleteError) {
      logger.warn({ deleteError }, 'Failed to delete thinking message');
    }
  }

  const streamer = slackClient.chatStream({
    channel,
    recipient_team_id: teamId,
    recipient_user_id: slackUserId,
    thread_ts: threadTs,
  });

  if (!response.body) {
    throw new Error('No response body from agent');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const data = JSON.parse(jsonStr);

          if (data.type === 'data-operation') {
            continue;
          }

          if (data.type === 'text-start' || data.type === 'text-end') {
            continue;
          }

          if (data.type === 'text-delta' && data.delta) {
            fullText += data.delta;
            await streamer.append({ markdown_text: data.delta });
          } else if (data.object === 'chat.completion.chunk' && data.choices?.[0]?.delta?.content) {
            const content = data.choices[0].delta.content;
            try {
              const parsed = JSON.parse(content);
              if (parsed.type === 'data-operation') {
                continue;
              }
            } catch {
              // Not JSON, use as-is
            }
            fullText += content;
            await streamer.append({ markdown_text: content });
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    const shareButton = {
      type: 'button' as const,
      text: { type: 'plain_text' as const, text: '📢 Share to Channel', emoji: true },
      action_id: 'share_to_channel',
      value: JSON.stringify({
        channelId: channel,
        text: fullText,
        agentName,
      }),
    };

    const contextBlock = {
      type: 'context' as const,
      elements: [
        {
          type: 'mrkdwn' as const,
          text: `Powered by *${agentName}* via Inkeep`,
        },
      ],
    };

    const actionsBlock = {
      type: 'actions' as const,
      elements: [shareButton],
    };

    await streamer.stop({ blocks: [contextBlock, actionsBlock] });

    logger.debug({ channel, threadTs, responseLength: fullText.length }, 'Streaming completed');
  } catch (streamError) {
    logger.error({ streamError }, 'Error during Slack streaming');
    await streamer.stop();
    throw streamError;
  }
}

async function handleShareToChannel(params: {
  teamId: string;
  channelId: string;
  userId: string;
  actionValue: string;
  responseUrl: string;
}) {
  const { teamId, channelId, userId, actionValue, responseUrl } = params;

  logger.info({ teamId, channelId, userId }, 'Handling share_to_channel action');

  // Parse the action value
  let textToShare = '';
  let agentName = 'Inkeep';

  try {
    const valueData = JSON.parse(actionValue);
    textToShare = valueData.text || '';
    agentName = valueData.agentName || 'Inkeep';
  } catch {
    logger.warn({ actionValue }, 'Failed to parse share_to_channel action value');
    return;
  }

  if (!textToShare) {
    logger.warn({}, 'No text content found to share');
    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: '❌ Could not find content to share.',
        response_type: 'ephemeral',
      });
    }
    return;
  }

  // Get bot token from Nango
  const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
  if (!workspaceConnection?.botToken) {
    logger.error({ teamId }, 'No bot token available for share_to_channel');
    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: '❌ Could not share to channel. Please try again.',
        response_type: 'ephemeral',
      });
    }
    return;
  }

  const slackClient = getSlackClient(workspaceConnection.botToken);

  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      text: textToShare,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: textToShare },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Shared by <@${userId}> • Powered by *${agentName}* via Inkeep`,
            },
          ],
        },
      ],
    });

    logger.info({ channelId, userId }, 'Successfully shared message to channel');

    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: '✅ Response shared to channel!',
        response_type: 'ephemeral',
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage, channelId }, 'Failed to share message to channel');

    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: '❌ Failed to share to channel. Please try again.',
        response_type: 'ephemeral',
      });
    }
  }
}

async function sendResponseUrlMessage(
  responseUrl: string,
  message: { text: string; response_type?: 'ephemeral' | 'in_channel' }
): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Failed to send response_url message');
  }
}

const SlackUserLinkSchema = z.object({
  slackUserId: z.string(),
  slackTeamId: z.string(),
  slackUsername: z.string().optional(),
  slackDisplayName: z.string().optional(),
  slackEmail: z.string().optional(),
  isSlackAdmin: z.boolean().optional(),
  isSlackOwner: z.boolean().optional(),
  enterpriseId: z.string().optional(),
  enterpriseName: z.string().optional(),
  appUserId: z.string(),
  appUserEmail: z.string().optional(),
  appUserName: z.string().optional(),
  nangoConnectionId: z.string(),
  isLinked: z.boolean(),
  linkedAt: z.string().optional(),
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/install',
    summary: 'Install Slack App',
    description: 'Redirects to Slack OAuth page for workspace installation',
    operationId: 'slack-install',
    tags: ['Work Apps', 'Slack'],
    responses: {
      302: {
        description: 'Redirect to Slack OAuth',
      },
    },
  }),
  (c) => {
    const clientId = env.SLACK_CLIENT_ID;
    const redirectUri = `${env.SLACK_APP_URL}/work-apps/slack/oauth_redirect`;
    const scopes = 'commands,chat:write,users:read,team:read,users:read.email,channels:read';

    const slackAuthUrl = new URL('https://slack.com/oauth/v2/authorize');
    slackAuthUrl.searchParams.set('client_id', clientId || '');
    slackAuthUrl.searchParams.set('scope', scopes);
    slackAuthUrl.searchParams.set('redirect_uri', redirectUri);

    logger.info({ redirectUri }, 'Redirecting to Slack OAuth');

    return c.redirect(slackAuthUrl.toString());
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/oauth_redirect',
    summary: 'Slack OAuth Callback',
    description: 'Handles the OAuth callback from Slack after workspace installation',
    operationId: 'slack-oauth-redirect',
    tags: ['Work Apps', 'Slack'],
    request: {
      query: z.object({
        code: z.string().optional(),
        error: z.string().optional(),
      }),
    },
    responses: {
      302: {
        description: 'Redirect to dashboard with workspace data',
      },
    },
  }),
  async (c) => {
    const { code, error } = c.req.valid('query');
    const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';
    const dashboardUrl = `${manageUiUrl}/default/work-apps/slack`;

    if (error) {
      logger.error({ error }, 'Slack OAuth error');
      return c.redirect(`${dashboardUrl}?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      logger.error({}, 'No code provided in OAuth callback');
      return c.redirect(`${dashboardUrl}?error=no_code`);
    }

    try {
      const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.SLACK_CLIENT_ID || '',
          client_secret: env.SLACK_CLIENT_SECRET || '',
          code,
          redirect_uri: `${env.SLACK_APP_URL}/work-apps/slack/oauth_redirect`,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenData.ok) {
        logger.error({ error: tokenData.error }, 'Slack token exchange failed');
        return c.redirect(
          `${dashboardUrl}?error=${encodeURIComponent(tokenData.error || 'token_exchange_failed')}`
        );
      }

      const client = getSlackClient(tokenData.access_token);
      const teamInfo = await getSlackTeamInfo(client);

      console.log('=== SLACK TEAM INFO ===');
      console.log(JSON.stringify(teamInfo, null, 2));
      console.log('=======================');

      const workspaceData = {
        ok: true,
        teamId: tokenData.team?.id,
        teamName: tokenData.team?.name,
        teamDomain: teamInfo?.domain,
        enterpriseId: tokenData.enterprise?.id,
        enterpriseName: tokenData.enterprise?.name,
        isEnterpriseInstall: tokenData.is_enterprise_install || false,
        botUserId: tokenData.bot_user_id,
        botToken: tokenData.access_token,
        botScopes: tokenData.scope,
        installerUserId: tokenData.authed_user?.id,
        installedAt: new Date().toISOString(),
      };

      if (workspaceData.teamId && workspaceData.botToken) {
        workspaceBotTokens.set(workspaceData.teamId, {
          botToken: workspaceData.botToken,
          teamName: workspaceData.teamName || '',
          installedAt: workspaceData.installedAt,
        });
        logger.info({ teamId: workspaceData.teamId }, 'Stored bot token for workspace');
      }

      logger.info(
        { teamId: workspaceData.teamId, teamName: workspaceData.teamName },
        'Slack workspace installation successful'
      );

      const encodedData = encodeURIComponent(JSON.stringify(workspaceData));
      return c.redirect(`${dashboardUrl}?success=true&workspace=${encodedData}`);
    } catch (err) {
      logger.error({ error: err }, 'Slack OAuth callback error');
      return c.redirect(`${dashboardUrl}?error=callback_error`);
    }
  }
);

app.post('/connect', async (c) => {
  const body = await c.req.json();
  const { userId, userEmail, userName, tenantId, sessionToken, sessionExpiresAt } = body as {
    userId?: string;
    userEmail?: string;
    userName?: string;
    tenantId?: string;
    sessionToken?: string;
    sessionExpiresAt?: string;
  };

  if (!userId) {
    return c.json({ error: 'userId is required' }, 400);
  }

  if (sessionToken && sessionExpiresAt) {
    pendingSessionTokens.set(userId, {
      token: sessionToken,
      expiresAt: sessionExpiresAt,
      createdAt: Date.now(),
    });
    logger.info({ userId }, 'Stored pending session token for Slack connection');
  }

  console.log('=== NANGO CONNECT SESSION CREATED ===');
  console.log({
    userId,
    userEmail,
    userName,
    integrationId: getSlackIntegrationId(),
    hasSessionToken: !!sessionToken,
  });
  console.log('=====================================');

  const session = await createConnectSession({
    userId,
    userEmail,
    userName,
    tenantId: tenantId || 'default',
  });

  if (!session) {
    return c.json({ error: 'Failed to create session' }, 500);
  }

  return c.json(session);
});

app.post('/nango-webhook', async (c) => {
  const body = await c.req.text();

  let payload: {
    type: string;
    success?: boolean;
    connectionId?: string;
    providerConfigKey?: string;
    endUser?: {
      endUserId: string;
      endUserEmail?: string;
      displayName?: string;
    };
    organization?: {
      id: string;
      displayName?: string;
    };
  };

  try {
    payload = JSON.parse(body);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  console.log('=== NANGO WEBHOOK RECEIVED ===');
  console.log(JSON.stringify(payload, null, 2));
  console.log('==============================');

  if (payload.type === 'auth' && payload.success && payload.endUser && payload.connectionId) {
    const { endUser, connectionId } = payload;
    const integrationId = getSlackIntegrationId();

    try {
      const nango = getSlackNango();
      const connection = await nango.getConnection(integrationId, connectionId);

      const rawResponse = (connection as { credentials?: { raw?: unknown } }).credentials?.raw as {
        ok?: boolean;
        authed_user?: { id: string };
        bot_user_id?: string;
        team?: { id: string; name: string };
        enterprise?: { id: string; name: string };
        access_token?: string;
        scope?: string;
        is_enterprise_install?: boolean;
      };

      console.log('=== NANGO CONNECTION INFO ===');
      console.log(JSON.stringify(rawResponse, null, 2));
      console.log('=============================');

      if (rawResponse?.ok && rawResponse.access_token) {
        const slackUserId = rawResponse.authed_user?.id || '';
        const slackTeamId = rawResponse.team?.id || '';
        const accessToken = rawResponse.access_token;

        let slackUsername = '';
        let slackDisplayName = '';
        let slackEmail = '';
        let isSlackAdmin = false;
        let isSlackOwner = false;

        if (slackUserId && accessToken) {
          const client = getSlackClient(accessToken);
          const userInfo = await getSlackUserInfo(client, slackUserId);

          if (userInfo) {
            slackUsername = userInfo.name || '';
            slackDisplayName = userInfo.displayName || userInfo.realName || '';
            slackEmail = userInfo.email || '';
            isSlackAdmin = userInfo.isAdmin || false;
            isSlackOwner = userInfo.isOwner || false;
          }
        }

        const userLink: z.infer<typeof SlackUserLinkSchema> = {
          slackUserId,
          slackTeamId,
          slackUsername,
          slackDisplayName,
          slackEmail,
          isSlackAdmin,
          isSlackOwner,
          enterpriseId: rawResponse.enterprise?.id,
          enterpriseName: rawResponse.enterprise?.name,
          appUserId: endUser.endUserId,
          appUserEmail: endUser.endUserEmail,
          appUserName: endUser.displayName,
          nangoConnectionId: connectionId,
          isLinked: true,
          linkedAt: new Date().toISOString(),
        };

        const tenantId = payload.organization?.id || 'default';

        const pendingSession = pendingSessionTokens.get(endUser.endUserId);
        if (pendingSession) {
          pendingSessionTokens.delete(endUser.endUserId);
          logger.info({ userId: endUser.endUserId }, 'Retrieved pending session token');
        }

        await updateConnectionMetadata(connectionId, {
          linked_at: userLink.linkedAt || '',
          app_user_id: endUser.endUserId,
          app_user_email: endUser.endUserEmail || '',
          tenant_id: tenantId,
          slack_user_id: slackUserId,
          slack_team_id: slackTeamId,
          slack_team_name: rawResponse.team?.name || '',
          slack_username: slackUsername,
          slack_display_name: slackDisplayName,
          slack_email: slackEmail,
          is_slack_admin: String(isSlackAdmin),
          is_slack_owner: String(isSlackOwner),
          enterprise_id: rawResponse.enterprise?.id || '',
          enterprise_name: rawResponse.enterprise?.name || '',
          ...(pendingSession
            ? {
                inkeep_session_token: pendingSession.token,
                inkeep_session_expires_at: pendingSession.expiresAt,
              }
            : {}),
        });

        console.log('=== USER LINK CREATED (ENRICHED) ===');
        console.log(JSON.stringify(userLink, null, 2));
        console.log('====================================');

        logger.info(
          { appUserId: endUser.endUserId, slackUserId, slackEmail },
          'User linked to Slack with enriched metadata'
        );
      }
    } catch (error) {
      logger.error({ error, connectionId }, 'Failed to process Nango webhook');
    }
  }

  return c.json({ received: true });
});

app.post('/commands', async (c) => {
  const body = await c.req.text();
  const timestamp = c.req.header('x-slack-request-timestamp') || '';
  const signature = c.req.header('x-slack-signature') || '';

  if (env.SLACK_SIGNING_SECRET) {
    if (!verifySlackRequest(env.SLACK_SIGNING_SECRET, body, timestamp, signature)) {
      logger.error({}, 'Invalid Slack request signature');
      return c.json({ response_type: 'ephemeral', text: 'Invalid request signature' }, 401);
    }
  }

  const params = parseSlackCommandBody(body);

  const payload: SlackCommandPayload = {
    command: params.command || '',
    text: params.text || '',
    userId: params.user_id || '',
    userName: params.user_name || '',
    teamId: params.team_id || '',
    teamDomain: params.team_domain || '',
    channelId: params.channel_id || '',
    channelName: params.channel_name || '',
    responseUrl: params.response_url || '',
    triggerId: params.trigger_id || '',
  };

  const response = await handleCommand(payload);
  return c.json(response);
});

app.get('/workspace-info', async (c) => {
  const connectionId = c.req.query('connectionId');

  if (!connectionId) {
    return c.json({ error: 'connectionId is required' }, 400);
  }

  try {
    const accessToken = await getConnectionAccessToken(connectionId);

    if (!accessToken) {
      return c.json({ error: 'No access token found' }, 404);
    }

    const client = getSlackClient(accessToken);
    const [team, channels] = await Promise.all([
      getSlackTeamInfo(client),
      getSlackChannels(client, 20),
    ]);

    console.log('=== SLACK WORKSPACE INFO ===');
    console.log({ team: !!team, channelCount: channels.length });
    console.log('============================');

    return c.json({ team, channels });
  } catch (error) {
    logger.error({ error, connectionId }, 'Failed to fetch Slack workspace info');
    return c.json({ error: 'Failed to fetch workspace info' }, 500);
  }
});

app.post('/events', async (c) => {
  const contentType = c.req.header('content-type') || '';
  const body = await c.req.text();

  let eventBody: Record<string, unknown>;
  try {
    eventBody = parseSlackEventBody(body, contentType);
  } catch {
    return c.json({ error: 'Invalid payload' }, 400);
  }

  console.log('=== SLACK EVENT RECEIVED ===');
  console.log(JSON.stringify(eventBody, null, 2));
  console.log('============================');

  const eventType = eventBody.type as string | undefined;

  if (eventType === 'url_verification') {
    logger.info({}, 'Responding to Slack URL verification challenge');
    return c.text(String(eventBody.challenge));
  }

  if (eventType === 'event_callback') {
    const teamId = eventBody.team_id as string | undefined;
    const event = eventBody.event as
      | {
          type?: string;
          user?: string;
          text?: string;
          channel?: string;
          ts?: string;
          thread_ts?: string;
          bot_id?: string;
          subtype?: string;
        }
      | undefined;

    if (event?.bot_id || event?.subtype === 'bot_message') {
      logger.debug({ botId: event.bot_id }, 'Ignoring bot message');
      return c.json({ ok: true });
    }

    console.log('=== SLACK EVENT CALLBACK ===');
    console.log(JSON.stringify(event, null, 2));
    console.log('============================');

    if (event?.type === 'app_home_opened') {
      logger.info({ userId: event.user }, 'App home opened');
    }

    if (event?.type === 'app_mention' && event.channel && event.user && teamId) {
      logger.info({ userId: event.user, channel: event.channel, teamId }, 'Bot was mentioned');

      const question = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();

      handleAppMention({
        slackUserId: event.user,
        channel: event.channel,
        text: question,
        threadTs: event.thread_ts || event.ts || '',
        messageTs: event.ts || '',
        teamId,
      }).catch((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        logger.error({ errorMessage, errorStack }, 'Failed to handle app mention (outer catch)');
      });
    }
  }

  if (eventType === 'block_actions' || eventType === 'interactive_message') {
    console.log('=== SLACK INTERACTIVE EVENT ===');
    console.log('Received interactive event, processing actions');
    console.log('================================');

    const actions = eventBody.actions as
      | Array<{
          action_id: string;
          value?: string;
        }>
      | undefined;

    const teamId = (eventBody.team as { id?: string })?.id;
    const channelId = (eventBody.channel as { id?: string })?.id;
    const userId = (eventBody.user as { id?: string })?.id;
    const responseUrl = eventBody.response_url as string | undefined;

    if (actions && teamId) {
      for (const action of actions) {
        if (action.action_id === 'share_to_channel' && action.value) {
          handleShareToChannel({
            teamId,
            channelId: channelId || '',
            userId: userId || '',
            actionValue: action.value,
            responseUrl: responseUrl || '',
          }).catch((err) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error(
              { errorMessage, actionId: action.action_id },
              'Failed to handle share_to_channel'
            );
          });
        }
      }
    }
  }

  return c.json({ ok: true });
});

app.get('/status', async (c) => {
  const appUserId = c.req.query('userId');

  if (!appUserId) {
    return c.json({ error: 'userId is required' }, 400);
  }

  try {
    const status = await getConnectionStatus(appUserId);

    console.log('=== SLACK CONNECTION STATUS ===');
    console.log({ appUserId, connected: status.connected });
    console.log('===============================');

    return c.json(status);
  } catch (error) {
    logger.error({ error, appUserId }, 'Failed to get connection status');
    return c.json({ error: 'Failed to get connection status' }, 500);
  }
});

app.post('/disconnect', async (c) => {
  const body = await c.req.json();
  const { userId, connectionId } = body as { userId?: string; connectionId?: string };

  if (!userId && !connectionId) {
    return c.json({ error: 'Either userId or connectionId is required' }, 400);
  }

  try {
    let targetConnectionId = connectionId;

    if (!targetConnectionId && userId) {
      const connection = await findConnectionByAppUser(userId);
      if (connection) {
        targetConnectionId = connection.connectionId;
      }
    }

    if (!targetConnectionId) {
      return c.json({ error: 'No connection found for this user' }, 404);
    }

    const success = await deleteConnection(targetConnectionId);

    if (!success) {
      return c.json({ error: 'Failed to delete connection' }, 500);
    }

    console.log('=== SLACK DISCONNECTION ===');
    console.log({ userId, connectionId: targetConnectionId, success: true });
    console.log('===========================');

    logger.info({ userId, connectionId: targetConnectionId }, 'User disconnected from Slack');

    return c.json({ success: true, connectionId: targetConnectionId });
  } catch (error) {
    logger.error({ error, userId, connectionId }, 'Failed to disconnect from Slack');
    return c.json({ error: 'Failed to disconnect' }, 500);
  }
});

app.post('/refresh-session', async (c) => {
  const body = await c.req.json();
  const { userId, sessionToken, sessionExpiresAt } = body as {
    userId?: string;
    sessionToken?: string;
    sessionExpiresAt?: string;
  };

  if (!userId) {
    return c.json({ error: 'userId is required' }, 400);
  }

  if (!sessionToken) {
    return c.json({ error: 'sessionToken is required' }, 400);
  }

  try {
    const connection = await findConnectionByAppUser(userId);

    if (!connection) {
      return c.json({ error: 'No connection found for this user', needsRelink: true }, 404);
    }

    await updateConnectionMetadata(connection.connectionId, {
      inkeep_session_token: sessionToken,
      inkeep_session_expires_at: sessionExpiresAt || '',
    });

    console.log('=== SLACK SESSION REFRESHED ===');
    console.log({ userId, connectionId: connection.connectionId, hasNewToken: true });
    console.log('===============================');

    logger.info(
      { userId, connectionId: connection.connectionId },
      'Refreshed Inkeep session token in Nango'
    );

    return c.json({ success: true, connectionId: connection.connectionId });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to refresh session token');
    return c.json({ error: 'Failed to refresh session' }, 500);
  }
});

app.post('/register-workspace', async (c) => {
  const body = await c.req.json();
  const { teamId, teamName, botToken } = body as {
    teamId?: string;
    teamName?: string;
    botToken?: string;
  };

  if (!teamId) {
    return c.json({ error: 'teamId is required' }, 400);
  }

  if (!botToken) {
    return c.json({ error: 'botToken is required' }, 400);
  }

  workspaceBotTokens.set(teamId, {
    botToken,
    teamName: teamName || '',
    installedAt: new Date().toISOString(),
  });

  logger.info({ teamId, teamName }, 'Registered workspace bot token');

  return c.json({ success: true, teamId });
});

app.get('/workspaces', async (c) => {
  const workspaces = Array.from(workspaceBotTokens.entries()).map(([teamId, data]) => ({
    teamId,
    teamName: data.teamName,
    installedAt: data.installedAt,
    hasToken: !!data.botToken,
  }));

  return c.json({ workspaces });
});

const workspaceSettings = new Map<
  string,
  {
    defaultAgent?: {
      agentId: string;
      agentName: string;
      projectId: string;
      projectName: string;
    };
    updatedAt: string;
  }
>();

app.get('/agents', async (c) => {
  const tenantId = c.req.query('tenantId') || 'default';

  try {
    const baseUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

    const projectsResponse = await fetch(
      `${baseUrl}/manage/tenants/${tenantId}/projects?limit=100`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Inkeep-Bypass-Secret': env.INKEEP_AGENTS_API_BYPASS_SECRET || '',
        },
      }
    );

    if (!projectsResponse.ok) {
      logger.error({ status: projectsResponse.status }, 'Failed to fetch projects');
      return c.json({ agents: [] });
    }

    const projectsData = (await projectsResponse.json()) as {
      data: Array<{ id: string; name: string | null }>;
    };

    const allAgents: Array<{
      id: string;
      name: string | null;
      projectId: string;
      projectName: string | null;
    }> = [];

    for (const project of projectsData.data || []) {
      try {
        const agentsResponse = await fetch(
          `${baseUrl}/manage/tenants/${tenantId}/projects/${project.id}/agents?limit=100`,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Inkeep-Bypass-Secret': env.INKEEP_AGENTS_API_BYPASS_SECRET || '',
            },
          }
        );

        if (agentsResponse.ok) {
          const agentsData = (await agentsResponse.json()) as {
            data: Array<{ id: string; name: string | null }>;
          };

          for (const agent of agentsData.data || []) {
            allAgents.push({
              id: agent.id,
              name: agent.name,
              projectId: project.id,
              projectName: project.name,
            });
          }
        }
      } catch {
        logger.warn({ projectId: project.id }, 'Failed to fetch agents for project');
      }
    }

    return c.json({ agents: allAgents });
  } catch (error) {
    logger.error({ error }, 'Failed to list agents');
    return c.json({ agents: [] });
  }
});

app.post('/workspace-settings', async (c) => {
  const body = await c.req.json();
  const { teamId, defaultAgent } = body as {
    teamId: string;
    defaultAgent?: DefaultAgentConfig;
  };

  if (!teamId) {
    return c.json({ error: 'teamId is required' }, 400);
  }

  if (defaultAgent) {
    const success = await setWorkspaceDefaultAgentInNango(teamId, defaultAgent);
    if (!success) {
      logger.warn({ teamId }, 'Failed to persist to Nango, using in-memory fallback');
    }
  }

  const existing = workspaceSettings.get(teamId) || { updatedAt: '' };
  workspaceSettings.set(teamId, {
    ...existing,
    defaultAgent,
    updatedAt: new Date().toISOString(),
  });

  logger.info(
    { teamId, agentId: defaultAgent?.agentId, agentName: defaultAgent?.agentName },
    'Saved workspace default agent'
  );

  return c.json({ success: true });
});

app.get('/workspace-settings', async (c) => {
  const teamId = c.req.query('teamId');

  if (!teamId) {
    return c.json({ error: 'teamId is required' }, 400);
  }

  const nangoDefault = await getWorkspaceDefaultAgentFromNango(teamId);
  if (nangoDefault) {
    return c.json({ defaultAgent: nangoDefault });
  }

  const settings = workspaceSettings.get(teamId);
  return c.json({
    defaultAgent: settings?.defaultAgent,
  });
});

export async function getWorkspaceDefaultAgent(teamId: string): Promise<DefaultAgentConfig | null> {
  const nangoDefault = await getWorkspaceDefaultAgentFromNango(teamId);
  if (nangoDefault) {
    return nangoDefault;
  }

  const settings = workspaceSettings.get(teamId);
  return settings?.defaultAgent || null;
}

export default app;
