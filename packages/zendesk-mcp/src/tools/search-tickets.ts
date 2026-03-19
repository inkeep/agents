import { z } from 'zod';
import { formatTicketList } from '../lib/format.js';
import type { ZendeskSearchResponse } from '../lib/types.js';
import type { ZendeskClient } from '../lib/zendesk-client.js';
import { handleError } from '../lib/zendesk-client.js';

export const SearchTicketsInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Search query. Supports Zendesk syntax: "status:open assignee:me created>7days". ' +
          'Or use natural language and the structured filters below.'
      ),
    status: z
      .enum(['new', 'open', 'pending', 'hold', 'solved', 'closed'])
      .optional()
      .describe('Filter by ticket status'),
    priority: z
      .enum(['low', 'normal', 'high', 'urgent'])
      .optional()
      .describe('Filter by priority level'),
    assignee: z.string().optional().describe('Filter by assignee name or email'),
    requester: z.string().optional().describe('Filter by requester name or email'),
    tags: z.string().optional().describe('Filter by tag'),
    created_after: z
      .string()
      .optional()
      .describe(
        'Only tickets created after this date. ISO format (2024-01-01) or relative (7days, 2weeks, 1month)'
      ),
    created_before: z
      .string()
      .optional()
      .describe('Only tickets created before this date. ISO format or relative'),
    sort_by: z
      .enum(['created_at', 'updated_at', 'priority', 'status', 'ticket_type'])
      .optional()
      .describe('Sort results by field (default: relevance)'),
    sort_order: z.enum(['asc', 'desc']).optional().describe('Sort order (default: desc)'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default: 1)'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Results per page, 1-100 (default: 25)'),
  })
  .strict();

export type SearchTicketsInput = z.infer<typeof SearchTicketsInputSchema>;

function buildQuery(params: SearchTicketsInput): string {
  const parts: string[] = [params.query];

  if (params.status) parts.push(`status:${params.status}`);
  if (params.priority) parts.push(`priority:${params.priority}`);
  if (params.assignee) parts.push(`assignee:${params.assignee}`);
  if (params.requester) parts.push(`requester:${params.requester}`);
  if (params.tags) parts.push(`tags:${params.tags}`);
  if (params.created_after) parts.push(`created>${params.created_after}`);
  if (params.created_before) parts.push(`created<${params.created_before}`);

  if (!parts.some((p) => p.includes('type:'))) {
    parts.push('type:ticket');
  }

  return parts.join(' ');
}

export function registerSearchTickets(server: any, client: ZendeskClient, subdomain: string) {
  server.registerTool(
    'zendesk_search_tickets',
    {
      title: 'Search Zendesk Tickets',
      description:
        'Search Zendesk tickets using full-text search with optional structured filters. ' +
        'The query field supports Zendesk search syntax (e.g., "status:open assignee:me created>7days") ' +
        'or natural language. Structured filter params are appended to the query automatically.\n\n' +
        'Examples:\n' +
        '  - "SSO login issues" with status=open -> finds open tickets about SSO\n' +
        '  - "billing" with priority=high, created_after=7days -> recent high-priority billing tickets\n' +
        '  - "requester:jane@co.com" -> tickets from a specific user\n\n' +
        'Returns up to 1000 results max. Use page/per_page for pagination.',
      inputSchema: SearchTicketsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: SearchTicketsInput) => {
      try {
        const query = buildQuery(params);
        const apiParams: Record<string, string> = { query };
        if (params.sort_by) apiParams.sort_by = params.sort_by;
        if (params.sort_order) apiParams.sort_order = params.sort_order;
        if (params.page) apiParams.page = String(params.page);
        apiParams.per_page = String(params.per_page ?? 25);

        const data = await client.request<ZendeskSearchResponse>('/search.json', apiParams);

        if (data.results.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No tickets found for query: ${query}` }],
          };
        }

        const header = `Found ${data.count} tickets (showing ${data.results.length}):\n\n`;
        const formatted = formatTicketList(data.results, subdomain);
        const pagination =
          data.count > (params.per_page ?? 25) * (params.page ?? 1)
            ? `\n\n---\n_More results available. Use page=${(params.page ?? 1) + 1} to see the next page._`
            : '';

        return { content: [{ type: 'text' as const, text: header + formatted + pagination }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: handleError(error) }], isError: true };
      }
    }
  );
}
