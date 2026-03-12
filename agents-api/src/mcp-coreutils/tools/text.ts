import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as Diff from 'diff';
import { z } from 'zod';

function coerceToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value.join('\n');
  }
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    'result' in (value as object)
  ) {
    return coerceToString((value as { result: unknown }).result);
  }
  return JSON.stringify(value, null, 2);
}

function buildRegex(pattern: string, isRegex: boolean, caseSensitive: boolean): RegExp {
  const flags = caseSensitive ? '' : 'i';
  const src = isRegex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(src, flags);
}

export function registerTextTools(server: McpServer): void {
  server.registerTool(
    'grep',
    {
      description:
        'Search for a pattern in text, like Unix grep. Returns matching lines with line numbers. Supports invert match, whole-word, context lines, count-only, and only-matching modes. Accepts string or object (auto-serialized to JSON).',
      inputSchema: z.object({
        pattern: z.string().describe('Search pattern'),
        content: z.unknown().describe('Text content to search (string or object)'),
        isRegex: z
          .boolean()
          .optional()
          .describe('Treat pattern as a regular expression, like grep -E (default: false)'),
        caseSensitive: z
          .boolean()
          .optional()
          .describe('Case-sensitive search, opposite of grep -i (default: true)'),
        invertMatch: z
          .boolean()
          .optional()
          .describe('Return lines that do NOT match, like grep -v (default: false)'),
        wholeWord: z
          .boolean()
          .optional()
          .describe('Match whole words only, like grep -w (default: false)'),
        onlyMatching: z
          .boolean()
          .optional()
          .describe(
            'Return only the matched portion of each line, like grep -o (default: false)'
          ),
        countOnly: z
          .boolean()
          .optional()
          .describe('Return only the count of matching lines, like grep -c (default: false)'),
        beforeContext: z
          .number()
          .optional()
          .describe('Lines of context before each match, like grep -B (default: 0)'),
        afterContext: z
          .number()
          .optional()
          .describe('Lines of context after each match, like grep -A (default: 0)'),
        contextLines: z
          .number()
          .optional()
          .describe(
            'Symmetric context lines before and after each match, like grep -C. Overridden by beforeContext/afterContext if set (default: 0)'
          ),
        maxResults: z
          .number()
          .optional()
          .describe('Maximum number of matching lines to return, like grep -m (default: 100)'),
      }),
    },
    async (args): Promise<CallToolResult> => {
      const {
        pattern,
        isRegex = false,
        caseSensitive = true,
        invertMatch = false,
        wholeWord = false,
        onlyMatching = false,
        countOnly = false,
        contextLines = 0,
        maxResults = 100,
      } = args;
      const beforeContext = args.beforeContext ?? contextLines;
      const afterContext = args.afterContext ?? contextLines;
      const content = coerceToString(args.content);

      let regex: RegExp;
      try {
        const flags = caseSensitive ? '' : 'i';
        let src = isRegex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (wholeWord) src = `\\b${src}\\b`;
        regex = new RegExp(src, flags);
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
      let matchCount = 0;
      const results: string[] = [];
      const printed = new Set<number>();

      for (let i = 0; i < lines.length; i++) {
        const matched = regex.test(lines[i]);
        regex.lastIndex = 0;
        const include = invertMatch ? !matched : matched;
        if (!include) continue;

        matchCount++;
        if (countOnly) continue;
        if (matchCount > maxResults) break;

        if (onlyMatching && !invertMatch) {
          const m = lines[i].match(regex);
          if (m) results.push(`${i + 1}: ${m[0]}`);
          continue;
        }

        const start = Math.max(0, i - beforeContext);
        const end = Math.min(lines.length - 1, i + afterContext);
        let addedSeparator = false;
        for (let j = start; j <= end; j++) {
          if (printed.has(j)) continue;
          if (!addedSeparator && results.length > 0 && j > 0 && !printed.has(j - 1)) {
            results.push('--');
            addedSeparator = true;
          }
          results.push(`${j + 1}${j === i ? ':' : '-'} ${lines[j]}`);
          printed.add(j);
        }
      }

      if (countOnly) return { content: [{ type: 'text', text: String(matchCount) }] };
      if (results.length === 0) return { content: [{ type: 'text', text: 'No matches found.' }] };
      return { content: [{ type: 'text', text: results.join('\n') }] };
    }
  );

  server.registerTool(
    'sed',
    {
      description:
        'Transform text like Unix sed. Two modes: (1) substitution — find and replace patterns across lines, like sed s/pattern/replacement/g; (2) address/extraction — extract or delete lines by line number range, character range, or pattern address range, like sed -n 10,20p or sed /start/,/end/p or sed /pattern/d. Accepts string or object (auto-serialized to JSON).',
      inputSchema: z.object({
        content: z.unknown().describe('Input text (string or object)'),
        find: z
          .string()
          .optional()
          .describe(
            'Pattern to find for substitution mode, like the s/pattern/ part of sed. When provided, activates substitution mode.'
          ),
        replace: z
          .string()
          .optional()
          .describe(
            'Replacement string for substitution mode. Supports capture group references ($1, $2) when isRegex is true.'
          ),
        replaceAll: z
          .boolean()
          .optional()
          .describe('Replace all occurrences, like sed s/pattern/replacement/g (default: true)'),
        startLine: z.number().optional().describe('1-indexed start line (inclusive)'),
        endLine: z.number().optional().describe('1-indexed end line (inclusive)'),
        startChar: z.number().optional().describe('0-indexed start character position'),
        endChar: z.number().optional().describe('0-indexed end character position'),
        startPattern: z
          .string()
          .optional()
          .describe(
            'Regex pattern marking the start of an address range, like sed /pattern/,/end/p. Includes the matching line. When used alone with invertMatch, deletes matching lines like sed /pattern/d.'
          ),
        endPattern: z
          .string()
          .optional()
          .describe(
            'Regex pattern marking the end of an address range. Includes the matching line. If omitted, extracts from startPattern match to end of input.'
          ),
        invertMatch: z
          .boolean()
          .optional()
          .describe(
            'In address mode with only startPattern: delete lines matching the pattern, like sed /pattern/d (default: false)'
          ),
        allOccurrences: z
          .boolean()
          .optional()
          .describe(
            'In address range mode: extract all matching ranges instead of just the first (default: false)'
          ),
        isRegex: z
          .boolean()
          .optional()
          .describe('Treat find/startPattern/endPattern as regular expressions (default: false)'),
        caseSensitive: z
          .boolean()
          .optional()
          .describe('Case-sensitive matching (default: true)'),
      }),
    },
    async (args): Promise<CallToolResult> => {
      const {
        isRegex = false,
        caseSensitive = true,
        replaceAll = true,
        invertMatch = false,
        allOccurrences = false,
      } = args;
      const content = coerceToString(args.content);

      if (args.find !== undefined) {
        const replace = args.replace ?? '';
        try {
          let flags = replaceAll ? 'g' : '';
          if (!caseSensitive) flags += 'i';
          const pattern = isRegex
            ? new RegExp(args.find, flags)
            : new RegExp(args.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
          const result = content.replace(pattern, replace);
          return { content: [{ type: 'text', text: result }] };
        } catch (err) {
          return {
            content: [
              {
                type: 'text',
                text: `sed substitution failed: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      }

      if (args.startChar !== undefined || args.endChar !== undefined) {
        const start = args.startChar ?? 0;
        const end = args.endChar ?? content.length;
        return { content: [{ type: 'text', text: content.slice(start, end) }] };
      }

      if (args.startPattern !== undefined) {
        let startRe: RegExp;
        try {
          startRe = buildRegex(args.startPattern, isRegex, caseSensitive);
        } catch (err) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid startPattern: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }

        const lines = content.split('\n');

        if (!args.endPattern && invertMatch) {
          const kept = lines.filter((line) => {
            const matched = startRe.test(line);
            startRe.lastIndex = 0;
            return !matched;
          });
          return { content: [{ type: 'text', text: kept.join('\n') }] };
        }

        let endRe: RegExp | null = null;
        if (args.endPattern) {
          try {
            endRe = buildRegex(args.endPattern, isRegex, caseSensitive);
          } catch (err) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Invalid endPattern: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
              isError: true,
            };
          }
        }

        const segments: string[] = [];
        let inRange = false;
        let rangeLines: string[] = [];

        for (const line of lines) {
          if (!inRange) {
            const matched = startRe.test(line);
            startRe.lastIndex = 0;
            if (matched) {
              inRange = true;
              rangeLines = [line];
              if (!endRe) {
                segments.push(line);
                if (!allOccurrences) break;
                inRange = false;
              }
            }
          } else {
            rangeLines.push(line);
            const matched = endRe!.test(line);
            endRe!.lastIndex = 0;
            if (matched) {
              segments.push(rangeLines.join('\n'));
              rangeLines = [];
              inRange = false;
              if (!allOccurrences) break;
            }
          }
        }

        if (inRange && rangeLines.length > 0) segments.push(rangeLines.join('\n'));
        if (segments.length === 0)
          return { content: [{ type: 'text', text: 'No matching range found.' }] };
        return { content: [{ type: 'text', text: segments.join('\n---\n') }] };
      }

      const lines = content.split('\n');
      const start = Math.max(0, (args.startLine ?? 1) - 1);
      const end = Math.min(lines.length, args.endLine ?? lines.length);
      return { content: [{ type: 'text', text: lines.slice(start, end).join('\n') }] };
    }
  );

  server.registerTool(
    'diff',
    {
      description: 'Generate a unified diff between two strings, like Unix diff.',
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
    'patch',
    {
      description: 'Apply a unified diff patch to a string, like Unix patch.',
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
    'head',
    {
      description:
        'Return the first N lines of text from the top, like Unix head. Use a negative n to return all but the last N lines (e.g. n=-5 drops the last 5 lines).',
      inputSchema: z.object({
        content: z.unknown().describe('Input text (string or object)'),
        n: z.number().describe('Lines to return from the top. Negative: all but last |n| lines.'),
      }),
    },
    async (args): Promise<CallToolResult> => {
      const lines = coerceToString(args.content).split('\n');
      const count = args.n >= 0 ? args.n : Math.max(0, lines.length + args.n);
      return { content: [{ type: 'text', text: lines.slice(0, count).join('\n') }] };
    }
  );

  server.registerTool(
    'tail',
    {
      description:
        'Return the last N lines of text from the bottom, like Unix tail. Use a negative n to return all but the first N lines (e.g. n=-5 skips the first 5 lines).',
      inputSchema: z.object({
        content: z.unknown().describe('Input text (string or object)'),
        n: z.number().describe('Lines to return from the bottom. Negative: all but first |n| lines.'),
      }),
    },
    async (args): Promise<CallToolResult> => {
      const lines = coerceToString(args.content).split('\n');
      const start = args.n >= 0 ? Math.max(0, lines.length - args.n) : Math.min(lines.length, -args.n);
      return { content: [{ type: 'text', text: lines.slice(start).join('\n') }] };
    }
  );
}
