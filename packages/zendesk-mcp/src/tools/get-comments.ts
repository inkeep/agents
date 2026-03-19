import { z } from 'zod';
import { formatComment } from '../lib/format.js';
import type { ZendeskCommentsResponse } from '../lib/types.js';
import type { ZendeskClient } from '../lib/zendesk-client.js';
import { handleError, ZendeskApiError } from '../lib/zendesk-client.js';

export const GetCommentsInputSchema = z
  .object({
    ticket_id: z.number().int().positive().describe('The Zendesk ticket ID to get comments for'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of comments per page, 1-100 (default: 50)'),
    cursor: z
      .string()
      .optional()
      .describe(
        'Cursor for pagination. Use the next_cursor value from a previous response to get the next page.'
      ),
  })
  .strict();

export type GetCommentsInput = z.infer<typeof GetCommentsInputSchema>;

export function registerGetComments(server: any, client: ZendeskClient) {
  server.registerTool(
    'zendesk_get_ticket_comments',
    {
      title: 'Get Zendesk Ticket Comments',
      description:
        'Get the conversation thread on a Zendesk ticket - all public replies and internal notes ' +
        'in chronological order. Includes comment body, author, visibility (public/internal), ' +
        'and attachments.\n\n' +
        'Use cursor-based pagination for tickets with many comments.\n\n' +
        'Example: ticket_id=12345 -> full conversation history on ticket #12345',
      inputSchema: GetCommentsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: GetCommentsInput) => {
      try {
        const apiParams: Record<string, string> = {
          'page[size]': String(params.page_size ?? 50),
          sort_order: 'asc',
        };
        if (params.cursor) {
          apiParams['page[after]'] = params.cursor;
        }

        const data = await client.request<ZendeskCommentsResponse>(
          `/tickets/${params.ticket_id}/comments.json`,
          apiParams
        );

        if (data.comments.length === 0) {
          return {
            content: [
              { type: 'text' as const, text: `No comments found on ticket #${params.ticket_id}.` },
            ],
          };
        }

        const formatted = data.comments.map((c, i) => formatComment(c, i)).join('\n\n---\n\n');
        const header = `# Comments on Ticket #${params.ticket_id}\n\n`;

        let pagination = '';
        if (data.meta?.has_more && data.meta.after_cursor) {
          pagination = `\n\n---\n_More comments available. Use cursor="${data.meta.after_cursor}" to get the next page._`;
        }

        return { content: [{ type: 'text' as const, text: header + formatted + pagination }] };
      } catch (error) {
        if (error instanceof ZendeskApiError && error.status === 404) {
          return {
            content: [{ type: 'text' as const, text: `Ticket #${params.ticket_id} not found.` }],
            isError: true,
          };
        }
        return { content: [{ type: 'text' as const, text: handleError(error) }], isError: true };
      }
    }
  );
}
