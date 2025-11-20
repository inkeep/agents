import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetFunctionToolRequest, GetFunctionToolResponse } from "../models/getfunctiontoolop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetFunctionToolAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Function Tool by ID
 */
export declare function functionToolsGetFunctionTool(client$: InkeepAgentsCore, request: GetFunctionToolRequest, options?: RequestOptions): APIPromise<Result<GetFunctionToolResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=functionToolsGetFunctionTool.d.ts.map