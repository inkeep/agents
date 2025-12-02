import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type UpdateApiKeyRequest, type UpdateApiKeyResponse } from '../models/updateapikeyop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
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