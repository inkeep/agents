import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const ALLOWED_CALC_CHARS = /^[\d\s+\-*/.()%eE]+$/;

function safeEval(expression: string): number {
  const trimmed = expression.trim();
  if (!ALLOWED_CALC_CHARS.test(trimmed)) {
    throw new Error(
      'Expression contains disallowed characters. Only numeric arithmetic (+, -, *, /, %, parentheses) is supported.'
    );
  }
  // biome-ignore lint/security/noGlobalEval: expression is strictly validated to contain only numeric operators
  const result = eval(trimmed);
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('Expression did not evaluate to a finite number.');
  }
  return result;
}

export function registerUtilityTools(server: McpServer): void {
  server.registerTool(
    'calculate',
    {
      description:
        'Evaluate a numeric arithmetic expression. Supports +, -, *, /, %, parentheses, and scientific notation.',
      inputSchema: z.object({
        expression: z
          .string()
          .describe('Arithmetic expression to evaluate (e.g. "(1024 * 1024) / 8", "2 ** 10")'),
      }),
    },
    async ({ expression }): Promise<CallToolResult> => {
      try {
        const result = safeEval(expression);
        return { content: [{ type: 'text', text: String(result) }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Calculation failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'uuid',
    { description: 'Generate a random UUID (v4).' },
    async (): Promise<CallToolResult> => {
      return { content: [{ type: 'text', text: randomUUID() }] };
    }
  );

  server.registerTool(
    'timestamp',
    {
      description: 'Get the current date/time as a formatted timestamp.',
      inputSchema: z.object({
        format: z
          .enum(['iso', 'unix', 'unix_ms', 'utc', 'locale'])
          .optional()
          .describe(
            'Output format (default: iso). iso=ISO 8601, unix=seconds, unix_ms=milliseconds, utc=UTC string, locale=locale string'
          ),
        timezone: z
          .string()
          .optional()
          .describe('IANA timezone name (e.g. "America/New_York"). Only applies to locale format.'),
      }),
    },
    async ({ format = 'iso', timezone }): Promise<CallToolResult> => {
      const now = new Date();
      let result: string;

      switch (format) {
        case 'unix':
          result = String(Math.floor(now.getTime() / 1000));
          break;
        case 'unix_ms':
          result = String(now.getTime());
          break;
        case 'utc':
          result = now.toUTCString();
          break;
        case 'locale':
          result = timezone
            ? now.toLocaleString('en-US', { timeZone: timezone })
            : now.toLocaleString();
          break;
        default:
          result = now.toISOString();
      }

      return { content: [{ type: 'text', text: result }] };
    }
  );
}
