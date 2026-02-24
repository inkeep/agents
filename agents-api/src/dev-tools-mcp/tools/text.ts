import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as Diff from 'diff';
import { z } from 'zod';

function coerceToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value, null, 2);
}

export function registerTextTools(server: McpServer): void {
  server.registerTool(
    'text_search',
    {
      description:
        'Search for a pattern in text content. Returns matching lines with line numbers. Accepts string or object (auto-serialized to JSON).',
      inputSchema: z.object({
        pattern: z.string().describe('Search pattern'),
        content: z.unknown().describe('Text content to search (string or object)'),
        isRegex: z
          .boolean()
          .optional()
          .describe('Treat pattern as a regular expression (default: false)'),
        caseSensitive: z.boolean().optional().describe('Case-sensitive search (default: true)'),
        contextLines: z
          .number()
          .optional()
          .describe('Lines of context before/after each match (default: 0)'),
        maxResults: z.number().optional().describe('Maximum results to return (default: 100)'),
      }),
    },
    async (args): Promise<CallToolResult> => {
      const {
        pattern,
        isRegex = false,
        caseSensitive = true,
        contextLines = 0,
        maxResults = 100,
      } = args;
      const content = coerceToString(args.content);

      let regex: RegExp;
      try {
        const flags = caseSensitive ? '' : 'i';
        regex = isRegex
          ? new RegExp(pattern, flags)
          : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }

      const lines = content.split('\n');
      const results: string[] = [];

      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        if (regex.test(lines[i])) {
          if (contextLines > 0) {
            const start = Math.max(0, i - contextLines);
            const end = Math.min(lines.length - 1, i + contextLines);
            for (let j = start; j <= end; j++) {
              results.push(`${j + 1}${j === i ? ':' : '-'} ${lines[j]}`);
            }
            results.push('---');
          } else {
            results.push(`${i + 1}: ${lines[i]}`);
          }
        }
      }

      if (results.length === 0) return { content: [{ type: 'text', text: 'No matches found.' }] };
      return { content: [{ type: 'text', text: results.join('\n') }] };
    }
  );

  server.registerTool(
    'text_replace',
    {
      description: 'Find and replace text in a string. Returns the modified content.',
      inputSchema: z.object({
        content: z
          .unknown()
          .describe('Input text (string or object, object will be JSON-serialized)'),
        find: z.string().describe('Text or pattern to find'),
        replace: z.string().describe('Replacement text'),
        isRegex: z
          .boolean()
          .optional()
          .describe('Treat find as a regular expression (default: false)'),
        replaceAll: z.boolean().optional().describe('Replace all occurrences (default: true)'),
        caseSensitive: z.boolean().optional().describe('Case-sensitive matching (default: true)'),
      }),
    },
    async (args): Promise<CallToolResult> => {
      const { find, replace, isRegex = false, replaceAll = true, caseSensitive = true } = args;
      const content = coerceToString(args.content);

      try {
        let flags = replaceAll ? 'g' : '';
        if (!caseSensitive) flags += 'i';

        const pattern = isRegex
          ? new RegExp(find, flags)
          : new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

        const result = content.replace(pattern, replace);
        return { content: [{ type: 'text', text: result }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Replace failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'text_diff',
    {
      description: 'Generate a unified diff between two strings.',
      inputSchema: z.object({
        a: z.unknown().describe('Original text (string or object)'),
        b: z.unknown().describe('New text (string or object)'),
        label_a: z.string().optional().describe('Label for original text (default: "original")'),
        label_b: z.string().optional().describe('Label for new text (default: "modified")'),
      }),
    },
    async (args): Promise<CallToolResult> => {
      const a = coerceToString(args.a);
      const b = coerceToString(args.b);
      const labelA = args.label_a ?? 'original';
      const labelB = args.label_b ?? 'modified';

      const patch = Diff.createPatch(labelA, a, b, labelA, labelB);
      return { content: [{ type: 'text', text: patch }] };
    }
  );

  server.registerTool(
    'patch_apply',
    {
      description: 'Apply a unified diff patch to a string. Returns the patched content.',
      inputSchema: z.object({
        original: z.unknown().describe('Original text to patch (string or object)'),
        patch: z.string().describe('Unified diff patch to apply'),
      }),
    },
    async (args): Promise<CallToolResult> => {
      const original = coerceToString(args.original);
      const result = Diff.applyPatch(original, args.patch);

      if (result === false) {
        return {
          content: [
            {
              type: 'text',
              text: 'Patch failed: patch does not apply cleanly to the provided content.',
            },
          ],
          isError: true,
        };
      }

      return { content: [{ type: 'text', text: result }] };
    }
  );

  server.registerTool(
    'regex_match',
    {
      description:
        'Extract all regex matches and capture groups from text. Returns structured match results.',
      inputSchema: z.object({
        pattern: z.string().describe('Regular expression pattern'),
        content: z.unknown().describe('Text to match against (string or object)'),
        flags: z
          .string()
          .optional()
          .describe(
            'Regex flags (default: "g"). Common: g=global, i=case-insensitive, m=multiline'
          ),
      }),
    },
    async (args): Promise<CallToolResult> => {
      const content = coerceToString(args.content);
      const flags = args.flags ?? 'g';

      let regex: RegExp;
      try {
        regex = new RegExp(args.pattern, flags.includes('g') ? flags : `${flags}g`);
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }

      const matches: Array<{ match: string; groups: string[]; index: number }> = [];
      let m: RegExpExecArray | null;
      while ((m = regex.exec(content)) !== null) {
        matches.push({ match: m[0], groups: m.slice(1), index: m.index });
        if (!flags.includes('g')) break;
      }

      if (matches.length === 0) return { content: [{ type: 'text', text: 'No matches found.' }] };

      const lines = matches.map(
        (m, i) =>
          `Match ${i + 1} (index ${m.index}): ${JSON.stringify(m.match)}` +
          (m.groups.length
            ? `\n  Groups: ${m.groups.map((g) => JSON.stringify(g)).join(', ')}`
            : '')
      );
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  server.registerTool(
    'text_extract',
    {
      description: 'Extract a slice of text by line range or character range.',
      inputSchema: z.object({
        content: z.unknown().describe('Input text (string or object)'),
        startLine: z.number().optional().describe('1-indexed start line (inclusive)'),
        endLine: z.number().optional().describe('1-indexed end line (inclusive)'),
        startChar: z.number().optional().describe('0-indexed start character position'),
        endChar: z.number().optional().describe('0-indexed end character position'),
      }),
    },
    async (args): Promise<CallToolResult> => {
      const content = coerceToString(args.content);

      if (args.startChar !== undefined || args.endChar !== undefined) {
        const start = args.startChar ?? 0;
        const end = args.endChar ?? content.length;
        return { content: [{ type: 'text', text: content.slice(start, end) }] };
      }

      const lines = content.split('\n');
      const start = Math.max(0, (args.startLine ?? 1) - 1);
      const end = Math.min(lines.length, args.endLine ?? lines.length);
      return { content: [{ type: 'text', text: lines.slice(start, end).join('\n') }] };
    }
  );

  server.registerTool(
    'text_truncate',
    {
      description: 'Truncate text to a maximum length.',
      inputSchema: z.object({
        content: z.unknown().describe('Input text (string or object)'),
        maxLength: z.number().describe('Maximum length'),
        unit: z
          .enum(['chars', 'lines'])
          .optional()
          .describe('Unit for maxLength: "chars" or "lines" (default: "chars")'),
        ellipsis: z
          .string()
          .optional()
          .describe('Ellipsis string to append when truncated (default: "...")'),
      }),
    },
    async (args): Promise<CallToolResult> => {
      const content = coerceToString(args.content);
      const unit = args.unit ?? 'chars';
      const ellipsis = args.ellipsis ?? '...';

      if (unit === 'lines') {
        const lines = content.split('\n');
        if (lines.length <= args.maxLength) return { content: [{ type: 'text', text: content }] };
        return {
          content: [
            { type: 'text', text: lines.slice(0, args.maxLength).join('\n') + `\n${ellipsis}` },
          ],
        };
      }

      if (content.length <= args.maxLength) return { content: [{ type: 'text', text: content }] };
      return {
        content: [
          { type: 'text', text: content.slice(0, args.maxLength - ellipsis.length) + ellipsis },
        ],
      };
    }
  );
}
