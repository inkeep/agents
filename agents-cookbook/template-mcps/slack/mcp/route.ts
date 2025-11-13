import { createMcpHandler } from 'mcp-handler';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { WebClient } from '@slack/web-api';

// Store headers globally for access in tools
let currentRequestHeaders: Headers | null = null;

// StreamableHttp server
const handler = createMcpHandler(
  async (server) => {
    server.tool(
      'send_slack_message',
      'Send a message to a Slack channel',
      {
        message: z.string().describe('The message to send'),
        channel: z
          .string()
          .optional()
          .describe(
            'The Slack channel ID or name (defaults to slack-default-channel header if set)'
          ),
      },
      async ({ message, channel }) => {
        try {
          let SLACK_TOKEN: string | null = null;
          let SLACK_DEFAULT_CHANNEL: string | null = null;

          // Access headers in the tool
          if (currentRequestHeaders) {
            console.log('=== Headers available in tool ===');
            currentRequestHeaders.forEach((value, key) => {
              console.log(`  ${key}: ${value}`);
            });

            SLACK_TOKEN = currentRequestHeaders.get('slack-token');
            SLACK_DEFAULT_CHANNEL = currentRequestHeaders.get('slack-default-channel');
          }

          if (!SLACK_TOKEN) {
            throw new Error(
              'Slack token not found in headers: must have slack-token header'
            );
          }

          const targetChannel = channel || SLACK_DEFAULT_CHANNEL;

          if (!targetChannel) {
            throw new Error(
              'No channel specified and slack-default-channel header not set'
            );
          }

          // Initialize Slack client with token from headers
          const slack = new WebClient(SLACK_TOKEN);

          const result = await slack.chat.postMessage({
            channel: targetChannel,
            text: message,
          });

          return {
            content: [
              {
                type: 'text',
                text: `Message sent successfully to channel ${targetChannel}. Timestamp: ${result.ts}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to send message: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
          };
        }
      }
    );
  },
  {
    capabilities: {
      tools: {
        send_slack_message: {
          description: 'Send a message to a Slack channel',
        },
      },
    },
  },
  {
    basePath: '/slack',
    verboseLogs: true,
    maxDuration: 60,
    disableSse: true,
  }
);

// Wrap the handler to capture headers and pass them to tools
const wrappedHandler = async (request: NextRequest) => {
  // Store headers globally so tools can access them
  currentRequestHeaders = request.headers;

  return handler(request);
};

export { wrappedHandler as GET, wrappedHandler as POST, wrappedHandler as DELETE };