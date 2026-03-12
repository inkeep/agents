import { randomUUID } from 'node:crypto';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import { mcpAuth } from '../middleware/mcpAuth';
import { createDevToolsMediaServer } from './server';

type DevToolsMediaVariables = {
  Variables: {
    tenantId: string;
    projectId: string;
  };
};

const app = new Hono<DevToolsMediaVariables>();

app.use('/mcp', mcpAuth());

app.all('/mcp', async (c) => {
  const sessionId = c.req.header('mcp-session-id') ?? randomUUID();
  const transport = new StreamableHTTPTransport();
  const server = createDevToolsMediaServer(sessionId, {
    tenantId: c.get('tenantId'),
    projectId: c.get('projectId'),
  });

  await server.connect(transport);
  return transport.handleRequest(c);
});

export default app;
