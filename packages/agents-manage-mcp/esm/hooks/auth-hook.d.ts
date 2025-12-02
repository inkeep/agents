import type { BeforeRequestContext, BeforeRequestHook } from './types.js';
/**
 * AuthHook adds bypass authentication to all SDK requests.
 * This hook injects the Authorization header from SDK options into every outgoing request.
 */
export declare class AuthHook implements BeforeRequestHook {
    beforeRequest(_hookCtx: BeforeRequestContext, request: Request): Promise<Request>;
}
//# sourceMappingURL=auth-hook.d.ts.map