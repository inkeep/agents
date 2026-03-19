import { z } from 'zod';
import { formatTicketWithDescription } from '../lib/format.js';
import type { ZendeskTicketResponse } from '../lib/types.js';
import type { ZendeskClient } from '../lib/zendesk-client.js';
import { handleError, ZendeskApiError } from '../lib/zendesk-client.js';

export const GetTicketInputSchema = z
  .object({
    ticket_id: z.number().int().positive().describe('The Zendesk ticket ID to retrieve'),
  })
  .strict();

export type GetTicketInput = z.infer<typeof GetTicketInputSchema>;

export function registerGetTicket(server: any, client: ZendeskClient, subdomain: string) {
  server.registerTool(
    'zendesk_get_ticket',
    {
      title: 'Get Zendesk Ticket',
      description:
        'Get full details of a specific Zendesk ticket by its ID. ' +
        'Returns subject, description, status, priority, type, tags, assignee, requester, dates, and URL.\n\n' +
        'Example: ticket_id=12345 -> full details of ticket #12345',
      inputSchema: GetTicketInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: GetTicketInput) => {
      try {
        const data = await client.request<ZendeskTicketResponse>(
          `/tickets/${params.ticket_id}.json`
        );
        const formatted = formatTicketWithDescription(data.ticket, subdomain);
        return { content: [{ type: 'text' as const, text: formatted }] };
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
