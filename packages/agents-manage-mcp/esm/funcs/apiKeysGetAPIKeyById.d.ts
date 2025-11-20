import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetApiKeyByIdRequest, GetApiKeyByIdResponse } from "../models/getapikeybyidop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetApiKeyByIdAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get API Key
 *
 * @remarks
 * Get a specific API key by ID (does not return the actual key)
 */
export declare function apiKeysGetAPIKeyById(client$: InkeepAgentsCore, request: GetApiKeyByIdRequest, options?: RequestOptions): APIPromise<Result<GetApiKeyByIdResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=apiKeysGetAPIKeyById.d.ts.map