import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type CreateApiKeyRequest, type CreateApiKeyResponse } from '../models/createapikeyop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum CreateApiKeyAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create API Key
 *
 * @remarks
 * Create a new API key for an agent. Returns the full key (shown only once).
 */
export declare function apiKeysCreateAPIKey(client$: InkeepAgentsCore, request: CreateApiKeyRequest, options?: RequestOptions): APIPromise<Result<CreateApiKeyResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=apiKeysCreateAPIKey.d.ts.map