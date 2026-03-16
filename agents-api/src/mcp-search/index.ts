import { StreamableHTTPTransport } from '@hono/mcp';
import {
  createBraveProvider,
  createExaProvider,
  createSerpApiProvider,
  createTavilyProvider,
  type SearchProvider,
} from '@plust/search-sdk';
import { Hono } from 'hono';
import { mcpAuth } from '../middleware/mcpAuth';
import { createSearchServer } from './server';

type SearchMcpVariables = {
  Variables: {
    tenantId: string;
    projectId: string;
    resolvedApiKey: string | undefined;
  };
};

type ProviderFactory = (apiKey: string) => SearchProvider;

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  exa: (apiKey) => createExaProvider({ apiKey }),
  tavily: (apiKey) => createTavilyProvider({ apiKey }),
  brave: (apiKey) => createBraveProvider({ apiKey }),
  serpapi: (apiKey) => createSerpApiProvider({ apiKey }),
};

const app = new Hono<SearchMcpVariables>();

app.use('/:provider/mcp', mcpAuth());

app.all('/:provider/mcp', async (c) => {
  const providerName = c.req.param('provider');
  const createProvider = PROVIDER_FACTORIES[providerName];

  if (!createProvider) {
    return c.json({ error: `Unknown search provider: ${providerName}` }, 400);
  }

  const apiKey = c.get('resolvedApiKey') ?? '';

  if (!apiKey) {
    return c.json({ error: 'Search credential not configured for this project' }, 503);
  }

  const provider = createProvider(apiKey);
  const transport = new StreamableHTTPTransport();
  const server = createSearchServer(provider);

  await server.connect(transport);
  return transport.handleRequest(c);
});

export default app;
