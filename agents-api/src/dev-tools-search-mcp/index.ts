import { randomUUID } from 'node:crypto';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import { env } from '../env';
import { devToolsSearchMcpAuth } from './auth';
import { createDevToolsSearchServer } from './server';

type DevToolsSearchVariables = {
  Variables: {
    tenantId: string;
    projectId: string;
  };
};

const app = new Hono<DevToolsSearchVariables>();

app.use('/mcp', devToolsSearchMcpAuth());

app.all('/mcp', async (c) => {
  if (!env.EXA_API_KEY) {
    return c.json({ error: 'EXA_API_KEY is not configured' }, 503);
  }

  const sessionId = c.req.header('mcp-session-id') ?? randomUUID();
  const transport = new StreamableHTTPTransport();
  const server = createDevToolsSearchServer(sessionId, env.EXA_API_KEY, {
    tenantId: c.get('tenantId'),
    projectId: c.get('projectId'),
  });

  await server.connect(transport);
  return transport.handleRequest(c);
});

export default app;
