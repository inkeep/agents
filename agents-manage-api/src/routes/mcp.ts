import { StreamableHTTPTransport } from '@hono/mcp';
import { createConsoleLogger, createMCPServer } from '@inkeep/agents-manage-mcp';
import { Hono } from 'hono';
import { env } from '../env';

const app = new Hono();

app.all('/', async (c) => {
  const transport = new StreamableHTTPTransport();
  const noOpLogger = createConsoleLogger('error');
  const mcpServer = createMCPServer({
    logger: noOpLogger,
    serverURL: env.INKEEP_AGENTS_MANAGE_API_URL,
  });

  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

export default app;
