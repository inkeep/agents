import { StreamableHTTPTransport } from '@hono/mcp';
import {
  createConsoleLogger,
  createMCPServer,
  HeaderForwardingHook,
  InkeepAgentsCore,
  SDKHooks,
} from '@inkeep/agents-manage-mcp';
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

  // Extract headers from the incoming request
  const headersToForward: Record<string, string> = {};
  for (const headerName of FORWARDED_HEADERS) {
    const value = c.req.header(headerName);
    if (value) {
      headersToForward[headerName] = value;
    }
  }

  // Map x-forwarded-cookie to cookie (browsers forbid setting Cookie header directly)
  if (headersToForward['x-forwarded-cookie'] && !headersToForward.cookie) {
    headersToForward.cookie = headersToForward['x-forwarded-cookie'];
  }

  // Create SDK factory with header forwarding hook
  // Following Speakeasy SDK hooks pattern: https://www.speakeasy.com/docs/sdks/customize/code/sdk-hooks
  const createSDKWithHeaders = () => {
    const hooks = new SDKHooks();

    // Register the header forwarding hook to inject incoming request headers
    hooks.registerBeforeRequestHook(new HeaderForwardingHook(headersToForward));

    // Create SDK with custom hooks
    // Note: hooks is passed as an extended option (not in SDKOptions type but accepted by ClientSDK)
    // SECURITY: Do not pass debugLogger - it would log all headers including sensitive auth cookies
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

  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

export default app;
