import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import { mcpAuth } from '../middleware/mcpAuth';
import { createDevToolsServer } from './server';

type DevToolsVariables = {
  Variables: {
    tenantId: string;
    projectId: string;
  };
};

const app = new Hono<DevToolsVariables>();

app.use('/mcp', mcpAuth());

app.all('/mcp', async (c) => {
  const transport = new StreamableHTTPTransport();
  const server = createDevToolsServer({
    tenantId: c.get('tenantId'),
    projectId: c.get('projectId'),
  });

  await server.connect(transport);
  return transport.handleRequest(c);
});

export default app;
