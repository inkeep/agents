import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { ListFunctionToolsRequest, ListFunctionToolsResponse } from "../models/listfunctiontoolsop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum ListFunctionToolsAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List Function Tools
 */
export declare function functionToolsListFunctionTools(client$: InkeepAgentsCore, request: ListFunctionToolsRequest, options?: RequestOptions): APIPromise<Result<ListFunctionToolsResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=functionToolsListFunctionTools.d.ts.map