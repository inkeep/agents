import type { BeforeRequestContext, BeforeRequestHook } from './types.js';

/**
 * HeaderForwardingHook forwards specified headers from incoming requests to outgoing SDK requests.
 * Used to propagate authentication headers (like cookies) through the MCP server to the downstream API.
 */
export class HeaderForwardingHook implements BeforeRequestHook {
  private headersToForward: Record<string, string>;

  constructor(headersToForward: Record<string, string>) {
    this.headersToForward = headersToForward;
  }

  async beforeRequest(_hookCtx: BeforeRequestContext, request: Request): Promise<Request> {
    if (Object.keys(this.headersToForward).length === 0) {
      return request;
    }

    const newHeaders = new Headers(request.headers);

    for (const [key, value] of Object.entries(this.headersToForward)) {
      const existingValue = newHeaders.get(key);
      if (!existingValue || (key === 'cookie' && existingValue === '')) {
        newHeaders.set(key, value);
      }
    }

    return new Request(request, { headers: newHeaders });
  }
}
