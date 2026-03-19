import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatTicketList } from '../lib/format.js';
import type { ZendeskTicketsListResponse } from '../lib/types.js';
import type { ZendeskClient } from '../lib/zendesk-client.js';
import { handleError } from '../lib/zendesk-client.js';

export const ListTicketsInputSchema = z
  .object({
    sort_by: z
      .enum(['created_at', 'updated_at', 'priority', 'status'])
      .optional()
      .describe('Sort field (default: updated_at)'),
    sort_order: z.enum(['asc', 'desc']).optional().describe('Sort order (default: desc)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Results per page, 1-100 (default: 25)'),
    cursor: z
      .string()
      .optional()
      .describe(
        'Cursor for pagination. Use the next_cursor from a previous response to get the next page.'
      ),
  })
  .strict();

export type ListTicketsInput = z.infer<typeof ListTicketsInputSchema>;

export function registerListTickets(server: McpServer, client: ZendeskClient, subdomain: string) {
  server.registerTool(
    'zendesk_list_tickets',
    {
      title: 'List Zendesk Tickets',
      description:
        'List recent Zendesk tickets sorted by update time. Use this for browsing recent activity ' +
        'without a specific search query. For filtered searches, use zendesk_search_tickets instead.\n\n' +
        'Supports cursor-based pagination for iterating through results.',
      inputSchema: ListTicketsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListTicketsInput) => {
      try {
        const apiParams: Record<string, string> = {
          'page[size]': String(params.page_size ?? 25),
          sort_by: params.sort_by ?? 'updated_at',
          sort_order: params.sort_order ?? 'desc',
        };
        if (params.cursor) {
          apiParams['page[after]'] = params.cursor;
        }

        const data = await client.request<ZendeskTicketsListResponse>('/tickets.json', apiParams);

        if (data.tickets.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No tickets found.' }] };
        }

        const formatted = formatTicketList(data.tickets, subdomain);

        let pagination = '';
        if (data.meta?.has_more && data.meta.after_cursor) {
          pagination = `\n\n---\n_More tickets available. Use cursor="${data.meta.after_cursor}" to get the next page._`;
        }

        return { content: [{ type: 'text' as const, text: formatted + pagination }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: handleError(error) }], isError: true };
      }
    }
  );
}
