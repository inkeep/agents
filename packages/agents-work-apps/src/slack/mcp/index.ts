import { z } from '@hono/zod-openapi';
import {
  getSlackMcpToolAccessConfig,
  listWorkAppSlackWorkspacesByTenant,
  workAppSlackMcpToolAccessConfig,
} from '@inkeep/agents-core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { eq } from 'drizzle-orm';
import { toFetchResponse, toReqRes } from 'fetch-to-node';
import { Hono } from 'hono';
import runDbClient from '../../db/runDbClient';
import { getLogger } from '../../logger';
import {
  getBotMemberChannels,
  getSlackClient,
  openDmConversation,
  postMessage,
  postMessageInThread,
} from '../services/client';
import { isSlackDevMode, loadSlackDevConfig } from '../services/dev-config';
import { getConnectionAccessToken } from '../services/nango';
import { slackMcpAuth } from './auth';
import { resolveChannelId, validateChannelAccess } from './utils';

const logger = getLogger('slack-mcp');

async function resolveWorkspaceToken(toolId: string): Promise<string> {
  if (isSlackDevMode()) {
    const devConfig = loadSlackDevConfig();
    if (devConfig?.botToken) {
      return devConfig.botToken;
    }
    throw new Error('Slack dev mode enabled but no botToken found in .slack-dev.json');
  }

  const accessRow = await runDbClient
    .select({ tenantId: workAppSlackMcpToolAccessConfig.tenantId })
    .from(workAppSlackMcpToolAccessConfig)
    .where(eq(workAppSlackMcpToolAccessConfig.toolId, toolId))
    .limit(1);

  const tenantId = accessRow[0]?.tenantId;
  if (!tenantId) {
    throw new Error(`No access config found for tool ${toolId}. Configure Slack access first.`);
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

interface ChannelInfo {
  id: string;
  name: string;
}

async function getAvailableChannels(
  client: ReturnType<typeof getSlackClient>,
  config: Awaited<ReturnType<ReturnType<typeof getSlackMcpToolAccessConfig>>>
): Promise<ChannelInfo[]> {
  try {
    const botChannels = await getBotMemberChannels(client);

    if (config.channelAccessMode === 'all') {
      return botChannels
        .filter((ch): ch is typeof ch & { id: string; name: string } => !!ch.id && !!ch.name)
        .map((ch) => ({ id: ch.id, name: ch.name }));
    }

    const allowedIds = new Set(config.channelIds);
    return botChannels
      .filter(
        (ch): ch is typeof ch & { id: string; name: string } =>
          !!ch.id && !!ch.name && allowedIds.has(ch.id)
      )
      .map((ch) => ({ id: ch.id, name: ch.name }));
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch available channels for tool description');
    return [];
  }
}

function getAvailableChannelsString(channels: ChannelInfo[]): string {
  if (channels.length === 0) {
    return 'No channels available';
  }
  return `Available channels: ${channels.map((ch) => `#${ch.name} (${ch.id})`).join(', ')}`;
}

const getServer = async (toolId: string) => {
  const botToken = await resolveWorkspaceToken(toolId);
  const config = await getSlackMcpToolAccessConfig(runDbClient)(toolId);
  const client = getSlackClient(botToken);
  const availableChannels = await getAvailableChannels(client, config);

  const server = new McpServer(
    {
      name: 'inkeep-slack-mcp-server',
      version: '1.0.0',
      description:
        'A Slack MCP server for posting messages to channels' +
        (config.dmEnabled ? ' and sending direct messages to users' : '') +
        '.\n' +
        availableChannels.map((ch) => `• #${ch.name} (${ch.id})`).join('\n'),
    },
    { capabilities: { logging: {} } }
  );

  server.tool(
    'post-channel-message',
    `Post a message to a Slack channel. Supports mrkdwn formatting and thread replies. ${getAvailableChannelsString(availableChannels)}`,
    {
      channel: z
        .string()
        .describe(
          'Channel ID (e.g., C1234567890) or channel name prefixed with # (e.g., #general).'
        ),
      text: z.string().describe('Message text. Supports Slack mrkdwn formatting.'),
      thread_ts: z
        .string()
        .optional()
        .describe('Thread timestamp to reply in a thread. If omitted, posts as a new message.'),
    },
    async ({ channel, text, thread_ts }) => {
      try {
        const channelId = await resolveChannelId(client, channel);

        const accessCheck = validateChannelAccess(channelId, config);
        if (!accessCheck.allowed) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${accessCheck.reason}` }],
            isError: true,
          };
        }

        const result = thread_ts
          ? await postMessageInThread(client, channelId, thread_ts, text)
          : await postMessage(client, channelId, text);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ok: result.ok,
                ts: result.ts,
                channel: result.channel,
              }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error, toolId, channel }, 'Failed to post Slack message via MCP');
        return {
          content: [{ type: 'text' as const, text: `Error posting message: ${message}` }],
          isError: true,
        };
      }
    }
  );

  if (config.dmEnabled) {
    server.tool(
      'post-direct-message',
      'Send a direct message to a Slack user. Opens or continues an existing DM conversation with the user.',
      {
        user_id: z.string().describe('The Slack user ID to DM (e.g., U1234567890).'),
        text: z.string().describe('Message text. Supports Slack mrkdwn formatting.'),
        thread_ts: z
          .string()
          .optional()
          .describe('Thread timestamp to reply in a thread. If omitted, posts as a new message.'),
      },
      async ({ user_id, text, thread_ts }) => {
        try {
          const dmChannelId = await openDmConversation(client, user_id);

          const result = thread_ts
            ? await postMessageInThread(client, dmChannelId, thread_ts, text)
            : await postMessage(client, dmChannelId, text);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  ok: result.ok,
                  ts: result.ts,
                  channel: result.channel,
                  user_id,
                }),
              },
            ],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.error({ error, toolId, user_id }, 'Failed to send Slack DM via MCP');
          return {
            content: [{ type: 'text' as const, text: `Error sending DM: ${message}` }],
            isError: true,
          };
        }
      }
    );
  }

  return server;
};

const app = new Hono<{
  Variables: {
    toolId: string;
  };
}>();

app.onError((err, c) => {
  const message = err.message || 'Internal server error';
  logger.error({ error: err }, 'Slack MCP error');
  return c.json({ jsonrpc: '2.0', error: { code: -32603, message }, id: null }, 500);
});

app.use('/', slackMcpAuth());
app.post('/', async (c) => {
  const toolId = c.get('toolId');
  let server: McpServer | undefined;

  try {
    const body = await c.req.json();
    server = await getServer(toolId);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);

    const { req, res } = toReqRes(c.req.raw);
    await transport.handleRequest(req, res, body);
    return toFetchResponse(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, toolId }, 'MCP request failed');
    return c.json({ jsonrpc: '2.0', error: { code: -32603, message }, id: null }, 500);
  } finally {
    if (server) {
      await server.close().catch((e) => logger.warn({ error: e }, 'Failed to close MCP server'));
    }
  }
});

app.delete('/', async (c) => {
  return c.json(
    {
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Method Not Allowed' },
      id: null,
    },
    { status: 405 }
  );
});

app.get('/', async (c) => {
  return c.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    },
    { status: 405 }
  );
});

app.get('/health', async (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Slack MCP Server',
  });
});

export default app;
