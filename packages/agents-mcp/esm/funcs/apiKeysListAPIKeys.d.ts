import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type ListApiKeysRequest, type ListApiKeysResponse } from '../models/listapikeysop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum ListApiKeysAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List API Keys
 *
 * @remarks
 * List all API keys for a tenant with optional pagination
 */
export declare function apiKeysListAPIKeys(client$: InkeepAgentsCore, request: ListApiKeysRequest, options?: RequestOptions): APIPromise<Result<ListApiKeysResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=apiKeysListAPIKeys.d.ts.map