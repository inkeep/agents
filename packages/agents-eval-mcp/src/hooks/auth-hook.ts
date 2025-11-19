import type { BeforeRequestContext, BeforeRequestHook } from './types.js';

/**
 * AuthHook adds bypass authentication to all SDK requests.
 * This hook injects the Authorization header from SDK options into every outgoing request.
 */
export class AuthHook implements BeforeRequestHook {
  async beforeRequest(_hookCtx: BeforeRequestContext, request: Request): Promise<Request> {
    // Inject bypass secret if configured, regardless of environment
    const bypassSecret = process.env['INKEEP_AGENTS_EVAL_API_BYPASS_SECRET'];

    if (bypassSecret) {
      // Log that we're injecting auth (console.log since this is in the MCP package without a logger)
      if (process.env['LOG_LEVEL'] === 'debug' || process.env['LOG_LEVEL'] === 'trace') {
        console.log('[AuthHook] Injecting bypass auth for request:', {
          method: request.method,
          url: request.url,
        });
      }

      const newRequest = new Request(request, {
        headers: {
          ...Object.fromEntries(request.headers.entries()),
          Authorization: `Bearer ${bypassSecret}`,
        },
      });
      return newRequest;
    }

    return request;
  }
}
