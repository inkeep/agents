import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { SearchProvider } from '@plust/search-sdk';
import { webSearch } from '@plust/search-sdk';
import { z } from 'zod';

function formatResults(results: Awaited<ReturnType<typeof webSearch>>): string {
  if (results.length === 0) return 'No results found.';
  return results
    .map((r, i) => {
      const lines = [`[${i + 1}] ${r.title ?? '(no title)'}\n    ${r.url}`];
      if (r.publishedDate) lines.push(`    Published: ${r.publishedDate}`);
      if (r.snippet) lines.push(`    ${r.snippet}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

export function registerSearchTools(server: McpServer, provider: SearchProvider): void {
  server.registerTool(
    'web_search',
    {
      description: 'Search the web. Returns relevant results with titles, URLs, and snippets.',
      inputSchema: z.object({
        query: z.string().describe('Search query'),
        numResults: z
          .number()
          .optional()
          .describe('Number of results to return (default: 10, max: 25)'),
      }),
    },
    async (args): Promise<CallToolResult> => {
      try {
        const results = await webSearch({
          provider: [provider],
          query: args.query,
          maxResults: Math.min(args.numResults ?? 10, 25),
        });
        return { content: [{ type: 'text', text: formatResults(results) }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
