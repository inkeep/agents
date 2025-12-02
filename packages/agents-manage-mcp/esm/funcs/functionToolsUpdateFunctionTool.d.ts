import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type UpdateFunctionToolRequest, type UpdateFunctionToolResponse } from '../models/updatefunctiontoolop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum UpdateFunctionToolAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update Function Tool
 */
export declare function functionToolsUpdateFunctionTool(client$: InkeepAgentsCore, request: UpdateFunctionToolRequest, options?: RequestOptions): APIPromise<Result<UpdateFunctionToolResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=functionToolsUpdateFunctionTool.d.ts.map