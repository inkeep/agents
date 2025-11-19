import { StreamableHTTPTransport } from '@hono/mcp';
import { createConsoleLogger, createMCPServer } from '@inkeep/agents-eval-mcp';
import { Hono } from 'hono';

const app = new Hono();

app.all('/', async (c) => {
  const transport = new StreamableHTTPTransport();
  const noOpLogger = createConsoleLogger('error');
  const mcpServer = createMCPServer({
    logger: noOpLogger,
  });

  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

export default app;

