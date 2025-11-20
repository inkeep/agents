import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { InitiateOauthLoginPublicRequest, InitiateOauthLoginPublicResponse } from "../models/initiateoauthloginpublicop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Initiate OAuth login for MCP tool
 *
 * @remarks
 * Detects OAuth requirements and redirects to authorization server (public endpoint)
 */
export declare function oAuthInitiateOauthLoginPublic(client$: InkeepAgentsCore, request: InitiateOauthLoginPublicRequest, options?: RequestOptions): APIPromise<Result<InitiateOauthLoginPublicResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=oAuthInitiateOauthLoginPublic.d.ts.map