import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import TurndownService from 'turndown';
import { z } from 'zod';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

export function registerHtmlTools(server: McpServer): void {
  server.registerTool(
    'html_to_markdown',
    {
      description:
        'Convert HTML content to Markdown. Useful for cleaning up fetched web pages before further processing.',
      inputSchema: z.object({
        html: z.string().describe('HTML string to convert'),
      }),
    },
    async ({ html }): Promise<CallToolResult> => {
      try {
        const markdown = turndown.turndown(html);
        return { content: [{ type: 'text', text: markdown }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Conversion failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
