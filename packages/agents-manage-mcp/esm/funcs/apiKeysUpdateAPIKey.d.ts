import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { UpdateApiKeyRequest, UpdateApiKeyResponse } from "../models/updateapikeyop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum UpdateApiKeyAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update API Key
 *
 * @remarks
 * Update an API key (currently only expiration date can be changed)
 */
export declare function apiKeysUpdateAPIKey(client$: InkeepAgentsCore, request: UpdateApiKeyRequest, options?: RequestOptions): APIPromise<Result<UpdateApiKeyResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=apiKeysUpdateAPIKey.d.ts.map