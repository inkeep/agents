import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { createConsoleLogger } from './mcp-server/console-logger.js';
import { createMCPServer } from './mcp-server/server.js';
const app = express();
app.use(express.json());
app.post('/mcp', async (req, res) => {
    // Key Component #1: Create the MCP server instance
    const mcpServer = createMCPServer({
        logger: createConsoleLogger('warning'), // or info/debug/error
    });
    // Key Component #2: Create the MCP transport instance
    const mcpTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless - no session tracking
    });
    // Key Component #3: Connect the MCP server to the transport
    await mcpServer.connect(mcpTransport);
    // Key Component #4: Handle the request using the MCP transport
    await mcpTransport.handleRequest(req, res, req.body);
});
app.get('/mcp', async (_req, res) => {
    res.status(405).send('Method not allowed: SSE not implemented.');
});
// Start the server and listen for requests
app.listen(3000, () => {
    console.log('MCP server listening on port 3000');
});
//# sourceMappingURL=http-server.js.map