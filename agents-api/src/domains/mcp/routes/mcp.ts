import { StreamableHTTPTransport } from '@hono/mcp';
import {
  createConsoleLogger,
  createMCPServer,
  HeaderForwardingHook,
  InkeepAgentsCore,
  SDKHooks,
} from '@inkeep/agents-mcp';
import { Hono } from 'hono';
import { env } from '../../../env';

const app = new Hono();

/**
 * Headers to forward from incoming requests to downstream API calls.
 * x-forwarded-cookie is mapped to cookie for browser compatibility
 * (browsers don't allow setting Cookie header directly).
 */
const FORWARDED_HEADERS = ['x-forwarded-cookie', 'authorization', 'cookie'] as const;

app.all('/', async (c) => {
  const transport = new StreamableHTTPTransport();
  const noOpLogger = createConsoleLogger('error');

  const headersToForward: Record<string, string> = {};
  for (const headerName of FORWARDED_HEADERS) {
    const value = c.req.header(headerName);
    if (value) {
      headersToForward[headerName] = value;
    }
  }

  if (headersToForward['x-forwarded-cookie'] && !headersToForward.cookie) {
    headersToForward.cookie = headersToForward['x-forwarded-cookie'];
  }

  const createSDKWithHeaders = () => {
    const hooks = new SDKHooks();
    hooks.registerBeforeRequestHook(new HeaderForwardingHook(headersToForward));

    return new InkeepAgentsCore({
      serverURL: env.INKEEP_AGENTS_API_URL,
      hooks,
    } as any);
  };

  const mcpServer = createMCPServer({
    logger: noOpLogger,
    serverURL: env.INKEEP_AGENTS_API_URL,
    getSDK: createSDKWithHeaders,
  });

  await mcpServer.server.connect(transport);
  return transport.handleRequest(c);
});

export default app;
