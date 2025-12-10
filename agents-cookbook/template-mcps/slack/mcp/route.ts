import { WebClient } from '@slack/web-api';
import { createMcpHandler } from 'mcp-handler';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * MCP server accepts the following headers:
 * - x-user-role: required, the role of the user (admin, moderator, user)
 * - slack-token: required, the Slack token for the user. See https://docs.slack.dev/authentication/tokens/#bot for info on how to get a bot token.
 * - slack-default-channel: The default Slack channel for the user
 *
 * Based on the role, the server will expose the appropriate tools.
 *
 * The server will also expose the following tools:
 * - send_slack_message: Send a message to a Slack channel
 * - delete_slack_message: Delete a message from a Slack channel
 * - list_channels: List all Slack channels
 */

// Factory function to create handler with conditional tools based on headers
function createHandlerForRequest(headers: Headers) {
  const userRole = headers.get('x-user-role') || 'user';

  // Define which tools are available for which roles
  const roleBasedTools: Record<string, string[]> = {
    admin: ['send_slack_message', 'delete_slack_message', 'list_channels'],
    moderator: ['send_slack_message', 'list_channels'],
    user: ['send_slack_message'],
  };

  const toolsForRole = roleBasedTools[userRole] || roleBasedTools['user'];

  // Build capabilities object dynamically
  const capabilities: Record<string, any> = {
    tools: {},
  };

  return createMcpHandler(
    async (server) => {
      // Only register tools that should be exposed
      if (toolsForRole.includes('send_slack_message')) {
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

              if (headers) {
                SLACK_TOKEN = headers.get('slack-token');
                SLACK_DEFAULT_CHANNEL = headers.get('slack-default-channel');
              }

              if (!SLACK_TOKEN) {
                throw new Error('Slack token not found in headers: must have slack-token header');
              }

              const targetChannel = channel || SLACK_DEFAULT_CHANNEL;

              if (!targetChannel) {
                throw new Error('No channel specified and slack-default-channel header not set');
              }

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
        capabilities.tools.send_slack_message = {
          description: 'Send a message to a Slack channel',
        };
      }

      // Example: Admin-only tool
      if (toolsForRole.includes('delete_slack_message')) {
        server.tool(
          'delete_slack_message',
          'Delete a message from a Slack channel (admin only)',
          {
            channel: z.string().describe('The Slack channel ID'),
            timestamp: z.string().describe('The message timestamp to delete'),
          },
          async ({ channel, timestamp }) => {
            try {
              if (headers) {
                const SLACK_TOKEN = headers.get('slack-token');

                if (!SLACK_TOKEN) {
                  throw new Error('Slack token not found in headers');
                }

                const slack = new WebClient(SLACK_TOKEN);

                await slack.chat.delete({
                  channel,
                  ts: timestamp,
                });

                return {
                  content: [
                    {
                      type: 'text',
                      text: `Message deleted successfully from channel ${channel}`,
                    },
                  ],
                };
              }
              throw new Error('Headers not available');
            } catch (error) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Failed to delete message: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
                  },
                ],
              };
            }
          }
        );
        capabilities.tools.delete_slack_message = {
          description: 'Delete a message from a Slack channel (admin only)',
        };
      }

      // Example: Moderator and Admin tool
      if (toolsForRole.includes('list_channels')) {
        server.tool(
          'list_channels',
          'List all Slack channels',
          // Does not accept any parameters
          {},
          async () => {
            try {
              if (headers) {
                const SLACK_TOKEN = headers.get('slack-token');

                if (!SLACK_TOKEN) {
                  throw new Error('Slack token not found in headers');
                }

                const slack = new WebClient(SLACK_TOKEN);
                const result = await slack.conversations.list();

                return {
                  content: [
                    {
                      type: 'text',
                      text: `Found ${result.channels?.length || 0} channels: ${
                        result.channels?.map((c) => c.name).join(', ') || 'none'
                      }`,
                    },
                  ],
                };
              }
              throw new Error('Headers not available');
            } catch (error) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Failed to list channels: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
                  },
                ],
              };
            }
          }
        );
        capabilities.tools.list_channels = {
          description: 'List all Slack channels',
        };
      }
    },
    {
      capabilities,
    },
    {
      basePath: '/slack',
      verboseLogs: true,
      maxDuration: 60,
      disableSse: true,
    }
  );
}

// Wrap the handler to capture headers and create handler dynamically
const wrappedHandler = async (request: NextRequest) => {
  // Create handler with tools filtered based on headers
  const handler = createHandlerForRequest(request.headers);

  return handler(request);
};

export { wrappedHandler as GET, wrappedHandler as POST, wrappedHandler as DELETE };
