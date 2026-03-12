import { randomUUID } from 'node:crypto';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import { mcpAuth } from '../middleware/mcpAuth';
import { createDevToolsHttpServer } from './server';

type DevToolsHttpVariables = {
  Variables: {
    tenantId: string;
    projectId: string;
  };
};

const app = new Hono<DevToolsHttpVariables>();

app.use('/mcp', mcpAuth());

app.all('/mcp', async (c) => {
  const sessionId = c.req.header('mcp-session-id') ?? randomUUID();
  const transport = new StreamableHTTPTransport();
  const server = createDevToolsHttpServer(sessionId, {
    tenantId: c.get('tenantId'),
    projectId: c.get('projectId'),
  });

  await server.connect(transport);
  return transport.handleRequest(c);
});

export default app;
