import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const EXA_BASE_URL = 'https://api.exa.ai';

interface ExaResult {
  title?: string | null;
  url: string;
  publishedDate?: string | null;
  text?: string;
  summary?: string;
}

interface ExaSearchResponse {
  results: ExaResult[];
}

async function exaRequest<T>(
  endpoint: string,
  body: Record<string, unknown>,
  apiKey: string
): Promise<T> {
  const response = await fetch(`${EXA_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Exa API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

function formatResults(results: ExaResult[]): string {
  if (results.length === 0) return 'No results found.';
  return results
    .map((r, i) => {
      const lines = [`[${i + 1}] ${r.title ?? '(no title)'}\n    ${r.url}`];
      if (r.publishedDate) lines.push(`    Published: ${r.publishedDate}`);
      if (r.summary) lines.push(`    Summary: ${r.summary}`);
      if (r.text) {
        const snippet = r.text.slice(0, 1500);
        lines.push(`    Content:\n${snippet}${r.text.length > 1500 ? '\n    ...(truncated)' : ''}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

export function registerSearchTools(server: McpServer, exaApiKey: string): void {
  server.registerTool(
    'web_search',
    {
      description:
        "Search the web using Exa's neural/semantic search. Returns relevant results with titles, URLs, and optionally page content.",
      inputSchema: z.object({
        query: z.string().describe('Search query'),
        numResults: z
          .number()
          .optional()
          .describe('Number of results to return (default: 10, max: 25)'),
        type: z
          .enum(['neural', 'keyword', 'auto', 'hybrid'])
          .optional()
          .describe(
            'Search algorithm. "neural" for semantic/conceptual, "keyword" for exact match, "auto" lets Exa decide (default: auto)'
          ),
        includeContent: z
          .boolean()
          .optional()
          .describe('Include full page text in results (default: true)'),
        includeSummary: z
          .boolean()
          .optional()
          .describe('Include AI-generated summary per result (default: false)'),
        category: z
          .enum([
            'company',
            'research paper',
            'news',
            'pdf',
            'github',
            'tweet',
            'personal site',
            'linkedin profile',
            'financial report',
          ])
          .optional()
          .describe('Filter results to a specific content category'),
        includeDomains: z
          .array(z.string())
          .optional()
          .describe('Only return results from these domains (e.g. ["github.com", "arxiv.org"])'),
        excludeDomains: z
          .array(z.string())
          .optional()
          .describe('Exclude results from these domains'),
        startPublishedDate: z
          .string()
          .optional()
          .describe('Only return results published after this date (ISO 8601, e.g. "2024-01-01")'),
        endPublishedDate: z
          .string()
          .optional()
          .describe('Only return results published before this date (ISO 8601)'),
      }),
    },
    async (args): Promise<CallToolResult> => {
      const {
        query,
        numResults = 10,
        type = 'auto',
        includeContent = true,
        includeSummary = false,
        category,
        includeDomains,
        excludeDomains,
        startPublishedDate,
        endPublishedDate,
      } = args;

      try {
        const body: Record<string, unknown> = {
          query,
          numResults: Math.min(numResults, 25),
          type,
          contents: {
            ...(includeContent ? { text: true } : {}),
            ...(includeSummary ? { summary: true } : {}),
          },
        };

        if (category) body.category = category;
        if (includeDomains?.length) body.includeDomains = includeDomains;
        if (excludeDomains?.length) body.excludeDomains = excludeDomains;
        if (startPublishedDate) body.startPublishedDate = startPublishedDate;
        if (endPublishedDate) body.endPublishedDate = endPublishedDate;

        const data = await exaRequest<ExaSearchResponse>('/search', body, exaApiKey);
        return { content: [{ type: 'text', text: formatResults(data.results) }] };
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

  server.registerTool(
    'find_similar',
    {
      description:
        'Find web pages semantically similar to a given URL. Useful for discovering related content, alternatives, or competitors.',
      inputSchema: z.object({
        url: z.string().describe('URL to find similar pages for'),
        numResults: z
          .number()
          .optional()
          .describe('Number of results to return (default: 10, max: 25)'),
        includeContent: z
          .boolean()
          .optional()
          .describe('Include full page text in results (default: true)'),
        includeSummary: z
          .boolean()
          .optional()
          .describe('Include AI-generated summary per result (default: false)'),
        excludeSourceDomain: z
          .boolean()
          .optional()
          .describe('Exclude results from the same domain as the input URL (default: true)'),
        includeDomains: z
          .array(z.string())
          .optional()
          .describe('Only return results from these domains'),
        excludeDomains: z
          .array(z.string())
          .optional()
          .describe('Exclude results from these domains'),
        startPublishedDate: z
          .string()
          .optional()
          .describe('Only return results published after this date (ISO 8601)'),
        endPublishedDate: z
          .string()
          .optional()
          .describe('Only return results published before this date (ISO 8601)'),
      }),
    },
    async (args): Promise<CallToolResult> => {
      const {
        url,
        numResults = 10,
        includeContent = true,
        includeSummary = false,
        excludeSourceDomain = true,
        includeDomains,
        excludeDomains,
        startPublishedDate,
        endPublishedDate,
      } = args;

      try {
        const body: Record<string, unknown> = {
          url,
          numResults: Math.min(numResults, 25),
          excludeSourceDomain,
          contents: {
            ...(includeContent ? { text: true } : {}),
            ...(includeSummary ? { summary: true } : {}),
          },
        };

        if (includeDomains?.length) body.includeDomains = includeDomains;
        if (excludeDomains?.length) body.excludeDomains = excludeDomains;
        if (startPublishedDate) body.startPublishedDate = startPublishedDate;
        if (endPublishedDate) body.endPublishedDate = endPublishedDate;

        const data = await exaRequest<ExaSearchResponse>('/findSimilar', body, exaApiKey);
        return { content: [{ type: 'text', text: formatResults(data.results) }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Find similar failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
