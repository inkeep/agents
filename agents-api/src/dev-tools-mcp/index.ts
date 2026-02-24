import { randomUUID } from 'node:crypto';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import { createDevToolsServer } from './server';

const app = new Hono();

app.all('/mcp', async (c) => {
  const sessionId = c.req.header('mcp-session-id') ?? randomUUID();
  const transport = new StreamableHTTPTransport();
  const server = createDevToolsServer(sessionId);

  await server.connect(transport);
  return transport.handleRequest(c);
});

export default app;
