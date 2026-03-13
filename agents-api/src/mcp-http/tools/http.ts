import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import ssrfFilter from 'ssrf-req-filter';
import { z } from 'zod';

export function registerHttpTools(server: McpServer): void {
  server.registerTool(
    'curl',
    {
      description: 'Make an HTTP request and return the response status and body, like Unix curl.',
      inputSchema: z.object({
        url: z.string().describe('URL to fetch'),
        method: z
          .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
          .optional()
          .describe('HTTP method (default: GET)'),
        body: z
          .unknown()
          .optional()
          .describe('Request body — string sent as-is, object sent as JSON'),
        headers: z.record(z.string(), z.string()).optional().describe('Additional request headers'),
        timeoutMs: z
          .number()
          .optional()
          .describe('Request timeout in milliseconds (default: 10000)'),
      }),
    },
    async ({
      url,
      method = 'GET',
      body,
      headers = {},
      timeoutMs = 10_000,
    }): Promise<CallToolResult> => {
      try {
        const isJsonBody = body !== null && body !== undefined && typeof body === 'object';
        const requestHeaders: Record<string, string> = { ...headers };
        if (isJsonBody && !requestHeaders['content-type']) {
          requestHeaders['content-type'] = 'application/json';
        }

        const agent = ssrfFilter(url);
        const response = await axios({
          url,
          method,
          headers: requestHeaders,
          data: body !== undefined ? (isJsonBody ? body : String(body)) : undefined,
          timeout: timeoutMs,
          httpAgent: agent,
          httpsAgent: agent,
          responseType: 'text',
          validateStatus: () => true,
          transformResponse: (data) => data,
        });

        const result = {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: response.data,
        };

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isTimeout = message.toLowerCase().includes('timeout');
        return {
          content: [
            {
              type: 'text',
              text: isTimeout
                ? `Request timed out after ${timeoutMs}ms`
                : `Request failed: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
