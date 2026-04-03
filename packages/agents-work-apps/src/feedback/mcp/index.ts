import { z } from '@hono/zod-openapi';
import {
  createFeedback,
  generateId,
  getFeedbackById,
  listConversations,
  listFeedback,
} from '@inkeep/agents-core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toFetchResponse, toReqRes } from 'fetch-to-node';
import { Hono } from 'hono';
import runDbClient from '../../db/runDbClient';
import { getLogger } from '../../logger';
import { platformMcpAuth } from '../../platform-mcp-auth';

const logger = getLogger('feedback-mcp');

type ToolScope = { tenantId: string; projectId: string; toolId: string };

async function resolveConversationIdsForAgent(
  scope: { tenantId: string; projectId: string },
  agentId: string
): Promise<string[]> {
  const result = await listConversations(runDbClient)({
    scopes: scope,
    pagination: { page: 1, limit: 200 },
  });
  return result.conversations.filter((c) => c.agentId === agentId).map((c) => c.id);
}

const getServer = (scope: ToolScope) => {
  const server = new McpServer(
    {
      name: 'inkeep-feedback-mcp-server',
      version: '1.0.0',
      description: 'Feedback MCP server for listing, submitting, and summarizing user feedback.',
    },
    { capabilities: { logging: {} } }
  );

  server.tool(
    'list-feedback',
    'List feedback entries with optional filters. Supports time range, result limit, feedback type, conversation ID, and agent ID filtering. Agent ID filtering resolves conversations owned by the agent and returns their feedback.',
    {
      agentId: z.string().optional().describe('Filter by agent ID (resolves via conversations).'),
      conversationId: z.string().optional().describe('Filter by conversation ID.'),
      messageId: z.string().optional().describe('Filter by message ID.'),
      type: z.enum(['positive', 'negative']).optional().describe('Filter by feedback type.'),
      startDate: z
        .string()
        .optional()
        .describe(
          'Start date filter (YYYY-MM-DD). Returns feedback created on or after this date.'
        ),
      endDate: z
        .string()
        .optional()
        .describe('End date filter (YYYY-MM-DD). Returns feedback created on or before this date.'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of results to return (1-100, default 10).'),
      page: z.number().min(1).optional().describe('Page number for pagination (default 1).'),
    },
    async ({ agentId, conversationId, messageId, type, startDate, endDate, limit, page }) => {
      try {
        if (agentId && conversationId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Provide either agentId or conversationId, not both.',
              },
            ],
            isError: true,
          };
        }

        const feedbackLimit = limit ?? 10;
        const feedbackPage = page ?? 1;
        const scopes = { tenantId: scope.tenantId, projectId: scope.projectId };

        let targetConversationIds: string[] | undefined;

        if (agentId) {
          targetConversationIds = await resolveConversationIdsForAgent(scopes, agentId);

          if (targetConversationIds.length === 0) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    data: [],
                    pagination: { page: 1, limit: feedbackLimit, total: 0, pages: 0 },
                  }),
                },
              ],
            };
          }
        }

        const conversationIds =
          targetConversationIds ?? (conversationId ? [conversationId] : undefined);

        if (conversationIds && conversationIds.length > 0) {
          const results = await Promise.all(
            conversationIds.map((cId) =>
              listFeedback(runDbClient)({
                scopes,
                conversationId: cId,
                messageId,
                type,
                startDate,
                endDate,
                pagination: { page: 1, limit: 100 },
              })
            )
          );

          const allFeedback = results.flatMap((r) => r.feedback);
          allFeedback.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

          const total = allFeedback.length;
          const offset = (feedbackPage - 1) * feedbackLimit;
          const paginated = allFeedback.slice(offset, offset + feedbackLimit);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  data: paginated,
                  pagination: {
                    page: feedbackPage,
                    limit: feedbackLimit,
                    total,
                    pages: Math.ceil(total / feedbackLimit),
                  },
                }),
              },
            ],
          };
        }

        const result = await listFeedback(runDbClient)({
          scopes,
          messageId,
          type,
          startDate,
          endDate,
          pagination: { page: feedbackPage, limit: feedbackLimit },
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                data: result.feedback,
                pagination: {
                  page: feedbackPage,
                  limit: feedbackLimit,
                  total: result.total,
                  pages: Math.ceil(result.total / feedbackLimit),
                },
              }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error, toolId: scope.toolId }, 'Failed to list feedback via MCP');
        return {
          content: [{ type: 'text' as const, text: `Error listing feedback: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get-feedback',
    'Get a single feedback entry by its ID.',
    {
      feedbackId: z.string().describe('The ID of the feedback entry to retrieve.'),
    },
    async ({ feedbackId }) => {
      try {
        const entry = await getFeedbackById(runDbClient)({
          scopes: { tenantId: scope.tenantId, projectId: scope.projectId },
          feedbackId,
        });

        if (!entry) {
          return {
            content: [{ type: 'text' as const, text: `Feedback not found: ${feedbackId}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ data: entry }) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error, toolId: scope.toolId, feedbackId }, 'Failed to get feedback via MCP');
        return {
          content: [{ type: 'text' as const, text: `Error getting feedback: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'submit-feedback',
    'Submit feedback for a conversation or a specific message within a conversation.',
    {
      conversationId: z.string().describe('The conversation ID to attach feedback to.'),
      messageId: z.string().optional().describe('Optional message ID for message-level feedback.'),
      type: z.enum(['positive', 'negative']).describe('Feedback type: positive or negative.'),
      details: z.string().optional().describe('Optional text details explaining the feedback.'),
    },
    async ({ conversationId, messageId, type, details }) => {
      try {
        const created = await createFeedback(runDbClient)({
          id: generateId(),
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          conversationId,
          messageId,
          type,
          details: details ?? null,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ data: created }) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(
          { error, toolId: scope.toolId, conversationId },
          'Failed to submit feedback via MCP'
        );
        return {
          content: [{ type: 'text' as const, text: `Error submitting feedback: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get-feedback-summary',
    'Get aggregated feedback counts (positive, negative, total) for a project scope. Optionally filter by agent ID, conversation ID, and/or time range.',
    {
      agentId: z.string().optional().describe('Scope summary to a specific agent ID.'),
      conversationId: z.string().optional().describe('Scope summary to a specific conversation.'),
      startDate: z.string().optional().describe('Start date filter (YYYY-MM-DD).'),
      endDate: z.string().optional().describe('End date filter (YYYY-MM-DD).'),
    },
    async ({ agentId, conversationId, startDate, endDate }) => {
      try {
        const scopes = { tenantId: scope.tenantId, projectId: scope.projectId };
        let targetConversationIds: string[] | undefined;

        if (agentId) {
          targetConversationIds = await resolveConversationIdsForAgent(scopes, agentId);
        } else if (conversationId) {
          targetConversationIds = [conversationId];
        }

        const fetchCounts = async (filterType?: 'positive' | 'negative'): Promise<number> => {
          if (targetConversationIds && targetConversationIds.length > 0) {
            const results = await Promise.all(
              targetConversationIds.map((cId) =>
                listFeedback(runDbClient)({
                  scopes,
                  conversationId: cId,
                  type: filterType,
                  startDate,
                  endDate,
                  pagination: { page: 1, limit: 1 },
                })
              )
            );
            return results.reduce((sum, r) => sum + r.total, 0);
          }

          const result = await listFeedback(runDbClient)({
            scopes,
            type: filterType,
            startDate,
            endDate,
            pagination: { page: 1, limit: 1 },
          });
          return result.total;
        };

        const [positive, negative] = await Promise.all([
          fetchCounts('positive'),
          fetchCounts('negative'),
        ]);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                positive,
                negative,
                total: positive + negative,
                ...(agentId ? { agentId } : {}),
                ...(conversationId ? { conversationId } : {}),
                ...(startDate ? { startDate } : {}),
                ...(endDate ? { endDate } : {}),
              }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error, toolId: scope.toolId }, 'Failed to get feedback summary via MCP');
        return {
          content: [
            { type: 'text' as const, text: `Error getting feedback summary: ${message}` },
          ],
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
    tenantId: string;
    projectId: string;
  };
}>();

app.onError((err, c) => {
  const message = err.message || 'Internal server error';
  logger.error({ error: err }, 'Feedback MCP error');
  return c.json({ jsonrpc: '2.0', error: { code: -32603, message }, id: null }, 500);
});

app.use('/', platformMcpAuth());
app.post('/', async (c) => {
  const toolId = c.get('toolId');
  const tenantId = c.get('tenantId');
  const projectId = c.get('projectId');
  let server: McpServer | undefined;

  try {
    const body = await c.req.json();
    server = getServer({ tenantId, projectId, toolId });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);

    const { req, res } = toReqRes(c.req.raw);
    await transport.handleRequest(req, res, body);
    return toFetchResponse(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, toolId }, 'Feedback MCP request failed');
    return c.json({ jsonrpc: '2.0', error: { code: -32603, message }, id: null }, 500);
  } finally {
    if (server) {
      await server.close().catch((e) => logger.warn({ error: e }, 'Failed to close MCP server'));
    }
  }
});

app.delete('/', async (c) => {
  return c.json(
    { jsonrpc: '2.0', error: { code: -32001, message: 'Method Not Allowed' }, id: null },
    { status: 405 }
  );
});

app.get('/', async (c) => {
  return c.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null },
    { status: 405 }
  );
});

app.get('/health', async (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Feedback MCP Server',
  });
});

export default app;
