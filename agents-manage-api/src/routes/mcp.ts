import { createMCPServer } from '@inkeep/agents-mcp/mcp-server/server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toReqRes } from 'fetch-to-node';
import { Hono } from 'hono';
import { getLogger } from '../logger';

const logger = getLogger('mcp');

const app = new Hono();

app.get('/', async (c) => {
  return c.text('Method not allowed: SSE not implemented.', 405);
});

app.post('/', async (c) => {
  try {
    logger.info({}, 'MCP request received');

    // Parse request body
    const body = await c.req.json();

    // Key Component #1: Create the MCP server instance
    const mcpServer = createMCPServer({
      logger: noOpLogger,
    });

    // Key Component #2: Create the MCP transport instance
    const mcpTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless - no session tracking
    });

    // Key Component #3: Connect the MCP server to the transport
    await mcpServer.connect(mcpTransport);

    // Key Component #4: Handle the request using the MCP transport
    // Convert Hono's Web API Request to Node.js IncomingMessage/ServerResponse
    // Using fetch-to-node to convert c.req.raw (Web API Request) to Node.js objects
    const { req, res } = toReqRes(c.req.raw);

    await mcpTransport.handleRequest(req, res, body);

    // Return the response that was written by the transport
    // The transport handles writing to the response, so we return null
    return c.body(null);
  } catch (error) {
    logger.error({ error }, 'Error handling MCP request');
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;
