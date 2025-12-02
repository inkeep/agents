import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type ListFunctionsRequest, type ListFunctionsResponse } from '../models/listfunctionsop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum ListFunctionsAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List Functions
 */
export declare function functionsListFunctions(client$: InkeepAgentsCore, request: ListFunctionsRequest, options?: RequestOptions): APIPromise<Result<ListFunctionsResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=functionsListFunctions.d.ts.map