import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type OauthCallbackRequest, type OauthCallbackResponse } from '../models/oauthcallbackop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * OAuth authorization callback
 *
 * @remarks
 * Handles OAuth authorization codes and completes the authentication flow
 */
export declare function oAuthOauthCallback(client$: InkeepAgentsCore, request: OauthCallbackRequest, options?: RequestOptions): APIPromise<Result<OauthCallbackResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=oAuthOauthCallback.d.ts.map