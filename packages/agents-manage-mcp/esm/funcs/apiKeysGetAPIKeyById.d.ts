import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type GetApiKeyByIdRequest, type GetApiKeyByIdResponse } from '../models/getapikeybyidop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
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