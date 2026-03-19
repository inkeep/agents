import { z } from 'zod';
import { formatUser } from '../lib/format.js';
import type { ZendeskUsersSearchResponse } from '../lib/types.js';
import type { ZendeskClient } from '../lib/zendesk-client.js';
import { handleError } from '../lib/zendesk-client.js';

export const SearchUsersInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('Search by name, email, phone, or external ID. Partial matches supported.'),
  })
  .strict();

export type SearchUsersInput = z.infer<typeof SearchUsersInputSchema>;

export function registerSearchUsers(server: any, client: ZendeskClient) {
  server.registerTool(
    'zendesk_search_users',
    {
      title: 'Search Zendesk Users',
      description:
        'Search for Zendesk users by name, email, phone, or external ID. Useful for finding ' +
        'a customer before searching their tickets.\n\n' +
        'Examples:\n' +
        '  - "john@example.com" -> find user by email\n' +
        '  - "Jane Smith" -> find user by name\n' +
        '  - "+15551234567" -> find user by phone',
      inputSchema: SearchUsersInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: SearchUsersInput) => {
      try {
        const data = await client.request<ZendeskUsersSearchResponse>('/users/search.json', {
          query: params.query,
        });

        if (data.users.length === 0) {
          return {
            content: [
              { type: 'text' as const, text: `No users found matching "${params.query}".` },
            ],
          };
        }

        const header = `Found ${data.count} users:\n\n`;
        const formatted = data.users.map((u) => formatUser(u)).join('\n\n---\n\n');

        return { content: [{ type: 'text' as const, text: header + formatted }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: handleError(error) }], isError: true };
      }
    }
  );
}
