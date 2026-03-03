import type { BeforeRequestContext, BeforeRequestHook } from './types.js';

/**
 * Appends a ?ref=<branch> query parameter to all outgoing SDK requests.
 * Used to propagate branch context through MCP tool calls so manage-side
 * operations target the correct Dolt branch.
 */
export class RefQueryParamHook implements BeforeRequestHook {
  private ref: string;

  constructor(ref: string) {
    this.ref = ref;
  }

  async beforeRequest(_hookCtx: BeforeRequestContext, request: Request): Promise<Request> {
    if (!this.ref || this.ref === 'main') {
      return request;
    }

    const url = new URL(request.url);
    url.searchParams.set('ref', this.ref);

    return new Request(url.toString(), request);
  }
}
