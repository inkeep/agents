import { createHash } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export function registerEncodingTools(server: McpServer): void {
  server.registerTool(
    'base64_encode',
    {
      description: 'Encode a string to base64.',
      inputSchema: z.object({
        input: z.string().describe('String to encode'),
      }),
    },
    async ({ input }): Promise<CallToolResult> => {
      const encoded = Buffer.from(input, 'utf-8').toString('base64');
      return { content: [{ type: 'text', text: encoded }] };
    }
  );

  server.registerTool(
    'base64_decode',
    {
      description: 'Decode a base64 string to UTF-8 text.',
      inputSchema: z.object({
        input: z.string().describe('Base64-encoded string to decode'),
      }),
    },
    async ({ input }): Promise<CallToolResult> => {
      try {
        const decoded = Buffer.from(input, 'base64').toString('utf-8');
        return { content: [{ type: 'text', text: decoded }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Decode failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'url_encode',
    {
      description: 'Percent-encode a string for use in a URL.',
      inputSchema: z.object({
        input: z.string().describe('String to URL-encode'),
        encodeComponent: z
          .boolean()
          .optional()
          .describe('Use encodeURIComponent (encodes more chars) vs encodeURI (default: true)'),
      }),
    },
    async ({ input, encodeComponent = true }): Promise<CallToolResult> => {
      const encoded = encodeComponent ? encodeURIComponent(input) : encodeURI(input);
      return { content: [{ type: 'text', text: encoded }] };
    }
  );

  server.registerTool(
    'url_decode',
    {
      description: 'Decode a percent-encoded URL string.',
      inputSchema: z.object({
        input: z.string().describe('URL-encoded string to decode'),
      }),
    },
    async ({ input }): Promise<CallToolResult> => {
      try {
        const decoded = decodeURIComponent(input);
        return { content: [{ type: 'text', text: decoded }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Decode failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'hash',
    {
      description: 'Compute a cryptographic hash of a string.',
      inputSchema: z.object({
        input: z.string().describe('String to hash'),
        algorithm: z
          .enum(['md5', 'sha1', 'sha256', 'sha512'])
          .optional()
          .describe('Hash algorithm (default: sha256)'),
        encoding: z.enum(['hex', 'base64']).optional().describe('Output encoding (default: hex)'),
      }),
    },
    async ({ input, algorithm = 'sha256', encoding = 'hex' }): Promise<CallToolResult> => {
      const hash = createHash(algorithm).update(input, 'utf-8').digest(encoding);
      return { content: [{ type: 'text', text: hash }] };
    }
  );
}
