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
import { getSlackClient } from '../services/client';
import { getConnectionAccessToken } from '../services/nango';
import { slackMcpAuth } from './auth';
import { resolveChannelId, validateChannelAccess } from './utils';

const logger = getLogger('slack-mcp');

async function resolveWorkspaceToken(toolId: string): Promise<string> {
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

const getServer = async (toolId: string) => {
  const botToken = await resolveWorkspaceToken(toolId);
  const config = await getSlackMcpToolAccessConfig(runDbClient)(toolId);
  const client = getSlackClient(botToken);

  const server = new McpServer(
    {
      name: 'inkeep-slack-mcp-server',
      version: '1.0.0',
      description: 'A Slack MCP server for posting messages to channels and DMs.',
    },
    { capabilities: { logging: {} } }
  );

  server.tool(
    'post-message',
    'Post a message to a Slack channel or DM. Supports mrkdwn formatting and thread replies.',
    {
      channel: z
        .string()
        .describe(
          'Channel ID (e.g., C1234567890) or channel name prefixed with # (e.g., #general). For DMs, use the DM channel ID (starts with D).'
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

        const args: {
          channel: string;
          text: string;
          thread_ts?: string;
        } = { channel: channelId, text };

        if (thread_ts) {
          args.thread_ts = thread_ts;
        }

        const result = await client.chat.postMessage(
          args as Parameters<typeof client.chat.postMessage>[0]
        );

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

  return server;
};

const app = new Hono<{
  Variables: {
    toolId: string;
  };
}>();

app.use('/', slackMcpAuth());
app.post('/', async (c) => {
  const toolId = c.get('toolId');
  const body = await c.req.json();

  const server = await getServer(toolId);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  const { req, res } = toReqRes(c.req.raw);

  try {
    await transport.handleRequest(req, res, body);
    return toFetchResponse(res);
  } finally {
    await server.close();
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
