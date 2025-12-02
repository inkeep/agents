import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type InitiateOauthLoginPublicRequest, type InitiateOauthLoginPublicResponse } from '../models/initiateoauthloginpublicop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Initiate OAuth login for MCP tool
 *
 * @remarks
 * Detects OAuth requirements and redirects to authorization server (public endpoint)
 */
export declare function oAuthInitiateOauthLoginPublic(client$: InkeepAgentsCore, request: InitiateOauthLoginPublicRequest, options?: RequestOptions): APIPromise<Result<InitiateOauthLoginPublicResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=oAuthInitiateOauthLoginPublic.d.ts.map