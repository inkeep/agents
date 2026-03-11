import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export function registerHttpTools(server: McpServer): void {
  server.registerTool(
    'fetch_url',
    {
      description: 'Make an HTTP request and return the response status and body.',
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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const isJsonBody = body !== null && body !== undefined && typeof body === 'object';
        const requestHeaders: Record<string, string> = { ...headers };
        if (isJsonBody && !requestHeaders['content-type']) {
          requestHeaders['content-type'] = 'application/json';
        }

        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: body !== undefined ? (isJsonBody ? JSON.stringify(body) : String(body)) : undefined,
          signal: controller.signal,
        });

        const responseBody = await response.text();
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        const result = {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
        };

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isTimeout = message.includes('abort') || message.includes('timeout');
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
      } finally {
        clearTimeout(timer);
      }
    }
  );
}
